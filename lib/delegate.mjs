// 主管自动委派：把一条派给"主管"的级联任务，按规则拆成子任务分派给相关员工。
// 仅当任务带 cascade=true 且角色为 manager 且执行器为 workbuddy 时触发；
// 完全不触碰 Codex（agent=codex）的派单 / 同步代码路径。
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const ROLE_IDS=['product','designer','developer','reviewer','delivery','hr','finance'];

function roleTitle(state,id){
  const r=state.roles.find(x=>x.id===id);
  if(r)return r.title;
  if(id==='boss')return state.boss?.title||'董事长';
  return id;
}

// 关键词 -> 需要参与的员工角色（顺序即执行顺序）
const RULES=[
  {re:/网站|官网|网页|落地页|landing|首页|page|web/i,roles:['product','designer','developer','reviewer','delivery']},
  {re:/产品|策划|需求|方案|规划|商业模式|调研|市场|用户画像|PRD/i,roles:['product','reviewer']},
  {re:/设计|ui|视觉|品牌|logo|图标|海报|插画|界面/i,roles:['designer','reviewer']},
  {re:/开发|代码|功能|app|程序|接口|api|后端|前端|脚本|自动化/i,roles:['developer','reviewer']},
  {re:/文案|内容|文章|脚本|推文|小红书|抖音|公众号/i,roles:['product','reviewer']},
  {re:/视频|动画|短片|剪辑|特效/i,roles:['designer','developer','delivery']},
  {re:/财务|报销|预算|工资|薪资|记账|账单/i,roles:['finance']},
  {re:/招聘|人事|面试|入职|绩效/i,roles:['hr']},
  {re:/测试|qa|验收|质量|审核/i,roles:['reviewer','developer']},
];

export function planRoles(prompt){
  const hit=new Set();
  for(const r of RULES){if(r.re.test(prompt))r.roles.forEach(x=>hit.add(x));}
  let ids=ROLE_IDS.filter(id=>hit.has(id));
  if(ids.length===0)ids=['product','developer','reviewer']; // 默认三件套
  return ids.map(role=>({role,task:`【${role}】${prompt}`}));
}

export async function delegateCascade({workbuddy,state,save,b}){
  const prompt=String(b.prompt||'').trim();
  if(prompt.length<2||prompt.length>12000)throw Error('需求需要 2～12000 个字符');
  if(!/^[\w-]{10,100}$/.test(b.requestId||''))throw Error('缺少有效提交标识');
  if(!state.roles.some(r=>r.id==='manager'))throw Error('主管岗位不存在');
  const previous=state.projects.find(p=>p.requestId===b.requestId);
  if(previous)return {id:previous.id,threadId:previous.threadId,status:previous.status,duplicate:true};
  const id=randomUUID();
  const cwd=path.join(workbuddy.root,id);
  await mkdir(cwd,{recursive:true});
  const parent={
    id,requestId:b.requestId,source:'workbuddy',transport:'acp',threadId:null,resume:false,
    cwd,prompt,title:prompt.slice(0,40),projectName:'主管分派 · '+prompt.slice(0,20),
    directRoleId:'manager',cascade:true,parentId:b.parentId||null,
    status:'running',steps:[],createdAt:Date.now(),
    summary:'主管正在分解任务并分派给相关员工。',children:[]
  };
  state.projects.unshift(parent);await save();
  const plan=planRoles(prompt);
  parent.steps=plan.map(p=>({title:`分派给${roleTitle(state,p.role)}`,status:'queued',weight:1}));
  await save();
  const children=[];
  for(let i=0;i<plan.length;i++){
    const item=plan[i];
    const rid='del-'+randomUUID();
    try{
      const r=await workbuddy.dispatch({agent:'workbuddy',roleId:item.role,prompt:item.task,requestId:rid,parentId:id,cascade:false});
      if(!r.id)throw Error('子任务未获得执行记录');children.push(r.id);
      if(parent.steps[i]){parent.steps[i].status='running';parent.steps[i].childId=r.id;}
    }catch(e){
      if(parent.steps[i]){parent.steps[i].status='interrupted';parent.steps[i].review=e.message;}
    }
  }
  parent.children=children;parent.dispatchErrors=parent.steps.filter(s=>s.status==='interrupted').map(s=>s.review);if(!children.length){parent.status='failed';parent.error=parent.dispatchErrors.join('；')||'没有子任务成功派发';parent.finishedAt=Date.now();}
  parent.summary=`主管已分派 ${children.length} 个子任务给：${plan.map(p=>roleTitle(state,p.role)).join('、')}。`;
  await save();
  return {id,status:parent.status,cascade:true,children};
}

// 在 server.mjs 的定时循环里调用：级联父任务在其所有子任务完成后置为 completed。
export function checkCascadeCompletion(state){
  const updates=[];
  for(const p of state.projects){
    if(p.cascade&&p.status==='running'&&Array.isArray(p.children)&&p.children.length){
      const kids=state.projects.filter(k=>p.children.includes(k.id));
      for(const step of p.steps||[]){const child=kids.find(k=>k.id===step.childId);if(!child)continue;const status=child.status==='completed'?'verified':['failed','cancelled','interrupted','unknown'].includes(child.status)?'interrupted':'running';if(step.status!==status){step.status=status;updates.push(p.id);}}
      if(kids.length===p.children.length&&kids.every(k=>['completed','failed','cancelled','interrupted','unknown'].includes(k.status))&&(kids.some(k=>k.status!=='completed')||p.dispatchErrors?.length)){p.status='failed';p.stage='部分子任务未完成，请查看各员工结果';p.error=[...(p.dispatchErrors||[]),...kids.filter(k=>k.status!=='completed').map(k=>k.error||k.status)].join('；');p.finishedAt=Date.now();updates.push(p.id);continue;}
      if(kids.length===p.children.length&&kids.every(k=>k.status==='completed')){
        p.status='completed';
        p.stage='主管已收齐各员工交付，任务完成';
        p.summary=(p.summary||'')+'\n所有子任务已完成。';
        p.finishedAt=Date.now();
        updates.push(p.id);
      }
    }
  }
  return updates;
}
