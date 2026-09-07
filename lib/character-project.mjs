import {captureAnimationReview} from './animation-review.mjs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {mkdir,copyFile,writeFile,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {CHARACTER_FILES} from '../public/character-actions.js';
import {characterConceptBrief,characterActionSteps,approvedConcept,importCharacterConcept,importCharacterPack,validateCharacterFrames} from './characters.mjs';

export async function configureSpriteSheets(project,role){
 if(project.generationMode==='sprite-sheet-6x3'){
  if(!project.steps?.length&&project.plannedSteps?.length){
   project.steps=[...(project.previousActionSteps||[]).filter(s=>s.status==='verified'),...project.plannedSteps.map(s=>({...s,id:randomUUID(),status:'queued'}))];project.resume=true;
  }
  return;
 }
 const old=project.steps||[],kept=old.filter(s=>s.status==='verified');
 const preservedFiles=[...new Set(kept.flatMap(s=>s.files||[]))];
 if(preservedFiles.length)await validateCharacterFrames(project.cwd,preservedFiles);
 if(old.length){
  const backup=path.join(project.cwd,'evidence','before-sheets');await mkdir(backup,{recursive:true});
  for(const file of CHARACTER_FILES){const source=path.join(project.cwd,file);const st=await lstat(source).catch(()=>null);if(st?.isFile()&&!st.isSymbolicLink())await copyFile(source,path.join(backup,file),constants.COPYFILE_EXCL).catch(e=>{if(e.code!=='EEXIST')throw e;});}
 }
 const planned=characterActionSteps(role,preservedFiles);
 await copyFile(fileURLToPath(new URL('../scripts/split-sprite-sheet.py',import.meta.url)),path.join(project.cwd,'split-sprite-sheet.py'));
 await mkdir(path.join(project.cwd,'sheets'),{recursive:true});
 await writeFile(path.join(project.cwd,'sprite-sheet-plan.json'),JSON.stringify({version:1,columns:6,rows:3,preservedFiles,sheets:planned.map(s=>({sheet:s.sheet,files:s.files}))},null,2));
 project.generationMode='sprite-sheet-6x3';project.preservedFiles=preservedFiles;project.plannedSteps=planned;
 project.prompt='按董事长确认的6列×3行精灵图集方式制作动作。每张最多18帧，生成后使用目录内程序切帧并播放检查。不要逐帧生成大图。保留已验收帧，先查看sprite-sheet-plan.json。';
 if(old.length){project.previousActionSteps=old;project.steps=[...kept,...planned.map(s=>({...s,id:randomUUID(),status:'queued'}))];project.resume=true;}
}

export async function verifyCharacterStep(project,step){
 if(project.characterStage!=='actions')return;
 if(step.sheet)await promisify(execFile)(process.env.ONE_PC_PYTHON||'python3',[path.join(project.cwd,'split-sprite-sheet.py'),'--manifest',path.join(project.cwd,'sprite-sheet-plan.json'),'--sheet',step.sheet],{cwd:project.cwd,maxBuffer:1024*1024,timeout:60000});
 await validateCharacterFrames(project.cwd,step.files);
 if(step.sheet)step.playbackEvidence=await captureAnimationReview(project.cwd,step);
}

export async function createCharacterProject({role,stage='concept',conceptId,brief='',dataDir,root}){
 if(!role?.referenceImage)throw Error('请先上传角色参考图');
 if(!['concept','actions'].includes(stage))throw Error('人物设计阶段无效');
 const concept=stage==='actions'?approvedConcept(role,conceptId):null;
 const id=randomUUID(),cwd=path.join(dataDir,'projects',id);await mkdir(cwd,{recursive:true});
 // Freeze the exact input files for this run; later uploads cannot silently change it.
 const referenceImage=path.join(cwd,concept?'approved-character.png':'reference'+path.extname(role.referenceImage));
 await copyFile(path.join(dataDir,'media',concept?.image||role.referenceImage),referenceImage);
 const referenceImages=[referenceImage];
 if(!concept){const style=path.join(cwd,'office-style.png');await copyFile(path.join(root,'public/assets/team-neutral.png'),style);referenceImages.push(style);}
 const project={id,cwd,createdAt:Date.now(),kind:'character-design',characterStage:stage,targetRoleId:role.id,directRoleId:'designer',status:'running',steps:[],brief,sourceReference:role.referenceImage,conceptId:concept?.id,referenceImage,referenceImages,
  title:`${role.name} · ${concept?'制作动作素材':'像素人物定稿'}`,
  prompt:concept?'根据董事长已确认的像素人物定稿，按步骤制作动作素材。身份、发型、服装、配色保持一致；每次只完成当前动作组，已经验收的文件保留。':characterConceptBrief(role,brief),
  ...(concept?{plannedSteps:characterActionSteps(role)}:{})};
 if(concept)await configureSpriteSheets(project,role);
 return project;
}

export async function finalizeCharacterProject(project,role,dataDir){
 if(project.characterStage==='concept'){
  const concept=await importCharacterConcept(project.cwd,path.join(dataDir,'media'),{referenceImage:project.sourceReference,brief:project.brief,projectId:project.id});
  role.characterConcepts??=[];role.characterConcepts.push(concept);project.conceptId=concept.id;
  project.completionStatus='awaiting_confirmation';project.completionSummary='像素人物定稿已完成，请预览并确认人物；确认后才生成动作素材。';
 }else{
  const pack=await importCharacterPack(project.cwd,path.join(dataDir,'media'));pack.conceptId=project.conceptId;role.characterPacks??=[];role.characterPacks.push(pack);
  project.completionSummary='全部动作素材已检查通过，请预览并应用整套动作。';
 }
}
