import {CHARACTER_LABELS} from './character-actions.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function showCharacterDialog(role,{getState,modal,action,toast,onStarted}){
 const $=s=>document.querySelector(s),state=getState();
 const concepts=[...(role.characterConcepts||[])].reverse();
 const busy=state.projects.some(p=>p.kind==='character-design'&&p.status==='running');
 modal(`${role.title} · ${role.name} · 角色形象`, `<p>① 照片设计像素人物 → ② 确认形象 → ③ 6×3图集制作动作</p>
 <form id="character-form"><p class="tiny-note">当前设计对象：${esc(role.title)} · ${esc(role.name)}</p><div class="character-preview">${role.referenceImage?`<img src="/media/${esc(role.referenceImage)}" alt="原始人物照片">`:'<span>上传人物照片</span>'}</div>
 <label class="form-field"><span>参考图 · PNG / JPEG / WebP，最大 8 MB</span><input type="file" id="character-file" accept="image/png,image/jpeg,image/webp"></label>
 <label class="form-field"><span>人物设计要求</span><textarea name="brief" maxlength="3000" placeholder="保留发型和眼镜，穿深绿色针织衫，设计为清晰像素块的游戏人物。"></textarea></label>
 <p class="tiny-note">先只设计一个完整站姿人物，确认相似度、服装和像素画风后再制作动作。设计期间保留当前办公室形象。</p>
 <button type="submit" class="primary" ${!role.referenceImage||busy?'disabled':''}>${busy?'设计任务执行中':'设计像素人物'}</button>
 <button type="button" class="text-button" id="reset-avatar">恢复默认形象</button></form>
 <h3>人物定稿 · 先预览，再确认</h3>${concepts.length?concepts.map(c=>{
 const stale=c.referenceImage!==role.referenceImage,p=state.projects.find(p=>p.characterStage==='actions'&&p.conceptId===c.id),complete=p?.status==='completed';
 return `<article class="history-item"><div class="character-preview"><img src="/media/${esc(c.image)}" alt="待确认的像素人物定稿"></div><p>${stale?'原始照片已更换，此版本不能用于新动作':c.approvedAt?'已确认的人物形象':'请检查像不像本人，以及发型、服装和像素画风'}</p>
 <p class="tiny-note">${esc(c.brief||'按原照片保留人物特征')}${p?` · 已验收 ${p.steps.filter(s=>s.status==='verified').length} / ${p.steps.length} 个制作步骤`:''}</p>
 ${p?.error?`<p class="error-text">${esc(p.error)}</p>`:''}
 <button class="primary" data-concept="${esc(c.id)}" ${stale||busy||complete?'disabled':''}>${complete?'动作素材已完成':p?'继续未完成的动作素材':'确认此形象，生成动作素材'}</button></article>`;
 }).join(''):'<p class="tiny-note">尚无人物定稿。点击“设计像素人物”开始第一步。</p>'}
 ${role.characterPacks?.length?`<h3>动作素材 · 预览后应用</h3>${role.characterPacks.map(pack=>`<details class="history-item"><summary>动作包 · ${new Date(pack.createdAt).toLocaleString('zh-CN')}</summary><div class="candidate-grid">${Object.entries(pack.frames).flatMap(([action,frames])=>frames.map((f,i)=>`<figure><img src="/media/${esc(f.name)}" alt="${CHARACTER_LABELS[action]||action} ${i+1}"><figcaption>${CHARACTER_LABELS[action]||action} ${i+1}</figcaption></figure>`)).join('')}</div><button class="primary" data-pack="${esc(pack.id)}">应用整套动作</button></details>`).join('')}`:'<p class="tiny-note">尚无完整动作包。定稿不会直接替换办公室人物。</p>'}`);
 $('#character-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>8*1024*1024)return toast('图片不能超过8 MB');try{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});await action('character-upload',{roleId:role.id,dataUrl});const updated=role.id==='boss'?getState().boss:getState().roles.find(r=>r.id===role.id);showCharacterDialog(updated,{getState,modal,action,toast,onStarted});toast('照片已保存，可以开始设计像素人物');}catch{}};
 $('#character-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{await action('character-design',{roleId:role.id,prompt:new FormData(e.target).get('brief')});$('#dialog').close();onStarted();toast('开始设计一张像素人物定稿，完成后请确认');}catch{b.disabled=false;}};
 document.querySelectorAll('[data-concept]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await action('character-actions',{roleId:role.id,conceptId:b.dataset.concept});$('#dialog').close();onStarted();toast('已采用此人物形象，开始制作6×3动作图集');}catch{b.disabled=false;}});
 document.querySelectorAll('[data-pack]').forEach(b=>b.onclick=async()=>{try{await action('character-apply',{roleId:role.id,packId:b.dataset.pack});$('#dialog').close();toast('整套角色动作已应用');}catch{}});
 $('#reset-avatar').onclick=async()=>{try{await action('character-apply',{roleId:role.id,reset:true});$('#dialog').close();}catch{}};
}
