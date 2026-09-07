#!/usr/bin/env node
// OPC · 一人公司 —— WorkBuddy MCP 连接器（stdio）
// 把 OPC 的本地 HTTP 接口包装成 MCP 工具，让 WorkBuddy 能直接给 AI 办公室派单 / 读状态。
// 零外部依赖，仅用 Node 标准库。
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {deployment,ensureOffice} from './lib/local-launch.mjs';

const OPC='127.0.0.1';
const PORT=(await deployment()).port||4317;
const BASE=`http://${OPC}:${PORT}`;
const ORIGIN=BASE;
let cookie=null;

function opcRequest(method,pathname,body){
  return new Promise((resolve,reject)=>{
    const data=body?JSON.stringify(body):null;
    const req=http.request({
      host:OPC,port:PORT,path:pathname,method,
      headers:{
        'Host':`${OPC}:${PORT}`,
        'Origin':ORIGIN,
        ...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),
        ...(cookie?{Cookie:cookie}:{}),
      },
    },res=>{
      if(res.headers['set-cookie'])cookie=res.headers['set-cookie'].map(c=>c.split(';')[0]).join('; ');
      let raw='';res.on('data',d=>raw+=d);res.on('end',()=>{
        try{const body=raw?JSON.parse(raw):null;if(res.statusCode>=400)reject(Error(body?.error||'OPC HTTP '+res.statusCode));else resolve({status:res.statusCode,body});}
        catch(e){resolve({status:res.statusCode,body:raw});}
      });
    });
    req.setTimeout(60000,()=>req.destroy(Error('OPC request timed out')));req.on('error',reject);
    if(data)req.write(data);
    req.end();
  });
}

async function ensureSession(){
  await ensureOffice();
  cookie=null;
  const r=await opcRequest('GET','/');
  if(r.status!==200)throw new Error('无法连接 OPC 办公室（HTTP '+r.status+'）');
}

const TOOLS=[
 {name:'opc_easter_eggs',description:'查看闲时彩蛋更新状态、启动一次空闲时联网搜集，或发布你刚实际联网搜集并原创的对话。publish 必须提供实际阅读来源和未来30天内的有效期，不得编造热搜。',inputSchema:{type:'object',properties:{action:{type:'string',enum:['status','refresh','publish']},items:{type:'array',maxItems:24,items:{type:'object',properties:{topic:{type:'string'},text:{type:'string'},roles:{type:'array',items:{type:'string'}},source:{type:'string'},expiresAt:{type:'number'},choices:{type:'array',items:{type:'object',properties:{label:{type:'string'},reply:{type:'string'}},required:['label','reply']}}},required:['topic','text','source','expiresAt','choices']}}},required:['action']}},
  {
    name:'opc_assign_task',
    description:'在 OPC AI 办公室里给某位员工安排任务（选择本机 WorkBuddy 或 Codex）。roleId 可选：manager(主管)/product(产品策划)/designer(设计总监)/developer(开发工程师)/reviewer(审核经理)/delivery(交付经理)/hr/finance(财务总监)。cascade=true 且 roleId=manager 时，主管会自动把任务拆给相关员工。',
    inputSchema:{
      type:'object',
      properties:{
        agent:{type:'string',enum:['workbuddy','codex'],description:'执行 Agent，默认 workbuddy'},
        cwd:{type:'string',description:'WorkBuddy 新任务的绝对目录，可选'},
        threadId:{type:'string',description:'续接原有 Agent 对话 ID，Codex 派单必须指定'},
        roleId:{type:'string',description:'员工角色 id，默认 manager'},
        prompt:{type:'string',description:'任务需求（2～12000 字）'},
        title:{type:'string',description:'任务标题（可选）'},
        cascade:{type:'boolean',description:'是否让主管自动级联派单给下属，默认 false'},
      },
      required:['prompt'],
    },
  },
  {
    name:'opc_list_tasks',
    description:'列出 OPC 办公室里所有任务（含状态、负责角色、来源、摘要）。',
    inputSchema:{type:'object',properties:{}},
  },
  {
    name:'opc_get_task',
    description:'查看某个任务的详情。',
    inputSchema:{type:'object',properties:{id:{type:'string',description:'任务 id'}},required:['id']},
  },
  {
    name:'opc_roles',
    description:'列出办公室所有员工角色及其当前状态（工作中/休息中）。',
    inputSchema:{type:'object',properties:{}},
  },
  {
    name:'opc_status',
    description:'查看 OPC 与 WorkBuddy / Codex 的连接状态及主管委派概况。',
    inputSchema:{type:'object',properties:{}},
  },
];

