import {SEAT_POINTS} from './office-scene.js';
import {routeBetween,heading,segmentClear} from './office-navigation.js';
export {routeBetween} from './office-navigation.js';
// Local visual simulation. Authoritative Agent status always overrides leisure.
export const ROLE_ORDER=['boss','manager','finance','developer','product','designer','delivery','hr','reviewer'];
export const roleNumber=id=>ROLE_ORDER.indexOf(id)+1||100;
export const LIFE_LABELS = {work:'认真工作',phone:'看看手机',game:'工位小游戏',console:'玩电视游戏',read:'整理思路',music:'听会儿音乐',report:'汇报工作',water:'接杯水',coffee:'喝杯咖啡',sofa:'坐会儿沙发',walk:'散散步',chat:'和同事聊聊',restroom:'去洗手间',greet:'和董事长打招呼',return:'返回工位'};
export const NODES={
 n0:[360,350],n1:[630,350],n2:[875,350],n3:[1100,350],n4:[1355,350],
 m0:[360,552],m1:[630,552],m2:[875,552],m3:[1100,552],m4:[1355,552],
 s0:[360,757],s1:[630,757],s2:[875,757],s3:[1100,757],s4:[1355,757],
 lounge:[330,310],sofaL:[218,290],sofaR:[285,298],bean:[225,408],
 kitchen:[300,658],kitchenBottom:[248,850],waterLane:[48,856],water:[95,842],coffee:[142,677],
 wcLane:[1370,650],wcBlue:[1380,748],wcPink:[1406,811],
 bossDoor:[500,320],managerDoor:[1040,325],financeDoor:[1275,320]
};
const bodyRadius=p=>p.seat||(p.x<360&&p.y<490)?28:44;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const HOME={
 boss:{point:SEAT_POINTS.boss,node:'bossDoor',seat:'boss',face:1},manager:{point:SEAT_POINTS.manager,node:'managerDoor',seat:'manager',face:1},finance:{point:SEAT_POINTS.finance,node:'financeDoor',seat:'finance',face:1},
 developer:{point:SEAT_POINTS.developer,node:'m0',seat:'developer',face:1},product:{point:SEAT_POINTS.product,node:'m1',seat:'product',face:1},designer:{point:SEAT_POINTS.designer,node:'m2',seat:'designer',face:1},delivery:{point:SEAT_POINTS.delivery,node:'m3',seat:'delivery',face:1},hr:{point:SEAT_POINTS.hr,node:'s0',seat:'hr',face:1},reviewer:{point:SEAT_POINTS.reviewer,node:'s1',seat:'reviewer',face:1}
};
export const HOTSPOTS={
 report:{},music:{home:true},console:{},phone:{home:true},game:{home:true},read:{home:true},work:{home:true},
 water:{node:'water',point:NODES.water,face:-1,resource:'water'},coffee:{node:'coffee',point:NODES.coffee,face:-1,resource:'coffee'},
 sofa:{node:'sofaL',point:NODES.sofaL,face:1,resource:'sofaL',seat:'sofaL'},
 walk:{node:'m2',point:NODES.m2,face:1},restroom:{node:'wcBlue',point:NODES.wcBlue,face:-1,resource:'wcBlue'},
 chat:{node:'m1',point:[790,350],face:-1}
};
const DURATIONS={phone:65000,game:65000,read:70000,music:65000,report:4500,water:6500,coffee:8500,sofa:15000,walk:3000,restroom:10500,chat:9500,console:18000};
export class OfficeLife{
 constructor({random=Math.random}={}){this.random=random;this.people=new Map();this.resources=new Map();this.now=0;this.suspended=false;}
 sync(roster,now=0){this.now=now;const ids=new Set(roster.map(r=>r.id));for(const [id,p] of this.people)if(!ids.has(id)){this.release(p);this.people.delete(id);}
 roster.forEach((r,i)=>{let p=this.people.get(r.id);if(!p){const home=HOME[r.id]||{point:[938+Math.max(0,i-9)%2*245,735],node:'s2',seat:i===9?'reserve-a':i===10?'reserve-b':r.id,face:1};p={id:r.id,number:roleNumber(r.id)===100?10+Math.max(0,i-9):roleNumber(r.id),title:r.title,home,x:home.point[0],y:home.point[1],face:home.face,action:['read','phone','game'][i%3],phase:'acting',seat:home.seat,path:[],deskTime:0,awayTime:0,until:now+45000+i*6000,bubble:null,hidden:false,authoritative:r.status==='working',revision:0,step:0};this.people.set(r.id,p);}
 const wasAttention=p.attention;p.attention=r.attention||null;const busy=r.status==='working';p.title=r.title;if(p.attention){p.authoritative=false;if(p.action!=='report')this.command(p.id,'report',now,true);p.until=Infinity;this.say(p.id,p.attention.label,now,Infinity);p.externalWork=!!r.externalWork;return;}if(wasAttention){p.authoritative=busy;this.command(p.id,busy?'work':'read',now,true);} if(busy!==p.authoritative){p.authoritative=busy;this.command(p.id,busy?'work':p.externalWork?'read':'report',now,true);}else if(busy&&p.action!=='work')this.command(p.id,'work',now,true);p.externalWork=!!r.externalWork;
 });}
 release(p){if(p.resource&&this.resources.get(p.resource)===p.id)this.resources.delete(p.resource);p.resource=null;if(p.partner){const q=this.people.get(p.partner);if(q?.partner===p.id){q.partner=null;q.until=Math.min(q.until,this.now+1000);}p.partner=null;}}
 destination(p,action){const spot={...(HOTSPOTS[action]||HOTSPOTS.read)};
 if(spot.home)return {point:p.home.point,node:p.home.node,face:p.home.face,seat:p.home.seat};
 if(action==='report')return {point:p.id==='manager'?NODES.bossDoor:NODES.managerDoor,face:-1,resource:p.id==='manager'?'report-boss':'report-manager'};
 if(action==='sofa'||action==='console'){const choices=[{node:'sofaL',point:NODES.sofaL,face:1,resource:'sofaL',seat:'sofaL'},{node:'sofaR',point:NODES.sofaR,face:1,resource:'sofaR',seat:'sofaR'},{node:'bean',point:NODES.bean,face:-1,resource:'bean',seat:'bean'}];return choices.find(s=>!this.resources.has(s.resource)||this.resources.get(s.resource)===p.id);}
 if(action==='restroom'){if([...this.people.values()].some(q=>q.id!==p.id&&(q.action==='restroom'||(q.x>1340&&q.y>650))))return null;const female=['product','designer','reviewer','hr'].includes(p.id);return {node:female?'wcPink':'wcBlue',point:NODES[female?'wcPink':'wcBlue'],face:1,resource:female?'wcPink':'wcBlue'};}
 if(action==='walk'){const list=['n0','n1','n2','n3','m0','m1','m2','m3','s1','s2'];const start=Math.floor(this.random()*list.length);const node=list.slice(start).concat(list.slice(0,start)).find(n=>![...this.people.values()].some(q=>q.id!==p.id&&((q.destination&&distance(q.destination.point,NODES[n])<60)||distance([q.x,q.y],NODES[n])<60)));return node?{node,point:NODES[node],face:p.face}:null;}
 return spot;
 }
 command(id,action,now=this.now,force=false){const p=this.people.get(id);if(!p)return false;if(p.attention&&action!=='report')return false;if(p.authoritative&&!force&&action!=='work'){this.say(id,'董事长，我正在努力工作呢！忙完这一步再去。',now);return false;}
 const dest=this.destination(p,action);if(!dest||(dest.resource&&this.resources.has(dest.resource)&&this.resources.get(dest.resource)!==id)){this.say(id,'那边有同事，我等一会儿再去。',now);return false;}
 const route=routeBetween([p.x,p.y],dest.point,[...this.people.values()].filter(q=>q.id!==id&&q.home.seat).map(q=>q.home.point));if(distance([p.x,p.y],dest.point)>2&&!route.length){this.say(id,'这条通道暂时走不通，我先留在这里。',now);return false;}const wasSeated=!!p.seat,wasHidden=p.hidden;this.release(p);if(dest.resource){this.resources.set(dest.resource,id);p.resource=dest.resource;}
 if(p.hidden)p.doorUntil=now+650;p.hidden=false;p.action=action;p.destination=dest;p.seat=null;p.partner=null;p.face=dest.face;p.revision++;p.bubble=null;p.nextRoute=0;
 if(distance([p.x,p.y],dest.point)<.1){p.x=dest.point[0];p.y=dest.point[1];this.arrive(p,now);}
 else{p.path=route;p.phase=wasHidden?'exiting':wasSeated?'standing':(dest.point===p.home.point?'running':'walking');p.phaseUntil=now+(wasHidden?450:500);if(wasHidden)p.face=-1;p.node=null;}
 return true;}
 arrive(p,now){if(p.home.seat&&p.destination?.seat===p.home.seat&&p.phase!=='scooting'&&p.phase!=='acting'){p.path=[];p.phase='pulling';p.phaseUntil=now+650;p.revision++;return;}p.path=[];p.phase='acting';p.node=p.destination?.node||p.home.node;p.face=p.destination?.face||1;p.seat=p.destination?.seat||null;p.until=(p.action==='work'||p.attention)?Infinity:now+(DURATIONS[p.action]||9000)*(0.8+this.random()*.4);p.revision++;p.arrivedAt=now;
 if(p.action==='restroom'){p.phase='entering';p.phaseUntil=now+450;p.door=p.resource;p.doorUntil=now+800;this.say(p.id,'洗手间使用中',now,2000);}
 if(p.action==='report'&&!p.attention)this.say(p.id,p.id==='manager'?'董事长，本次任务状态已更新，向您汇报。':'主管，本次任务状态已更新，向您汇报。',now,4000);
 if(p.action==='water'||p.action==='coffee')this.say(p.id,p.action==='water'?'补充一点水分。':'咖啡续命，灵感加倍。',now,2300);
 }
 say(id,message,now=this.now,duration=4200){const p=this.people.get(id);if(p)p.bubble={message:p.attention?.label||message,until:p.attention?Infinity:now+duration};}
 greet(id,now=this.now){const p=this.people.get(id);if(!p)return '';const busy=p.authoritative;const lines=busy?['董事长，我正在努力工作呢！','收到，正在把这一项做好。','这一步我盯着呢，有进展就汇报。']:p.hidden?['董事长，我在洗手间，马上回来。']:({phone:['董事长好！刚看了一眼消息。','没错，我在给大脑充电。'],game:['董事长好！这局结束就收手。','没任务时练练手速，绝不耽误工作。'],water:['董事长，要不要也来一杯水？'],coffee:['咖啡刚好，董事长要来一杯吗？'],chat:['我们在交换灵感呢，董事长好！'],sofa:['董事长好！坐一会儿，恢复战斗力。'],walk:['董事长好！走两步换换思路。']})[p.action]||['董事长好！今天也元气满满。','随时待命，您有新的想法吗？'];const message=lines[Math.floor(this.random()*lines.length)];this.say(id,message,now);p.greetUntil=now+1400;return message;}
 chat(id,now=this.now){const p=this.people.get(id);if(!p||p.authoritative||p.attention)return false;if([...this.people.values()].some(q=>q.partner)){this.say(id,'同事们正在聊天，我等他们聊完再过去。',now);return false;}const peer=[...this.people.values()].find(q=>q.id!==id&&!q.authoritative&&!q.attention&&!q.partner&&!q.hidden&&q.id!=='boss');if(!peer){this.say(id,'大家都在忙，我先自己转转。',now);return false;}
 this.command(id,'chat',now);this.command(peer.id,'chat',now);p.partner=peer.id;peer.partner=id;peer.destination={point:[860,350],node:'m1',face:-1};p.destination={point:[790,350],node:'m1',face:1};p.path=routeBetween([p.x,p.y],p.destination.point,[]);peer.path=routeBetween([peer.x,peer.y],peer.destination.point,[]);if(p.phase!=='standing')p.phase='walking';if(peer.phase!=='standing')peer.phase='walking';return true;}
 choose(p,now){if(p.id==='boss'||distance([p.x,p.y],p.home.point)>2){this.command(p.id,'read',now);return;}const atDesk=['phone','game','read','music'];if(p.awayTime*4>=p.deskTime||this.random()<.2){this.command(p.id,atDesk[Math.floor(this.random()*atDesk.length)],now);return;}const outings=['water','coffee','sofa','restroom','walk'];if(!this.command(p.id,outings[Math.floor(this.random()*outings.length)],now))this.command(p.id,'read',now);}

