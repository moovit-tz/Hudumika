import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog.js';
import { Banner } from '../../components/ui/alert.js';
import { ButtonSpinner } from '../../components/ui/spinner.js';
import { LAWDEPOT_CATEGORIES } from './LawDepotTemplateCatalog.js';

interface SaveAsTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string; category: string; documentType: string }) => Promise<void>;
  initialName?: string;
  initialCategory?: string;
  initialDescription?: string;
  initialDocumentType?: string;
}

export function SaveAsTemplateModal({ open, onClose, onSave, initialName = '', initialCategory = 'Start & Manage a Business', initialDescription = '', initialDocumentType = 'agreement' }: SaveAsTemplateModalProps) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [description, setDescription] = useState(initialDescription);
  const [documentType, setDocumentType] = useState(initialDocumentType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initialName || 'Company Template');
      setCategory(initialCategory || 'Start & Manage a Business');
      setDescription(initialDescription || '');
      setDocumentType(initialDocumentType);
      setError('');
    }
  }, [open, initialName, initialCategory, initialDescription, initialDocumentType]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSave({ name: name.trim(), description: description.trim(), category, documentType });
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save template'); }
    finally { setBusy(false); }
  }

  const categories = [...new Set([initialCategory, ...LAWDEPOT_CATEGORIES.map(item => item.name), 'Other'])].filter(Boolean);
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto sm:max-w-lg" onInteractOutside={event => { if (busy) event.preventDefault(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>Save as reusable template</DialogTitle><DialogDescription>Keep this document in your company library for your team to reuse.</DialogDescription></DialogHeader>
      {error && <Banner variant="error">{error}</Banner>}
      <form onSubmit={handleSubmit}>
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4 border-0 p-0">
          <label className="flex flex-col gap-2 text-sm">Template name<Input autoFocus required maxLength={180} value={name} onChange={event => setName(event.target.value)} /></label>
          <label className="flex flex-col gap-2 text-sm">Category<Select value={category} onValueChange={setCategory} disabled={busy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label>
          <label className="flex flex-col gap-2 text-sm">Document type<Select value={documentType} onValueChange={setDocumentType} disabled={busy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[['agreement','Agreement / Contract'],['letter','Letter / Notice'],['policy','Policy / Guideline'],['record','Record / Minutes'],['form','Form / Checklist']].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
          <label className="flex flex-col gap-2 text-sm">Description<Textarea rows={3} maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} placeholder="When should your team use this template?" /></label>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? <ButtonSpinner /> : <Icon name="check" size={14} />}{busy ? 'Saving template…' : 'Save template'}</Button></DialogFooter>
        </fieldset>
      </form>
    </DialogContent>
  </Dialog>;
}
