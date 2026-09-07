import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {routeTask} from './task-routing.mjs';
import {applyDesktopChange,desktopStatus} from './desktop-state.mjs';

export class SyncWorkflow {
 constructor({sync,state,save,activity}){this.sync=sync;this.state=state;this.save=save;this.activity=activity;this.active=new Map();this.locks=new Set();this.pendingRequests=new Map();this.desktopStates=new Map();this.followed=new Set();this.catalogCache=null;this.catalogAt=0;
  sync.app.on('event',e=>this.event(e));
  sync.app.on('disconnect',()=>{for(const p of this.active.values()){p.status='unknown';p.stage='连接中断，正在重新核对 Codex 状态';}this.active.clear();this.save().catch(()=>{});});
  sync.desktop.on('disconnect',()=>{this.desktopStates.clear();this.followed.clear();for(const p of state.projects)if(p.transport==='desktop'&&['running','waiting'].includes(p.status))p.status='unknown';this.save().catch(()=>{});});
  sync.desktop.on('broadcast',m=>{if(m.method!=='thread-stream-state-changed'||m.params.hostId!=='local')return;const id=m.params.conversationId,next=applyDesktopChange(this.desktopStates.get(id),m.params.change);if(next)this.desktopStates.set(id,next);else {this.desktopStates.delete(id);this.follow(id,true).catch(()=>{});}this.reconcileDesktop(id);});
 }
 async catalog(force=false){if(!force&&this.catalogCache&&Date.now()-this.catalogAt<15000)return this.catalogCache;this.catalogCache=await this.sync.catalog();this.catalogAt=Date.now();return this.catalogCache;}
 async follow(id,force=false){await this.sync.desktop.connect();if(this.followed.has(id)&&!force)return;this.followed.add(id);this.sync.desktop.write({type:'broadcast',sourceClientId:this.sync.desktop.clientId,method:'thread-stream-following-changed',version:1,params:{conversationId:id,hostId:'local',following:true}});}
 async messages(id){
  await this.follow(id).catch(()=>{});
  const r=await this.sync.messages(id),d=this.desktopStates.get(id)?.state;
  if(d){const turns=[...(d.turns||[]),...Object.values(d.turnHistory?.history?.entitiesByKey||{})].filter(t=>t.turnId).sort((a,b)=>(a.turnStartedAtMs||0)-(b.turnStartedAtMs||0));
   const seen=new Set();for(const t of turns){if(seen.has(t.turnId))continue;seen.add(t.turnId);const items=t.items||[];if(!items.length&&!t.params?.input?.length)continue;r.items=r.items.filter(i=>i.turnId!==t.turnId);if(!items.some(i=>i.type==='userMessage')&&t.params?.input?.length)r.items.push({type:'userMessage',turnId:t.turnId,content:t.params.input});r.items.push(...items.map(i=>({...i,turnId:t.turnId})));}
  }return r;
 }
 async route(body){
  const catalog=await this.catalog(true);
  const threads=catalog.threads.map(t=>({...t,recentContext:this.state.projects.filter(p=>p.source==='codex'&&p.threadId===t.id).slice(0,3).map(p=>[p.prompt,p.summary].filter(Boolean).join(' ')).join(' ').slice(0,6000)}));
  return routeTask(body,{...catalog,threads});
 }
 async dispatch(body){
  const prompt=String(body.prompt||'').trim();if(prompt.length<2||prompt.length>12000)throw Error('需求需要 2～12000 个字符');
  if(!/^[\w-]{10,100}$/.test(body.requestId||''))throw Error('缺少有效提交标识，请重新打开任务窗口');
  const previous=this.state.projects.find(p=>p.requestId===body.requestId);if(previous&&['failed','sync_unknown'].includes(previous.status))throw Error(previous.error||'上一条发送结果尚未确认，请检查原对话');if(previous)return {id:previous.id,threadId:previous.threadId,status:previous.status,duplicate:true};
  if(this.locks.has(body.requestId))throw Error('这条需求正在同步，请勿重复发送');this.locks.add(body.requestId);
  let p;
  try{
   const route=await this.route({...body,prompt});if(route.needsSelection)return route;
   p={id:randomUUID(),requestId:body.requestId,prompt,title:prompt.slice(0,40),createdAt:Date.now(),status:'syncing',steps:[],source:'codex',directRoleId:body.roleId||'manager',routeReason:route.reason};
   this.state.projects.unshift(p);await this.save();
   let project=route.project;if(route.mode==='new_project')project=await this.sync.createProject(route.projectName,body.requestId);
   if(project){p.codexProjectId=project.id;p.projectName=project.name;p.cwd=project.roots[0];await this.save();}
   let thread=route.thread;
   if(!thread)thread=await this.sync.createThread(project,route.threadName||prompt.slice(0,40));
   p.threadId=thread.id;p.cwd=thread.cwd||p.cwd;p.threadName=thread.name||route.threadName;p.projectName??=path.basename(p.cwd);await this.save();this.catalogAt=0;
   if(this.active.has(thread.id))throw Error('此对话正在执行，请等待完成后继续，或在 Codex 中补充需求');
   // Query desktop ownership before opening a second runtime for an existing thread.
   const owner=route.mode==='existing'?await this.sync.desktop.owner(thread.id):null;
   if(owner){
    await this.follow(thread.id);p.status='submitting';p.transport='desktop';await this.save();
    const r=await this.sync.desktop.call('thread-follower-start-turn',{conversationId:thread.id,turnStart:{request:{threadId:thread.id,clientUserMessageId:body.requestId,input:[{type:'text',text:prompt,text_elements:[]}]},context:{inheritThreadSettings:true}}},{targetClientId:owner,timeoutMs:45000});
    p.status='running';p.submittedAt=Date.now();p.submitResult=r.result;await this.save();
   }else{
    const host=this.activity.snapshot().tasks.find(t=>t.id===thread.id);if(host?.active)throw Error('这个对话正在其他 Codex 窗口执行，暂不能安全续接，请在原窗口补充需求');
    if(route.mode==='existing')await this.sync.app.call('thread/resume',{threadId:thread.id,excludeTurns:true});
    p.transport='app-server';p.status='submitting';await this.save();this.active.set(thread.id,p);
    const result=await this.sync.app.call('turn/start',{threadId:thread.id,clientUserMessageId:body.requestId,input:[{type:'text',text:prompt,text_elements:[]}]});
    p.turnId=result.turn.id;p.status=result.turn.status==='completed'?'completed':'running';p.submittedAt=Date.now();await this.save();
   }
   await this.sync.desktop.open(thread.id).catch(()=>{});
   return {id:p.id,threadId:p.threadId,projectName:p.projectName,status:p.status,routeReason:p.routeReason};
  }catch(e){if(p){p.status=['submitting','running'].includes(p.status)?'sync_unknown':'failed';p.error=e.message;await this.save();}throw e;}finally{this.locks.delete(body.requestId);}
 }
 event(e){const x=e.params||{},p=this.active.get(x.threadId)||this.state.projects.find(p=>p.source==='codex'&&p.threadId===x.threadId&&p.transport==='app-server'&&(e.method==='turn/started'||['running','waiting','unknown','submitting'].includes(p.status)));if(!p)return;
  if(e.id!==undefined){this.pendingRequests.set(String(e.id),{id:e.id,method:e.method,params:x,threadId:x.threadId});p.status='waiting';}
  if(e.method==='turn/started'){p.turnId=x.turn.id;p.status='running';p.steps=[];p.error=null;}
  if(e.method==='turn/plan/updated')p.steps=(x.plan||[]).map(s=>({title:s.step,status:s.status==='completed'?'verified':s.status==='inProgress'?'running':'queued',weight:1}));
  if(e.method==='item/started'){p.currentRole=({commandExecution:'developer',fileChange:'developer',webSearch:'product',mcpToolCall:/image|design/.test(x.item?.tool||'')?'designer':'manager'})[x.item?.type]||p.directRoleId||'manager';p.stage=({commandExecution:'运行命令',fileChange:'修改文件',mcpToolCall:'调用工具',webSearch:'查阅资料'})[x.item?.type]||'处理任务';}
  if(e.method==='item/completed'&&x.item?.type==='agentMessage'){p.summary=x.item.text;p.lastMessage=x.item.text;}
  if(e.method==='turn/completed'){p.status=({completed:'completed',interrupted:'interrupted',failed:'failed'})[x.turn.status]||'unknown';p.error=x.turn.error?.message;this.active.delete(x.threadId);for(const [id,r]of this.pendingRequests)if(r.threadId===x.threadId)this.pendingRequests.delete(id);this.catalogAt=0;}
  this.save().catch(()=>{});
 }
 reconcileDesktop(id){const s=this.desktopStates.get(id)?.state;if(!s)return;const status=desktopStatus(s);const turns=[...(s.turns||[]),...Object.values(s.turnHistory?.history?.entitiesByKey||{})].filter(t=>t.turnId).sort((a,b)=>(a.turnStartedAtMs||0)-(b.turnStartedAtMs||0));const last=turns.at(-1);
  for(const p of this.state.projects.filter(p=>p.threadId===id&&p.source==='codex').slice(0,1)){const before=JSON.stringify([p.status,p.turnId,p.summary]);if(status==='running'||status==='waiting'){p.status=status;p.turnId=last?.turnId||p.turnId;}else if(status==='idle'&&p.submittedAt&&last?.turnStartedAtMs>=p.submittedAt-5000){p.status=last.status==='completed'?'completed':last.status==='failed'?'failed':'interrupted';}const final=last?.items?.filter(i=>i.type==='agentMessage').at(-1);if(final)p.summary=final.text;if(before!==JSON.stringify([p.status,p.turnId,p.summary]))this.save().catch(()=>{});}
 }
 async poll(){const seen=new Set();for(const p of this.state.projects.filter(p=>p.threadId&&p.source==='codex').slice(0,30)){if(seen.has(p.threadId))continue;seen.add(p.threadId);
  if(p.transport==='app-server'&&!this.active.has(p.threadId)&&['running','waiting','submitting','unknown','sync_unknown'].includes(p.status)){try{const {thread}=await this.sync.app.call('thread/read',{threadId:p.threadId,includeTurns:false});if(thread.status.type==='active'){this.active.set(p.threadId,p);await this.sync.app.call('thread/resume',{threadId:p.threadId,excludeTurns:true});p.status='running';}else{const turns=await this.sync.app.call('thread/turns/list',{threadId:p.threadId,limit:1});const t=turns.data[0];p.status=t?.status==='completed'?'completed':t?.status==='failed'?'failed':'interrupted';}await this.save();}catch{p.status='unknown';}}
  await this.follow(p.threadId).catch(()=>{});const s=[...this.activity.sessions.values()].find(s=>s.id===p.threadId)?.snapshot();if(!s)continue;if(p.status==='sync_unknown'&&s.turnId!==p.turnId&&s.updatedAt>=p.createdAt){p.turnId=s.turnId;p.status=s.status;await this.save();}if(s.turnId!==p.turnId&&s.updatedAt>=p.createdAt&&!this.active.has(p.threadId)){p.turnId=s.turnId;p.status=s.stale?'unknown':s.status;p.steps=[];p.error=null;await this.save();}if(s.plan?.length)p.steps=s.plan.map(x=>({title:x.title,status:x.status==='completed'?'verified':x.status==='in_progress'?'running':'queued',weight:1}));if(p.transport==='desktop'&&!this.desktopStates.has(p.threadId)&&s.updatedAt>=p.createdAt){p.status=s.stale?'unknown':s.status;p.stage=s.stage;} }
 }
 async cancel(id){const p=this.state.projects.find(p=>p.id===id&&p.source==='codex');if(!p)throw Error('未找到对应 Codex 任务');if(p.transport==='desktop')await this.sync.desktop.interrupt(p.threadId,p.turnId);else await this.sync.app.call('turn/interrupt',{threadId:p.threadId,turnId:p.turnId});}
 requests(){return [...this.pendingRequests.values()];}
 async answer(id,result){const r=this.pendingRequests.get(id);if(!r)throw Error('请求已失效');if(/requestApproval$/.test(r.method)&&!['accept','decline','cancel'].includes(result?.decision))throw Error('无效的批准选择');
  if(/requestUserInput$/.test(r.method)&&(!result?.answers||typeof result.answers!=='object'))throw Error('缺少问题回答');
  this.sync.app.reply(r.id,result);this.pendingRequests.delete(id);const p=this.active.get(r.threadId);if(p)p.status='running';}
}
