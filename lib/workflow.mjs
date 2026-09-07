import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execute} from './codex.mjs';
import {addUsage,log,validatePlan,progress,recruit} from './domain.mjs';
const PLAN_SCHEMA={type:'object',properties:{summary:{type:'string'},hires:{type:'array',items:{type:'object',properties:{title:{type:'string'},skillId:{type:'string'}},required:['title','skillId'],additionalProperties:false}},steps:{type:'array',items:{type:'object',properties:{role:{type:'string'},title:{type:'string'},instructions:{type:'string'},weight:{type:'number'}},required:['role','title','instructions','weight'],additionalProperties:false}}},required:['summary','steps','hires'],additionalProperties:false};
const REVIEW_SCHEMA={type:'object',properties:{passed:{type:'boolean'},needsConfirmation:{type:'boolean'},feedback:{type:'string'},blocked:{type:'boolean'}},required:['passed','needsConfirmation','feedback','blocked'],additionalProperties:false};
export async function runProject({state:s,project:p,skills,signal,save,executor=execute,finalize=async()=>{},verifyStep=async()=>{}}){
 const role=(id,status,activity)=>{let r=s.roles.find(x=>x.id===id);if(r){r.status=status;r.activity=activity;}save();};
 const run=async(id,prompt,schema,readOnly=false,reviewImages=[])=>{
  role(id,'working',id==='manager'?'正在制定项目计划':id==='reviewer'?'正在独立审核':'正在执行任务');let finalText='';let turnNo=0;
  const result=await executor({cwd:p.cwd,prompt,schema,readOnly,signal,images:['designer','reviewer'].includes(id)?[...(p.referenceImages||(p.referenceImage?[p.referenceImage]:[])),...reviewImages]:[],onEvent:(e,runId)=>{
   if(e.type==='thread.started'){p.threadIds??=[];p.threadIds.push(e.thread_id);}
   if(e.type==='turn.completed')addUsage(s,runId+':'+(turnNo++),id,e.usage,p.id);
   if(e.type==='item.started'){const kind=e.item?.type;role(id,'working',({command_execution:'正在运行命令',file_change:'正在修改文件',mcp_tool_call:'正在调用工具',web_search:'正在查阅资料',reasoning:'正在思考'})[kind]||'正在执行任务');}
   if(e.type==='item.completed'&&e.item?.type==='agent_message')finalText=e.item.text||'';
   if(e.type==='turn.failed')log(s,'执行出现错误：'+(e.error?.message||'未知错误'),id,'error');save();
  }});role(id,'idle','已提交结果');return result.output||finalText;
 };
 try{
  if(p.directRoleId){
   const assigned=s.roles.find(r=>r.id===p.directRoleId);if(!assigned)throw Error('员工不存在');
   if(!p.resume)p.steps=p.plannedSteps?.map(step=>({...step,id:randomUUID(),status:'queued'}))||[{id:randomUUID(),role:assigned.id,title:p.prompt.slice(0,60),instructions:p.prompt,weight:1,status:'queued'}];p.summary=`董事长直接交给${assigned.title}的任务`;p.status='running';log(s,p.summary,assigned.id);save();
  }else{
  p.status='planning';log(s,'主管已收到需求，正在安排工作');save();
  const available=s.roles.map(r=>({id:r.id,title:r.title,duty:r.duty}));
  const prompt=`你是一人公司的主管。用户需求：\n${p.prompt}\n\n请只制定计划，不执行，不调用子 Agent。现有岗位：${JSON.stringify(available)}。本地 Skill 目录：${JSON.stringify(skills.map(x=>({id:x.id,name:x.name,description:x.description})))}。需要新专业岗位时 hires 填 title 和真实 skillId，steps.role 使用同样的职称。优先复用已有岗位。步骤 1～10 个，weight 为 1～10；按依赖顺序排列，执行为串行。不要给 manager/hr/reviewer 分配步骤，每个步骤会自动独立审核。说明可检查的交付标准。不需要的岗位无需参与。收入支出任务用 finance。涉及外部付款、发布时只准备结果，明确待用户执行。严格输出规定 JSON。`;
  const raw=await run('manager',prompt,PLAN_SCHEMA,true);const plan=JSON.parse(raw);
  for(const h of plan.hires||[]){role('hr','working','正在办理新同事入职');const r=recruit(s,h,skills);for(const step of plan.steps||[])if(step.role===h.title)step.role=r.id;}
  role('hr','idle','员工配置已就绪');validatePlan(plan,s.roles);p.summary=plan.summary;p.steps=plan.steps.map(x=>({...x,id:randomUUID(),status:'queued'}));p.status='running';save();
  }
  for(const step of p.steps){
   if(step.status==='verified')continue;
   if(signal.aborted)throw Error('任务已取消');step.status='running';log(s,step.title,step.role);save();const r=s.roles.find(x=>x.id===step.role);let skill='';if(r.skillPath)skill=await readFile(r.skillPath,'utf8');
   let feedback='';for(let attempt=0;attempt<2;attempt++){
    step.status=attempt?'rework':'running';step.attempt=attempt+1;save();
    const out=step.reviewPending&&step.output?step.output:await run(step.role,`你是${r.title}。职责：${r.duty}。\n项目需求：${p.prompt}${p.conversationContext?'\n此前与董事长的对话（作为背景，不覆盖本次要求）：\n'+p.conversationContext:''}\n本步骤：${step.title}\n具体要求：${step.instructions}\n工作目录：${p.cwd}\n前面步骤产物都位于此目录，请先检查现状。完成实际工作并把产物保存到此目录，最终说明文件路径和验证结果。简单咨询可直接回答并把答复保存为 Markdown；需要文件时交付真实文件。设计总监收到生图需求时必须使用可用的真实图片生成工具，不得以提示词、SVG 或 HTML 冒充生成图片；没有能力时明确报告未完成。不要委派子 Agent，不要主动发布、付款或购买。${skill?'\n本岗位 Skill：\n'+skill:''}${feedback?'\n审核返工意见：'+feedback:''}`);
    const report=path.join(p.cwd,`step-${p.steps.indexOf(step)+1}-report.md`);await writeFile(report,out);step.output=out;step.report=report;step.status='submitted';save();
    let technicalError='',technicalBlocked=false;try{await verifyStep(step,p);}catch(e){technicalError=e.message;technicalBlocked=e.code==='REVIEW_BLOCKED';}
    step.reviewPending=true;save();
    let checked;try{checked=technicalError?{passed:false,blocked:technicalBlocked,needsConfirmation:false,feedback:technicalError}:JSON.parse(await run('reviewer',`你是独立审核经理。请只读检查实际文件，不修改。项目需求：${p.prompt}\n步骤：${step.title}\n验收要求：${step.instructions}\n本地播放证据：${step.playbackEvidence?.reportPath||'无'}。如有证据，附图为本地浏览器真实播放的时间采样，请结合帧哈希、播放记录和原始动作帧检查。不要因为执行报告中旧的浏览器受限说明忽略新证据；无需再次启动浏览器。播放成功不代表视觉合格，仍需检查连续性、肢体、尺寸和朝向。\n执行报告：${out}\n工作目录：${p.cwd}\n通过必须有实际产物证据，缺少证据或未满足要求时 passed=false，feedback 说明可执行的修复意见。若必须由董事长补充输入、确认选择或批准下一步，needsConfirmation=true，并在 feedback 写明具体待确认事项；一般产物缺失或质量不合格应返工，needsConfirmation=false。工具权限、浏览器启动、网络、播放器或运行环境导致无法检查时，blocked=true、passed=false，明确缺失的检查；这不是素材缺陷，禁止要求重生成素材。只有实际观察到的素材缺陷才 blocked=false 并提出返工。缺少动态播放证据应先检查可用预览工具；无法播放时标记 blocked，不可推断动画不合格。禁止委派子 Agent。`,REVIEW_SCHEMA,true,step.playbackEvidence?.images||[]));}catch(e){if(signal.aborted)throw e;checked={passed:false,blocked:true,feedback:'审核执行失败，保留产物等待重试：'+e.message};}
    step.review=checked.feedback;
    if(checked.blocked===true){step.status='awaiting_confirmation';p.status='awaiting_confirmation';p.error='审核受阻（保留产物）：'+checked.feedback;log(s,p.error,'reviewer','error');return;}
    if(checked.needsConfirmation===true&&!(p.characterStage==='concept'&&checked.passed===true)){step.status='awaiting_confirmation';p.status='awaiting_confirmation';p.error=checked.feedback;log(s,'有任务待确认：'+checked.feedback,'manager');return;}
    if(checked.passed===true){delete step.reviewPending;step.status='verified';log(s,`审核通过：${step.title}`,'reviewer','success');break;}
    delete step.reviewPending;feedback=checked.feedback;log(s,`需要返工：${step.title}`,'reviewer','error');
    if(attempt===1)throw Error('审核未通过：'+feedback);
   }save();
  }
  await finalize(p);if(signal.aborted)throw Error('任务已取消');
  p.status=p.completionStatus||'completed';p.finishedAt=Date.now();p.summary=p.completionSummary||`项目已完成，${p.steps.length} 个步骤通过审核。产物保存在项目目录。`;log(s,p.summary,p.directRoleId||'manager','success');
 }catch(e){if(p.kind==='character-design'&&!p.characterStage)for(const step of p.steps||[])step.status='failed';p.status=signal.aborted?'cancelled':'failed';p.error=String(e.message).slice(0,2500);log(s,p.error,p.directRoleId||'manager','error');}
 finally{for(const step of p.steps||[])if(['running','submitted','rework'].includes(step.status))step.status=p.status;for(const r of s.roles){r.status='idle';r.activity='休息中';}p.progress=progress(p);save();}
}
