import {useSessionDraft,clearSessionDrafts} from './useSessionDraft.js';
function prefix(){try{const user=JSON.parse(localStorage.getItem('hudumika_user')||'{}');return `finance:${user.tenant_id||'workspace'}:${user.id||'user'}:${location.pathname}:`;}catch{return `finance:workspace:user:${location.pathname}:`;}}
export function useFinanceDraft<T>(key:string,initial:T|(()=>T)){return useSessionDraft<T>(prefix()+key,typeof initial==='function'?(initial as ()=>T)():initial);}
export function clearFinanceDrafts(){clearSessionDrafts(prefix());}
export function hasFinanceDraft(key:string){try{return sessionStorage.getItem('draft:'+prefix()+key)!==null;}catch{return false;}}

export function hasAnyFinanceDraft(){try{const start='draft:'+prefix();return Object.keys(sessionStorage).some(key=>key.startsWith(start));}catch{return false;}}
