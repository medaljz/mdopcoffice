// Codex desktop uses Immer patches. Reject gaps and unsafe paths; request a fresh
// snapshot rather than applying partial state to a different revision.
export function applyDesktopChange(previous,change){
 if(change.type==='snapshot')return {revision:change.revision,state:structuredClone(change.conversationState)};
 if(change.type!=='patches'||!previous||previous.revision!==change.baseRevision)return null;
 const state=structuredClone(previous.state);
 for(const p of change.patches){if(!Array.isArray(p.path)||p.path.some(k=>['__proto__','constructor','prototype'].includes(k)))return null;let parent=state;for(const k of p.path.slice(0,-1)){parent=parent?.[k];if(parent==null)return null;}const key=p.path.at(-1);if(key===undefined)return null;if(p.op==='remove'){if(Array.isArray(parent))parent.splice(Number(key),1);else delete parent[key];}else if(p.op==='add'||p.op==='replace'){if(Array.isArray(parent)&&p.op==='add')parent.splice(Number(key),0,p.value);else parent[key]=p.value;}else return null;}
 return {revision:change.revision,state};
}
export function desktopStatus(s){const t=s.threadRuntimeStatus;if(t?.type==='active')return t.activeFlags?.some(x=>/waiting|approval|input/i.test(x))?'waiting':'running';if(t?.type==='idle')return 'idle';return 'unknown';}
