import {useEffect,useRef,useState} from 'react';

/** Script-disabled receipt document; measuring its body avoids nested scrollbars on short receipts. */
export function PosReceiptPreview({html,title='Receipt preview'}:{html:string;title?:string}) {
  const frame=useRef<HTMLIFrameElement>(null);
  const observer=useRef<ResizeObserver|null>(null);
  const [height,setHeight]=useState(560);
  useEffect(()=>()=>observer.current?.disconnect(),[]);
  function measure() {
    observer.current?.disconnect();
    const body=frame.current?.contentDocument?.body;
    if(!body)return;
    const update=()=>setHeight(Math.min(12000,Math.max(100,Math.ceil(body.scrollHeight+24))));
    observer.current=new ResizeObserver(update);observer.current.observe(body);update();
  }
  return <div className="min-w-0 rounded-lg border bg-muted p-3"><iframe ref={frame} title={title} sandbox="allow-same-origin" srcDoc={html} onLoad={measure} className="block w-full border-0 bg-white" style={{height}}/></div>;
}
