const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s·：:，,。！？!?「」“”《》"'_-]/g,'');
const explicit=(s,re)=>re.test(s.replace(/(?:不要|不用|无需|别|不必)\s*(?:再)?\s*(?:新建|创建|另建|开一个|新开)\s*(?:一个)?\s*(?:项目|对话|会话|任务)/g,''));
export function routeTask({prompt,route={},contextThreadId},catalog){
 if(route.mode==='existing'&&!route.threadId)throw Error('请选择要延续的对话');
 const text=normalize(prompt),projects=catalog.projects,threads=catalog.threads;
 const newProject=route.mode==='new_project'||route.mode!=='existing'&&explicit(prompt,/(?:新建|创建|另建|开一个|新开)\s*(?:一个)?\s*项目/);
 const newThread=route.mode==='new_thread'||route.mode!=='existing'&&explicit(prompt,/(?:新建|创建|另建|开一个|新开)\s*(?:一个)?\s*(?:对话|会话)/);
 const choose=reason=>({needsSelection:true,reason,projects,threads:threads.slice(0,100)});
 if(newProject){const match=prompt.match(/(?:新建|创建|另建|开一个|新开)\s*(?:一个)?\s*项目\s*(?:叫做|名为|叫|名称是|：|:)?\s*[「“《"]([^」”》"\n]+)[」”》"]/);const name=String(route.projectName||match?.[1]||'').trim();if(!name)return {...choose('这是新项目，请填写项目名称。'),requestedMode:'new_project'};return {mode:'new_project',projectName:name,threadName:route.threadName||prompt.slice(0,40),reason:'明确要求新建项目'};}
 if(route.threadId&&!newThread){const t=threads.find(t=>t.id===route.threadId);if(!t)throw Error('所选对话已不存在或已归档');if(route.projectId&&t.projectId!==route.projectId)throw Error('所选对话不属于这个项目');return {mode:'existing',thread:t,project:projects.find(p=>p.id===t.projectId),reason:'使用指定对话'};}
 let candidates=route.projectId?projects.filter(p=>p.id===route.projectId):projects.filter(p=>text.includes(normalize(p.name)));
 if(route.projectId&&!candidates.length)throw Error('所选项目已不存在');
 const exact=threads.filter(t=>normalize(t.name).length>=4&&text.includes(normalize(t.name))&&(!candidates.length||candidates.some(p=>p.id===t.projectId)));
 if(!newThread&&exact.length===1)return {mode:'existing',thread:exact[0],project:projects.find(p=>p.id===exact[0].projectId),reason:'任务明确提到已有对话名称'};
 if(candidates.length>1)return choose('需求涉及多个项目，请指定这次任务的归属。');
 if(newThread){if(candidates.length!==1)return {...choose('这是新对话，请选择所属项目。'),requestedMode:'new_thread'};return {mode:'new_thread',project:candidates[0],threadName:route.threadName||prompt.slice(0,40),reason:'明确要求在项目中新建对话'};}
 const items=threads.filter(t=>!candidates.length||t.projectId===candidates[0].id);
 const use=(t,reason)=>({mode:'existing',thread:t,project:projects.find(p=>p.id===t.projectId),reason});
 const generic=new Set(['帮我','一个','任务','项目','对话','需要','生成','修改','继续','里面','这个','功能','新建','设计','修复','一下','还是','可以','现在','上面','下面','一点','什么','为什么','怎么','已经','内容','调整','整理','一些','我想','帮忙','处理']);
 const topic=candidates.reduce((s,p)=>s.replaceAll(normalize(p.name),' '),text);
 const words=[...new Set([...new Intl.Segmenter('zh',{granularity:'word'}).segment(topic)].filter(x=>x.isWordLike&&x.segment.length>=2).map(x=>normalize(x.segment)).filter(x=>!generic.has(x)))];
 const scored=items.map(t=>{const title=normalize(t.name),body=normalize([t.preview,t.recentContext].filter(Boolean).join(' '));const matches=words.filter(w=>title.includes(w)||body.includes(w));return {t,count:matches.length,score:matches.reduce((n,w)=>n+(title.includes(w)?3:2),0)};}).filter(x=>x.count>=2).sort((a,b)=>b.score-a.score);
 if(scored.length===1||scored[0]?.score>=(scored[1]?.score||0)+2){return use(scored[0].t,'根据对话标题和最近内容匹配：'+scored[0].t.name);}
 const current=items.find(t=>t.id===contextThreadId);
 if(current&&/(?:继续|接着|刚才|上次|这个|那个|它|还是|仍然|还有|另外|再|改成|换成|往[上下左右]|不对|没用|点不了)/.test(prompt))return use(current,'续接当前对话：'+current.name);
 if(candidates.length===1){if(items.length===1)return use(items[0],'匹配到项目及唯一对话');return {...choose('该项目中仍有多个可能的对话，请选择这次要继续的对话。'),projectId:candidates[0].id,threads:items};}
 return choose('没有足够信息确定归属，请选择已有项目和对话，或明确新建。');
}
