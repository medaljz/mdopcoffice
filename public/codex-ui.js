const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupCodexUI({api,action,modal,toast,getState,onSubmitted,onWorkBuddy}){
 let lastThreadId=null;
 try{const saved=JSON.parse(localStorage.getItem('opc.codex-context')||'null');if(saved&&Date.now()-saved.at<86400000)lastThreadId=saved.id;}catch{}
 function remember(id){lastThreadId=id;try{localStorage.setItem('opc.codex-context',JSON.stringify({id,at:Date.now()}));}catch{}}

 async function task({threadId,projectId,roleId='manager'}={}){
  const requestId=crypto.randomUUID();
  modal('安排 Codex 任务',`<form id="sync-task-form"><label class="form-field"><span>执行 Agent</span><select id="task-agent"><option value="codex">Codex</option><option value="workbuddy">WorkBuddy</option></select></label><label class="form-field"><span>任务需求</span><textarea name="prompt" required minlength="2" maxlength="12000" placeholder="说明任务内容；可以说：继续某项目的某个对话，或新建项目、新建对话。"></textarea></label><label class="form-field"><span>项目与对话</span><select name="mode"><option value="auto">自动判断归属</option><option value="existing">延续对话（手动选择）</option><option value="new_thread">在已有项目中新建对话</option><option value="new_project">新建项目和对话</option></select></label><button type="button" class="secondary" id="sync-select-existing">延续对话 · 手动选择</button><div id="sync-route-fields"></div><p id="sync-route-note" class="tiny-note">正在读取 Codex 项目与对话…</p><p class="tiny-note">消息和回复保存在真实 Codex 对话中。无法确定归属时会让你选择；执行使用 Codex 实际用量。</p><button class="primary" type="submit" disabled>发送任务</button></form>`);
  const form=document.querySelector('#sync-task-form');document.querySelector('#task-agent').onchange=()=>onWorkBuddy({roleId});let catalog;
  try{catalog=await api('history');if(!form.isConnected)return;}catch(e){if(form.isConnected)document.querySelector('#sync-route-note').textContent=e.message;return;}
  if(lastThreadId&&!catalog.threads.some(t=>t.id===lastThreadId))lastThreadId=null;
  if(!lastThreadId){const active=(getState().hostActivity?.tasks||[]).filter(t=>t.source!=='workbuddy'&&catalog.threads.some(c=>c.id===t.id));if(active.length===1)lastThreadId=active[0].id;}
  const note=document.querySelector('#sync-route-note');note.textContent='共 '+catalog.projects.length+' 个项目、'+catalog.threads.length+' 个对话'+(lastThreadId?'；当前上下文：'+catalog.threads.find(t=>t.id===lastThreadId)?.name:'');
  function fields(){const mode=form.mode.value;if(mode==='existing')note.textContent='只发送到你选中的对话，不再自动判断归属。';document.querySelector('#sync-route-fields').innerHTML=mode==='new_project'?`<label class="form-field"><span>新项目名称</span><input name="projectName" required maxlength="80" placeholder="例如：摄影工作室网站"></label><label class="form-field"><span>对话名称（可选）</span><input name="threadName" maxlength="80"></label>`:mode==='auto'?'':`<label class="form-field"><span>所属项目</span><select name="projectId"><option value="">选择项目</option>${catalog.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><div id="sync-thread-field"></div>`;if(form.projectId){form.projectId.value=projectId||'';form.projectId.onchange=threads;threads();}}
  function threads(){const id=form.projectId.value;document.querySelector('#sync-thread-field').innerHTML=form.mode.value==='new_thread'?`<label class="form-field"><span>新对话名称（可选）</span><input name="threadName" maxlength="80"></label>`:`<label class="form-field"><span>延续到哪个对话</span><select name="threadId" required><option value="">选择对话</option>${catalog.threads.filter(t=>!id||t.projectId===id).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>`;if(form.threadId)form.threadId.value=threadId||'';}
  document.querySelector('#sync-select-existing').onclick=()=>{form.mode.value='existing';fields();form.threadId.focus();};form.mode.onchange=fields;if(projectId)form.mode.value='new_thread';if(threadId){form.mode.value='existing';projectId=catalog.threads.find(t=>t.id===threadId)?.projectId;}fields();form.querySelector('[type=submit]').disabled=false;
  let previewTimer,previewSequence=0;
  form.prompt.addEventListener('input',()=>{clearTimeout(previewTimer);const sequence=++previewSequence;previewTimer=setTimeout(async()=>{if(!form.isConnected||form.mode.value!=='auto'||form.prompt.value.trim().length<2)return;try{const r=await api('codex-route',{prompt:form.prompt.value,contextThreadId:threadId||lastThreadId,route:{mode:'auto'}});if(form.isConnected&&form.mode.value==='auto'&&sequence===previewSequence)note.textContent=r.needsSelection?r.reason:'自动归属：'+(r.thread?.name||r.project?.name||r.projectName)+' · '+r.reason;}catch(e){if(form.isConnected&&form.mode.value==='auto'&&sequence===previewSequence)note.textContent=e.message;}},500);});
  form.onsubmit=async e=>{e.preventDefault();clearTimeout(previewTimer);previewSequence++;const button=form.querySelector('[type=submit]');button.disabled=true;note.textContent='正在匹配并同步到 Codex…';const values=Object.fromEntries(new FormData(form));try{const result=await action('project',{prompt:values.prompt,roleId,requestId,contextThreadId:threadId||lastThreadId,route:values});if(result.needsSelection){note.textContent=result.reason;projectId=result.projectId;form.mode.value=result.requestedMode||'existing';fields();return;}remember(result.threadId);document.querySelector('#dialog').close();toast('已同步到 Codex：'+(result.projectName||'对应对话'));onSubmitted();}catch(e){note.textContent=e.message;}finally{button.disabled=false;}};
 }
 async function messages(threadId){
  remember(threadId);
  modal('Codex 对话记录','<h3 id="sync-title"></h3><div id="sync-messages" style="max-height:430px;overflow:auto"><p>正在读取真实对话…</p></div><p id="sync-error" class="tiny-note"></p><div class="form-actions"><button class="secondary" id="sync-open">在 Codex 中打开</button><button class="primary" id="sync-continue">继续此对话</button><button class="secondary" id="sync-stop" hidden>停止当前任务</button></div>');
  const dialog=document.querySelector('#dialog'),list=document.querySelector('#sync-messages'),title=document.querySelector('#sync-title'),error=document.querySelector('#sync-error'),stopButton=document.querySelector('#sync-stop');
  let timer,stopped=false,loading=false,previousHTML=null;
  function stop(){stopped=true;clearInterval(timer);}
  document.querySelector('#sync-open').onclick=()=>action('codex-open',{threadId}).catch(()=>{});
  document.querySelector('#sync-continue').onclick=()=>{stop();task({threadId});};
  dialog.addEventListener('close',stop,{once:true});
  async function load(){
   if(stopped||loading||!dialog.open||!list.isConnected)return;
   loading=true;
   try{
    const r=await api('codex-messages?threadId='+encodeURIComponent(threadId));
    if(stopped||!dialog.open||!list.isConnected)return;
    const items=r.items.filter(i=>['userMessage','agentMessage'].includes(i.type));
    const html=items.map(i=>`<article class="history-item"><b>${i.type==='userMessage'?'你':'Codex'}</b><pre class="report">${esc(i.text||i.content?.map(x=>x.text||'').join('\n')||'')}</pre></article>`).join('')||'<p>暂时没有文字消息。</p>';
    title.textContent=r.thread.name||'Codex 对话';error.textContent='';
    if(html!==previousHTML){
     const top=list.scrollTop,follow=previousHTML===null||list.scrollHeight-list.clientHeight-top<=24;
     list.innerHTML=html;
     list.scrollTop=follow?list.scrollHeight:top;
     previousHTML=html;
    }
    const active=getState().projects.find(p=>p.threadId===threadId&&['running','waiting','unknown'].includes(p.status));
    stopButton.hidden=!active;stopButton.onclick=active?()=>action('cancel',{id:active.id}).catch(()=>{}):null;
   }catch(e){if(!stopped&&list.isConnected)error.textContent=e.message;}
   finally{loading=false;}
  }
  await load();if(!stopped&&list.isConnected)timer=setInterval(load,3000);
 }
 async function history(){modal('Codex 项目与对话','<p>正在读取…</p>');try{const r=await api('history');document.querySelector('#dialog-body').innerHTML=r.projects.map(p=>`<section class="history-item"><h3>${esc(p.name)}</h3><p class="tiny-note">${esc(p.roots.join('、'))}</p><button class="secondary" data-new-thread="${p.id}">在此项目安排任务</button>${r.threads.filter(t=>t.projectId===p.id).map(t=>`<button class="employee" data-thread="${t.id}">${esc(t.name)}</button>`).join('')}</section>`).join('')+`<h3>其他对话</h3>`+r.threads.filter(t=>!t.projectId).map(t=>`<button class="employee" data-thread="${t.id}">${esc(t.name)}</button>`).join('');document.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>messages(b.dataset.thread));document.querySelectorAll('[data-new-thread]').forEach(b=>b.onclick=()=>task({projectId:b.dataset.newThread}));}catch(e){document.querySelector('#dialog-body').textContent=e.message;}}
 return {task,messages,history};
}

