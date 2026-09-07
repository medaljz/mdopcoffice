import {recoverWorkBuddyProject} from './workbuddy-recovery.mjs';
import {WorkBuddyDesktop,desktopTask} from './workbuddy-desktop.mjs';
import {WorkBuddyHistory} from './workbuddy-history.mjs';
import {routeTask} from './task-routing.mjs';
import {openExternal} from './platform.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync} from 'node:fs';
import {mkdir,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';

export function workbuddyCLI(){
 const candidates=[process.env.OPC_WORKBUDDY_CLI,process.platform==='darwin'?'/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy':null,process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs/WorkBuddy/resources/app.asar.unpacked/cli/bin/codebuddy')];
 return candidates.find(p=>p&&existsSync(p));
}
export class WorkBuddyACP {
 constructor({cwd,onUpdate=()=>{},onPermission=()=>{}}={}){this.cwd=cwd;this.onUpdate=onUpdate;this.onPermission=onPermission;this.pending=new Map();this.next=0;}
 async connect(){
  const cli=workbuddyCLI();if(!cli)throw Error('未找到 WorkBuddy，请先安装，或设置 OPC_WORKBUDDY_CLI');
  const config=process.env.OPC_WORKBUDDY_HOME||path.join(os.homedir(),'.workbuddy');
  this.child=spawn(process.execPath,[cli,'--acp'],{cwd:this.cwd,env:{...process.env,CODEBUDDY_CONFIG_DIR:config,WORKBUDDY_CONFIG_DIR:config},stdio:['pipe','pipe','pipe']});
  this.child.stderr.on('data',()=>{});this.child.stdin.on('error',()=>{});
  const fail=()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('WorkBuddy 执行器连接中断；不会自动重发任务'));}this.pending.clear();};
  this.child.on('error',fail);this.child.on('exit',fail);
  createInterface({input:this.child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
   if(m.method==='session/update')this.onUpdate(m.params);
   else if(m.method==='session/request_permission')this.onPermission(m.id,m.params);
   else if(m.method&&m.id!==undefined)this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Client capability not supported'}})+'\n');
   else if(this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message||'WorkBuddy 请求失败')):p.resolve(m.result);}
  });
  return this.call('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'opc-office',version:'0.1.0'}},30000);
 }
 call(method,params,timeout=30000){return new Promise((resolve,reject)=>{const id=++this.next;const timer=timeout?setTimeout(()=>{this.pending.delete(id);reject(Error('WorkBuddy 响应超时；发送状态需确认，不会自动重发'));},timeout):null;this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
 notify(method,params){this.child?.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n');}
 answer(id,optionId){this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,result:{outcome:optionId?{outcome:'selected',optionId}:{outcome:'cancelled'}}})+'\n');}
 close(){this.child?.kill();}
}
export function applyACPUpdate(p,update){
 if(update.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text')p.summary=(p.summary||'')+update.content.text;
 if(update.sessionUpdate==='plan')p.steps=(update.entries||[]).map(e=>({title:e.content,status:e.status==='completed'?'verified':e.status==='in_progress'?'running':'queued',weight:1}));
 if(['tool_call','tool_call_update'].includes(update.sessionUpdate)){
  p.toolCalls??={};p.toolCalls[update.toolCallId]={...p.toolCalls[update.toolCallId],...update};
  p.stage=update.title||p.toolCalls[update.toolCallId].title||'WorkBuddy 正在调用工具';
 }
}
export class WorkBuddyWorkflow {
 constructor({state,save,root,runner,installed=()=>!!workbuddyCLI()}){Object.assign(this,{state,save,root,installed});this.preferDesktop=!runner&&process.platform==='darwin';this.history=new WorkBuddyHistory({state});this.desktop=new WorkBuddyDesktop({history:this.history,state,save,dataDir:path.dirname(root)});this.desktopSnapshot={tasks:[],lastTask:null};this.active=new Map();this.locks=new Set();this.permissions=new Map();this.runner=runner||this.run.bind(this);}
 status(){return {installed:this.installed(),connected:!!this.desktopRunning||(this.installed()&&!!this.state.workbuddyConnection?.verifiedAt&&!this.state.workbuddyConnection?.error),desktopRunning:!!this.desktopRunning,...this.state.workbuddyConnection};}
 async pollDesktop(){
  if(!this.probedAt||Date.now()-this.probedAt>5000){this.probedAt=Date.now();this.desktopRunning=(await Promise.all([18488,18489,18490].map(async port=>{try{const r=await fetch('http://127.0.0.1:'+port+'/workbuddy/probe',{signal:AbortSignal.timeout(400)});const b=await r.json();return r.ok&&b.ok===true&&b.app==='workbuddy-desktop';}catch{return false;}}))).some(Boolean);}
  const catalog=await this.catalog();await this.reconcile(catalog);const tasks=[],finished=[];
  for(const t of catalog.threads.filter(t=>t.desktop&&(t.runtimeOpen||this.state.projects.some(p=>p.transport==='desktop'&&p.threadId===t.id)||t.updatedAt>Date.now()-86400000)).slice(0,50)){
   const parsed=await this.history.transcript(t);const own=this.state.projects.find(p=>p.source==='workbuddy'&&p.threadId===t.id);const task=desktopTask(t,parsed,own?.directRoleId);if(task.active)tasks.push(task);else finished.push(task);
   for(const p of this.state.projects.filter(p=>p.transport==='desktop'&&p.threadId===t.id&&p.desktopMessageId&&['running','waiting','unknown'].includes(p.status))){
    const index=parsed.items.findIndex(i=>i.id===p.desktopMessageId);if(index<0)continue;
    p.summary=parsed.items.slice(index+1).filter(i=>i.type==='agentMessage').map(i=>i.text).join('\n');p.stage=task.stage;p.question=task.question;p.steps=task.plan.map(x=>({title:x.title,status:x.status==='completed'?'verified':x.status==='in_progress'?'running':'queued',weight:1,role:task.role}));
    // A completed database state from the preceding turn cannot finish a new unanswered message.
    if(task.status!=='completed'||p.summary||p.cancelRequestedAt){p.status=p.cancelRequestedAt&&!task.active?'cancelled':task.status;if(['completed','failed','cancelled'].includes(p.status))p.finishedAt=Date.now();}
    await this.syncUsage(p);
   }
  }
  if(tasks.length)this.state.workbuddyConnection={verifiedAt:Date.now(),error:null,transport:'desktop'};
  this.desktopSnapshot={tasks,lastTask:finished.sort((a,b)=>b.updatedAt-a.updatedAt)[0]||null};await this.save();
 }
 async reconcile(catalog){
  catalog??=await this.catalog();const results=[];
  for(const p of this.state.projects.filter(p=>p.source==='workbuddy'&&['unknown','recovered'].includes(p.status))){
   if(!p.threadId){p.stage='尚未找到对应会话，未重发任务';continue;}
   try{const thread=catalog.threads.find(t=>t.id===p.threadId);const parsed=await this.history.transcript({id:p.threadId,cwd:p.cwd});const result=recoverWorkBuddyProject(p,thread,parsed);Object.assign(p,result);p.recoveryCheckedAt=Date.now();if(['completed','failed','cancelled','interrupted'].includes(p.status))p.finishedAt??=Date.now();await this.syncUsage(p);results.push({id:p.id,status:p.status,reason:p.recoveryReason});}catch(e){p.stage='原始记录暂时无法读取：'+e.message;}
  }
  if(results.length)await this.save();return results;
 }
 async catalog(){return this.history.catalog();}
 async messages(id){const data=await this.history.messages(id);if(data.thread.desktop)data.activity=desktopTask(data.thread,await this.history.transcript(data.thread),this.state.projects.find(p=>p.threadId===id)?.directRoleId);return data;}
 async route(body){const catalog=await this.catalog();for(const t of catalog.threads.slice(0,40)){const data=await this.history.transcript(t).catch(()=>({items:[]}));t.recentContext=data.items.slice(-6).map(i=>i.text).join(' ').slice(-6000);}return routeTask(body,catalog);}
 async open(id){const c=await this.catalog();if(!c.threads.some(t=>t.id===id))throw Error('WorkBuddy 对话不存在');await openExternal('workbuddy://chat/'+encodeURIComponent(id));}
 async syncUsage(p){const entries=await this.history.collectUsage(p);this.state.usage??=[];for(const u of entries){const index=this.state.usage.findIndex(x=>x.id===u.id);if(index>=0)this.state.usage[index]=u;else this.state.usage.push(u);}return entries;}
 requests(){return [...this.permissions.values()].map(({client,...r})=>r);}
 async dispatch(b){
  if(!this.installed())throw Error('未找到 WorkBuddy 执行器');
  const prompt=String(b.prompt||'').trim(),roleId=b.roleId||'manager';
  if(prompt.length<2||prompt.length>12000)throw Error('需求需要 2～12000 个字符');
  if(!/^[\w-]{10,100}$/.test(b.requestId||''))throw Error('缺少有效提交标识');
  if(!this.state.roles.some(r=>r.id===roleId))throw Error('岗位不存在');
  const previous=this.state.projects.find(p=>p.requestId===b.requestId);
  if(previous){if(previous.source!=='workbuddy')throw Error('提交标识已用于其他 Agent');return {id:previous.id,threadId:previous.threadId,status:previous.status,duplicate:true};}
  if(b.route&&!b.followUpId){const route=await this.route(b);if(route.needsSelection)return route;b={...b,threadId:route.thread?.id,cwd:route.project?.roots[0]||b.cwd};}
  if(b.followUpId){const old=this.state.projects.find(p=>p.id===b.followUpId);if(old?.threadId&&old.transport!=='desktop'&&(await this.history.runtimeSessions()).some(r=>r.id===old.threadId))throw Error('此对话的执行器仍在运行，请稍后重试或在 WorkBuddy 关闭该任务');}
  let external=null;if(b.threadId){const c=await this.catalog();external=c.threads.find(t=>t.id===b.threadId);if(!external)throw Error('WorkBuddy 对话不存在');}
  const parent=b.followUpId?this.state.projects.find(p=>p.id===b.followUpId&&p.source==='workbuddy'):external?{threadId:external.id,cwd:external.cwd,model:external.model}:null;
  if(b.followUpId&&!parent)throw Error('未找到对应 WorkBuddy 对话');
  if(parent&&(!parent.threadId||this.active.has(parent.threadId)||this.state.projects.some(p=>p.source==='workbuddy'&&p.threadId===parent.threadId&&['running','waiting','submitting','syncing','unknown','recovered'].includes(p.status))))throw Error('此对话正在执行或状态尚未确认');
  const lock=parent?.threadId||b.requestId;if(this.locks.has(lock))throw Error('此对话正在执行');this.locks.add(lock);
  try{
   const existing=this.state.projects.find(p=>p.requestId===b.requestId);if(existing)return {id:existing.id,threadId:existing.threadId,status:existing.status,duplicate:true};
   const id=randomUUID();let cwd=parent?.cwd||path.join(this.root,id);
   if(!parent&&b.cwd){if(!path.isAbsolute(b.cwd))throw Error('工作目录需要绝对路径');cwd=await realpath(b.cwd);if(!(await stat(cwd)).isDirectory())throw Error('工作目录不存在');}
   await mkdir(cwd,{recursive:true});
   const p={id,requestId:b.requestId,source:'workbuddy',transport:external?.desktop||parent?.transport==='desktop'||(!parent&&this.preferDesktop)?'desktop':'acp',threadId:parent?.threadId,resume:!!parent,cwd,prompt,title:prompt.slice(0,40),projectName:'WorkBuddy · '+prompt.slice(0,24),directRoleId:roleId,parentId:b.parentId||null,status:'syncing',steps:[],createdAt:Date.now(),summary:''};
   this.state.projects.unshift(p);await this.save();
   this.active.set(p.threadId||p.id,p);
   (p.transport==='desktop'?this.desktop.run(p):this.runner(p)).catch(async e=>{p.status=p.status==='cancelled'?'cancelled':['submitting','running','waiting'].includes(p.status)?'unknown':'failed';p.error=e.message;this.state.workbuddyConnection={...this.state.workbuddyConnection,error:e.message};await this.save();}).finally(()=>{this.active.delete(p.id);if(p.threadId)this.active.delete(p.threadId);for(const [id,r]of this.permissions)if(r.projectId===p.id)this.permissions.delete(id);}).catch(()=>{});
   return {id:p.id,threadId:p.threadId,status:p.status};
  }finally{this.locks.delete(lock);}
 }
 async run(p){
  let usageTimer;const client=new WorkBuddyACP({cwd:p.cwd,onUpdate:({sessionId,update})=>{if(sessionId!==p.threadId)return;applyACPUpdate(p,update);this.save().catch(()=>{});},onPermission:(rpcId,params)=>{const id=randomUUID();this.permissions.set(id,{id,rpcId,projectId:p.id,tool:params.toolCall?.title||'工具调用',detail:params.toolCall?.rawInput||params.toolCall?.content||[],options:params.options||[],client});p.status='waiting';p.stage='等待你批准工具调用';this.save().catch(()=>{});}});
  this.clients??=new Map();this.clients.set(p.id,client);
  try{
   await client.connect();
   const params={cwd:p.cwd,mcpServers:[]};
   if(p.resume)await client.call('session/load',{...params,sessionId:p.threadId});
   else{const result=await client.call('session/new',params);p.threadId=result.sessionId;if(!p.threadId)throw Error('WorkBuddy 未返回有效会话');}
   this.active.delete(p.id);this.active.set(p.threadId,p);p.summary='';p.steps=[];p.toolCalls={};p.status='submitting';await this.save();
   const resultPromise=client.call('session/prompt',{sessionId:p.threadId,prompt:[{type:'text',text:p.prompt}]},0);
   p.status='running';p.stage='WorkBuddy 正在处理任务';await this.save();usageTimer=setInterval(()=>this.syncUsage(p).catch(()=>{}),5000);usageTimer.unref();
   const result=await resultPromise;
   if(p.status!=='cancelled')p.status=result.stopReason==='end_turn'?'completed':result.stopReason==='cancelled'?'cancelled':'interrupted';
   p.stopReason=result.stopReason;p.finishedAt=Date.now();p.stage=p.status==='completed'?'本次任务已完成':p.status==='cancelled'?'任务已取消':'执行已中断';
   await this.syncUsage(p).catch(e=>{p.usageError=e.message;});this.state.workbuddyConnection={verifiedAt:Date.now(),error:null};await this.save();
  }finally{clearInterval(usageTimer);client.close();this.clients.delete(p.id);}
 }
 async answer(id,optionId){const r=this.permissions.get(id);if(!r)throw Error('批准请求已失效');if(optionId&&!r.options.some(o=>o.optionId===optionId))throw Error('无效批准选项');r.client.answer(r.rpcId,optionId);this.permissions.delete(id);const p=this.state.projects.find(p=>p.id===r.projectId);if(p){p.status='running';p.stage='WorkBuddy 正在处理任务';}await this.save();}
 async answerQuestion({threadId,callId,optionIndex}){return this.desktop.enqueue(async()=>{
  const data=await this.messages(threadId),question=data.activity?.question;
  if(!question||question.callId!==callId||question.questions?.length!==1||question.questions[0].multiSelect)throw Error('提问已变化或需要在 WorkBuddy 原窗口处理');
  const option=question.questions[0].options?.[optionIndex];if(!Number.isInteger(optionIndex)||!option?.label)throw Error('无效回答选项');
  const expectedUser=data.items.filter(i=>i.type==='userMessage').at(-1)?.text.replace(/<\/?user_query>/g,'').trim();if(!expectedUser)throw Error('无法核验提问所属对话');
  await this.desktop.bridge({threadId,title:data.thread.name,expectedUser,prompt:expectedUser,action:'answer',optionTitle:(optionIndex+1)+' '+option.label,questionText:question.questions[0].question});
  return {ok:true};
 });}
 async cancel(id){const p=this.state.projects.find(p=>p.id===id&&p.source==='workbuddy');if(!p)throw Error('未找到 WorkBuddy 任务');if(p.transport==='desktop')return this.desktop.stop(p);const client=this.clients?.get(id);if(!client)throw Error('任务不在当前服务中执行，不能确认停止');p.status='cancelled';client.notify('session/cancel',{sessionId:p.threadId});for(const [id,r]of this.permissions)if(r.projectId===p.id){r.client.answer(r.rpcId,null);this.permissions.delete(id);}setTimeout(()=>client.close(),2000).unref();await this.save();}
}
