export const defaultCompany={name:'麦多OPC',subtitle:'一人公司'};
export function updateCompany(state,input){const name=String(input.name||'').trim(),subtitle=String(input.subtitle??'一人公司').trim();if(!name||[...name].length>24||/[\u0000-\u001f\u007f]/.test(name))throw Error('公司名称需要 1～24 个可显示字符');if([...subtitle].length>32||/[\u0000-\u001f\u007f]/.test(subtitle))throw Error('公司说明最多 32 个可显示字符');state.company={name,subtitle};return state.company;}
export function bindAgent(state,{roleId,agent}){if(!['codex','workbuddy'].includes(agent))throw Error('请选择 Codex 或 WorkBuddy');const role=state.roles.find(r=>r.id===roleId);if(!role)throw Error('岗位不存在');role.agent=agent;return role;}

export function deploymentCompanyName(value){const prefix=String(value??'').trim().replace(/\s*opc$/i,'').trim();if(!prefix)throw Error('请输入 OPC 名称，例如 小林');const name=prefix+'OPC';updateCompany({}, {name});return name;}
