import {spawn,execFile} from 'node:child_process';
import {createInterface} from 'node:readline';
import {EventEmitter} from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {realpath,mkdir,stat,open,unlink} from 'node:fs/promises';
import {promisify} from 'node:util';
import {CODEX} from './codex.mjs';

// Metadata uses the installed protocol. Execution belongs to the desktop owner,
// never to a second app-server that might overwrite an active conversation.
export class AppServer extends EventEmitter {
 constructor(){super();this.pending=new Map();this.next=0;this.dataDir=path.resolve(process.env.ONE_PC_DATA_DIR||'.local');this.socketPath=path.join(os.tmpdir(),'opc-'+(process.getuid?.()??0),createHash('sha256').update(this.dataDir).digest('hex').slice(0,16)+'.sock');}
 async connect(){
  if(process.platform==='win32')throw Error('Windows 版 Codex 桌面同步尚未验证，请使用 WorkBuddy 或原 Codex 窗口');
  if(this.ready)return this.ready;
  this.ready=(async()=>{
   await mkdir(path.dirname(this.socketPath),{recursive:true,mode:0o700});const socketDir=await stat(path.dirname(this.socketPath));if(socketDir.uid!==(process.getuid?.()??0)||(socketDir.mode&0o077))throw Error('OPC 后台连接目录权限不正确');await mkdir(this.dataDir,{recursive:true});
   const connect=()=>new Promise((resolve,reject)=>{const c=net.createConnection(this.socketPath,()=>resolve(c));c.once('error',reject);});
   let socket;
   try{socket=await connect();}catch(e){
    if(!['ENOENT','ECONNREFUSED'].includes(e.code))throw e;
    if(e.code==='ECONNREFUSED'){const st=await stat(this.socketPath);if(st.uid!==(process.getuid?.()??0))throw Error('连接文件所有者不匹配');await unlink(this.socketPath);}
    const file=await open(path.join(this.dataDir,'codex-relay.log'),'a',0o600);
    const relay=spawn(process.execPath,[path.resolve('scripts/codex-daemon.mjs'),this.socketPath,CODEX],{detached:true,stdio:['ignore',file.fd,file.fd]});relay.unref();await file.close();
    for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,100));try{socket=await connect();break;}catch{}}
    if(!socket)throw Error('Codex 后台连接未启动');
   }
   this.socket=socket;this.child={stdin:socket};this.lines=createInterface({input:socket});
   const fail=e=>{this.ready=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();this.emit('disconnect',e);};
   socket.on('error',fail);socket.on('close',()=>fail(Error('Codex 数据连接已关闭')));
   this.lines.on('line',line=>{try{const m=JSON.parse(line);if(m.method){this.emit('event',m);return;}const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}catch{}});
   await this.send('initialize',{clientInfo:{name:'opc_monitor',version:'0.2.0'},capabilities:{experimentalApi:true}});
   this.socket.write(JSON.stringify({method:'initialized'})+'\n');
  })().catch(e=>{this.ready=null;throw e;});return this.ready;
 }
 send(method,params){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Codex 接口超时：'+method));},15000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,method,params})+'\n');});}
 async call(method,params={}){await this.connect();return this.send(method,params);}
 async pages(method,params={}){const data=[];let cursor;do{const r=await this.call(method,{...params,limit:100,...cursor?{cursor}:{}});data.push(...r.data);cursor=r.nextCursor;}while(cursor);return data;}
 reply(id,result){this.child.stdin.write(JSON.stringify({id,result})+'\n');}
 close(){this.socket?.end();this.lines?.close();}
}

