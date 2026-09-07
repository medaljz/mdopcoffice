import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export function findExecutable(names,extra=[]){for(const p of extra)if(p&&existsSync(p))return p;for(const dir of (process.env.PATH||'').split(path.delimiter))for(const name of names){const p=path.join(dir,name);if(existsSync(p))return p;}return null;}
export function findCodex(){return findExecutable(process.platform==='win32'?['codex.exe']:['codex'],[process.env.ONE_PC_CODEX,process.platform==='darwin'?'/Applications/ChatGPT.app/Contents/Resources/codex':null,process.platform==='darwin'?'/Applications/Codex.app/Contents/Resources/codex':null]);}
export async function openExternal(target){if(typeof target!=='string'||/[\r\n\0]/.test(target))throw Error('无效打开目标');if(process.platform==='darwin')return promisify(execFile)('/usr/bin/open',[target]);if(process.platform==='win32')return promisify(execFile)('rundll32.exe',['url.dll,FileProtocolHandler',target]);return promisify(execFile)('xdg-open',[target]);}
export const defaultHome=()=>os.homedir();
