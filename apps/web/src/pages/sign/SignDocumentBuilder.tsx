import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { COUNTRIES, expandSignDocument, type SignGeneratedDocument, type SignDocumentLanguage } from '@hudumika/types';
import { useLocale } from '../../hooks/useLocale.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { apiFetch, apiFetchBlob } from '../../lib/api.js';
import { PageHeader } from '../../components/PageHeader.js';
import { BackButton } from '../../components/ui/BackButton.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Card } from '../../components/ui/card.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Badge } from '../../components/ui/badge.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Icon } from '../../components/Icon.js';
import { showPrompt } from '../../lib/prompt.js';
import { showConfirm } from '../../lib/confirm.js';
import type { LibraryTemplate } from './SignDocumentLibrary.js';
import './SignDocuments.css';

export function SignDocumentBuilder() {
  const route = useParams();
  const [previewParams] = useSearchParams();
  const templateId=route.templateId || previewParams.get("source");
  const documentId=route.documentId || previewParams.get("draft");
  const navigate = useNavigate();
  const locale = useLocale();
  const [language,setLanguage] = useState<SignDocumentLanguage>(['en','sw','zh'].includes(locale.language) ? locale.language as SignDocumentLanguage : 'en');
  const [template, setTemplate] = useState<LibraryTemplate | null>(null);
  const [document, setDocument] = useState<SignGeneratedDocument | null>(null);
  const [title, setTitle] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [customJurisdiction, setCustomJurisdiction] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [review, setReview] = useState(false);
  const [step,setStep]=useState<"setup"|"details">("setup");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    (documentId ? apiFetch(`/v1/sign/generated-documents/${documentId}`) : apiFetch('/v1/sign/document-library')).then(result => {
      if (!active) return;
      if (documentId) {
        const doc = result as SignGeneratedDocument;
        setDocument(doc); setTemplate({ id: doc.template_id || '', name: doc.template_name, description: null, document_definition: doc.definition });
        setTitle(doc.title); setJurisdiction(doc.jurisdiction); setLanguage(doc.definition.language || 'en'); setCustomJurisdiction(!COUNTRIES.some(c => c.name === doc.jurisdiction)); setAnswers(doc.answers); setBody(doc.body); setReview(!!doc.jurisdiction && previewParams.get("stage")!=="decisions");
      } else {
        const item = [...result.company, ...result.starters].find((item: LibraryTemplate) => item.id === templateId);
        if (!item) throw new Error('Template not found');
        setTemplate(item); setTitle(item.name);
        const requestedLanguage=previewParams.get('language');
        const selectedLanguage=(['en','sw','zh'].includes(requestedLanguage || '')?requestedLanguage:language) as SignDocumentLanguage;
        setLanguage(selectedLanguage==='en'||item.document_definition.translations?.[selectedLanguage]?selectedLanguage:'en');
        const requestedJurisdiction=previewParams.get('jurisdiction');
        if(requestedJurisdiction && (item.document_definition.jurisdiction_clauses?.[requestedJurisdiction] || item.document_definition.jurisdictions.includes(requestedJurisdiction))) setJurisdiction(requestedJurisdiction);
      }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [templateId, documentId]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const definition = template?.document_definition;
  const preview = review ? body : definition ? expandSignDocument(definition,answers,jurisdiction,language,true) : '';
  const label = (en: string,sw: string,zh: string) => ({en,sw,zh})[language];
  const guidance = definition?.jurisdiction_guidance?.find(item=>item.jurisdiction===jurisdiction);
  const jurisdictionOptions = definition?.jurisdiction_clauses ? Object.keys(definition.jurisdiction_clauses).map(value=>({value,label:value})) : definition?.jurisdictions.length ? definition.jurisdictions.map(value=>({value,label:value})) : [...COUNTRIES.map(country=>({value:country.name,label:country.name})),{value:'__custom',label:'Other country / specific region'}];
  async function generate() {
    if (!template || !definition) return;
    setBusy(true); setError('');
    try {
      if (document) {
        if (!(await showConfirm('Updating the decisions or language will replace this draft with regenerated wording.', { title: 'Regenerate this document?', confirmLabel: 'Regenerate' }))) return;
        const text = expandSignDocument(definition,answers,jurisdiction,language);
        const updated = await apiFetch(`/v1/sign/generated-documents/${document.id}`, { method: 'PATCH', body: JSON.stringify({title, jurisdiction, answers, language, body: text}) });
        setDocument(updated); setBody(updated.body); setReview(true); setDirty(false);
      } else {
        const created = await apiFetch(`/v1/sign/document-library/${template.id}/generate`, {method:'POST', body: JSON.stringify({title, jurisdiction, answers, language})});
        setDirty(false); navigate(`/sign/editor?mode=draft&draft=${created.id}`, {replace:true});
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    if (!document) throw new Error('Generate a document first');
    const result = await apiFetch(`/v1/sign/generated-documents/${document.id}`, {method:'PATCH', body:JSON.stringify({title, jurisdiction, answers, language, body})});
    setDocument(result); setDirty(false); setSaved(true); return result;
  }
  async function complete(action: 'save' | 'download' | 'sign') {
    setBusy(true); setError('');
    try {
      const result = await save();
      if (action === 'download') {
        const blob = await apiFetchBlob(`/v1/sign/generated-documents/${result.id}/pdf`);
        const url = URL.createObjectURL(blob); const link = window.document.createElement('a'); link.href = url; link.download = `${title}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (action === 'sign') navigate(`/sign/editor?document=${result.id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function saveAsTemplate() {
    if(!definition)return;
    const name=await showPrompt('',{title:'Template name',defaultValue:title,required:true,confirmLabel:'Save template'});
    if(!name?.trim())return;
    setBusy(true);setError('');
    try{await apiFetch('/v1/sign/document-library',{method:'POST',body:JSON.stringify({name,description:template?.description || '',document_definition:definition})});setSaved(true);}catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }
  function changed() { setDirty(true); setSaved(false); }
  async function back() { if (!dirty || await showConfirm('Your unsaved changes will be lost.', { title: 'Leave document?', confirmLabel: 'Leave' })) navigate('/sign/templates'); }
  return <div className="sign-library">
    <BackButton onClick={back} label={label('Back to library','Rudi maktabani','返回模板库')} color="var(--ink2)" />
    <PageHeader crumbs={['eSign', 'Templates', review ? 'Review' : 'Details']} titlePlain={review ? label('Review your','Hakiki','审阅') : label('Create your','Tengeneza','创建')} titleEm={label('document','hati','文件')} subtitle={template?.name || 'Guided document builder'} />
    {error && <Banner variant="error">{error}</Banner>}{saved && <Banner variant="success">Document saved.</Banner>}
    {loading ? <SectionLoading label="Preparing your document…" /> : definition && <>
      <Tabs value={review?'review':step} onValueChange={value=>{if(value==='review'){setReview(true);}else{setReview(false);setStep(value as 'setup'|'details');}}}>
        <TabsList aria-label="Creation steps"><TabsTrigger value="setup">1 · Location &amp; language</TabsTrigger><TabsTrigger value="details" disabled={!jurisdiction.trim()}>2 · Key decisions</TabsTrigger><TabsTrigger value="review" disabled={!document || dirty || !document.jurisdiction}>3 · Review &amp; export</TabsTrigger></TabsList>
      </Tabs>
      <div className="sign-builder-grid">
        <Card className="sign-builder-form">
          <h2>{review ? label('Document controls','Udhibiti wa hati','文件选项') : step==='setup'?label('Location and language','Eneo na lugha','地区和语言'):label('Key decisions','Maamuzi muhimu','关键选项')}</h2><p>{label('The clauses are prewritten. Enter the facts and choices relevant to this transaction.','Masharti yameandikwa tayari. Weka ukweli na chaguo zinazohusu shughuli hii.','条款已预先拟定，请填写本交易的事实及选项。')}</p>
          {!review && step==='setup' && <label htmlFor="document-language">{label('Document language','Lugha ya hati','文件语言')}<Select value={language} onValueChange={value=>{setLanguage(value as SignDocumentLanguage);changed();}}><SelectTrigger id="document-language"><SelectValue/></SelectTrigger><SelectContent>{(['en','sw','zh'] as const).filter(value=>value==='en'||definition.translations?.[value]).map(value=><SelectItem key={value} value={value}>{{en:'English',sw:'Kiswahili',zh:'简体中文'}[value]}</SelectItem>)}</SelectContent></Select></label>}
          <label htmlFor="generated-title">{label('Document title','Kichwa cha hati','文件标题')}<Input id="generated-title" value={title} onChange={e => {setTitle(e.target.value); changed();}} /></label>
          {!review && <>
            {step==='setup' && <>
            <label htmlFor="generated-jurisdiction">{label('Governing jurisdiction','Eneo la sheria','管辖法域')}
              <Combobox options={jurisdictionOptions} value={customJurisdiction && !definition.jurisdictions.length && !definition.jurisdiction_clauses ? '__custom' : jurisdiction} onChange={value => {setCustomJurisdiction(value === '__custom'); setJurisdiction(value === '__custom' ? '' : value); changed();}} placeholder={label('Select jurisdiction','Chagua eneo la sheria','选择法域')} />
              {customJurisdiction && !definition.jurisdictions.length && <Input id="generated-jurisdiction" placeholder="Enter country and state / region" value={jurisdiction} onChange={e => {setJurisdiction(e.target.value); changed();}} />}
            </label>
            {guidance && <Banner variant="warning"><strong>{label('Execution requirements','Masharti ya utekelezaji','签署要求')}</strong><p>{guidance.notes[language]}</p>{guidance.sources.map(source=><p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>)}</Banner>}
            <Button disabled={!title.trim() || !jurisdiction.trim()} onClick={()=>setStep("details")}>Continue to key decisions<Icon name="arrowRight" size={14}/></Button></>}
            {step==='details' && <>
            <Button variant="ghost" onClick={()=>setStep("setup")}><Icon name="arrowLeft" size={14}/>Location and language</Button>
            {definition.questions.map(question => <label key={question.key} htmlFor={`answer-${question.key}`}>{question.labels?.[language] || question.label}{question.required ? ' *' : label(' (optional)',' (si lazima)','（可选）')}
              {question.type === 'select' ? <Select value={answers[question.key] || ''} onValueChange={value=>{setAnswers({...answers,[question.key]:value});changed();}}><SelectTrigger id={`answer-${question.key}`}><SelectValue placeholder={label('Choose an option','Chagua','请选择')}/></SelectTrigger><SelectContent>{question.options?.map(option=><SelectItem key={option.value} value={option.value}>{option.labels[language]}</SelectItem>)}</SelectContent></Select> : question.type === 'textarea' ? <Textarea id={`answer-${question.key}`} rows={3} value={answers[question.key] || ''} onChange={e => {setAnswers({...answers,[question.key]:e.target.value}); changed();}} /> : question.type === 'date' ? <DatePicker placeholder={question.labels?.[language] || question.label} date={parseDateOnly(answers[question.key])} onChange={date => {setAnswers({...answers,[question.key]:toDateOnlyString(date)}); changed();}} /> : <Input id={`answer-${question.key}`} type={question.type} value={answers[question.key] || ''} onChange={e => {setAnswers({...answers,[question.key]:e.target.value}); changed();}} />}
            </label>)}
            <Button disabled={busy || !title.trim() || !jurisdiction.trim() || definition.questions.some(q => q.required && !answers[q.key]?.trim())} onClick={generate}>{busy ? label('Generating…','Inaandaliwa…','生成中…') : label('Generate document','Tengeneza hati','生成文件')}<Icon name="arrowRight" size={14}/></Button>
            </>}
          </>}
          {review && <><Badge variant="brand">{jurisdiction}</Badge><Button variant="outline" disabled={busy} onClick={() => complete('save')}>{busy ? 'Working…' : 'Save document'}</Button><Button variant="outline" disabled={busy} onClick={() => complete('download')}><Icon name="download" size={14}/>Download PDF</Button><Button disabled={busy} onClick={() => complete('sign')}><Icon name="edit" size={14}/>Prepare for signing</Button><Button variant="outline" disabled={busy} onClick={saveAsTemplate}><Icon name="copy" size={14}/>Save as template</Button><Button variant="ghost" disabled={busy} onClick={() => {setReview(false);setStep('setup');}}>Change answers</Button></>}
          <p className="sign-library-footnote">{label('Check the execution requirements before signing. Entered facts stay in their original language when you switch versions.','Hakiki masharti ya utekelezaji kabla ya kusaini. Taarifa ulizoingiza zinabaki katika lugha yake unapobadili toleo.','签署前请核查签署要求。切换版本时，已填写事实保留原文。')}</p>
        </Card>
        <Card className="sign-document-preview" lang={language==='zh'?'zh-Hans':language}><div className="sign-preview-heading"><span>{label('Document preview','Onyesho la hati','文件预览')}</span><Badge variant="gray">{label('Draft','Rasimu','草稿')}</Badge></div><h2>{title}</h2><div className="sign-document-text">{preview}</div></Card>
      </div>
    </>}
  </div>;
}