const versions={'thread-owner-discovery':1,'thread-follower-start-turn':2,'thread-follower-steer-turn':1,'thread-follower-interrupt-turn':4,'thread-follower-load-complete-history':1};
export class DesktopBridge extends EventEmitter {
 constructor(socketPath=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'ipc/ipc.sock')){super();this.socketPath=socketPath;this.pending=new Map();this.buffer=Buffer.alloc(0);this.snapshots=new Map();}
 async connect(){
  if(this.ready)return this.ready;
  this.ready=(async()=>{
   const st=await stat(this.socketPath);if(!st.isSocket()||st.uid!==(process.getuid?.()??0))throw Error('Codex 桌面连接不可用');
   await new Promise((resolve,reject)=>{const s=this.socket=net.createConnection(this.socketPath,resolve);s.once('error',reject);s.on('error',()=>{});s.on('close',()=>{this.ready=null;this.clientId=null;this.snapshots.clear();this.emit('disconnect');for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Codex 桌面连接断开；请检查对话是否已收到消息，不要重复发送'));}this.pending.clear();});s.on('data',b=>this.receive(b));});
   const r=await this.send('initialize',{clientType:'opc-monitor'});this.clientId=r.result.clientId;
  })().catch(e=>{this.ready=null;throw e;});return this.ready;
 }
 write(m){const b=Buffer.from(JSON.stringify(m)),h=Buffer.alloc(4);h.writeUInt32LE(b.length);this.socket.write(Buffer.concat([h,b]));}
 receive(b){this.buffer=Buffer.concat([this.buffer,b]);while(this.buffer.length>=4){const n=this.buffer.readUInt32LE();if(n>64*1024*1024||!n){this.socket.destroy();return;}if(this.buffer.length<4+n)return;const raw=this.buffer.subarray(4,4+n);this.buffer=this.buffer.subarray(4+n);let m;try{m=JSON.parse(raw);}catch{this.socket.destroy();return;}
  if(m.type==='client-discovery-request')this.write({type:'client-discovery-response',requestId:m.requestId,response:{canHandle:false}});
  if(m.type==='response'){const p=this.pending.get(m.requestId);if(p){clearTimeout(p.timer);this.pending.delete(m.requestId);m.resultType==='error'?p.reject(Error(m.error)):p.resolve(m);}}
  if(m.type==='broadcast')this.emit('broadcast',m);
 }}
 send(method,params,{targetClientId,timeoutMs=20000}={}){return new Promise((resolve,reject)=>{const requestId=randomUUID(),timer=setTimeout(()=>{this.pending.delete(requestId);reject(Error('Codex 桌面响应超时；请先检查对话记录，避免重复发送'));},timeoutMs);this.pending.set(requestId,{resolve,reject,timer});this.write({type:'request',requestId,sourceClientId:this.clientId,method,params,version:versions[method]||0,targetClientId,timeoutMs});});}
 async call(method,params,options){await this.connect();return this.send(method,params,options);}
 async owner(id){try{return (await this.call('thread-owner-discovery',{hostId:'local',conversationId:id},{timeoutMs:12000})).handledByClientId;}catch(e){if(e.message==='no-client-found')return null;throw e;}}
 async open(id){if(!/^[\w-]+$/.test(id))throw Error('无效对话 ID');await promisify(execFile)('/usr/bin/open',['-a','/Applications/ChatGPT.app','codex://threads/'+id]);}
 async readyOwner(id){let owner=await this.owner(id);if(owner)return owner;await this.open(id);const end=Date.now()+12000;while(Date.now()<end){await new Promise(r=>setTimeout(r,500));owner=await this.owner(id);if(owner)return owner;}throw Error('请在 Codex 中打开此对话，桌面端尚未准备好接收任务');}
 async submit(id,prompt,clientUserMessageId){const owner=await this.readyOwner(id);return this.call('thread-follower-start-turn',{conversationId:id,turnStart:{request:{threadId:id,input:[{type:'text',text:prompt,text_elements:[]}],clientUserMessageId},context:{inheritThreadSettings:true}}},{targetClientId:owner,timeoutMs:45000});}
 async interrupt(id,turnId){if(!turnId)throw Error('没有可确认的当前轮次，请在 Codex 中停止任务');const owner=await this.owner(id);if(!owner)throw Error('Codex 对话不在运行');return this.call('thread-follower-interrupt-turn',{conversationId:id,expectedTurnId:turnId},{targetClientId:owner});}
 close(){this.socket?.destroy();}
}

export async function canonical(p){return realpath(p).catch(()=>path.resolve(p));}
export class CodexSync {
 constructor({root,app=new AppServer(),desktop=new DesktopBridge()}={}){this.root=root;this.app=app;this.desktop=desktop;}
 async catalog(){
  const [projects,threads]=await Promise.all([this.app.pages('project/list'),this.app.pages('thread/list',{sortKey:'updated_at',useStateDbOnly:true})]);
  for(const p of projects)p.paths=await Promise.all(p.roots.map(r=>canonical(r.path)));
  const mapped=await Promise.all(threads.filter(t=>!t.ephemeral).map(async t=>{const cwd=await canonical(t.cwd);return {id:t.id,name:t.name||t.preview?.slice(0,70)||'未命名对话',preview:t.preview?.slice(0,500)||'',cwd,projectId:t.projectId||projects.find(p=>p.paths.includes(cwd))?.id||null,updatedAt:t.updatedAt,path:t.path,historyMode:t.historyMode};}));
  return {projects:projects.map(p=>({id:p.id,name:p.name,roots:p.paths})),threads:mapped};
 }
 async createProject(name,key){
  if(!name||name.length>80||/[\\/\x00-\x1f]/.test(name)||['.','..'].includes(name))throw Error('项目名称需要 1～80 字，不能包含路径分隔符');
  const cwd=path.join(this.root,name);await mkdir(cwd,{recursive:true});
  await promisify(execFile)('/usr/bin/open',['-a','/Applications/ChatGPT.app',cwd]);
  for(let i=0;i<12;i++){const projects=await this.app.pages('project/list');const project=projects.find(p=>p.roots.some(r=>r.path===cwd));if(project)return {id:project.id,name:project.name,roots:[cwd]};await new Promise(r=>setTimeout(r,500));}
  throw Error('目录已创建，但 Codex 尚未登记项目，请打开 Codex 后重试');
 }
 async createThread(project,title){const cwd=project.roots[0];await stat(cwd);const {thread}=await this.app.call('thread/start',{cwd,projectId:project.id,historyMode:'paginated'});await this.app.call('thread/name/set',{threadId:thread.id,name:title.slice(0,80)});return thread;}
 async messages(id){const {thread}=await this.app.call('thread/read',{threadId:id,includeTurns:false});if(thread.historyMode==='paginated'){const r=await this.app.call('thread/items/list',{threadId:id,limit:100,sortDirection:'desc'});return {thread,items:r.data.reverse().map(e=>({...e.item,turnId:e.turnId})),cursor:r.nextCursor};}const r=await this.app.call('thread/read',{threadId:id,includeTurns:true});return {thread:r.thread,items:r.thread.turns.flatMap(t=>(t.items||[]).map(i=>({...i,turnId:t.id})))};}
 close(){this.desktop.close();this.app.close();}
}
