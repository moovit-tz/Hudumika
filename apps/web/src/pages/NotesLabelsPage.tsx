import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Button } from '../components/ui/button.js';
import { showConfirm } from '../lib/confirm.js';
import {
  useNoteLabels, useNotesLoaded, loadNotes, addLabel, updateLabel, deleteLabel,
} from '../data/notesStore.js';

/**
 * Manage note labels — a real page (not the old hand-rolled modal) so it
 * follows the same "dedicated page, not a popup" convention the rest of the
 * platform uses for anything beyond a single confirm dialog.
 */
export function NotesLabelsPage() {
  const navigate = useNavigate();
  const labels = useNoteLabels();
  const loaded = useNotesLoaded();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { loadNotes(); }, []);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    await addLabel(name);
    setNewName('');
    setAdding(false);
  };

  const remove = async (id: string, name: string) => {
    const ok = await showConfirm(`Delete the "${name}" label? It will be removed from every note that carries it.`, { variant: 'warning', confirmLabel: 'Delete' });
    if (ok) await deleteLabel(id);
  };

  return (
    <div style={{ padding: '0 0 32px' }}>
      <PageHeader
        crumbs={['Notes']}
        titlePlain="Manage"
        titleEm="labels"
        subtitle="Labels used to organise notes — rename or remove one, or add a new one."
        actions={
          <Button variant="outline" onClick={() => navigate('/notes')}>
            <Icon name="chevronLeft" size={14} /> Back to notes
          </Button>
        }
      />

      <SectionCard title="Labels" collapsible={false}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            type="text"
            className="input-field"
            style={{ flex: 1 }}
            placeholder="New label name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') create(); }}
          />
          <Button disabled={!newName.trim() || adding} onClick={create}>
            <Icon name="plus" size={14} /> Add label
          </Button>
        </div>

        {!loaded ? (
          <SectionLoading />
        ) : labels.length === 0 ? (
          <div style={{ padding: '16px 0', color: 'var(--ink3)', fontSize: 13 }}>No labels yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {labels.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                <Icon name="tag" size={15} color="var(--ink3)" />
                <input
                  type="text"
                  defaultValue={l.name}
                  className="input-field"
                  style={{ flex: 1, border: 'none', background: 'transparent', padding: '4px 0' }}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== l.name) updateLabel(l.id, v); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
                <button type="button" onClick={() => remove(l.id, l.name)} title="Delete label"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}>
                  <Icon name="trash" size={15} color="var(--red)" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
