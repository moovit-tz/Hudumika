import React, { useEffect, useRef } from 'react';
import { clearFinanceDrafts, hasAnyFinanceDraft } from '../hooks/useFinanceDraft.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader, type Crumb } from './PageHeader.js';
import { BackButton } from './ui/BackButton.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

/**
 * Full-page create/edit form chrome.
 *
 * Quotations already worked this way — a `view` state whose 'create' branch
 * early-returns a whole page instead of layering a dialog over the list —
 * and every other finance page opened the same kind of form in a fixed
 * overlay. A record with a dozen fields and a line-item table does not fit
 * a modal: it scrolls inside a box inside a scrolling page, the list behind
 * it keeps its own scroll position, and on a phone the whole thing is a
 * viewport-height box with its own inner scrollbar.
 *
 * This is that chrome, extracted so the remaining pages adopt the pattern
 * without each re-deriving the header, spacing and back affordance.
 */
export interface FormPageProps {
  /** e.g. "New Invoice" or "Edit INV-2026-0031". */
  title: string;
  /** One line under the title saying what the form is for. */
  subtitle?: string;
  /** Back arrow and any Cancel control route here. */
  onCancel: () => void;
  /** Save / submit buttons, rendered right-aligned in the header. */
  actions?: React.ReactNode;
  /** Breadcrumb hierarchy */
  crumbs?: Crumb[];
  children: React.ReactNode;
}

export function FormPage({ title, subtitle, onCancel, actions, crumbs, children }: FormPageProps) {
  const isMobile = useIsMobile();
  const dirty=useRef(hasAnyFinanceDraft());
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const mark=()=>{dirty.current=true;};
    const before=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};
    const node=root.current;node?.addEventListener('input',mark);node?.addEventListener('change',mark);window.addEventListener('beforeunload',before);
    return()=>{node?.removeEventListener('input',mark);node?.removeEventListener('change',mark);window.removeEventListener('beforeunload',before);};
  },[]);
  async function cancel(){if(!dirty.current || await showConfirm('Discard the unsaved changes in this form?',{confirmLabel:'Discard changes'})){dirty.current=false;clearFinanceDrafts();onCancel();}}

  return (
    <div ref={root} onClickCapture={event=>{const control=(event.target as HTMLElement).closest('button,a');if(control?.textContent?.trim()==='Cancel'){event.preventDefault();event.stopPropagation();void cancel();}}} style={{ padding: '0 0 24px', flex: 1, overflowY: 'auto' }}>
      <PageHeader crumbs={crumbs || []} onBack={cancel} backLabel="Back" titlePlain={title.split(' ').slice(0,-1).join(' ')} titleEm={title.split(' ').slice(-1)[0]} subtitle={subtitle} actions={actions}/>
      {children}
    </div>
  );
}

/** The two header buttons every one of these forms needs, so Cancel and Save
 *  are the same control on all ten pages rather than ten hand-rolled pairs. */
export function FormPageActions({ onCancel, onSave, saving, saveLabel = 'Save', extra }: {
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  extra?: React.ReactNode;
}) {
  return (
    <>
      {extra}
      <button type="button" onClick={onCancel} disabled={saving} className="btn btn-secondary" data-ui-native-button="">
        Cancel
      </button>
      <button type="button" onClick={onSave} disabled={saving} className="btn btn-primary" data-ui-native-button="">
        {saving ? 'Saving…' : saveLabel}
      </button>
    </>
  );
}
