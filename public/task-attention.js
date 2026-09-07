const failures=new Set(['failed','interrupted']);
const confirmations=new Set(['awaiting_confirmation','needs_confirmation','blocked','waiting_input','waiting']);
export function pendingFeedback(projects=[]){return projects.filter(p=>(failures.has(p.status)||confirmations.has(p.status)||(p.kind==='character-design'&&p.status==='completed'))&&p.feedbackReadStatus!==p.status).map(p=>({id:p.id,status:p.status,label:failures.has(p.status)?'任务失败':'有任务待确认'}));}
export function managerAttention(projects){const items=pendingFeedback(projects);return items.length?{label:items.some(p=>p.label==='任务失败')?'任务失败':'有任务待确认',items}:null;}
export function acknowledgeFeedback(projects,items=[]){for(const item of items){const p=projects.find(p=>p.id===item.id);if(p&&p.status===item.status&&pendingFeedback([p]).length){p.feedbackReadStatus=p.status;p.feedbackReadAt=Date.now();}}}
