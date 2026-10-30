import {useState, useEffect, useCallback, useRef} from 'react';
import {apiFetch} from '../lib/api.js';
import type {RenewalFinanceOverview, RenewalCycleCostSummary, RenewalCostLine, RenewalBudget, RenewalAllocation, RenewalForecast} from '@hudumika/types';
function useFinanceQuery<T>(path: string | null, initial: T) {
  const [data,setData]=useState<T>(initial);
  const [loading,setLoading]=useState(!!path);
  const [error,setError]=useState<string|null>(null);
  const generation=useRef(0);
  const load=useCallback(async()=>{
    const current=++generation.current;
    if (!path) return;
    setLoading(true); setError(null);
    try {const result=await apiFetch(path);if(current===generation.current)setData(result);}
    catch(e) {if(current===generation.current){setData(initial);setError(e instanceof Error?e.message:'Unable to load renewal finance');}}
    finally {if(current===generation.current)setLoading(false);}
  // Initial values are reset only on failure; the request URL identifies the query.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[path]);
  useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
  return {data,loading,error,refresh:load};
}
export const useRenewalFinanceOverview=(currency='TZS')=>useFinanceQuery<RenewalFinanceOverview|null>(`/v1/renewal-finance/overview?currency=${encodeURIComponent(currency)}`,null);
export function useRenewalRegister(opts?:{currency?:string;entity_id?:string;site_id?:string;jurisdiction?:string;agency_code?:string;status?:string}){
  const params=new URLSearchParams(Object.entries(opts??{}).filter((p):p is [string,string]=>p[1]!==undefined));
  return useFinanceQuery<RenewalCycleCostSummary[]>(`/v1/renewal-finance/register?${params}`,[]);
}
export const useCycleCostLines=(id:string|null)=>useFinanceQuery<RenewalCostLine[]>(id?`/v1/renewal-finance/cycles/${id}/cost-lines`:null,[]);
export const useCycleBudgets=(id:string|null)=>useFinanceQuery<RenewalBudget[]>(id?`/v1/renewal-finance/cycles/${id}/budgets`:null,[]);
export const useCycleAllocations=(id:string|null)=>useFinanceQuery<RenewalAllocation[]>(id?`/v1/renewal-finance/cycles/${id}/allocations`:null,[]);
export const useCycleAudit=(id:string|null)=>useFinanceQuery<any[]>(id?`/v1/renewal-finance/cycles/${id}/audit`:null,[]);
export const useForecasts=(currency='TZS')=>useFinanceQuery<RenewalForecast[]>(`/v1/renewal-finance/forecasts?currency=${encodeURIComponent(currency)}`,[]);
