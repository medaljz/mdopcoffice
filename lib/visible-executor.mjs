import {randomUUID} from 'node:crypto';

// Keep the workflow's independent execution/review turns, but persist each as a
// named Codex conversation instead of an invisible CLI subprocess.
export function visibleExecutor({sync,workflow,project,save}) {
 return async ({cwd,prompt,schema,readOnly=false,images=[],signal,onEvent})=>{
  if(signal?.aborted)throw Error('任务已取消');
  const continuous=project.generationMode==='sprite-sheet-6x3'&&!readOnly;
  const {thread}=continuous&&project.designerThreadId?await sync.app.call('thread/resume',{threadId:project.designerThreadId,excludeTurns:true}):await sync.app.call('thread/start',{cwd,historyMode:'paginated'});
  if(continuous)project.designerThreadId=thread.id;
  const id=thread.id,runId=randomUUID();
  await sync.app.call('thread/name/set',{threadId:id,name:`${project.title} · ${project.steps?.find(s=>['running','submitted','rework'].includes(s.status))?.title||''} · ${readOnly?'审核':'执行'}`.slice(0,80)});
  project.threadId=id;project.transport='app-server';project.syncManaged=true;
  onEvent?.({type:'thread.started',thread_id:id},runId);await save();
  let turnId,output='',usage,settled=false;
  return await new Promise((resolve,reject)=>{
   const finish=(error)=>{if(settled)return;settled=true;sync.app.off('event',event);sync.app.off('disconnect',disconnect);signal?.removeEventListener('abort',abort);for(const [key,r]of workflow.pendingRequests)if(r.threadId===id)workflow.pendingRequests.delete(key);error?reject(error):resolve({id:runId,output});};
   const disconnect=()=>finish(Error('Codex 连接中断，请查看原对话后继续，未自动重复执行'));
   const abort=()=>{if(turnId)sync.app.call('turn/interrupt',{threadId:id,turnId}).catch(e=>finish(e));};
   const event=e=>{const x=e.params||{};if(x.threadId!==id)return;
    if(e.id!==undefined){workflow.pendingRequests.set(String(e.id),{id:e.id,method:e.method,params:x,threadId:id});save();}
    if(e.method==='turn/started'){turnId=x.turn.id;if(signal?.aborted)abort();}
    if(e.method==='thread/tokenUsage/updated'){const u=x.tokenUsage?.last;usage=u&&{input_tokens:u.inputTokens,output_tokens:u.outputTokens,cached_input_tokens:u.cachedInputTokens};}
    if(e.method==='item/started'||e.method==='item/completed'){const type=({agentMessage:'agent_message',commandExecution:'command_execution',fileChange:'file_change',mcpToolCall:'mcp_tool_call'})[x.item?.type]||x.item?.type;if(type==='agent_message'&&e.method==='item/completed')output=x.item.text||output;onEvent?.({type:e.method.replace('/','.'),item:{...x.item,type}},runId);}
    if(e.method==='turn/completed'){if(usage)onEvent?.({type:'turn.completed',usage},runId);finish(x.turn.status==='completed'&&!signal?.aborted?null:Error(x.turn.error?.message||'任务已取消或中断'));}
   };
   sync.app.on('event',event);sync.app.on('disconnect',disconnect);signal?.addEventListener('abort',abort,{once:true});
   sync.app.call('turn/start',{threadId:id,cwd,input:[{type:'text',text:prompt,text_elements:[]},...images.map(path=>({type:'localImage',path}))],outputSchema:schema??null,approvalPolicy:'never',sandboxPolicy:readOnly?{type:'readOnly'}:{type:'workspaceWrite',writableRoots:[cwd],networkAccess:true}}).then(async r=>{turnId=r.turn.id;project.turnId=turnId;await save();if(signal?.aborted)abort();await sync.desktop.open(id).catch(e=>{project.syncWarning='对话已保存，但自动打开失败：'+e.message;save();});if(r.turn.status==='completed')finish();}).catch(finish);
  });
 };
}
