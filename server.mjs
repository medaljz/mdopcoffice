import {EasterEggs} from './lib/easter-eggs.mjs';
import {collectEggs} from './lib/easter-egg-agent.mjs';
import {updateCompany,bindAgent} from './lib/company.mjs';
import {WorkBuddyWorkflow} from './lib/workbuddy.mjs';
import {createCharacterProject,finalizeCharacterProject,configureSpriteSheets,verifyCharacterStep} from './lib/character-project.mjs';
import {managerAttention,acknowledgeFeedback} from './public/task-attention.js';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import {storeImage,validMediaName} from './lib/media.mjs';
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {createState,addEntry,recruit,log,progress} from './lib/domain.mjs';
import {discoverSkills} from './lib/skills.mjs';
import {CODEX} from './lib/codex.mjs';
import {runProject} from './lib/workflow.mjs';
import {visibleExecutor} from './lib/visible-executor.mjs';
import {CodexActivity} from './lib/host-activity.mjs';
import {CodexSync} from './lib/codex-sync.mjs';
import {SyncWorkflow} from './lib/sync-workflow.mjs';
import {delegateCascade,checkCascadeCompletion} from './lib/delegate.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));process.chdir(ROOT);
const DATA=process.env.ONE_PC_DATA_DIR||path.join(ROOT,'.local');await mkdir(DATA,{recursive:true});let state;try{state=JSON.parse(await readFile(path.join(DATA,'office.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('本地账本无法读取，已停止启动以保护数据：'+e.message);state=createState();}
if(!state.company){let settings={};try{settings=JSON.parse(await readFile(path.join(DATA,'deployment.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}updateCompany(state,{name:settings.companyName||'麦多OPC'});}
state.boss??=createState().boss;
for(const p of state.projects)if(p.source==='workbuddy'&&!p.cascade&&['syncing','submitting','running','waiting'].includes(p.status)){p.status='unknown';p.error='办公室服务重启，WorkBuddy 执行状态需确认；未自动重发。';}
for(const r of state.roles){r.status='idle';r.activity='休息中';}for(const p of state.projects)if(!['codex','workbuddy'].includes(p.source)&&['planning','running'].includes(p.status)){p.status='interrupted';p.error='上次窗口关闭，任务中断；没有自动重跑。';for(const step of p.steps||[])if(['running','submitted','rework'].includes(step.status))step.status='interrupted';}
let saveChain=Promise.resolve();let lastSaveError=null;
function save(){const data=JSON.stringify(state,null,2);saveChain=saveChain.then(async()=>{await writeFile(path.join(DATA,'office.tmp'),data,{mode:0o600});await rename(path.join(DATA,'office.tmp'),path.join(DATA,'office.json'));lastSaveError=null;}).catch(e=>{lastSaveError='账本保存失败：'+e.message;console.error(lastSaveError);});return saveChain;}
let skills=await discoverSkills();let controller=null;let demoTimer=null;const session=randomBytes(32).toString('hex');
const hostActivity=new CodexActivity(process.env.ONE_PC_SESSIONS_DIR||path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'sessions'));let hostPolling=true;hostActivity.poll().catch(e=>console.error('首次任务读取：'+e.message)).finally(()=>{hostPolling=false;});setInterval(async()=>{if(hostPolling)return;hostPolling=true;try{await hostActivity.poll();}finally{hostPolling=false;}},1000).unref();
const codexSync=new CodexSync({root:process.env.OPC_PROJECTS_ROOT||path.join(path.dirname(ROOT),'OPC项目')});
const syncWorkflow=new SyncWorkflow({sync:codexSync,state,save:async()=>{await save();if(lastSaveError)throw Error(lastSaveError);},activity:hostActivity});
const workbuddy=new WorkBuddyWorkflow({state,save:async()=>{await save();if(lastSaveError)throw Error(lastSaveError);},root:path.join(DATA,'workbuddy-projects')});
let wbPolling=false;setInterval(async()=>{if(wbPolling)return;wbPolling=true;try{await workbuddy.pollDesktop();}catch(e){console.error('WorkBuddy 状态同步：'+e.message);}finally{wbPolling=false;}},1500).unref();
let syncPolling=false;setInterval(async()=>{if(syncPolling)return;syncPolling=true;try{await syncWorkflow.poll();}catch(e){console.error('Codex 同步：'+e.message);}finally{syncPolling=false;}},2000).unref();
let cascadePolling=false;setInterval(async()=>{if(cascadePolling)return;cascadePolling=true;try{const ids=checkCascadeCompletion(state);if(ids.length)await save();}catch(e){console.error('级联检查：'+e.message);}finally{cascadePolling=false;}},3000).unref();
function snapshot(){const host=hostActivity.snapshot();host.tasks.push(...workbuddy.desktopSnapshot.tasks);if((workbuddy.desktopSnapshot.lastTask?.updatedAt||0)>(host.lastTask?.updatedAt||0))host.lastTask=workbuddy.desktopSnapshot.lastTask;for(const p of state.projects.filter(p=>['codex','workbuddy'].includes(p.source)&&['syncing','submitting','running','waiting'].includes(p.status))){if(!host.tasks.some(t=>t.id===p.threadId))host.tasks.push({id:p.threadId||p.id,source:p.source,project:p.projectName,cwd:p.cwd,task:p.prompt,stage:p.stage||(p.source==='workbuddy'?'WorkBuddy 正在处理任务':'Codex 正在处理任务'),role:p.currentRole||p.directRoleId||'manager',active:true,status:p.status,progress:progress(p),plan:p.steps||[]});}host.active=host.tasks.length>0;return {...state,hostActivity:{...host,usage:undefined},roles:state.roles.map(r=>{const tasks=host.tasks.filter(t=>t.role===r.id);const attention=r.id==='manager'?managerAttention(state.projects):null;if(attention)return {...r,status:tasks.some(t=>t.status!=='waiting')?'working':'attention',externalTasks:tasks,activity:tasks.length?tasks.map(t=>t.project+'：'+t.stage).join('；'):attention.label,attention};return tasks.length?{...r,status:tasks.some(t=>t.status==='waiting')?'attention':'working',externalWork:r.status!=='working',externalTasks:tasks,activity:tasks.map(t=>t.project+'：'+t.stage).join('；')}:r;}),usage:[...state.usage,...host.usage],projects:state.projects.map(p=>({...p,progress:progress(p)})),skills:skills.map(({path,...s})=>s),connection:{codex:existsSync(CODEX),workbuddy:workbuddy.status().connected,workbuddyStatus:workbuddy.status(),mode:'monitor',desktop:!!codexSync.desktop.clientId,lastSync:Date.now()},codexRequests:syncWorkflow.requests(),workbuddyRequests:workbuddy.requests(),storageError:lastSaveError,followEnabled:existsSync(process.platform==='win32'?path.join(process.env.APPDATA||os.homedir(),'Microsoft/Windows/Start Menu/Programs/Startup/OPC-agent-start.vbs'):path.join(os.homedir(),'Library/LaunchAgents/local.opc.agent-start.plist'))||existsSync(path.join(os.homedir(),'Library/LaunchAgents/local.onepc.follow-host.plist')),root:ROOT};}
const eggAbort=new AbortController();
const eggs=await EasterEggs.open({dir:DATA,busy:()=>!!demoState||!!controller||snapshot().hostActivity.active,run:topics=>collectEggs({dir:path.join(DATA,'easter-egg-research'),topics,signal:AbortSignal.any([eggAbort.signal,AbortSignal.timeout(240000)])})});
const eggTimer=setInterval(()=>{if(process.env.OPC_EGGS_AUTO!=='off')eggs.refresh().catch(e=>console.error('彩蛋更新：'+e.message));},60000);eggTimer.unref();
function stopDemo(){if(demoTimer)clearInterval(demoTimer);demoTimer=null;}
let demoState=null;
function demo(){stopDemo();const s=createState();s.mode='demo';s.skills=skills.map(({path,...x})=>x);s.connection={codex:existsSync(CODEX),workbuddy:false,mode:'demo'};s.root=ROOT;s.roles.find(x=>x.id==='designer').status='working';s.roles.find(x=>x.id==='designer').activity='正在设计品牌首页';s.roles.find(x=>x.id==='manager').status='working';s.roles.find(x=>x.id==='manager').activity='正在协调项目';
 const p={id:'demo',title:'为我的一人公司，做一个品牌网站',prompt:'制作一个温暖、简洁的个人品牌网站',status:'running',summary:'设计方案进行中，开发将在设计完成后接手。',steps:[{id:'1',role:'product',title:'梳理品牌定位与页面结构',weight:2,status:'verified'},{id:'2',role:'designer',title:'设计首页与视觉规范',weight:3,status:'running'},{id:'3',role:'developer',title:'实现页面与交互',weight:4,status:'queued'},{id:'4',role:'delivery',title:'整理交付文件',weight:1,status:'queued'}],createdAt:Date.now()};s.projects=[p];log(s,'需求梳理已通过审核，设计总监正在绘制页面。','manager');log(s,'产品定位与页面结构已交付。','product','success');demoState=s;
 let tick=0;demoTimer=setInterval(()=>{if(!demoState)return;tick++;if(tick%4)return;let step=p.steps.find(x=>x.status==='running');if(step){step.status='verified';s.roles.find(x=>x.id===step.role).status='idle';log(s,`演示：${step.title}已通过审核`,'reviewer','success');}let next=p.steps.find(x=>x.status==='queued');if(next){next.status='running';let r=s.roles.find(x=>x.id===next.role);r.status='working';r.activity=next.title;log(s,'演示：'+next.title,next.role);}else{p.status='completed';p.summary='演示项目已完成。切换真实模式可向主管安排实际任务。';for(const r of s.roles)r.status='idle';stopDemo();}},2000);
 return s;
}
function output(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
function sessionOK(req){return req.headers.cookie?.split(';').some(x=>x.trim()==='office_session='+session);}
async function body(req){let raw='';for await(const b of req){raw+=b;if(raw.length>(req.url==='/api/character-upload'?12*1024*1024:32768))throw Error('请求内容过长');}return raw?JSON.parse(raw):{};}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 try{
  const expected=`127.0.0.1:${server.address().port}`;if(req.headers.host!==expected)return output(res,403,{error:'只允许本机窗口连接'});
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const url=new URL(req.url,`http://${expected}`);
  if(url.pathname.startsWith('/api/')){
   if(!sessionOK(req))return output(res,401,{error:'请先打开办公窗口'});
   if(req.method==='POST'&&(req.headers.origin!==`http://${expected}`||req.headers['content-type']!=='application/json'))return output(res,403,{error:'请求来源不匹配'});
   if(req.method==='GET'&&url.pathname==='/api/state'){const s=demoState?{...demoState,projects:demoState.projects.map(p=>({...p,progress:progress(p)}))}:snapshot();return output(res,200,s);}
   if(req.method==='GET'&&url.pathname==='/api/history')return output(res,200,await syncWorkflow.catalog());
   if(req.method==='GET'&&url.pathname==='/api/codex-messages'){const id=url.searchParams.get('threadId');const catalog=await syncWorkflow.catalog();if(!catalog.threads.some(t=>t.id===id))throw Error('对话不存在');return output(res,200,await syncWorkflow.messages(id));}
   if(req.method==='GET'&&url.pathname==='/api/workbuddy-history')return output(res,200,await workbuddy.catalog());
   if(req.method==='GET'&&url.pathname==='/api/workbuddy-messages')return output(res,200,await workbuddy.messages(url.searchParams.get('threadId')));
   if(req.method==='GET'&&url.pathname==='/api/easter-eggs')return output(res,200,eggs.status());
   if(req.method!=='POST')return output(res,404,{error:'接口不存在'});const b=await body(req);
   if(url.pathname==='/api/mode'){if(controller)throw Error('项目正在执行，请先取消再切换模式');if(b.mode==='demo')demo();else{stopDemo();demoState=null;}return output(res,200,{ok:true});}
   const current=demoState||state;
   if(url.pathname==='/api/easter-eggs/pick'){const s=demoState||snapshot();const r=b.roleId==='boss'?s.boss:s.roles.find(r=>r.id===b.roleId);if(!r)throw Error('员工不存在');return output(res,200,{egg:await eggs.pick(r.id,r.id==='boss'||r.status!=='idle'||!!r.attention)});}
   if(url.pathname==='/api/easter-eggs/settings')return output(res,200,await eggs.configure(b.enabled));
   if(url.pathname==='/api/easter-eggs/refresh'){if(!eggs.data.enabled)throw Error('请先开启彩蛋更新');if(eggs.busy())throw Error('Agent 正忙，空闲后再搜集');if(eggs.running)return output(res,200,eggs.status());eggs.refresh(true).catch(e=>console.error(e.message));return output(res,202,eggs.status());}
   if(url.pathname==='/api/easter-eggs/publish')return output(res,200,{added:await eggs.publish(b.items)});
   if(url.pathname==='/api/company'){updateCompany(current,b);if(!demoState)await save();return output(res,200,{ok:true});}
   if(url.pathname==='/api/role-agent'){bindAgent(current,b);if(!demoState)await save();return output(res,200,{ok:true});}
   if(url.pathname==='/api/workbuddy-reconcile'){if(demoState)throw Error('请切换真实模式再核对任务');return output(res,200,{items:await workbuddy.reconcile()});}
   if(url.pathname==='/api/workbuddy-route')return output(res,200,await workbuddy.route(b));
   if(url.pathname==='/api/workbuddy-open'){await workbuddy.open(b.threadId);return output(res,200,{ok:true});}
   if(url.pathname==='/api/codex-route'){if(demoState)throw Error('演示模式不路由真实任务');return output(res,200,await syncWorkflow.route(b));}
   if(url.pathname==='/api/codex-open'){if(!(await syncWorkflow.catalog()).threads.some(t=>t.id===b.threadId))throw Error('对话不存在');await codexSync.desktop.open(b.threadId);return output(res,200,{ok:true});}
   if(url.pathname==='/api/codex-answer'){await syncWorkflow.answer(String(b.id),b.result);return output(res,200,{ok:true});}
   if(url.pathname==='/api/workbuddy-question-answer'){if(demoState)throw Error('演示模式不能回答真实任务');return output(res,200,await workbuddy.answerQuestion(b));}
   if(url.pathname==='/api/workbuddy-answer'){if(demoState)throw Error('请切换真实模式');await workbuddy.answer(b.id,b.optionId);return output(res,200,{ok:true});}
   if(url.pathname==='/api/project'&&!demoState){if(b.agent&&!['codex','workbuddy'].includes(b.agent))throw Error('未知 Agent');if(b.agent==='workbuddy'&&b.cascade&&b.roleId==='manager'){return output(res,202,await delegateCascade({workbuddy,state,save,b}));}return output(res,202,await (b.agent==='workbuddy'?workbuddy:syncWorkflow).dispatch(b));}
   if(url.pathname==='/api/feedback-read'){acknowledgeFeedback(current.projects,Array.isArray(b.items)?b.items:[]);if(!demoState){await save();if(lastSaveError)throw Error(lastSaveError);}return output(res,200,{ok:true});}
   if(url.pathname==='/api/employee-name'){const role=b.roleId==='boss'?current.boss:current.roles.find(r=>r.id===b.roleId);if(!role)throw Error('员工不存在');const name=String(b.name||'').trim();if(!name||[...name].length>24||/[\u0000-\u001f\u007f]/.test(name))throw Error('员工名称需要 1～24 个可显示字符');role.name=name;if(!demoState)await save();return output(res,200,{ok:true});}
   if(url.pathname==='/api/character-design'||url.pathname==='/api/character-actions'){
    if(demoState)throw Error('请切换真实工作后设计人物');if(controller)throw Error('已有本地设计任务执行中，请等待完成');
    if(!existsSync(CODEX))throw Error('尚未找到 Codex CLI');
    const role=b.roleId==='boss'?state.boss:state.roles.find(r=>r.id===b.roleId);
    const stage=url.pathname==='/api/character-actions'?'actions':'concept';
    const concept=stage==='actions'?role?.characterConcepts?.find(c=>c.id===b.conceptId&&c.validated&&c.referenceImage===role.referenceImage):null;
    if(stage==='actions'&&!concept)throw Error('人物定稿不存在或参考图已更换，请重新设计');
    const existing=concept&&state.projects.find(p=>p.characterStage==='actions'&&p.conceptId===concept.id&&p.targetRoleId===role.id);
    if(existing){
     if(['failed','interrupted','cancelled','awaiting_confirmation'].includes(existing.status)){
      await configureSpriteSheets(existing,role);
      if(b.acceptedSheet){
       const step=existing.steps.find(s=>s.sheet===b.acceptedSheet);
       if(!step)throw Error('待确认图集不存在');
       await verifyCharacterStep(existing,step);
       step.status='verified';step.review='董事长明确确认此图集可用，保留并继续后续动作。';step.userAcceptedAt=Date.now();
      }
      if(b.retryReview){const step=existing.steps.find(s=>s.status!=='verified');if(!step?.output)throw Error('没有可复审的产物报告');step.reviewPending=true;}
      existing.resume=true;existing.status='running';delete existing.error;delete existing.finishedAt;delete existing.feedbackReadStatus;
      controller=new AbortController();await save();runProject({state,project:existing,executor:visibleExecutor({sync:codexSync,workflow:syncWorkflow,project:existing,save}),skills,signal:controller.signal,save,verifyStep:step=>verifyCharacterStep(existing,step),finalize:()=>finalizeCharacterProject(existing,role,DATA)}).finally(()=>{controller=null;});
     }
     return output(res,200,{id:existing.id,status:existing.status});
    }
    const brief=String(b.prompt||'').trim();if(brief.length>3000)throw Error('设计要求最多3000字');
    const oldApprovedAt=concept?.approvedAt;if(concept)concept.approvedAt=Date.now();
    let p;try{p=await createCharacterProject({role,stage,conceptId:concept?.id,brief,dataDir:DATA,root:ROOT});}catch(e){if(concept)concept.approvedAt=oldApprovedAt;throw e;}
    if(concept){const source=state.projects.find(x=>x.id===concept.projectId);if(source){source.status='completed';source.feedbackReadStatus='completed';source.summary='人物定稿已由董事长确认，开始制作动作素材。';}}
    state.projects.unshift(p);controller=new AbortController();await save();
    runProject({state,project:p,executor:visibleExecutor({sync:codexSync,workflow:syncWorkflow,project:p,save}),skills,signal:controller.signal,save,verifyStep:step=>verifyCharacterStep(p,step),finalize:()=>finalizeCharacterProject(p,role,DATA)}).finally(()=>{controller=null;});
    return output(res,202,{id:p.id});
   }
   if(url.pathname==='/api/character-upload'){const role=(b.roleId==='boss'?current.boss:current.roles.find(r=>r.id===b.roleId));if(!role)throw Error('员工不存在');const name=await storeImage(b.dataUrl,path.join(DATA,'media'));role.referenceImage=name;log(current,`已为${role.title}保存角色参考图`,'designer');if(!demoState)await save();return output(res,200,{name,url:'/media/'+name});}
   if(url.pathname==='/api/character-reference-move'){const from=b.fromRoleId==='boss'?current.boss:current.roles.find(r=>r.id===b.fromRoleId),to=b.toRoleId==='boss'?current.boss:current.roles.find(r=>r.id===b.toRoleId);if(!from||!to||from===to||!from.referenceImage)throw Error('角色或参考图不存在');if(to.referenceImage&&to.referenceImage!==from.referenceImage)throw Error('目标角色已有参考图');to.referenceImage=from.referenceImage;delete from.referenceImage;if(!demoState)await save();return output(res,200,{ok:true});}
   if(url.pathname==='/api/character-apply'){const role=b.roleId==='boss'?current.boss:current.roles.find(r=>r.id===b.roleId);if(!role)throw Error('员工不存在');if(b.reset){delete role.avatarImage;delete role.avatarPack;}else{const pack=role.characterPacks?.find(p=>p.id===b.packId&&p.validated);if(!pack)throw Error('需要完整且检查通过的动作包，不能只应用一张参考图');role.avatarPack=pack;delete role.avatarImage;}if(!demoState)await save();return output(res,200,{ok:true});}
   if(url.pathname==='/api/follow'){if(demoState)throw Error('请切换真实模式设置伴随启动');await promisify(execFile)(process.execPath,[path.join(ROOT,'scripts/follow-host.mjs'),b.enabled?'enable':'disable']);return output(res,200,{ok:true});}
   if(url.pathname==='/api/recruit'){skills=await discoverSkills();const r=recruit(current,b,skills);if(!demoState){await save();if(lastSaveError)throw Error(lastSaveError);}return output(res,200,r);}
   if(url.pathname==='/api/ledger'){const e=addEntry(current,b);log(current,`已记录${e.type==='income'?'收入':'支出'}：${e.currency} ${(e.minor/100).toFixed(2)}`,'finance');if(!demoState){await save();if(lastSaveError)throw Error(lastSaveError);}return output(res,200,e);}
   if(url.pathname==='/api/cancel'){if(demoState){stopDemo();demoState.projects[0].status='cancelled';for(const r of demoState.roles)r.status='idle';}else if(b.id&&state.projects.find(p=>p.id===b.id)?.kind==='character-design'){controller?.abort();}else if(b.id){if(state.projects.find(p=>p.id===b.id)?.source==='workbuddy')await workbuddy.cancel(b.id);else await syncWorkflow.cancel(b.id);}else{controller?.abort();}return output(res,200,{ok:true});}
   if(url.pathname==='/api/project'&&demoState){demo();return output(res,200,{demo:true});}
   return output(res,404,{error:'接口不存在'});
  }
  if(req.method!=='GET')return output(res,405,{error:'不支持的请求'});
  if(url.pathname.startsWith('/media/')){if(!sessionOK(req))return output(res,401,{error:'需要本地会话'});const name=url.pathname.slice(7);if(!validMediaName(name))return output(res,404,{error:'图片不存在'});const bytes=await readFile(path.join(DATA,'media',name));res.writeHead(200,{'Content-Type':'image/'+(name.endsWith('.jpg')?'jpeg':path.extname(name).slice(1)),'Cache-Control':'private, max-age=3600'});return res.end(bytes);}
  if(url.pathname==='/fonts/noto-sans-sc.ttf'){const bytes=await readFile(path.join(ROOT,'public/fonts/noto-sans-sc.ttf'));res.writeHead(200,{'Content-Type':'font/ttf','Cache-Control':'public, max-age=3600'});return res.end(bytes);}
  if(url.pathname.startsWith('/assets/')){const name=url.pathname.slice(8);if(!/^[a-z0-9-]+\.(png|webp)$/.test(name))return output(res,404,{error:'素材不存在'});const bytes=await readFile(path.join(ROOT,'public/assets',name));res.writeHead(200,{'Content-Type':'image/'+path.extname(name).slice(1),'Cache-Control':'public, max-age=3600'});return res.end(bytes);}
  if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
  if(url.pathname==='/health')return output(res,200,{app:'one-pc-office',version:'0.1.0',installationId:createHash('sha256').update(ROOT).digest('hex')});
  const names={...Object.fromEntries(['workbuddy-ui','character-ui','codex-ui','task-attention','brown-chair-complete-geometry','boss-seated-unified-geometry','actor-scale','task-progress','boss-seated-right-geometry','executive-phone-front-geometry','seated-directions-geometry','empty-chair-geometry','seated-phone-geometry','executive-chair-geometry','character-actions','team-sipping-geometry','seated-side-geometry','walk-right-geometry','walk-front-geometry','walk-back-geometry','walk-pass-geometry','office-navigation','office-life','office-scene','office-view','neutral-geometry'].map(n=>['/'+n+'.js',n+'.js'])),'/':'index.html','/app.js':'app.js','/sprite-geometry.js':'sprite-geometry.js','/working-geometry.js':'working-geometry.js','/style.css':'style.css'};const name=names[url.pathname];if(!name)return output(res,404,{error:'文件不存在'});
  if(url.pathname==='/')res.setHeader('Set-Cookie',`office_session=${session}; HttpOnly; SameSite=Strict; Path=/`);
  const file=path.join(ROOT,'public',name);res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});res.end(await readFile(file));
 }catch(e){output(res,400,{error:e.message});}
});
const port=Number(process.env.ONE_PC_PORT||4317);server.listen(port,'127.0.0.1',()=>{console.log(`ONE_PC_READY http://127.0.0.1:${server.address().port}`);});
async function shutdown(){clearInterval(eggTimer);eggAbort.abort();await eggs.saves;stopDemo();codexSync.close();controller?.abort();save();await saveChain;server.close();setTimeout(()=>process.exit(0),3000).unref();}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
