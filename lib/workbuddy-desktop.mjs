import {currentWorkBuddyTurn,workBuddyRole} from './workbuddy-turn.mjs';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {openExternal} from './platform.mjs';
export class WorkBuddyDesktop {
 constructor({history,save,state,dataDir}){Object.assign(this,{history,save,state,dataDir});this.busy=false;this.queue=Promise.resolve();}
 enqueue(operation){const next=this.queue.then(operation);this.queue=next.catch(()=>{});return next;}
 async run(p){p.stage="等待 WorkBuddy 发送窗口";await this.save();return this.enqueue(()=>p.status==='cancelled'?undefined:this.runInWindow(p));}
 async stop(p){if(p.status==='syncing'){p.status='cancelled';p.stage='已取消排队任务';p.finishedAt=Date.now();await this.save();return;}return this.enqueue(()=>this.stopInWindow(p));}
 async bridge(request){
  if(process.platform!=='darwin')throw Error('当前桌面续接适配仅用于本机 macOS');
  if(this.busy)throw Error('正在向 WorkBuddy 窗口发送另一条消息，请稍后再试');this.busy=true;
  try{const file=path.join(this.dataDir,'tools/workbuddy-bridge'),source=path.resolve('native/WorkBuddyBridge.swift');await mkdir(path.dirname(file),{recursive:true});
   if((await stat(file).catch(()=>({mtimeMs:0}))).mtimeMs<(await stat(source)).mtimeMs)await promisify(execFile)('xcrun',['swiftc',source,'-o',file]);
   if(request.threadId)await openExternal('workbuddy://chat/'+encodeURIComponent(request.threadId));
   return await new Promise((resolve,reject)=>{const child=spawn(file,[],{stdio:['pipe','pipe','pipe']});let err='';const timeout=setTimeout(()=>child.kill('SIGKILL'),30000);child.stdin.on('error',()=>{});child.once('close',()=>clearTimeout(timeout));child.stderr.on('data',b=>err+=b);child.stdout.resume();child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(err||'WorkBuddy 窗口操作失败')));child.stdin.end(JSON.stringify(request));});
  }finally{this.busy=false;}
 }
 async create(p){
  const u=new URL('workbuddy://task');u.searchParams.set('action','start');u.searchParams.set('cwd',p.cwd);u.searchParams.set('prompt',p.prompt);
  p.status='submitting';p.stage='正在 WorkBuddy 桌面创建任务';await this.save();await openExternal(u.href);await this.bridge({title:path.basename(p.cwd),expectedUser:p.prompt,prompt:p.prompt,action:'create'});
  const until=Date.now()+60000;
  while(Date.now()<until){const catalog=await this.history.catalog();for(const t of catalog.threads.filter(t=>t.desktop&&t.cwd===p.cwd&&t.updatedAt>=p.createdAt)){const parsed=await this.history.transcript(t);const m=parsed.items.find(i=>i.type==='userMessage'&&i.time>=p.createdAt&&i.text.replace(/<\/?user_query>/g,'').trim()===p.prompt);if(m){p.threadId=t.id;p.desktopMessageId=m.id;p.status='running';p.stage='WorkBuddy 原窗口正在执行';this.state.workbuddyConnection={verifiedAt:Date.now(),error:null};await this.save();return;}}await new Promise(r=>setTimeout(r,500));}
  p.status='unknown';p.error='WorkBuddy 桌面新任务送达尚未确认；不会自动重发';await this.save();
 }
 async stopInWindow(p){const data=await this.history.messages(p.threadId);const expectedUser=data.items.filter(i=>i.type==='userMessage').at(-1)?.text.replace(/<\/?user_query>/g,'').trim();if(!expectedUser)throw Error('无法核验要停止的对话');await this.bridge({threadId:p.threadId,title:data.thread.name,expectedUser,prompt:p.prompt,action:'stop'});p.cancelRequestedAt=Date.now();p.stage='已请求 WorkBuddy 停止，正在核对结果';await this.save();}
 async runInWindow(p){
  if(!p.threadId)return this.create(p);
  const data=await this.history.messages(p.threadId);const expectedUser=data.items.filter(i=>i.type==='userMessage').at(-1)?.text.replace(/<\/?user_query>/g,'').trim();
  if(!expectedUser)throw Error('没有可核验的原对话内容，未发送');
  p.status='submitting';p.stage='正在核对 WorkBuddy 原窗口';await this.save();
  await this.bridge({threadId:p.threadId,title:data.thread.name,expectedUser,prompt:p.prompt});
  p.status='submitting';p.stage='已操作原窗口，正在核对消息是否送达';await this.save();
  const until=Date.now()+45000;
  while(Date.now()<until){const transcript=await this.history.transcript(data.thread);const message=transcript.items.find(i=>i.type==='userMessage'&&i.time>=p.createdAt&&i.text.replace(/<\/?user_query>/g,'').trim()===p.prompt);if(message){p.desktopMessageId=message.id;p.status='running';p.stage='WorkBuddy 原窗口正在执行';this.state.workbuddyConnection={verifiedAt:Date.now(),error:null};await this.save();return;}await new Promise(r=>setTimeout(r,500));}
  p.status='unknown';p.error='原窗口消息送达尚未确认，请查看 WorkBuddy；不会自动重发';await this.save();
 }
}
export function desktopTask(thread,parsed,role='manager'){
 const turn=currentWorkBuddyTurn(parsed.records);
 const raw=String(thread.desktopStatus||thread.status||'').toLowerCase();const last=turn.records.filter(r=>['message','user','assistant','function_call','function_call_result'].includes(r.type)).at(-1);
 let status=['completed','idle'].includes(raw)?'completed':['error','failed'].includes(raw)?'failed':['cancelled','canceled','terminated'].includes(raw)?'cancelled':['pending','waiting_user_input','await_input','waiting_permission','waiting_question','paused'].includes(raw)?'waiting':['active','running','working','planning','preparing','summarizing'].includes(raw)?'running':'unknown';
 if(status==='running'&&turn.tool?.pending&&['AskUserQuestion','ask_user','request_user_input'].includes(turn.tool.name))status='waiting';
 if(last?.providerData?.error||last?.status==='incomplete')status='failed';
 if(['running','waiting'].includes(status)&&!thread.runtimeOpen)status='unknown';
 const tool=turn.tool?.name||'';role=workBuddyRole(turn.tool,role);
 const plan=turn.plan,done=plan.filter(x=>x.status==='completed').length;const progress=plan.length?Math.min(status==='completed'?100:99,Math.round(100*done/plan.length)):status==='completed'?100:null;
 const latestUser=parsed.items.filter(i=>i.type==='userMessage').at(-1);
 return {id:thread.id,source:'workbuddy',project:thread.name,cwd:thread.cwd,role:role||'manager',active:['running','waiting'].includes(status),status,task:latestUser?.text.replace(/<\/?user_query>/g,'')||thread.name,stage:status==='completed'?'本次任务已完成':status==='failed'?'WorkBuddy 执行失败':status==='waiting'?'请在 WorkBuddy 处理批准或输入':status==='unknown'?'WorkBuddy 执行状态待确认':plan.find(x=>x.status==='in_progress')?.title||(tool&&turn.tool.pending?'正在调用 '+tool:'WorkBuddy 正在回复'),updatedAt:thread.updatedAt,progress,plan,question:status==='waiting'&&turn.tool?.name==='AskUserQuestion'&&turn.tool.pending?{callId:turn.tool.callId,questions:turn.tool.args.questions}:null};
}
