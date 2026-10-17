import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { expandSignDocument, type SignDocumentLanguage } from '@hudumika/types';
import { apiFetch } from '../../lib/api.js';
import { PageHeader } from '../../components/PageHeader.js';
import { BackButton } from '../../components/ui/BackButton.js';
import { Button } from '../../components/ui/button.js';
import { Card } from '../../components/ui/card.js';
import { Badge } from '../../components/ui/badge.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Icon } from '../../components/Icon.js';
import { SignTemplateThumbnail } from './SignTemplateThumbnail.js';
import type { LibraryTemplate } from './SignDocumentLibrary.js';
import './SignDocuments.css';

export function SignTemplatePreview() {
  const route=useParams(); const [params]=useSearchParams(); const templateId=route.templateId || params.get("source"); const navigate=useNavigate();
  const location=useLocation();
  const [template,setTemplate]=useState<LibraryTemplate|null>(null);
  const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const [language,setLanguage]=useState<SignDocumentLanguage>('en'); const [jurisdiction,setJurisdiction]=useState('');
  useEffect(()=>{let active=true;setLoading(true);setError('');apiFetch('/v1/sign/document-library').then(library=>{
    if(!active)return;
    const found=[...library.company,...library.starters].find((item:LibraryTemplate)=>item.id===templateId);
    if(!found)throw new Error('Template not found');setTemplate(found);setLanguage('en');setJurisdiction('');
  }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[templateId]);
  const definition=template?.document_definition;
  const jurisdictions=definition?.jurisdiction_clauses?Object.keys(definition.jurisdiction_clauses):definition?.jurisdictions || [];
  const guidance=definition?.jurisdiction_guidance?.find(item=>item.jurisdiction===jurisdiction);
  function useTemplate() {
    if(template) navigate(`/sign/editor?${new URLSearchParams({mode:"guided",source:template.id,language,...(jurisdiction?{jurisdiction}:{})})}`);
  }
  return <div className="sign-library sign-template-preview-page">
    <BackButton label="Back to library" onClick={()=>navigate(`/sign/templates${typeof location.state?.librarySearch==='string' && location.state.librarySearch ? `?${location.state.librarySearch}` : ''}`)} color="var(--ink2)"/>
    <PageHeader crumbs={['eSign','Templates','Preview']} titlePlain="Template" titleEm="preview" subtitle={template?.name || 'Read the document before creating your own copy.'} actions={template&&<Button onClick={useTemplate}><Icon name="plus" size={15}/>Use this template</Button>}/>
    {error&&<Banner variant="error">{error}</Banner>}
    {loading?<SectionLoading label="Loading template preview…"/>:template&&definition&&<div className="sign-template-preview-layout">
      <Card className="sign-template-preview-info"><SignTemplateThumbnail name={template.name} definition={definition}/><Badge variant="gray">{definition.category}</Badge><p>{template.description}</p><p><strong>{definition.questions.length}</strong> key facts and decisions · No draft created yet</p>
        <label>Preview language<Select value={language} onValueChange={value=>setLanguage(value as SignDocumentLanguage)}><SelectTrigger aria-label="Preview language"><SelectValue/></SelectTrigger><SelectContent>{(['en','sw','zh'] as const).filter(value=>value==='en'||definition.translations?.[value]).map(value=><SelectItem key={value} value={value}>{{en:'English',sw:'Kiswahili',zh:'简体中文'}[value]}</SelectItem>)}</SelectContent></Select></label>
        {jurisdictions.length>0&&<label>Preview jurisdiction<Combobox value={jurisdiction} onChange={setJurisdiction} options={jurisdictions.map(value=>({value,label:value}))} placeholder="Choose jurisdiction"/></label>}
        {guidance&&<p>{guidance.notes[language]}</p>}
        <Button variant="outline" onClick={()=>navigate(`/sign/editor?mode=author&copy=${template.id}`)}><Icon name="copy" size={14}/>Create company version</Button>
      </Card>
      <Card className="sign-template-reading-paper" lang={language==='zh'?'zh-Hans':language}><div className="sign-preview-heading"><span>Read-only template · Fields in brackets are completed later</span><Badge variant="gray">Preview</Badge></div><h2>{template.name}</h2><div className="sign-document-text">{expandSignDocument(definition,{},jurisdiction,language,true)}</div></Card>
    </div>}
  </div>;
}