async function callTool(name,args){
  await ensureSession();
  if(name==='opc_easter_eggs'){
    if(args.action==='status')return (await opcRequest('GET','/api/easter-eggs')).body;
    if(args.action==='refresh')return (await opcRequest('POST','/api/easter-eggs/refresh',{})).body;
    if(args.action==='publish')return (await opcRequest('POST','/api/easter-eggs/publish',{items:args.items})).body;
    throw Error('未知彩蛋操作');
  }
  if(name==='opc_assign_task'){
    const roleId=args.roleId||'manager';
    const prompt=String(args.prompt||'').trim();
    if(prompt.length<2)throw new Error('prompt 至少需要 2 个字符');
    if(args.agent==='codex'&&!args.threadId)throw Error('Codex 派单需要 threadId；请先在 OPC 选择项目与对话');
    const requestId='opc-'+Date.now().toString(36)+'-'+randomUUID().slice(0,8);
    const r=await opcRequest('POST','/api/project',{
      agent:args.agent||'workbuddy',roleId,prompt,...(args.cwd?{cwd:args.cwd}:{}),...(args.threadId?{route:{mode:'existing',threadId:args.threadId}}:{}),
      requestId,
      ...(args.title?{title:args.title}:{}),
      ...(args.cascade?{cascade:true}:{}),
    });
    return {ok:r.status===202,status:r.status,body:r.body};
  }
  if(name==='opc_list_tasks'){
    const r=await opcRequest('GET','/api/state');
    const ps=(r.body?.projects||[]).map(p=>({
      id:p.id,title:p.title,status:p.status,source:p.source,
      role:p.currentRole||p.directRoleId||'manager',summary:(p.summary||'').slice(0,120),
    }));
    return {count:ps.length,projects:ps};
  }
  if(name==='opc_get_task'){
    const r=await opcRequest('GET','/api/state');
    const p=(r.body?.projects||[]).find(x=>x.id===args.id);
    return p?{task:p}:{error:'任务不存在'};
  }
  if(name==='opc_roles'){
    const r=await opcRequest('GET','/api/state');
    return {roles:(r.body?.roles||[]).map(x=>({id:x.id,title:x.title,status:x.status,activity:x.activity}))};
  }
  if(name==='opc_status'){
    const r=await opcRequest('GET','/api/state');
    const c=r.body?.connection||{};
    const wb=c.workbuddyStatus||{};
    return {
      workbuddy:!!c.workbuddy,
      workbuddyInstalled:wb.installed??null,
      workbuddyConnected:wb.connected??null,
      verifiedAt:wb.verifiedAt??null,
      codex:!!c.codex,
      roles:(r.body?.roles||[]).map(x=>`${x.title}:${x.status}`),
    };
  }
  throw new Error('未知工具: '+name);
}

// ---- MCP stdio 传输 ----
const pending=new Map();
function send(obj){process.stdout.write(JSON.stringify(obj)+'\n');}
process.stdin.setEncoding('utf8');
let buf='';
process.stdin.on('data',chunk=>{
  buf+=chunk;
  let i;
  while((i=buf.indexOf('\n'))>=0){
    const line=buf.slice(0,i).trim();buf=buf.slice(i+1);
    if(!line)continue;
    let msg;try{msg=JSON.parse(line);}catch{continue;}
    handle(msg);
  }
});
process.stdin.on('end',()=>{}); // MCP 客户端控制进程生命周期；stdin 关闭时不立即退出，让 pending 异步工具调用完成

async function handle(msg){
  try{
    if(msg.method==='initialize'){
      send({jsonrpc:'2.0',id:msg.id,result:{
        protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(msg.params?.protocolVersion)?msg.params.protocolVersion:'2025-11-25',
        capabilities:{tools:{}},
        serverInfo:{name:'opc-office',version:'0.1.0'},
      }});
      ensureOffice().catch(e=>process.stderr.write('opc startup: '+e.message+'\n'));
      return;
    }
    if(msg.method==='ping'){send({jsonrpc:'2.0',id:msg.id,result:{}});return;}
    if(msg.method==='tools/list'){
      send({jsonrpc:'2.0',id:msg.id,result:{tools:TOOLS}});
      return;
    }
    if(msg.method==='tools/call'){
      const {name,arguments:args}=msg.params||{};
      try{
        const result=await callTool(name,args||{});
        send({jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:JSON.stringify(result,null,2)}]}});
      }catch(e){
        send({jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:'调用失败: '+e.message}],isError:true}});
      }
      return;
    }
    if(msg.method&&msg.id!==undefined){
      send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'不支持的方法: '+msg.method}});
    }
  }catch(e){
    if(msg.id!==undefined)send({jsonrpc:'2.0',id:msg.id,error:{code:-32603,message:e.message}});
  }
}
process.stderr.write('opc-mcp: ready (stdio)\n');
