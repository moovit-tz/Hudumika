import {useLocation,useNavigate} from 'react-router-dom';
export function useFinanceDocumentRoute(collection:string){
 const location=useLocation();const navigate=useNavigate();const base=`/finance/${collection}`;
 const parts=location.pathname.slice(base.length).split('/').filter(Boolean);
 const mode=parts[0]==='new'?'new':parts[0]?(parts[1]==='edit'?'edit':'detail'):'list';
 const id=parts[0]&&parts[0]!=='new'?decodeURIComponent(parts[0]):null;
 return {mode,id,path:location.pathname,open:(next:'new'|'detail'|'edit'|'list',recordId?:string|null)=>navigate(next==='list'?base:next==='new'?base+'/new'+location.search:`${base}/${encodeURIComponent(recordId||id||'')}${next==='edit'?'/edit':''}`)};
}
