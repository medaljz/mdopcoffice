import {findCodex} from './platform.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
export const CODEX=findCodex()||'';
export async function execute({prompt,cwd,signal,onEvent,schema,readOnly=false,images=[],webSearch=false}){
 const id=randomUUID();const tmp=path.resolve('.local/runs');await mkdir(tmp,{recursive:true});const out=path.join(tmp,id+'.txt'),schemaPath=path.join(tmp,id+'.schema.json');
 const args=['exec','--json','--color','never','--skip-git-repo-check','--sandbox',readOnly?'read-only':'workspace-write','-c','approval_policy="never"','-C',cwd,'--output-last-message',out];
 if(webSearch)args.push('-c','web_search="live"');
 for(const image of images)args.push('--image',image);
 if(schema){await writeFile(schemaPath,JSON.stringify(schema));args.push('--output-schema',schemaPath);}args.push('-');
 return await new Promise((resolve,reject)=>{
  const child=spawn(CODEX,args,{stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});let err='',settled=false,timer;
  const abort=()=>{try{if(child.pid)process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}timer=setTimeout(()=>{try{if(child.pid)process.kill(-child.pid,'SIGKILL');}catch{}},2500);timer.unref();};
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const rl=createInterface({input:child.stdout});rl.on('line',line=>{try{onEvent?.(JSON.parse(line),id);}catch{}});
  child.stderr.on('data',b=>{err=(err+b.toString()).slice(-4000);});child.stdin.on('error',()=>{});
  child.on('error',e=>{if(!settled){settled=true;signal?.removeEventListener('abort',abort);reject(e);}});
  child.on('close',async code=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);rl.close();let output='';try{output=await readFile(out,'utf8');}catch{}await unlink(schemaPath).catch(()=>{});if(signal?.aborted)return reject(Error('任务已取消'));if(code!==0)return reject(Error(output||err||`Codex 退出 (${code})`));resolve({id,output});});child.stdin.end(prompt);
 });
}
export async function listThreads(){
 const child=spawn(CODEX,['app-server','--stdio'],{stdio:['pipe','pipe','ignore']});const rl=createInterface({input:child.stdout});let next=0;const pending=new Map();
 rl.on('line',line=>{try{let e=JSON.parse(line);if(pending.has(e.id)){let {resolve,reject}=pending.get(e.id);pending.delete(e.id);e.error?reject(Error(e.error.message)):resolve(e.result);}}catch{}});
 const call=(method,params)=>new Promise((resolve,reject)=>{let id=++next;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,params})+'\n');});
 child.stdin.on('error',()=>{});child.on('error',e=>{for(const p of pending.values())p.reject(e);});
 const timer=setTimeout(()=>{for(const p of pending.values())p.reject(Error('读取任务超时'));child.kill();},15000);
 try{await call('initialize',{clientInfo:{name:'one_pc_office',version:'0.1.0'}});let r=await call('thread/list',{limit:20,sortKey:'updated_at',useStateDbOnly:true});return r.data.map(x=>({id:x.id,name:x.name||x.preview?.slice(0,70)||'未命名任务',cwd:x.cwd,updatedAt:x.updatedAt,status:'history'}));}finally{clearTimeout(timer);child.kill();rl.close();}
}
