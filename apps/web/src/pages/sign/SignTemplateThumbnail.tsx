import React, { useMemo } from 'react';
import type { SignDocumentDefinition } from '@hudumika/types';

const escapeXml = (text: string) => text.replace(/[<>&"']/g, char => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]!));

/** Generated locally from the template wording; company content never leaves the browser. */
export function SignTemplateThumbnail({name,definition}: {name:string;definition:SignDocumentDefinition}) {
  const src = useMemo(()=> {
    const lines: string[] = [];
    for (const paragraph of definition.body.replace(/\{\{([^}]+)\}\}/g,(_,key:string)=>`[${key.replace(/_/g,' ')}]`).split('\n')) {
      if (!paragraph.trim()) {lines.push('');continue;}
      const words=paragraph.split(/\s+/); let line='';
      for (const word of words) {if ((line+' '+word).length>65 && line) {lines.push(line);line='';} line+=(line?' ':'')+word;}
      if(line) lines.push(line);
      if(lines.length>42) break;
    }
    const titleLines=name.match(/.{1,30}(?:\s|$)|.{1,30}/g)?.slice(0,2) || [name];
    const bodyStart=58+titleLines.length*20;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect x=".5" y=".5" width="299" height="399" rx="3" fill="white" stroke="#dce1e5"/><rect x="24" y="23" width="24" height="3" fill="#64748b"/>${titleLines.map((line,index)=>`<text x="24" y="${53+index*20}" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#17212b">${escapeXml(line.trim())}</text>`).join('')}<path d="M24 ${bodyStart-10}H276" stroke="#e5e7eb"/>${lines.slice(0,Math.floor((365-bodyStart)/8)).map((line,index)=>`<text x="24" y="${bodyStart+index*8}" font-family="Arial,sans-serif" font-size="5.3" fill="#56616d">${escapeXml(line)}</text>`).join('')}<path d="M24 378H276" stroke="#e5e7eb"/><text x="276" y="389" text-anchor="end" font-family="Arial,sans-serif" font-size="5" fill="#7a8490">1</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  },[name,definition.body]);
  return <img className="sign-template-thumbnail" src={src} alt={`First-page thumbnail of ${name}`} loading="lazy" decoding="async" width={300} height={400}/>;
}
