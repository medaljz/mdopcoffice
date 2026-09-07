import {cp,mkdir,rm,writeFile,readdir,lstat,readFile} from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dest=path.join(root,'output/OPC-share'),archive=path.join(root,'output/OPC-share.zip');
const view=await readFile(path.join(root,'public/office-view.js'),'utf8');const preload=view.match(/this\.images=(\[[^\]]+\])\.map/);if(!preload)throw Error('Cannot resolve current scene asset list');const assets=new Set(JSON.parse(preload[1].replaceAll("'",'"')).map(n=>n+'.png'));
await rm(dest,{recursive:true,force:true});await mkdir(dest,{recursive:true});
async function copy(name){await cp(path.join(root,name),path.join(dest,name),{recursive:true,filter:async src=>{if((await lstat(src)).isSymbolicLink())throw Error('Refusing symlink in share package: '+src);if(path.dirname(src)===path.join(root,'public/assets')&&src.endsWith('.png'))return assets.has(path.basename(src));return !src.endsWith('.DS_Store');}});}
for(const name of ['public','lib','native','skills','server.mjs','opc-mcp.mjs','package.json','package-lock.json','启动OPC.command','启动OPC-Windows.cmd'])await copy(name);
for(const name of ['launch.mjs','deploy.mjs','watch-agents.mjs','build-macos.sh','build-windows.ps1','codex-daemon.mjs','follow-host.mjs','split-sprite-sheet.py','validate-character.py','package-share.mjs'])await copy('scripts/'+name);
for(const name of ['INSTALL.md','share-guide.md','AGENT-INSTALL.md','RELEASE-STATUS.md','ASSETS.md','office-preview.png','readme-demo.png'])await copy('docs/'+name);
const pkg=JSON.parse(await readFile(path.join(dest,'package.json'),'utf8'));pkg.scripts={start:'node scripts/launch.mjs',deploy:'node scripts/deploy.mjs',build:'bash scripts/build-macos.sh'};await writeFile(path.join(dest,'package.json'),JSON.stringify(pkg,null,2));
await writeFile(path.join(dest,'README.md'),(await readFile(path.join(dest,'docs/share-guide.md'),'utf8')).replaceAll('(INSTALL.md)','(docs/INSTALL.md)').replaceAll('(ASSETS.md)','(docs/ASSETS.md)').replaceAll('(readme-demo.png)','(docs/readme-demo.png)'));await writeFile(path.join(dest,'AGENTS.md'),'# OPC 安装与修改\n\n先阅读 docs/AGENT-INSTALL.md 和 docs/RELEASE-STATUS.md。保留用户的源码、公司与人物设置；绑定当前电脑自己的 Agent。未经真实验收不宣称派发或自动启动成功。不得复制其他安装的账号或聊天记录。\n');
await writeFile(path.join(dest,'.gitignore'),'.local/\nnode_modules/\ndist/\noutput/\n.env\n.env.*\n.DS_Store\n*.log\n');
const hashes={};async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())await scan(file);else hashes[path.relative(dest,file).replaceAll(path.sep,'/')]=createHash('sha256').update(await readFile(file)).digest('hex');}}await scan(dest);await writeFile(path.join(dest,'MANIFEST.json'),JSON.stringify({format:1,files:hashes},null,2));
await rm(archive,{force:true});
// Python's ZIP writer sets the standard UTF-8 filename flag for Chinese launchers.
await promisify(execFile)(process.platform==='win32'?'python':'python3',['-c',`import os,sys,zipfile
root,archive=sys.argv[1:]
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for folder,dirs,files in os.walk(root):
  for name in sorted(files):
   file=os.path.join(folder,name)
   z.write(file,os.path.relpath(file,os.path.dirname(root)))
`,dest,archive]);
console.log(JSON.stringify({archive,files:Object.keys(hashes).length,sha256:createHash('sha256').update(await readFile(archive)).digest('hex')},null,2));
