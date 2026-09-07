import {readdir,readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
export async function discoverSkills(){
 const roots=[path.resolve('skills'),path.join(os.homedir(),'.agents/skills'),path.join(os.homedir(),'.codex/skills'),path.resolve('.local/skills')];const found=[];const seen=new Set();
 for(const root of roots){let dirs;try{dirs=await readdir(root,{withFileTypes:true});}catch{continue;}for(const d of dirs){if(d.name.startsWith('.'))continue;try{let file=await realpath(path.join(root,d.name,'SKILL.md'));if(seen.has(file))continue;seen.add(file);let raw=await readFile(file,'utf8');const front=raw.match(/^---\s*\n([\s\S]*?)\n---/);let name=front?.[1].match(/^name:\s*["']?([^\n"']+)/m)?.[1]||d.name;let description=front?.[1].match(/^description:\s*["']?([^\n"']+)/m)?.[1]||'';found.push({id:createHash('sha256').update(file).digest('hex').slice(0,16),name,description:description.slice(0,240),path:file});}catch{}}}
 return found.sort((a,b)=>a.name.localeCompare(b.name));
}
