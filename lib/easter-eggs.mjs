import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const HOUR=3600000;
// Original office banter, not a claim that these are today's trending headlines.
const lines=[
['咖啡颗粒度','先对齐咖啡的颗粒度，再拉通今天的清醒度。','对齐了吗','豆子对齐了，人还在缓冲。'],
['弹性工作','我对弹性工作的理解：坐累了站起来。','很有道理','弹的是膝盖，性价比还挺高。'],
['闭环','今天先做个小闭环：接水，喝水，再接水。','这能写周报吗','可以，但建议不要拆成三个里程碑。'],
['情绪价值','今天的情绪价值，由这盆绿植提供。','它说什么了','它说：别卷了，浇点水吧。'],
['降本增效','我刚完成一次降本增效：把两个会合成一条消息。','效果怎么样','大家终于有空做消息里说的事了。'],
['松弛感','我不是在发呆，是在给灵感留空位。','灵感来了没','它说路上有点堵，让我先喝口水。'],
['进度条','我的电量已经见底，咖啡还在排队充电。','给你续上','收到，今天的生产力有着落了。'],
['复盘','刚复盘了一下：今天最有效的会议是没开的那个。','为什么','省下的时间，问题已经解决了。'],
['版本管理','文件名已经叫最终版了，内心还留着最终版二。','我懂','那咱们约好，这次不加真的两个字。'],
['向上管理','我刚向上管理了一下：把显示器抬高两厘米。','立刻见效','颈椎说这是今天最好的决策。'],
['赋能','给同事赋能之前，我先给鼠标换个电池。','务实','不然连光标都带不动，怎么带团队。'],
['摸鱼学','我没有摸鱼，我在观察需求池的生态。','观察到什么','有个需求长大了，需要重新估工时。'],
['工位绿植','工位上的多肉比我淡定，它连周报都不写。','它负责什么','负责提醒我，缓慢生长也是生长。'],
['带宽','我的带宽还剩一点，优先分配给午饭。','吃什么','这是今天唯一需要认真开会的问题。'],
['打通','今天已经打通了工位到茶水间的链路。','下一步呢','验证回程，顺便给你带杯水。'],
['会议纪要','会议纪要只有一句：这事其实可以直接说。','精炼','刚刚省下的字数，留给下班聊天。'],
['预期管理','先管理一下预期：我的咖啡拉花像一张流程图。','能看懂吗','看不懂也没关系，入口很顺畅。'],
['长期主义','长期主义的第一步，是找把坐着舒服的椅子。','支持','坐稳了，才有空想远一点。'],
['对齐','大家都在对齐，我先把键盘摆正。','基础很扎实','至少这一次，对齐是肉眼可见的。'],
['验收','刚验收了茶水间的饼干，质量稳定。','需要复测吗','为了严谨，我愿意再跑一轮。'],
['留白','日程上这段空白，是我给脑袋留的呼吸口。','别填满','放心，已经标成重要会议了。'],
['稳定性','今天系统很稳定，我打算跟它学学。','怎么学','有事处理，没事安静待着。'],
['灵感池','灵感池里暂时没鱼，先别急着抽干水。','等一等','对，好的点子也需要长大。'],
['周报','正在把做完的事写进周报，努力不让字数超过工作量。','难度很高','所以我决定少写两句，多做一点。']];
export const seedEggs=lines.map(([topic,text,label,reply],i)=>({id:'office-'+i,topic,text,choices:[{label,reply}],roles:['*'],source:null,expiresAt:null}));
function clean(value,max){if(typeof value!=='string'||!value.trim()||[...value.trim()].length>max||/[\u0000-\u001f\u007f]/.test(value))throw Error('彩蛋文字格式或长度不正确');return value.trim();}
export function validateEggs(items,now=Date.now()){
 if(!Array.isArray(items)||!items.length||items.length>24)throw Error('每批需要 1～24 条彩蛋');
 const unique=new Map();for(const item of items){const text=clean(item.text,60),topic=clean(item.topic,24);const u=new URL(item.source);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|0\.|192\.168\.|10\.|\[)/i.test(u.hostname))throw Error('彩蛋需要公开网页来源');
 const roles=item.roles??['*'];if(!Array.isArray(roles)||!roles.length||roles.length>16||roles.some(r=>!/^([a-z][a-z0-9-]{0,40}|\*)$/.test(r)))throw Error('彩蛋岗位格式错误');
 if(!Array.isArray(item.choices)||item.choices.length<1||item.choices.length>3)throw Error('彩蛋需要 1～3 个接话选项');const choices=item.choices.map(c=>({label:clean(c.label,16),reply:clean(c.reply,80)}));
 const expiresAt=Number(item.expiresAt);if(!Number.isFinite(expiresAt)||expiresAt<=now||expiresAt>now+30*24*HOUR)throw Error('彩蛋有效期需要在未来 30 天内');
 const id=createHash('sha256').update(text.replace(/[\p{P}\p{Z}]/gu,'')).digest('hex').slice(0,20);unique.set(id,{id,topic,text,roles,choices,source:u.href,expiresAt,addedAt:now});}return [...unique.values()];
}
export class EasterEggs{
 static async open(options){const self=new EasterEggs(options);await mkdir(options.dir,{recursive:true});try{self.data=JSON.parse(await readFile(self.file,'utf8'));if(!Array.isArray(self.data.items)||!self.data.seen)throw Error('彩蛋库格式异常');}catch(e){if(e.code!=='ENOENT')throw e;self.data={items:structuredClone(seedEggs),seen:{},enabled:true,nextUpdate:Date.now()+120000,lastUpdate:null,error:null};await self.save();}return self;}
 constructor({dir,run,busy=()=>false}){this.file=path.join(dir,'easter-eggs.json');this.run=run;this.busy=busy;this.saves=Promise.resolve();this.running=false;}
 save(){const text=JSON.stringify(this.data);this.saves=this.saves.catch(()=>{}).then(async()=>{await writeFile(this.file+'.tmp',text,{mode:0o600});await rename(this.file+'.tmp',this.file);});return this.saves;}
 available(role){return this.data.items.filter(x=>(!x.expiresAt||x.expiresAt>Date.now())&&(x.roles.includes('*')||x.roles.includes(role)));}
 async pick(role,busy=false){if(busy)return null;const pool=this.available(role),seen=this.data.seen[role]??[],global=this.data.seen['*']??[];const unseen=pool.filter(x=>!seen.includes(x.id));const options=unseen.length?unseen:pool.filter(x=>x.id!==seen.at(-1));if(!options.length)return null;const fresh=options.filter(x=>!global.slice(-8).includes(x.id));const candidates=fresh.length?fresh:options;const egg=candidates[Math.floor(Math.random()*candidates.length)];this.data.seen[role]=[...(unseen.length?seen:[]),egg.id].slice(-240);this.data.seen['*']=[...global,egg.id].slice(-16);await this.save();return egg;}
 status(){return {enabled:this.data.enabled,running:this.running,count:this.data.items.filter(x=>!x.expiresAt||x.expiresAt>Date.now()).length,lastUpdate:this.data.lastUpdate,nextUpdate:this.data.nextUpdate,error:this.data.error,agent:this.data.agent||null};}
 async publish(items){const validated=validateEggs(items);const originals=this.data.items.filter(x=>!x.source);const dynamic=new Map(this.data.items.filter(x=>x.source&&x.expiresAt>Date.now()).map(x=>[x.id,x]));for(const item of validated)dynamic.set(item.id,item);this.data.items=[...originals,...[...dynamic.values()].slice(-120)];this.data.lastUpdate=Date.now();this.data.error=null;this.data.nextUpdate=Date.now()+(18+Math.random()*18)*HOUR;await this.save();return validated.length;}
 async configure(enabled){if(typeof enabled!=='boolean')throw Error('enabled 必须为布尔值');this.data.enabled=enabled;await this.save();return this.status();}
 async refresh(force=false){if(this.running||!this.data.enabled||this.busy()||(!force&&Date.now()<this.data.nextUpdate))return false;this.running=true;try{this.data.nextUpdate=Date.now()+6*HOUR;await this.save();const result=await this.run(this.data.items.filter(x=>x.source).map(x=>x.topic));await this.publish(result.items);this.data.agent=result.agent;await this.save();return true;}catch(e){this.data.error=String(e.message).slice(0,300);this.data.nextUpdate=Date.now()+6*HOUR;await this.save();return false;}finally{this.running=false;}}
}
