export function agentPids(stdout,platform,agents=['codex','workbuddy']){
 const names=agents.flatMap(a=>a==='codex'?['codex','chatgpt']:['workbuddy']);return stdout.split('\n').flatMap(line=>{
  const m=platform==='win32'?line.match(/^"([^\"]+)","(\d+)"/):line.match(/^\s*(\d+)\s+(.+)$/);if(!m)return [];
  if(platform==='win32')return names.includes(m[1].replace(/\.exe$/i,'').toLowerCase())?[m[2]]:[];
  const command=m[2];if(command.includes('/Contents/Frameworks/')||/\s--type[= ]/.test(command))return [];
  if(agents.includes('workbuddy')&&/^\S*\/WorkBuddy\.app\/Contents\/MacOS\/(?:Electron|WorkBuddy)(?:\s|$)/i.test(command))return [m[1]];
  const name=command.split(/\s/)[0].split('/').at(-1);return names.includes(name.toLowerCase())?[m[1]]:[];
 });
}
