import {CHARACTER_ACTIONS,CHARACTER_LABELS} from '../public/character-actions.js';
export const SHEET_GROUPS=[['idle','walk-right','walk-up','walk-down','greet','chat','drink'],['seated','phone','music','game','sofa','sofa-front','sit','pull','read']];
const poses={idle:'自然站立、眨眼轻微手部变化','walk-right':'严格侧面朝右连续行走，三帧腿部前后交替','walk-up':'背面朝上行走，三帧腿部交替','walk-down':'正面朝下行走，三帧腿部交替',greet:'站立挥手两帧',chat:'站立交谈、轻微手势两帧',drink:'站立单手把杯子由胸前举到嘴边两帧',sofa:'朝画面右方坐沙发的姿势，无椅子','sofa-front':'严格朝画面下方正面坐姿，无椅子',sit:'由站立到坐下两帧，保留完整腿脚',pull:'站立伸手拉椅子两帧，椅子由场景提供，不画椅子',seated:'坐姿双手敲键盘，不画桌子',phone:'相同坐姿手握手机，屏幕朝人物',music:'相同坐姿自然听音乐，不画耳机，不拿手机',game:'相同坐姿手握手柄',read:'相同坐姿阅读'};
export function spriteSheetSteps(role,preservedFiles=[]){const preserved=new Set(preservedFiles);return SHEET_GROUPS.map((actions,i)=>{
 const files=actions.flatMap(a=>Array.from({length:CHARACTER_ACTIONS[a]},(_,n)=>`${a}-${n}.png`)).filter(f=>!preserved.has(f));
 const sheet=`sheet-${String(i+1).padStart(2,'0')}`;
 const mapping=files.map((f,n)=>`第${Math.floor(n/6)+1}行第${n%6+1}格 = ${f}`).join('；');
 const seating=['boss','manager','finance'].includes(role.id)?'办公室坐姿不画椅子，场景提供椅子；董事长以正面略向右25度坐姿为准，主管和财务正面坐姿':'普通工位坐姿左后方视角朝右，包含黑色办公椅，完整腿脚';
 return {role:'designer',sheet,files,weight:files.length,title:`制作图集 ${i+1}（${files.length}帧，6×3）`,instructions:`以 approved-character.png 中董事长已确认的像素人物为身份参考，人物、服装、配色不变。现在改用 Sprite Sheet 批量生成，禁止再逐帧生成大图。
本步用一次真实生图生成一张横向6列×3行图集，画布宽高建议2:1，保存 sheets/${sheet}.png。一次放${files.length}个完整角色，按从左到右、从上到下固定映射：${mapping}。剩余格完全空白。不要文字、编号、分格线或拼贴标签。每格等大，留足间隔；单人物不跨格。人物的头身比例和像素密度一致，站立约占格高88%，坐姿不单独放大，脚底靠近每格底部。背景统一纯品红 #ff00ff 或真实透明，禁止画棋盘格。连续同方向步行帧放在一起，衣服和发型不随帧变化。
本图动作说明：${actions.map(a=>`${CHARACTER_LABELS[a]}：${poses[a]}`).join('；')}。${seating}。各帧四肢完整，杯子等道具与手真实连接。
生成后运行 python3 split-sprite-sheet.py --manifest sprite-sheet-plan.json --sheet ${sheet}。程序按格切出512×512透明PNG、落脚统一、最近邻缩放，并生成 evidence/sheets 中的联系图和逐动作播放GIF。不得自行分别拉伸坐姿、头部或躯干。先使用该程序，不要重复编写抠图切帧脚本。
检查联系图与播放预览，身份和服装一致、无缺格错位、无跨格、无残留背景、无明显大小跳变即满足视觉验收；正常眨眼、姿态变化造成的轮廓像素差异不算失败，不需要反复提交部位尺寸报告。若单格存在明显问题，只编辑该格对应区域并重新切帧，不重生成整套。已验收保留文件：${preservedFiles.join('、')||'无'}；不得覆盖它们。旧任务未验收素材保留用于参考，不把排列旧图片冒充新生图。最终只报告当前图集的真实路径、切帧和播放检查结果。`};
 }).filter(s=>s.files.length);}
