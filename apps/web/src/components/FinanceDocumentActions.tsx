import React, {useState} from 'react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button.js';
import { Icon } from './Icon.js';
import { showAlert } from '../lib/alert.js';
import { documentPreviewUrl, downloadDocument, type FinanceDocumentKind } from '../lib/financeDocuments.js';
export function FinanceDocumentActions({kind,id,label}: {kind:FinanceDocumentKind;id:string;label:string}) {
  const [busy,setBusy]=useState(false);
  return <div className="flex flex-wrap items-center gap-2" aria-label="Document output actions">
    <Button asChild size="sm" variant="outline"><Link to={documentPreviewUrl(kind,id)}><Icon name="eye" size={14}/>Preview PDF</Link></Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await downloadDocument(kind,id,label);}catch(e){showAlert(e instanceof Error?e.message:'Could not download PDF.',{variant:'error'});}finally{setBusy(false);}}}><Icon name="download" size={14}/>{busy?'Downloading…':'Download PDF'}</Button>
    <Button asChild size="sm" variant="outline"><Link to={documentPreviewUrl(kind,id)+'?print=1'}><Icon name="printer" size={14}/>Print</Link></Button>
    <Button asChild size="sm" variant="outline"><Link to={documentPreviewUrl(kind,id)+'?send=1'}><Icon name="mail" size={14}/>Send</Link></Button>
  </div>;
}