 tick(delta,now){this.now=now;if(this.suspended){for(const p of this.people.values()){for(const key of ['until','phaseUntil','doorUntil','greetUntil'])if(Number.isFinite(p[key]))p[key]+=delta;if(p.bubble)p.bubble.until+=delta;}return;}const dt=Math.min(delta,100)/1000;
 for(const p of this.people.values()){if(distance([p.x,p.y],p.home.point)<2&&p.phase==='acting')p.deskTime=(p.deskTime||0)+delta;else p.awayTime=(p.awayTime||0)+delta;if(p.bubble?.until<now)p.bubble=null;
 if(p.phase==='entering'){if(now>=p.phaseUntil){p.hidden=true;p.phase='acting';}continue;}
 if(['exiting','standing','pulling','sitting','scooting'].includes(p.phase)){if(now>=p.phaseUntil){const next={exiting:p.destination?.point===p.home.point?'running':'walking',standing:p.destination?.point===p.home.point?'running':'walking',pulling:'sitting',sitting:'scooting',scooting:'acting'}[p.phase];if(p.phase==='scooting')this.arrive(p,now);else{p.phase=next;p.phaseUntil=now+650;p.revision++;}}continue;}
 if(['walking','running'].includes(p.phase)&&!p.path.length){this.arrive(p,now);continue;}
 if(['walking','running'].includes(p.phase)&&p.path.length){const to=p.path[0],d=distance([p.x,p.y],to),speed=p.phase==='running'?175:90,step=Math.min(d,speed*dt),vx=(to[0]-p.x)/(d||1),vy=(to[1]-p.y)/(d||1);let candidate=[p.x+vx*step,p.y+vy*step];
 const neighbors=[...this.people.values()].filter(q=>q.id!==p.id&&!q.hidden),priority=q=>q.number??roleNumber(q.id);
 const free=q=>segmentClear([p.x,p.y],q)&&!neighbors.some(other=>{const before=distance([p.x,p.y],[other.x,other.y]),after=distance(q,[other.x,other.y]),radius=bodyRadius(other);return after<radius&&after<=before+.001;})&&![...this.people.values()].some(other=>other.id!==p.id&&other.home.seat&&distance(q,other.home.point)<28);
 const blocker=neighbors.find(q=>distance(candidate,[q.x,q.y])<(bodyRadius(q)));p.yielding=false;
 if(!free(candidate)){candidate=null;p.yielding=!!blocker&&priority(p)>priority(blocker);
 if(now>=(p.nextRoute||0)){
 p.nextRoute=now+700;
 const obstacles=[...this.people.values()].filter(q=>q.id!==p.id).flatMap(q=>[...(q.home.seat?[q.home.point]:[]),...(!q.hidden?[[q.x,q.y,bodyRadius(q)]]:[])]);
 const route=blocker&&priority(p)<priority(blocker)&&['walking','running'].includes(blocker.phase)?[]:routeBetween([p.x,p.y],p.destination?.point||p.path.at(-1),obstacles);
 if(route.length)p.path=route;
 else if(!blocker||!['walking','running'].includes(blocker.phase)||priority(p)>priority(blocker)){
 // Commit to a floor detour instead of oscillating sideways each frame.
 detourSearch:for(const radius of [20,35,50,80,110])for(let i=0;i<16;i++){const angle=Math.atan2(vy,vx)+Math.PI/2+i*Math.PI/8,target=[p.x+Math.cos(angle)*radius,p.y+Math.sin(angle)*radius];if(free(target)){const detour=routeBetween([p.x,p.y],target,obstacles);if(detour.length&&distance(detour[0],[p.x,p.y])>.1){p.path=[...detour,...p.path];break detourSearch;}}}
 }

 }
 }

 if(candidate){p.heading=heading(candidate[0]-p.x,candidate[1]-p.y,p.heading);p.face=p.heading==='left'?-1:p.heading==='right'?1:p.face;p.step+=dt*(p.phase==='running'?16:9);p.x=candidate[0];p.y=candidate[1];if(distance(candidate,to)<.1){p.path.shift();if(!p.path.length)this.arrive(p,now);}}
 }else if(p.phase==='acting'&&now>=p.until){if(p.action==='restroom')this.command(p.id,'read',now);else this.choose(p,now);}
 if(p.action==='chat'&&p.phase==='acting'&&p.partner){const q=this.people.get(p.partner);if(q?.phase==='acting'&&!p.bubble&&Math.sin(now/2000+p.id.length)>.995)this.say(p.id,p.id<q.id?'刚想到一个不错的点子。':'说来听听，咱们一起琢磨。',now,2500);}
 }
 }
}
