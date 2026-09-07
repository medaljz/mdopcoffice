import {agentPids} from '../lib/agent-start.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {deployment,installationRoot,showOffice} from '../lib/local-launch.mjs';
const file=path.join(installationRoot,'.local/watcher.pid');await mkdir(path.dirname(file),{recursive:true});try{const pid=Number(await readFile(file,'utf8'));if(pid!==process.pid){process.kill(pid,0);process.exit(0);}}catch{}await writeFile(file,String(process.pid));
const exec=promisify(execFile);let previous=[],busy=false;
async function tick(){if(busy)return;busy=true;try{const c=await deployment();if(c.autostart!=='agent')return;const {stdout}=await exec(process.platform==='win32'?'tasklist.exe':'/bin/ps',process.platform==='win32'?['/FO','CSV','/NH']:['-axo','pid=,args='],{windowsHide:true});const current=agentPids(stdout,process.platform,c.agents);if(current.some(id=>!previous.includes(id)))await showOffice(installationRoot);previous=current;}catch(e){process.stderr.write(e.message+'\n');}finally{busy=false;}}
await tick();setInterval(tick,3000);
