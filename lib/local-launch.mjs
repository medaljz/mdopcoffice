import {spawn} from 'node:child_process';
import {readFile,mkdir,open,rm,stat,realpath,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {openExternal} from './platform.mjs';
export const installationRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function deployment(root=installationRoot){try{return JSON.parse(await readFile(path.join(root,'.local/deployment.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {mode:'web',port:4317};throw e;}}
export async function ensureOffice(root=installationRoot){
 if(Number(process.versions.node.split('.')[0])<24)throw Error('OPC requires Node.js 24 or later');
 const config=await deployment(root),port=Number(config.port||4317);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid OPC port');const url='http://127.0.0.1:'+port;
 async function ready(){let r;try{r=await fetch(url+'/health',{signal:AbortSignal.timeout(1000)});}catch{return false;}let h;try{h=await r.json();}catch{throw Error('Port '+port+' belongs to another service');}if(h.app!=='one-pc-office')throw Error('Port '+port+' belongs to another service');const home=await fetch(url,{signal:AbortSignal.timeout(5000)}),cookie=home.headers.get('set-cookie')?.split(';')[0];const state=await(await fetch(url+'/api/state',{headers:{cookie},signal:AbortSignal.timeout(5000)})).json();if(await realpath(state.root)!==await realpath(root))throw Error('Another OPC installation uses port '+port+'; choose --port');return true;}
 if(await ready())return url;
 const local=path.join(root,'.local');await mkdir(local,{recursive:true});const lock=path.join(local,'start-lock');let owner=false;
 for(let i=0;i<100;i++){try{await mkdir(lock);owner=true;break;}catch(e){if(e.code!=='EEXIST')throw e;if(await ready())return url;if(Date.now()-(await stat(lock).catch(()=>({mtimeMs:Date.now()}))).mtimeMs>60000)await rm(lock,{recursive:true,force:true});await new Promise(r=>setTimeout(r,200));}}
 if(!owner)throw Error('OPC startup is still pending');
 try{if(await ready())return url;const log=await open(path.join(local,'service.log'),'a',0o600);const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:{...process.env,ONE_PC_PORT:String(port),ONE_PC_DATA_DIR:local},detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]});let error;child.on('error',e=>error=e);child.unref();await log.close();await writeFile(path.join(local,'service.pid'),String(child.pid));for(let i=0;i<100;i++){if(error)throw error;if(await ready())return url;await new Promise(r=>setTimeout(r,200));}throw Error('OPC startup failed; inspect .local/service.log');}finally{await rm(lock,{recursive:true,force:true});}
}
export async function showOffice(root=installationRoot,mode){const c=await deployment(root),url=await ensureOffice(root);mode??=c.mode;if(mode==='web')return openExternal(url);
 if(process.platform==='darwin'){const app=path.join(root,'dist/OPC.app');if(!existsSync(app))throw Error('Run deployment with --mode app first');return openExternal(app);}
 if(process.platform==='win32'){const exe=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).flatMap(base=>[path.join(base,'Microsoft/Edge/Application/msedge.exe'),path.join(base,'Google/Chrome/Application/chrome.exe')]).find(existsSync);if(!exe)throw Error('Standalone window requires Edge or Chrome');const child=spawn(exe,['--app='+url],{detached:true,windowsHide:true,stdio:'ignore'});child.on('error',e=>process.stderr.write(e.message+'\n'));child.unref();return;}
 throw Error('Standalone window is supported on macOS and Windows');
}
