const clean=s=>String(s||'').replace(/<\/?user_query>/g,'').trim();
const timestamp=r=>typeof r.timestamp==='number'?r.timestamp:Date.parse(r.timestamp)||0;
// Never send, cancel or start a runtime here. A complete assistant message is not
// itself evidence that session/prompt returned end_turn.
export function recoverWorkBuddyProject(project,thread,parsed){
 const candidates=parsed.items.filter(i=>i.type==='userMessage'&&(project.desktopMessageId?i.id===project.desktopMessageId:clean(i.text)===clean(project.prompt)&&i.time>=project.createdAt-1000));
 if(candidates.length!==1)return {status:'unknown',stage:'没有找到唯一匹配的原始消息，未重发任务',recoveryReason:'message_not_identified'};
 const message=candidates[0],start=parsed.records.findIndex(r=>(r.id||r.uuid)===message.id);
 if(start<0)return {status:'unknown',stage:'原始消息记录不完整，未重发任务',recoveryReason:'missing_record'};
 let end=parsed.records.findIndex((r,i)=>i>start&&(r.role||r.message?.role||r.type)==='user'&&!r.isMeta);if(end<0)end=parsed.records.length;
 const records=parsed.records.slice(start,end),last=records.filter(r=>['message','assistant','function_call','function_call_result'].includes(r.type)).at(-1);
 const nextTime=end<parsed.records.length?timestamp(parsed.records[end]):Infinity;
 const replies=parsed.items.filter(i=>i.type==='agentMessage'&&i.time>=message.time&&i.time<nextTime);
 const summary=replies.map(i=>i.text).join('\n');const patch={summary:summary||project.summary||'',desktopMessageId:project.transport==='desktop'?message.id:project.desktopMessageId,recoveryMessageId:message.id};
 const pending=new Set();for(const r of records){if(r.type==='function_call')pending.add(r.callId);if(r.type==='function_call_result')pending.delete(r.callId);}
 const state=String(thread?.desktopStatus||'').toLowerCase();const latest=end===parsed.records.length;
 if(project.stopReason==='end_turn'||latest&&['completed'].includes(state)&&summary&&!pending.size)return {...patch,status:'completed',stage:'已核对原始记录：本轮已完成',error:null,recoveryReason:'terminal_confirmed'};
 if(project.stopReason==='cancelled'||latest&&['cancelled','canceled','terminated'].includes(state))return {...patch,status:'cancelled',stage:'已核对原始记录：本轮已取消',error:null,recoveryReason:'cancel_confirmed'};
 if(last?.providerData?.error||last?.status==='incomplete'||latest&&['failed','error'].includes(state))return {...patch,status:'failed',stage:'原始记录确认执行失败',error:'WorkBuddy 原始记录包含失败或未完成响应',recoveryReason:'failure_confirmed'};
 if(summary&&(last?.role||last?.type)==='assistant'&&last.status==='completed'&&!pending.size)return {...patch,status:thread?.runtimeOpen===false?'interrupted':'recovered',stage:thread?.runtimeOpen===false?'完整回复已恢复；原执行器已离线，未收到结束确认':'完整回复已恢复；执行结束状态待确认',error:null,recoveryReason:'reply_recovered_without_terminal'};
 return {...patch,status:'unknown',stage:pending.size?'原记录仍有未确认工具调用；未重发任务':'尚无本轮结束证据；未重发任务',recoveryReason:'terminal_missing'};
}
