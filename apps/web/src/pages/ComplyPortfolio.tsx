import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {useRenewalRegister} from '../hooks/useRenewalFinance.js';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '../components/ui/card.js';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '../components/ui/select.js';
import {Button} from '../components/ui/button.js';
import {Banner} from '../components/ui/alert.js';
import {Badge} from '../components/ui/badge.js';
import {Tabs,TabsList,TabsTrigger} from '../components/ui/tabs.js';
import {SectionLoading} from '../components/ui/spinner.js';

export function ComplyPortfolio({revision=0}:{revision?:number}) {
  const [currency,setCurrency]=useState('TZS');
  const [groupBy,setGroupBy]=useState('entity');
  const [entity,setEntity]=useState('all');
  const [site,setSite]=useState('all');
  const [jurisdiction,setJurisdiction]=useState('all');
  const register=useRenewalRegister({currency});
  const lastRevision=useRef(revision);
  useEffect(()=>{if(lastRevision.current!==revision){lastRevision.current=revision;void register.refresh();}},[revision,register.refresh]);
  const rows=register.data.filter(r=>(entity==='all'||(r.entity_id??'unassigned')===entity)&&(site==='all'||(r.site_id??'unassigned')===site)&&(jurisdiction==='all'||(r.jurisdiction||'unassigned')===jurisdiction));
  const entities=new Map(register.data.map(r=>[r.entity_id??'unassigned',r.entity_name??'Unassigned entity']));
  const sites=new Map(register.data.filter(r=>entity==='all'||(r.entity_id??'unassigned')===entity).map(r=>[r.site_id??'unassigned',r.site_name??'Unassigned branch / site']));
  const jurisdictions=new Set(register.data.map(r=>r.jurisdiction||'unassigned'));
  const money=(amount:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(amount);
  const sum=(key:'estimated_cost'|'approved_budget'|'net_paid'|'remaining_forecast'|'committed')=>rows.reduce((total,r)=>total+Number(r[key]),0);
  const unpriced=rows.filter(r=>r.cost_line_count===undefined?r.estimated_cost===0:r.cost_line_count===0).length;
  const scope=new URLSearchParams({currency});
  if(entity!=='all')scope.set(entity==='unassigned'?'unassigned_entity':'entity_id',entity==='unassigned'?'1':entity);
  if(site!=='all')scope.set(site==='unassigned'?'unassigned_site':'site_id',site==='unassigned'?'1':site);
  if(jurisdiction!=='all')scope.set(jurisdiction==='unassigned'?'unassigned_jurisdiction':'jurisdiction',jurisdiction==='unassigned'?'1':jurisdiction);
  const groups=new Map<string,{name:string;count:number;unknown:number;remaining:number;open:number;overdue:number}>();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  for(const row of rows){
    const key=groupBy==='entity'?row.entity_id??'unassigned':groupBy==='site'?row.site_id??'unassigned':row.jurisdiction||'unassigned';
    const name=groupBy==='entity'?row.entity_name??'Unassigned entity':groupBy==='site'?row.site_name??'Unassigned branch / site':row.jurisdiction||'Unassigned jurisdiction';
    const group=groups.get(key)??{name,count:0,unknown:0,remaining:0,open:0,overdue:0};
    group.count++;group.unknown+=row.cost_line_count===0?1:0;group.remaining+=Number(row.remaining_forecast);group.open+=Number(row.open_commitments??0);
    if(row.expiry_date&&row.expiry_date<=today&&!['issued','cancelled'].includes(row.cycle_status))group.overdue++;
    groups.set(key,group);
  }
  const comparison=[...groups].sort((a,b)=>b[1].remaining-a[1].remaining||a[1].name.localeCompare(b[1].name));
  const metrics=[['Recorded estimate',sum('estimated_cost')],['Approved budget',sum('approved_budget')],['Net paid',sum('net_paid')],['Remaining funding',sum('remaining_forecast')],['Open commitments',rows.reduce((total,r)=>total+Number(r.open_commitments??0),0)]] as const;
  return <Card className="comply-portfolio">
    <CardHeader className="comply-desk-card-header"><div className="comply-desk-section-heading"><div><CardTitle>Renewal portfolio</CardTitle><CardDescription>Financial exposure across entities, branches and jurisdictions.</CardDescription></div><Button asChild size="sm" variant="outline"><Link to={`/complyos/renewal-finance?${scope}`}>Finance register</Link></Button></div></CardHeader>
    <CardContent className="comply-desk-card-content">
      <div className="comply-portfolio-filters">
        <label>Legal entity<Select value={entity} onValueChange={v=>{setEntity(v);setSite('all');}}><SelectTrigger aria-label="Portfolio legal entity"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All entities</SelectItem>{[...entities].map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></label>
        <label>Branch / site<Select value={site} onValueChange={setSite}><SelectTrigger aria-label="Portfolio branch or site"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All branches / sites</SelectItem>{[...sites].map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></label>
        <label>Jurisdiction<Select value={jurisdiction} onValueChange={setJurisdiction}><SelectTrigger aria-label="Portfolio jurisdiction"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All jurisdictions</SelectItem>{[...jurisdictions].sort().map(j=><SelectItem key={j} value={j}>{j==='unassigned'?'Unassigned jurisdiction':j}</SelectItem>)}</SelectContent></Select></label>
        <label>Currency<Select value={currency} onValueChange={setCurrency}><SelectTrigger aria-label="Portfolio currency"><SelectValue/></SelectTrigger><SelectContent>{['TZS','USD','KES','EUR','GBP'].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></label>
      </div>
      {(entity!=='all'||site!=='all'||jurisdiction!=='all')&&<Button className="comply-portfolio-reset" size="sm" variant="ghost" onClick={()=>{setEntity('all');setSite('all');setJurisdiction('all');}}>Clear scope</Button>}
      {register.error?<Banner variant="error" action={<Button size="sm" variant="outline" onClick={()=>void register.refresh()}>Retry portfolio</Button>}>{register.error}</Banner>:register.loading?<SectionLoading label="Loading renewal portfolio…"/>:<>
        <dl className="comply-portfolio-metrics">{metrics.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{!rows.length?'—':unpriced===rows.length&&(label==='Recorded estimate'||label==='Remaining funding')?'Cost unknown':money(value)}</dd></div>)}</dl>
        <p className="comply-desk-note">{rows.length} renewal cycles in scope · {unpriced} without recorded costs in {currency}. Filters apply to this portfolio.</p><details className="comply-portfolio-basis"><summary>How these amounts are calculated</summary><p>Amounts exclude unrecorded costs and penalties; currencies are never combined. Remaining funding uses recorded estimates less payments. Commitments can overlap and should not be added to it. Only linked renewal cycles are included; workspace-wide records remain outside this scope.</p></details>
        {!!rows.length&&<section className="comply-portfolio-comparison" aria-label="Portfolio comparison">
          <div className="comply-portfolio-comparison-heading"><strong>Compare exposure</strong><Tabs value={groupBy} onValueChange={setGroupBy}><TabsList aria-label="Compare portfolio by"><TabsTrigger value="entity">Entities</TabsTrigger><TabsTrigger value="site">Branches</TabsTrigger><TabsTrigger value="jurisdiction">Jurisdictions</TabsTrigger></TabsList></Tabs></div>
          <ul>{comparison.map(([id,g])=><li key={id}><button data-ui-native-button="" type="button" className="comply-portfolio-group" onClick={()=>{if(groupBy==='entity'){setEntity(id);setSite('all');}else if(groupBy==='site')setSite(id);else setJurisdiction(id);}}><span><strong>{g.name}</strong><small>{g.count} cycles · {g.unknown} unpriced{g.overdue?` · ${g.overdue} cycles with expired permits`:''}</small></span><span><strong>{g.unknown===g.count?'Cost unknown':money(g.remaining)}</strong><small>Remaining funding</small></span><Badge variant={g.open>0?'warning':'gray'}>{money(g.open)} open</Badge></button></li>)}</ul>
        </section>}
        {!rows.length?<p className="comply-desk-note">No linked renewal cycles match this scope. Add entity, site and jurisdiction links in the renewal workflow to build portfolio coverage.</p>:<details className="comply-portfolio-records"><summary>View scoped renewals</summary><ul>{rows.map(r=><li key={r.cycle_id}><Link to={`/complyos/renewal-finance/${r.cycle_id}`}><strong>{r.cert_name??r.cert_number??'Renewal cycle'}</strong><span>{r.entity_name??'Unassigned entity'} · {r.site_name??'Unassigned branch / site'} · {r.jurisdiction||'Unassigned jurisdiction'}</span><span>{r.cost_line_count===0?'Cost unknown':`${money(r.remaining_forecast)} remaining`} · {r.cycle_status.replaceAll('_',' ')}</span></Link></li>)}</ul></details>}
      </>}
    </CardContent>
  </Card>;
}
