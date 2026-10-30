import {useState} from 'react';
import {Button} from './ui/button.js';
import {apiDownload} from '../lib/api.js';
import {showAlert} from '../lib/alert.js';
import type {FinanceDocumentKind} from '../lib/financeDocuments.js';
export function FinanceDocumentListExport({kind}:{kind:FinanceDocumentKind}){const [busy,setBusy]=useState(false);return <div className="flex justify-end py-2"><Button size="sm" variant="outline" disabled={busy} title="Exports all accessible records, independent of list filters. Maximum 10,000 rows." onClick={async()=>{setBusy(true);try{await apiDownload(`/v1/finance/documents/${kind}/export`,`${kind}-all-records.csv`);}catch(e){showAlert(e instanceof Error?e.message:'Could not export records.',{variant:'error'});}finally{setBusy(false);}}}>{busy?'Exporting…':'Export all records CSV'}</Button></div>;}
