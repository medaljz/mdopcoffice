// Private local relay: Codex continues working when the OPC window disconnects.
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {chmod,unlink} from 'node:fs/promises';
const [socketPath,codeX]=process.argv.slice(2);if(!socketPath||!codeX)process.exit(2);
const clients=new Set(),pending=new Map(),requests=new Map();let sequence=0,initialized=null,initializing=null;
const active=new Set();let idleTimer;function idle(){clearTimeout(idleTimer);if(!clients.size&&!active.size)idleTimer=setTimeout(()=>child?.kill(),15000);}
let child;let childReady;const started=new Promise(r=>childReady=r);
const write=(c,m)=>{if(!c.destroyed)c.write(JSON.stringify(m)+'\n');};
const server=net.createServer(c=>{clients.add(c);clearTimeout(idleTimer);const lines=createInterface({input:c});lines.on('line',async line=>{let m;try{m=JSON.parse(line);}catch{return;}await started;
 if(m.method==='initialize'){
  if(initialized){write(c,{id:m.id,result:initialized});for(const r of requests.values())write(c,r);return;}
  if(initializing){await initializing;write(c,{id:m.id,result:initialized});return;}
  let done;initializing=new Promise(r=>done=r);const id=++sequence;pending.set(id,{c,id:m.id,initialize:done});child.stdin.write(JSON.stringify({...m,id})+'\n');return;
 }
 if(m.method==='initialized')return;
 if(m.method&&m.id!==undefined){const id=++sequence;pending.set(id,{c,id:m.id});child.stdin.write(JSON.stringify({...m,id})+'\n');}
 else if(m.id!==undefined&&!m.method){if(!requests.has(String(m.id)))return;requests.delete(String(m.id));child.stdin.write(JSON.stringify(m)+'\n');}
 else child.stdin.write(JSON.stringify(m)+'\n');
 });c.on('error',()=>{});c.on('close',()=>{clients.delete(c);lines.close();idle();});});
server.on('error',e=>{if(e.code!=='EADDRINUSE')console.error(e);process.exit(1);});
server.listen(socketPath,async()=>{
 await chmod(socketPath,0o600);
 child=spawn(codeX,['app-server','--stdio'],{stdio:['pipe','pipe','inherit']});
 childReady();
 createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
  if(m.method){if(m.method==='turn/started')active.add(m.params.threadId);if(m.method==='turn/completed'){active.delete(m.params.threadId);idle();}if(m.id!==undefined)requests.set(String(m.id),m);for(const c of clients)write(c,m);return;}
  const p=pending.get(m.id);if(!p)return;pending.delete(m.id);if(p.initialize){initialized=m.result;p.initialize();if(m.error){console.error(m.error.message);child.kill();return;}child.stdin.write('{"method":"initialized"}\n');}write(p.c,{...m,id:p.id});
 });child.on('error',e=>{console.error(e);process.exit(1);});child.on('close',async()=>{for(const c of clients)c.destroy();await unlink(socketPath).catch(()=>{});server.close();process.exit(0);});
});
process.on('SIGTERM',()=>child?.kill());process.on('SIGINT',()=>child?.kill());
