import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Runs in the OPC host, not in the restricted model execution process.
export async function captureAnimationReview(cwd,step,{executablePath=process.env.OPC_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}={}){
 const {chromium}=await import('playwright');
 const groups={},hashes={};
 for(const file of step.files){
  if(path.basename(file)!==file||!file.endsWith('.png'))throw Error('Invalid animation frame');
  const bytes=await readFile(path.join(cwd,file));hashes[file]=createHash('sha256').update(bytes).digest('hex');
  (groups[file.replace(/-\d+\.png$/,'')]??=[]).push('data:image/png;base64,'+bytes.toString('base64'));
 }
 const dir=path.join(cwd,'evidence','playback',step.sheet||step.id);await mkdir(dir,{recursive:true});
 let browser;
 try{
  browser=await chromium.launch({executablePath,headless:true});
  const page=await browser.newPage({viewport:{width:1000,height:1000}});
  await page.setContent('<body style="margin:0;background:#e9eddc"><canvas width="1000" height="1000"></canvas></body>');
  await page.evaluate(async groups=>{
   const actions=await Promise.all(Object.entries(groups).map(async([name,urls])=>({name,frames:await Promise.all(urls.map(async src=>{const i=new Image();i.src=src;await i.decode();return i}))})));
   const ctx=document.querySelector('canvas').getContext('2d');ctx.imageSmoothingEnabled=false;
   window.playback={ticks:[],seen:{}};window.samples=[];const start=performance.now();
   function draw(now){const tick=Math.max(0,Math.floor((now-start)/180));ctx.fillStyle='#e9eddc';ctx.fillRect(0,0,1000,1000);
    actions.forEach((a,i)=>{const index=tick%a.frames.length,x=(i%3)*330,y=Math.floor(i/3)*330;ctx.fillStyle='#222';ctx.font='18px sans-serif';ctx.fillText(a.name+' · '+index,x+10,y+24);ctx.drawImage(a.frames[index],x+10,y+30,290,290);(window.playback.seen[a.name]??={})[index]=true;});
    if(window.playback.ticks.at(-1)?.tick!==tick){window.playback.ticks.push({tick,ms:now-start});if(window.samples.length<6)window.samples.push({tick,png:ctx.canvas.toDataURL('image/png')});}requestAnimationFrame(draw);
   }requestAnimationFrame(draw);
  },groups);
  const images=[];
  await page.waitForFunction(()=>window.samples?.length===6,{},{timeout:10000});
  const samples=await page.evaluate(()=>window.samples);
  for(const [i,sample] of samples.entries()){const file=path.join(dir,`sample-${i}.png`);await writeFile(file,Buffer.from(sample.png.split(',')[1],'base64'));images.push(file);}
  const playback=await page.evaluate(()=>window.playback);
  for(const [name,frames] of Object.entries(groups))if(Object.keys(playback.seen[name]||{}).length!==frames.length)throw Error('Playback missed frames: '+name);
  const report={capturedAt:new Date().toISOString(),frameHashes:hashes,frameDurationMs:180,sampleTicks:samples.map(s=>s.tick),playback,images,visualVerdict:'pending reviewer inspection; playback alone does not prove quality'};
  const reportPath=path.join(dir,'report.json');await writeFile(reportPath,JSON.stringify(report,null,2));
  return {reportPath,images};
 }catch(e){throw Object.assign(Error('本地动态验收无法完成：'+e.message),{code:'REVIEW_BLOCKED'});}finally{await browser?.close();}
}
