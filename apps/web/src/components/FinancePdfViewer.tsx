import type {PDFDocumentProxy} from 'pdfjs-dist';
import {useEffect,useRef,useState} from 'react';
import {usePdfDocument} from '../pages/cloud/lib/usePdfDocument.js';
import {PdfPageCanvas} from '../pages/cloud/components/PdfPageCanvas.js';
import {Button} from './ui/button.js';
import {Icon} from './Icon.js';
import {SectionLoading} from './ui/spinner.js';
/** Reuses Cloud's PDF.js renderer so preview also works without a browser PDF plugin. */
export function FinancePdfViewer({url,label,onReady}:{url:string;label:string;onReady?:(doc:PDFDocumentProxy|null)=>void}){
 const {doc,numPages,loading,error}=usePdfDocument(url);const [page,setPage]=useState(1);const [width,setWidth]=useState(600);const [zoom,setZoom]=useState(1);const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{const node=host.current;if(!node)return;const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));observer.observe(node);return()=>observer.disconnect();},[]);
 useEffect(()=>setPage(1),[url]);
 useEffect(()=>{onReady?.(doc);return()=>onReady?.(null);},[doc,onReady]);
 return <section aria-label={`${label} PDF preview`} className="min-w-0 rounded-lg border bg-muted/20"><div className="flex flex-wrap items-center justify-center gap-2 border-b p-2"><Button variant="outline" iconOnly aria-label="Previous page" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><Icon name="chevronLeft" size={14}/></Button><span role="status" className="min-w-[3.5rem] text-center text-sm tabular-nums">{page} / {numPages||'…'}</span><Button variant="outline" iconOnly aria-label="Next page" disabled={page>=numPages} onClick={()=>setPage(p=>p+1)}><Icon name="chevronRight" size={14}/></Button><span aria-hidden className="mx-1 h-5 w-px bg-border"/><Button variant="outline" iconOnly aria-label="Zoom out" disabled={zoom<=.5} onClick={()=>setZoom(z=>z-.25)}><Icon name="zoomOut" size={14}/></Button><Button variant="outline" iconOnly aria-label="Fit width" onClick={()=>setZoom(1)}><Icon name="maximize" size={14}/></Button><Button variant="outline" iconOnly aria-label="Zoom in" disabled={zoom>=2} onClick={()=>setZoom(z=>z+.25)}><Icon name="zoomIn" size={14}/></Button></div><div ref={host} className="min-w-0 overflow-auto p-3" style={{maxHeight:'78vh'}}>{loading?<SectionLoading/>:error?<p role="alert">Could not render this PDF. Download the original file to view it.</p>:doc&&<PdfPageCanvas doc={doc} pageNumber={page} scale={Math.max(.25,Math.min((width-24)/595.28,1.5))*zoom} className="mx-auto bg-white shadow-sm"/>}</div></section>;
}
