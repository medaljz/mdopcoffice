// Scope desktop activity to the latest real user turn. Tool results are evidence;
// old plans and tools must not leak into a subsequent conversational reply.
const user=r=>(r.role||r.message?.role||r.type)==='user'&&!r.isMeta;
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
export function currentWorkBuddyTurn(records=[]){
 const start=records.findLastIndex(user),items=start<0?records:records.slice(start);
 const results=new Map(items.filter(r=>r.type==='function_call_result').map(r=>[r.callId,r]));
 let plan=[];const tools=[],tasks=new Map();
 for(const r of items){
  if(r.type==='function_call'){
   const args=parse(r.arguments)||{},result=results.get(r.callId);
   if(r.name==='TodoWrite'){
    if(result?.status==='completed'&&!result.providerData?.toolResult?.isError){const next=normalizePlan(args.newTodos??args.todos);if(next)plan=next;}
   }else if(!['TaskCreate','TaskUpdate','TaskList'].includes(r.name))tools.push({callId:r.callId,name:r.name,args,pending:!result,failed:result?.status==='failed'});
  }
  if(r.type==='function_call_result'&&['TaskCreate','TaskUpdate','TaskList'].includes(r.name)&&r.status==='completed'&&!r.providerData?.toolResult?.isError){const raw=r.providerData?.toolResult?.rawResponse||{};const rows=raw.todos;
   if(normalizePlan(rows))for(const item of rows)tasks.set(item.id||'title:'+(item.content??item.subject),item);
   if(raw.task?.id){if(raw.task.status==='deleted')tasks.delete(raw.task.id);else if(normalizePlan([raw.task]))tasks.set(raw.task.id,raw.task);}
   if(tasks.size||Array.isArray(rows))plan=normalizePlan([...tasks.values()])||plan;}
 }
 return {records:items,plan,tool:tools.at(-1),user:items.find(user)};
}
export function normalizePlan(value){const rows=parse(value);if(!Array.isArray(rows)||!rows.every(x=>x&&typeof (x.content??x.subject)==='string'&&(x.content??x.subject).trim()&&['pending','in_progress','completed'].includes(x.status)))return null;return rows.map(x=>({title:x.content??x.subject,status:x.status}));}
export function workBuddyRole(tool,assigned){
 if(assigned&&assigned!=='manager')return assigned;
 if(!tool)return assigned||'manager';
 const name=tool.name||'',command=String(tool.args?.command||'');
 if(/imagegen|image_gen|generate_image|view_image/i.test(name))return 'designer';
 if(/^(Bash|Execute|Terminal)$/i.test(name)&&/\b(npm (test|run (check|test))|node --test|pytest|cargo test|swift test)\b/.test(command))return 'reviewer';
 if(/^(Bash|Write|Edit|Execute|Terminal|apply_patch)$/i.test(name))return 'developer';
 if(/^(Read|Grep|Glob|WebSearch|WebFetch)$/i.test(name))return 'product';
 return assigned||'manager';
}