export function showCodexRequests({state,modal,action,toast}){
 const requests=state.codexRequests||[];if(!requests.length)return;
 modal('Codex 需要你处理',requests.map((r,i)=>{const q=r.params.questions||[],approval=/requestApproval$/.test(r.method)&&!r.method.includes('permissions');return `<section class="history-item"><p>${esc(r.params.reason||r.params.message||r.method)}</p>${r.params.command?`<pre class="report">${esc(r.params.command)}</pre>`:''}${q.length?`<form data-question="${i}">${q.map(x=>`<label class="form-field"><span>${esc(x.question)}</span><input name="${esc(x.id)}" required placeholder="${esc(x.options?.map(o=>o.label).join(' / ')||'输入回答')}"></label>`).join('')}<button type="submit" class="primary">提交回答</button></form>`:approval?`<button data-approve="${i}" data-decision="accept" class="primary">允许本次</button> <button data-approve="${i}" data-decision="decline" class="secondary">拒绝</button>`:`<p class="tiny-note">此请求需要 Codex 支持的专用交互；可停止任务后在 Codex 对话中继续处理。</p>`}</section>`}).join(''));
 document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{try{await action('codex-answer',{id:String(requests[b.dataset.approve].id),result:{decision:b.dataset.decision}});document.querySelector('#dialog').close();}catch{}});
 document.querySelectorAll('[data-question]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();try{await action('codex-answer',{id:String(requests[f.dataset.question].id),result:{answers:Object.fromEntries([...new FormData(f)].map(([k,v])=>[k,{answers:[v]}]))}});document.querySelector('#dialog').close();}catch{}});
}
