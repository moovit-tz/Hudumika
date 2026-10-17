import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { COUNTRIES, type SignDocumentDefinition } from '@hudumika/types';
import { apiFetch } from '../../lib/api.js';
import { APP_REGISTRY } from '../../lib/appRegistry.js';
import { useBranding } from '../../hooks/useBranding.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import { Button } from '../../components/ui/button.js';
import { Card } from '../../components/ui/card.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { Icon } from '../../components/Icon.js';
import { SignTemplateThumbnail } from './SignTemplateThumbnail.js';
import { SignTemplates } from './SignTemplates.js';
import './SignDocuments.css';

export interface LibraryTemplate { id: string; name: string; description: string | null; document_definition: SignDocumentDefinition }
interface LibraryDraft { id: string; title: string; jurisdiction: string; template_name: string; updated_at: string; apps?: string[]; category?: string; document_type?: string }
interface LibraryItem { id: string; name: string; description: string; apps: string[]; category: string; type: string; jurisdictions: string[]; source: string; questions: number; definition?: SignDocumentDefinition; updated?: string }
const TYPES = [{value:'agreement',label:'Agreements & contracts'},{value:'letter',label:'Letters & notices'},{value:'policy',label:'Policies'},{value:'record',label:'Records & certificates'},{value:'form',label:'Forms & checklists'},{value:'unclassified',label:'Unclassified'}];
const PAGE_SIZES = [12,24,48,96];
export function SignDocumentLibrary({ importing = false }: { importing?: boolean } = {}) {
  const navigate = useNavigate(); const branding = useBranding();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<LibraryTemplate[]>([]); const [starters, setStarters] = useState<LibraryTemplate[]>([]);
  const [drafts, setDrafts] = useState<LibraryDraft[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const view = params.get('tab') === 'drafts' ? 'drafts' : params.get('tab') === 'layouts' ? 'layouts' : 'library';
  const search = params.get('q') || ''; const category = params.get('category'); const app = params.get('app');
  const type = params.get('type'); const source = params.get('source'); const jurisdiction = params.get('jurisdiction');
  const requestedSize = Number(params.get('size')); const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 12;
  const requestedPage = Number(params.get('page')); const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [display, setDisplay] = useState<'grid' | 'rows'>(() => { try { return localStorage.getItem('hudumika_sign_library_view') === 'rows' ? 'rows' : 'grid'; } catch { return 'grid'; } });
  function setParam(key: string, value: string | null) {
    setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key,value); else next.delete(key); if(key !== 'page') next.delete('page'); return next; }, {replace:true});
  }
  function clearFilters() { setParams(previous => { const next = new URLSearchParams(previous); for(const key of ['q','category','app','type','source','jurisdiction','page']) next.delete(key); return next; },{replace:true}); }
  function changeDisplay(value: 'grid' | 'rows') { setDisplay(value); try { localStorage.setItem('hudumika_sign_library_view',value); } catch { /* Keep the current session usable when storage is unavailable. */ } }
  useEffect(() => {
    let active = true;
    Promise.all([apiFetch('/v1/sign/document-library'), apiFetch('/v1/sign/generated-documents')]).then(([library, documents]) => {
      if (active) { setItems(library.company); setStarters(library.starters); setDrafts(documents); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const appName = (id: string) => branding.getAppName(id, APP_REGISTRY.find(item => item.id === id)?.name || id);
  const all: LibraryItem[] = view === 'drafts' ? drafts.map(draft => ({id:draft.id,name:draft.title,description:draft.template_name,apps:draft.apps || [],category:draft.category || 'Company documents',type:draft.document_type || 'unclassified',jurisdictions:[draft.jurisdiction],source:'draft',questions:0,updated:draft.updated_at})) : [...items,...starters].map(item => ({id:item.id,name:item.name,description:item.description || 'Reusable company document.',apps:item.document_definition.apps || [],category:item.document_definition.category,type:item.document_definition.document_type || 'unclassified',jurisdictions:item.document_definition.jurisdiction_clauses ? Object.keys(item.document_definition.jurisdiction_clauses) : item.document_definition.jurisdictions,source:item.id.startsWith('starter-')?'starter':'company',questions:item.document_definition.questions.length,definition:item.document_definition}));
  const categories = [...new Set(all.map(item => item.category))].sort();
  const filtered = all.filter(item => (!category || item.category === category) && (!app || (app === '__general' ? item.apps.length === 0 : item.apps.length === 0 || item.apps.includes(app))) && (!type || item.type === type) && (view === 'drafts' || !source || item.source === source) && (!jurisdiction || (jurisdiction === '__any' ? item.jurisdictions.length === 0 : item.jurisdictions.length === 0 || item.jurisdictions.includes(jurisdiction))) && `${item.name} ${item.description} ${item.category} ${item.apps.map(appName).join(' ')} ${item.type}`.toLowerCase().includes(search.trim().toLowerCase()));
  const safePage = Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)));
  const paginated = filtered.slice((safePage-1)*pageSize,safePage*pageSize);
  const activeFilters = [app,category,type,jurisdiction,view === 'library' ? source : null].filter(Boolean).length;
  const jurisdictions = [...new Set([...COUNTRIES.map(country=>country.name),...all.flatMap(item=>item.jurisdictions)])].sort();
  function destination(item: LibraryItem) { return item.source === 'draft' ? `/sign/editor?mode=draft&draft=${item.id}` : importing ? `/sign/editor?mode=preview&source=${item.id}` : `/sign/templates/preview/${item.id}`; }
  const actions = (item: LibraryItem) => <div className="sign-library-item-actions"><Button variant="outline" size="sm" onClick={()=>navigate(destination(item),{state:{librarySearch:params.toString()}})} aria-label={`${item.source === 'draft'?'Continue editing':'Preview template'} ${item.name}`}>{item.source === 'draft'?'Continue':'Preview'}<Icon name="arrowRight" size={14}/></Button></div>;
  const thumbnail = (item: LibraryItem) => item.definition ? <Link className="sign-library-thumbnail-button" to={destination(item)} state={{librarySearch:params.toString()}} aria-label={`Preview ${item.name}`}><SignTemplateThumbnail name={item.name} definition={item.definition}/></Link> : <FeaturedIcon variant="brand" size="sm"><Icon name="fileText" size={16}/></FeaturedIcon>;
  const apps = (item: LibraryItem) => <div className="sign-library-apps">{item.apps.length ? <>{item.apps.slice(0,2).map(id=><Badge key={id} variant="gray">{appName(id)}</Badge>)}{item.apps.length>2&&<Badge variant="gray" title={item.apps.slice(2).map(appName).join(', ')} aria-label={`Additional apps: ${item.apps.slice(2).map(appName).join(', ')}`}>+{item.apps.length-2}</Badge>}</> : <Badge variant="gray">Company-wide</Badge>}</div>;
  const origin = (item: LibraryItem) => <Badge variant={item.source === 'starter'?'warning':'gray'}>{item.source === 'starter'?'Draft template':item.source === 'draft'?'Draft':'Company template'}</Badge>;
  return <div className="sign-library">
    <PageHeader crumbs={['eSign','Templates']} titlePlain="Document" titleEm="library" subtitle={importing?"Preview a template, choose location and language, then answer the key decisions.":"Contracts, agreements and business records for every part of your workspace."} actions={<Button onClick={()=>navigate('/sign/editor?mode=author')}><Icon name="plus" size={15}/>Create company template</Button>}/>
    <Tabs value={view} onValueChange={value=>setParam('tab',value === 'library'?null:value)}><TabsList aria-label="Template views"><TabsTrigger value="library">Template library <Badge variant="gray">{items.length+starters.length}</Badge></TabsTrigger><TabsTrigger value="drafts">My document drafts <Badge variant="gray">{drafts.length}</Badge></TabsTrigger><TabsTrigger value="layouts">Signing layouts</TabsTrigger></TabsList></Tabs>
    {view === 'layouts' ? <SignTemplates/> : <>
      {error && <Banner variant="error">{error}</Banner>}
      <SearchToolbar search={search} onSearch={value=>setParam('q',value)} placeholder="Search templates, document names or apps…" quickFilters={[
        {searchable:true,value:app,onChange:value=>setParam('app',value),allLabel:'All apps',options:[{value:'__general',label:'Company-wide'},...APP_REGISTRY.map(item=>({value:item.id,label:appName(item.id)}))]},
        {searchable:true,value:category,onChange:value=>setParam('category',value),allLabel:'All categories',options:categories.map(value=>({value,label:value}))},
      ]} activeFilterCount={activeFilters} filterContent={close=><div className="sign-library-filter-panel">
        <strong>Filter documents</strong>
        <label>Document type<Select value={type || '__all'} onValueChange={value=>setParam('type',value==='__all'?null:value)}><SelectTrigger aria-label="Document type"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__all">All document types</SelectItem>{TYPES.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>
        {view === 'library' && <label>Template source<Select value={source || '__all'} onValueChange={value=>setParam('source',value==='__all'?null:value)}><SelectTrigger aria-label="Template source"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__all">All template sources</SelectItem><SelectItem value="starter">Draft templates</SelectItem><SelectItem value="company">Company templates</SelectItem></SelectContent></Select></label>}
        <label>Jurisdiction choice<Combobox value={jurisdiction || '__all'} onChange={value=>setParam('jurisdiction',value==='__all'?null:value)} options={[{value:'__all',label:'All jurisdictions'},{value:'__any',label:'Choose per document'},...jurisdictions.map(value=>({value,label:value}))]}/></label>
        <p>Draft templates allow jurisdiction selection; this does not certify local legal suitability.</p><div><Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button><Button size="sm" onClick={close}>Done</Button></div>
      </div>} actions={<div className="sign-library-view-switch" role="group" aria-label="Library display"><Button variant={display==='grid'?'secondary':'ghost'} size="sm" aria-label="Grid view" aria-pressed={display==='grid'} onClick={()=>changeDisplay('grid')}><Icon name="grid" size={16}/></Button><Button variant={display==='rows'?'secondary':'ghost'} size="sm" aria-label="Rows view" aria-pressed={display==='rows'} onClick={()=>changeDisplay('rows')}><Icon name="list" size={16}/></Button></div>}/>
      <div className="sign-library-results" aria-live="polite"><span>{filtered.length} {view==='drafts'?'drafts':'templates'}{activeFilters || search ? ' matching your search and filters':''}</span>{(activeFilters>0 || search) && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear all</Button>}</div>
      {loading ? <SectionLoading label="Loading your document library…"/> : !filtered.length ? <Card className="sign-library-empty"><FeaturedIcon variant="gray" size="lg"><Icon name="search" size={24}/></FeaturedIcon><h2>No matching {view==='drafts'?'drafts':'templates'}</h2><p>Try another search or clear the filters.</p><Button variant="outline" onClick={clearFilters}>Clear filters</Button></Card> : display === 'grid' ? <div className="sign-library-grid">{paginated.map(item=><Card key={item.id} className="sign-library-item">{thumbnail(item)}<div className="sign-library-item-top">{origin(item)}</div><span className="sign-library-category">{item.category}</span><h2><Link className="sign-library-title-button" to={destination(item)} state={{librarySearch:params.toString()}}>{item.name}</Link></h2><p>{item.description}</p>{apps(item)}<div className="sign-library-meta"><span>{TYPES.find(option=>option.value===item.type)?.label || item.type}</span><span>{item.source==='draft'?new Date(item.updated!).toLocaleDateString():`${item.questions} questions`}</span></div>{actions(item)}</Card>)}</div> : <div className="sign-library-rows"><div className="sign-library-row-heading" aria-hidden="true"><span>Document</span><span>Apps</span><span>Type / source</span><span>Actions</span></div><ul>{paginated.map(item=><li key={item.id}><Card className="sign-library-row"><div className="sign-library-row-title">{thumbnail(item)}<div><span className="sign-library-category">{item.category}</span><h2><Link className="sign-library-title-button" to={destination(item)} state={{librarySearch:params.toString()}}>{item.name}</Link></h2><p>{item.description}</p></div></div>{apps(item)}<div className="sign-library-row-details"><span>{TYPES.find(option=>option.value===item.type)?.label || item.type}</span>{origin(item)}<small>{item.source==='draft'?new Date(item.updated!).toLocaleDateString():`${item.questions} questions`}</small></div>{actions(item)}</Card></li>)}</ul></div>}
      {!loading && <PaginationBar page={safePage} pageSize={pageSize} total={filtered.length} onPageChange={value=>setParam('page',String(value))} onPageSizeChange={value=>setParam('size',String(value))} pageSizeOptions={PAGE_SIZES} itemLabel={view==='drafts'?'draft':'template'}/>}
      <p className="sign-library-footnote">Prewritten draft templates support English, Kiswahili and Simplified Chinese. Complete the transaction facts and check the execution guidance for the selected jurisdiction.</p>
    </>}
  </div>;
}
