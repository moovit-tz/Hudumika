import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AppId, SignDocumentDefinition, SignDocumentLanguage, SignDocumentQuestion, SignDocumentType } from '@hudumika/types';
import { APP_REGISTRY } from '../../lib/appRegistry.js';
import { useBranding } from '../../hooks/useBranding.js';
import { MultiSelectFilter } from '../../components/ui/filter-dropdown.js';
import { apiFetch } from '../../lib/api.js';
import { BackButton } from '../../components/ui/BackButton.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Card } from '../../components/ui/card.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Button } from '../../components/ui/button.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Banner } from '../../components/ui/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import './SignDocuments.css';

export function SignTemplateAuthor() {
  const navigate = useNavigate();
  const branding = useBranding();
  const [apps, setApps] = useState<AppId[]>([]);
  const [documentType, setDocumentType] = useState<SignDocumentType>('agreement');
  const [categories, setCategories] = useState<string[]>([]);
  const [params] = useSearchParams();
  const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Business & services'); const [jurisdictions, setJurisdictions] = useState('');
  const [body, setBody] = useState(''); const [questions, setQuestions] = useState<SignDocumentQuestion[]>([]);
  const [sourceDefinition,setSourceDefinition] = useState<SignDocumentDefinition | null>(null);
  const [translations,setTranslations] = useState<SignDocumentDefinition['translations']>({});
  const [wordingLanguage,setWordingLanguage] = useState<SignDocumentLanguage>('en');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const id = params.get('copy');
    apiFetch('/v1/sign/document-library').then(library => {
      setCategories([...new Set<string>([...library.company,...library.starters].map(t => t.document_definition.category))]);
      if (!id) return;
      const template = [...library.company, ...library.starters].find(t => t.id === id);
      if (!template) throw new Error('Template not found');
      setName(`${template.name} — company version`); setDescription(template.description || ''); setCategory(template.document_definition.category);
      setApps(template.document_definition.apps || []); setDocumentType(template.document_definition.document_type || 'agreement');
      setSourceDefinition(template.document_definition); setTranslations(template.document_definition.translations || {});
      setJurisdictions(template.document_definition.jurisdictions.join('\n')); setBody(template.document_definition.body); setQuestions(template.document_definition.questions);
    }).catch(e => setError(e.message));
  }, [params]);
  function updateBody(text: string) {
    if (wordingLanguage !== 'en') {setTranslations(previous=>({...previous,[wordingLanguage]:{body:text}}));setDirty(true);return;}
    setBody(text); setDirty(true);
    const keys = [...new Set([...text.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)].map(match => match[1]))].filter(key => !['jurisdiction','jurisdiction_terms'].includes(key));
    setQuestions(previous => keys.map(key => previous.find(q => q.key === key) || {key, label:key.replace(/_/g,' '),type:'text',required:true}));
  }
  async function save(asDocument = false) {
    setError(''); setBusy(true);
    try {
      const definition={...sourceDefinition,apps,document_type:documentType,category,jurisdictions:jurisdictions.split('\n').map(s=>s.trim()).filter(Boolean),body,translations:{...translations,en:{body}},questions};
      if(asDocument){
        const draft=await apiFetch('/v1/sign/generated-documents',{method:'POST',body:JSON.stringify({title:name,definition})});
        setDirty(false);navigate(`/sign/editor?mode=draft&draft=${draft.id}&stage=decisions`);
      }else{
        await apiFetch('/v1/sign/document-library',{method:'POST',body:JSON.stringify({name,description,document_definition:definition})});
        setDirty(false); navigate('/sign/templates');
      }
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function back() { if (!dirty || await showConfirm('Your unsaved template changes will be lost.', {title:'Leave template?',confirmLabel:'Leave'})) navigate('/sign/templates'); }
  return <div className="sign-library"><BackButton onClick={back} label="Back to library" color="var(--ink2)"/><PageHeader crumbs={['eSign','Templates','Create']} titlePlain="Write your" titleEm="document" subtitle="Write your document once. Complete its key decisions or save the wording as a reusable company template." actions={<><Button variant="outline" disabled={busy || !name.trim() || !body.trim() || !category.trim()} onClick={()=>save(false)}>Save as template</Button><Button disabled={busy || !name.trim() || !body.trim() || !category.trim()} onClick={()=>save(true)}>{busy ? 'Saving…' : 'Continue to decisions'}</Button></>} />
    {error && <Banner variant="error">{error}</Banner>}
    <div className="sign-builder-grid"><Card className="sign-builder-form"><h2>Document information</h2>
      <label htmlFor="template-name">Document name<Input id="template-name" value={name} onChange={e=>{setName(e.target.value);setDirty(true);}}/></label>
      <label htmlFor="template-description">Description<Textarea id="template-description" value={description} onChange={e=>{setDescription(e.target.value);setDirty(true);}}/></label>
      <label htmlFor="template-category">Category<Select value={category} onValueChange={value=>{setCategory(value);setDirty(true);}}><SelectTrigger id="template-category"><SelectValue/></SelectTrigger><SelectContent>{[...new Set([category,...categories,'Business & services','Confidentiality & IP','Employment & HR','Sales & procurement','Corporate governance','Finance & payments','Property & leases','Other'])].sort().map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label>
      <div className="sign-template-app-picker"><span>Applicable apps</span><MultiSelectFilter label="Apps" options={APP_REGISTRY.map(app=>({value:app.id,label:branding.getAppName(app.id,app.name)}))} values={apps} onChange={values=>{setApps(values as AppId[]);setDirty(true);}}/><p>Leave empty for a company-wide template.</p></div>
      <label htmlFor="template-type">Document type<Select value={documentType} onValueChange={value=>{setDocumentType(value as SignDocumentType);setDirty(true);}}><SelectTrigger id="template-type"><SelectValue/></SelectTrigger><SelectContent>{[['agreement','Agreement / contract'],['letter','Letter / notice'],['policy','Policy'],['record','Record / certificate'],['form','Form / checklist']].map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label htmlFor="template-jurisdictions">Supported jurisdictions<Textarea id="template-jurisdictions" placeholder="One country / region per line. Leave blank to let the author enter one." value={jurisdictions} onChange={e=>{setJurisdictions(e.target.value);setDirty(true);}}/></label>
      <p className="sign-library-footnote">Publish wording your company is authorised to use. Supported jurisdictions describe the intended scope; they do not certify legal compliance.</p>
    </Card><Card className="sign-builder-form"><h2>Document wording</h2><p>Write or paste your company’s text. Add fill-in spaces such as <code>{'{{company_name}}'}</code> and <code>{'{{payment_terms}}'}</code>. Use <code>{'{{jurisdiction}}'}</code> for the selected jurisdiction. Questions appear below automatically.</p>
      <label>Wording language<Select value={wordingLanguage} onValueChange={value=>setWordingLanguage(value as SignDocumentLanguage)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="sw">Kiswahili</SelectItem><SelectItem value="zh">简体中文</SelectItem></SelectContent></Select></label>
      <Textarea aria-label="Template document text" lang={wordingLanguage} rows={16} value={wordingLanguage==='en'?body:translations?.[wordingLanguage]?.body || ''} onChange={e=>updateBody(e.target.value)} placeholder="Paste your document text here…"/>
      {questions.map((question,index)=><div className="sign-question-editor" key={question.key}><label htmlFor={`question-label-${index}`}>Question for {question.key}<Input id={`question-label-${index}`} value={question.label} onChange={e=>{setQuestions(previous=>previous.map(q=>q.key===question.key?{...q,label:e.target.value}:q));setDirty(true);}}/></label>
        <Select value={question.type} onValueChange={value=>{setQuestions(previous=>previous.map(q=>q.key===question.key?{...q,type:value as SignDocumentQuestion['type']}:q));setDirty(true);}}><SelectTrigger aria-label={`Answer type for ${question.key}`}><SelectValue/></SelectTrigger><SelectContent>{['text','textarea','date','email','number'].map(type=><SelectItem key={type} value={type}>{type==='textarea'?'Long answer':type}</SelectItem>)}</SelectContent></Select>
        <label className="sign-question-required"><Checkbox checked={question.required} onCheckedChange={checked=>{setQuestions(previous=>previous.map(q=>q.key===question.key?{...q,required:checked===true}:q));setDirty(true);}}/>Required</label>
      </div>)}
    </Card></div>
  </div>;
}
