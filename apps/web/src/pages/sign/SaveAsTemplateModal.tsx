import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { LAWDEPOT_CATEGORIES } from './LawDepotTemplateCatalog.js';
import './LawDepot.css';

interface SaveAsTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    category: string;
    documentType: string;
  }) => Promise<void>;
  initialName?: string;
  initialCategory?: string;
  initialDescription?: string;
}

export function SaveAsTemplateModal({
  open,
  onClose,
  onSave,
  initialName = '',
  initialCategory = 'Start & Manage a Business',
  initialDescription = '',
}: SaveAsTemplateModalProps) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [description, setDescription] = useState(initialDescription);
  const [documentType, setDocumentType] = useState('agreement');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initialName || 'Company Template');
      setCategory(initialCategory || 'Start & Manage a Business');
      setDescription(initialDescription || '');
      setError('');
    }
  }, [open, initialName, initialCategory, initialDescription]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a name for this template.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        category,
        documentType,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lawdepot-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lawdepot-save-modal-card" onClick={e => e.stopPropagation()}>
        <div className="lawdepot-modal-header">
          <div className="lawdepot-modal-header-copy">
            <div className="lawdepot-modal-badge">
              <Icon name="copy" size={14} />
              <span>Company Template Library</span>
            </div>
            <h2>Save as Reusable Template</h2>
            <p>Publish this document wording, clauses, and key decisions to your tenant library for future reuse.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close modal">
            <Icon name="close" size={18} />
          </Button>
        </div>

        {error && <div className="lawdepot-banner-error">{error}</div>}

        <form onSubmit={handleSubmit} className="lawdepot-save-form">
          <label className="lawdepot-form-field">
            <span>Template Name *</span>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Master Services Agreement (Standard)"
              required
            />
          </label>

          <label className="lawdepot-form-field">
            <span>Category</span>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {LAWDEPOT_CATEGORIES.map(cat => (
                  <SelectItem key={cat.id} value={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
                <SelectItem value="Other">Other / General</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="lawdepot-form-field">
            <span>Document Type</span>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agreement">Agreement / Contract</SelectItem>
                <SelectItem value="letter">Letter / Notice</SelectItem>
                <SelectItem value="policy">Policy / Guideline</SelectItem>
                <SelectItem value="record">Record / Minutes</SelectItem>
                <SelectItem value="form">Form / Checklist</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="lawdepot-form-field">
            <span>Description & Notes</span>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Briefly describe when your team should use this template and any special signing requirements..."
              rows={3}
            />
          </label>

          <div className="lawdepot-save-modal-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={busy || !name.trim()}>
              {busy ? (
                <>
                  <Icon name="refresh" size={14} className="animate-spin" />
                  Saving template…
                </>
              ) : (
                <>
                  <Icon name="check" size={14} />
                  Save Template
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
