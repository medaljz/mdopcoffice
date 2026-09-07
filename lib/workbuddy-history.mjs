import {readFile,readdir,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';

export const workbuddyHome=()=>process.env.OPC_WORKBUDDY_HOME||path.join(os.homedir(),'.workbuddy');
const validId=id=>typeof id==='string'&&/^[\w:-]{1,150}$/.test(id);
const projectId=cwd=>'wb-'+createHash('sha256').update(cwd).digest('hex').slice(0,16);
export function parseTranscript(text){
 const records=[];for(const line of text.split('\n')){try{records.push(JSON.parse(line));}catch{}}
 const messages=new Map(),usage=new Map();
 const time=r=>typeof r.timestamp==='number'?r.timestamp:Date.parse(r.timestamp||r.__timestamp)||0;
 for(const r of records){const m={...r,...r.message},id=r.uuid||r.id||m.id;const role=m.role||r.type;
  if(['user','assistant'].includes(role)&&Array.isArray(m.content)){
   const text=m.content.filter(x=>['text','input_text','output_text'].includes(x.type)).map(x=>x.text).join('\n').replace(/<system-reminder[\s\S]*?<\/system-reminder>/g,'').trim();
   if(text&&!r.isMeta)messages.set(id||String(messages.size),{id,type:role==='user'?'userMessage':'agentMessage',text,time:time(r)});
  }else if(role==='user'&&typeof m.content==='string')messages.set(id||String(messages.size),{id,type:'userMessage',text:m.content,time:time(r)});
  const u=m.usage;if(id&&u&&Number.isSafeInteger(u.input_tokens)&&Number.isSafeInteger(u.output_tokens)&&u.input_tokens>=0&&u.output_tokens>=0){const value={id,input:u.input_tokens,output:u.output_tokens,cached:u.cache_read_input_tokens||0,total:u.input_tokens+u.output_tokens,time:time(r)};const old=usage.get(id);if(!old||value.total>=old.total)usage.set(id,value);}
 }
 return {items:[...messages.values()],usage:[...usage.values()].filter(u=>u.total>0),records};
}
export class WorkBuddyHistory {
 constructor({home=workbuddyHome(),state={projects:[]}}={}){this.home=home;this.state=state;this.cache=new Map();}
 async runtimeSessions(){const result=[];let names=[];try{names=await readdir(path.join(this.home,'sessions'));}catch{return result;}
  for(const n of names.filter(n=>/^\d+\.json$/.test(n))){try{const r=JSON.parse(await readFile(path.join(this.home,'sessions',n),'utf8'));if(!Number.isInteger(r.pid)||!validId(r.sessionId))continue;process.kill(r.pid,0);result.push({id:r.sessionId,pid:r.pid});}catch{}}
  return result;
 }
 async catalog(){let rows=[],error=null;let db;
  try{await stat(path.join(this.home,'workbuddy.db'));const {DatabaseSync}=await import('node:sqlite');db=new DatabaseSync(path.join(this.home,'workbuddy.db'),{readOnly:true});rows=db.prepare("SELECT id,cwd,title,custom_title,status,updated_at,model FROM sessions WHERE deleted_at IS NULL AND status != 'archived' ORDER BY updated_at DESC LIMIT 500").all();}
  catch(e){if(e.code!=='ENOENT')error='WorkBuddy 桌面记录读取失败：'+e.message;}finally{db?.close();}
  const live=new Set((await this.runtimeSessions()).map(r=>r.id));const map=new Map();
  for(const r of rows)if(validId(r.id)&&path.isAbsolute(r.cwd||''))map.set(r.id,{id:r.id,name:r.custom_title||r.title||'WorkBuddy 对话',cwd:r.cwd,projectId:projectId(r.cwd),updatedAt:r.updated_at,model:r.model,desktop:true,runtimeOpen:live.has(r.id),status:r.status,desktopStatus:r.status});
  for(const p of this.state.projects.filter(p=>p.source==='workbuddy'&&validId(p.threadId)).slice().reverse()){const old=map.get(p.threadId)||{};map.set(p.threadId,{...old,id:p.threadId,name:old.name||p.title,cwd:p.cwd,projectId:projectId(p.cwd),updatedAt:p.createdAt,preview:p.prompt,opcProjectId:p.id,status:p.status,desktop:old.desktop||false,runtimeOpen:live.has(p.threadId)});}
  const threads=[...map.values()].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));const projects=[...new Map(threads.map(t=>[t.projectId,{id:t.projectId,name:path.basename(t.cwd),roots:[t.cwd]}])).values()];return {projects,threads,error};
 }
 async transcript(thread){
  if(!validId(thread.id))throw Error('无效 WorkBuddy 会话');
  const cwd=await realpath(thread.cwd).catch(()=>thread.cwd);
  const file=path.join(this.home,'projects',cwd.replace(/[:\\/]/g,'-').replace(/^-+/,''),thread.id+'.jsonl');
  let info;try{info=await stat(file);}catch(e){if(e.code==='ENOENT')return {items:[],usage:[],records:[]};throw e;}
  if(info.size>32*1024*1024)throw Error('WorkBuddy 对话记录超过当前读取上限，请在原应用查看');
  const cached=this.cache.get(file);if(cached?.mtime===info.mtimeMs&&cached.size===info.size)return cached.data;
  const data=parseTranscript(await readFile(file,'utf8'));this.cache.set(file,{mtime:info.mtimeMs,size:info.size,data});if(this.cache.size>60)this.cache.delete(this.cache.keys().next().value);return data;
 }
 async messages(id){const catalog=await this.catalog(),thread=catalog.threads.find(t=>t.id===id);if(!thread)throw Error('WorkBuddy 对话不存在或已归档');const parsed=await this.transcript(thread);return {thread,items:parsed.items};}
 async collectUsage(p){if(!p.threadId)return [];return (await this.transcript({id:p.threadId,cwd:p.cwd})).usage.filter(u=>u.time>=p.createdAt-1000).map(u=>({...u,id:'workbuddy:'+p.threadId+':'+u.id,source:'workbuddy.transcript',role:p.directRoleId||'manager',projectId:p.id}));}
}
