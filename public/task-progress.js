// External percentages are based only on the task's reported plan.
export function taskProgress(state){
 const projects=state.projects||[],active=projects.filter(p=>['running','planning','waiting','syncing','submitting'].includes(p.status));
 const hostTasks=state.hostActivity?.tasks||[],last=state.hostActivity?.lastTask;
 const external=(hostTasks.length?hostTasks:!active.length&&last?[last]:[]).filter(t=>!active.some(p=>p.threadId?p.threadId===t.id:p.cwd&&p.cwd===t.cwd)).map(t=>({id:t.id,title:t.project,task:t.task,stage:t.status==='completed'?'本次任务已完成':t.stage,status:t.status||'running',progress:t.progress??(t.source==='workbuddy'?null:0),steps:t.plan||[],source:t.source==='workbuddy'?'WorkBuddy':'Codex'}));
 const local=active.map(p=>({...p,progress:p.source==='codex'?p.progress??0:p.steps?.length?p.progress:null,stage:p.stage||p.steps?.find(x=>['running','submitted','rework'].includes(x.status))?.title||'正在规划',source:p.source==='workbuddy'?'WorkBuddy':'OPC'}));
 return [...external,...local];
}
