import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover.js';
import { Button } from '../components/ui/button.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { ReminderPicker } from '../components/ReminderPicker.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { EntityPicker, type PickerItem } from '../components/EntityPicker.js';
import { MeetingLinkPanel } from '../components/MeetingLinkPanel.js';
import { showAlert } from '../lib/alert.js';
import { apiFetch, apiFetchBlob } from '../lib/api.js';
import { fetchPeople, type Person } from '../lib/identity.js';
import {
  useNotes,
  useNoteLabels,
  usePeopleById,
  useNotesViewMode,
  useNotesSearchQuery,
  useNotesLoaded,
  loadNotes,
  setNotesViewMode,
  addNote,
  updateNote,
  togglePinNote,
  toggleArchiveNote,
  trashNote,
  restoreNote,
  permanentlyDeleteNote,
  emptyTrash,
  uploadNoteImage,
  loadMoreNotes,
  useHasMoreNotes,
  useNotesLoading,
  fetchNoteRevisions,
  restoreNoteRevision,
  NOTE_CATEGORIES,
  categoryMeta,
  type NoteItem,
  type KeepColor,
  type ChecklistItem,
  type NotesFilterId,
  type NoteVisibility,
  type NoteShareEntry,
  type NoteRevision,
} from '../data/notesStore.js';
import './Notes.css';

const VISIBILITY_META: Record<NoteVisibility, { label: string; icon: 'globe' | 'lock' | 'users'; hint: string }> = {
  team: { label: 'Team', icon: 'globe', hint: 'Visible and editable by everyone in your workspace.' },
  private: { label: 'Private', icon: 'lock', hint: 'Visible only to you.' },
  shared: { label: 'Shared', icon: 'users', hint: 'Visible only to you and whoever you add below.' },
};

const COLOR_OPTIONS: { id: KeepColor; name: string; hex: string }[] = [
  { id: 'default', name: 'Default', hex: '#ffffff' },
  { id: 'red', name: 'Red', hex: '#f28b82' },
  { id: 'orange', name: 'Orange', hex: '#fbbc04' },
  { id: 'yellow', name: 'Yellow', hex: '#fff475' },
  { id: 'green', name: 'Green', hex: '#ccff90' },
  { id: 'teal', name: 'Teal', hex: '#a7ffeb' },
  { id: 'blue', name: 'Blue', hex: '#cbf0f8' },
  { id: 'darkblue', name: 'Dark Blue', hex: '#aecbfa' },
  { id: 'purple', name: 'Purple', hex: '#d7aefb' },
  { id: 'pink', name: 'Pink', hex: '#fdaffc' },
  { id: 'brown', name: 'Brown', hex: '#e6c9a8' },
  { id: 'gray', name: 'Gray', hex: '#e8eaed' },
];

/**
 * `filter` comes from the route (see NotesShell.tsx) — All Notes/Reminders/
 * Archive/Trash/a label are all real URLs now, same as every other app's
 * sidebar, rather than an internal-only toggle a browser back button
 * couldn't see.
 */
export const NotesApp: React.FC<{ filter: NotesFilterId }> = ({ filter: activeFilter }) => {
  const notes = useNotes();
  const labels = useNoteLabels();
  const peopleById = usePeopleById();
  const viewMode = useNotesViewMode();
  const searchQuery = useNotesSearchQuery();
  const loaded = useNotesLoaded();
  const notesLoading = useNotesLoading();
  const hasMoreNotes = useHasMoreNotes();

  useEffect(() => { loadNotes(); }, []);

  // Note Composer State
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [color, setColor] = useState<KeepColor>('default');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [drawing, setDrawing] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [reminder, setReminder] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [categorySubjectId, setCategorySubjectId] = useState<string | null>(null);
  const [isChecklistMode, setIsChecklistMode] = useState(false);

  // Active Modals & Popovers State
  const [activeColorPopover, setActiveColorPopover] = useState<string | null>(null); // noteId or 'composer'
  const [activeLabelPopover, setActiveLabelPopover] = useState<string | null>(null); // noteId or 'composer'
  const [activeReminderPopover, setActiveReminderPopover] = useState<string | null>(null);
  const [activeCategoryPopover, setActiveCategoryPopover] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  // Debounced autosave for the editor's free-text fields (title, content,
  // checklist item text) — these used to fire a real PATCH on every single
  // keystroke, which is both needless network chatter and why a single
  // ~1s server hiccup (e.g. the API dev server restarting under `tsx
  // watch`) was so likely to be hit mid-sentence. Keyed per-field so
  // editing the title doesn't cancel a pending content save or vice versa.
  // editorPendingSaves holds the latest patch for a field that hasn't
  // actually been sent yet — flushed for real (not just cancelled) on
  // close, so the last keystroke before closing is never silently dropped.
  const [editorSaveState, setEditorSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const editorSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const editorPendingSaves = useRef<Record<string, { patch: Partial<NoteItem>; noteId: string }>>({});

  async function flushFieldSave(key: string) {
    const pending = editorPendingSaves.current[key];
    if (!pending) return;
    if (editorSaveTimers.current[key]) {
      clearTimeout(editorSaveTimers.current[key]);
      delete editorSaveTimers.current[key];
    }
    setEditorSaveState('saving');
    const ok = await updateNote(pending.noteId, pending.patch);
    if (ok) {
      // Only cleared on success — a failed attempt keeps its patch pending
      // so both the "Retry" button and the next keystroke's own debounce
      // have something real to resend, instead of silently having nothing
      // left to retry.
      delete editorPendingSaves.current[key];
      setEditorSaveState('saved');
      setTimeout(() => setEditorSaveState(s => (s === 'saved' ? 'idle' : s)), 1500);
    } else {
      setEditorSaveState('error');
    }
  }

  function scheduleFieldSave(key: string, patch: Partial<NoteItem>, noteId: string) {
    editorPendingSaves.current[key] = { patch, noteId };
    if (editorSaveTimers.current[key]) clearTimeout(editorSaveTimers.current[key]);
    editorSaveTimers.current[key] = setTimeout(() => flushFieldSave(key), 700);
  }

  function flushAllPendingSaves() {
    for (const key of Object.keys(editorPendingSaves.current)) flushFieldSave(key);
  }

  // Reset the indicator on every open/close/note-switch — a stale
  // "Saving…" from the previous note must never bleed into the next one.
  useEffect(() => { setEditorSaveState('idle'); }, [editingNote?.id]);

  // Safety net for navigating away entirely (e.g. clicking a different app
  // in the sidebar) within the debounce window — Close/backdrop-click
  // already flush explicitly; this covers the case neither of those fires.
  useEffect(() => {
    return () => { flushAllPendingSaves(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showDrawingModal, setShowDrawingModal] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showMeetingPanel, setShowMeetingPanel] = useState(false);

  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close composer when clicking outside if title/content empty. Radix
  // Popover content (ReminderPicker, CategoryPicker, the label picker)
  // renders through a Portal straight onto document.body, so it's never a
  // DOM descendant of composerRef — without this check, picking a
  // reminder, category or label read as an "outside" click and silently
  // saved+reset the composer before Done could be pressed.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest?.('[data-radix-popper-content-wrapper]')) return;
      if (composerRef.current && !composerRef.current.contains(event.target as Node)) {
        if (isExpanded) {
          saveComposerNote();
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded, title, content, checklist, images, drawing, isPinned, color, selectedLabels, reminder, category]);

  const saveComposerNote = () => {
    if (title.trim() || content.trim() || checklist.length > 0 || images.length > 0 || drawing) {
      addNote({
        title,
        content,
        pinned: isPinned,
        color,
        labels: selectedLabels,
        checklist,
        drawing,
        images,
        reminder,
        subjectType: category,
        subjectId: categorySubjectId,
      });
    }
    resetComposer();
  };

  const resetComposer = () => {
    setTitle('');
    setContent('');
    setIsPinned(false);
    setColor('default');
    setSelectedLabels([]);
    setChecklist([]);
    setDrawing(null);
    setImages([]);
    setReminder(null);
    setCategory(null);
    setCategorySubjectId(null);
    setIsChecklistMode(false);
    setIsExpanded(false);
    setActiveColorPopover(null);
    setActiveLabelPopover(null);
    setActiveReminderPopover(null);
    setActiveCategoryPopover(null);
  };

  // Checklist Item Helpers in Composer
  const addChecklistItem = (text: string) => {
    if (!text.trim()) return;
    setChecklist(prev => [...prev, { id: `item-${Date.now()}-${Math.random()}`, text: text.trim(), completed: false }]);
  };

  const toggleComposerChecklist = (itemId: string) => {
    setChecklist(prev => prev.map(item => item.id === itemId ? { ...item, completed: !item.completed } : item));
  };

  const removeComposerChecklistItem = (itemId: string) => {
    setChecklist(prev => prev.filter(item => item.id !== itemId));
  };

  // Image Upload Handler — routes through the real Drive file store when
  // possible (uploadNoteImage falls back to inline storage on any failure,
  // e.g. a tenant without the Cloud entitlement — see notesStore.ts).
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, targetNoteId?: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(async file => {
      const ref = await uploadNoteImage(file);
      if (targetNoteId) {
        const targetNote = notes.find(n => n.id === targetNoteId);
        if (targetNote) {
          updateNote(targetNoteId, { images: [...targetNote.images, ref] });
        }
      } else {
        setImages(prev => [...prev, ref]);
        setIsExpanded(true);
      }
    });
    e.target.value = '';
  };

  // Filtered Notes Logic
  const filteredNotes = notes.filter(n => {
    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = n.title.toLowerCase().includes(q);
      const contentMatch = n.content.toLowerCase().includes(q);
      const checklistMatch = n.checklist.some(c => c.text.toLowerCase().includes(q));
      if (!titleMatch && !contentMatch && !checklistMatch) return false;
    }

    // 2. Sidebar Navigation Filter
    if (activeFilter === 'all') return !n.archived && !n.trashed;
    if (activeFilter === 'reminders') return !n.archived && !n.trashed && !!n.reminder;
    if (activeFilter === 'archive') return n.archived && !n.trashed;
    if (activeFilter === 'trash') return n.trashed;
    if (activeFilter.startsWith('label:')) {
      const labelId = activeFilter.replace('label:', '');
      return !n.archived && !n.trashed && n.labels.includes(labelId);
    }
    if (activeFilter.startsWith('category:')) {
      const type = activeFilter.slice('category:'.length);
      return !n.archived && !n.trashed && n.subjectType === type;
    }
    return true;
  });

  const pinnedNotes = filteredNotes.filter(n => n.pinned);
  const otherNotes = filteredNotes.filter(n => !n.pinned);

  const heading = (() => {
    if (activeFilter === 'reminders') return { crumbs: ['Notes', 'Reminders'], titlePlain: 'With', titleEm: 'reminders', subtitle: 'Notes that have a reminder set.' };
    if (activeFilter === 'archive') return { crumbs: ['Notes', 'Archive'], titlePlain: 'Archived', titleEm: 'notes', subtitle: 'Notes tucked away, out of the main list.' };
    if (activeFilter === 'trash') return { crumbs: ['Notes', 'Trash'], titlePlain: 'Trash', titleEm: 'bin', subtitle: 'Deleted notes — restore one or empty the trash for good.' };
    if (activeFilter.startsWith('label:')) {
      const lbl = labels.find(l => l.id === activeFilter.slice('label:'.length));
      return { crumbs: ['Notes', 'Label'], titlePlain: 'Label', titleEm: lbl?.name || '…', subtitle: `Notes tagged “${lbl?.name || ''}”.` };
    }
    if (activeFilter.startsWith('category:')) {
      const meta = categoryMeta(activeFilter.slice('category:'.length));
      return { crumbs: ['Notes', 'Category'], titlePlain: 'Related to', titleEm: meta.label, subtitle: `Notes related to ${meta.label.toLowerCase()}.` };
    }
    return { crumbs: ['Notes'], titlePlain: 'Keep', titleEm: 'notes', subtitle: 'Shared notes, checklists and sketches for the whole workspace.' };
  })();

  if (!loaded) {
    return (
      <div className="notes-page">
        <PageHeader crumbs={heading.crumbs} titlePlain={heading.titlePlain} titleEm={heading.titleEm} subtitle={heading.subtitle} />
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13.5 }}>Loading notes…</div>
      </div>
    );
  }

  return (
    <div className="notes-page">
      <PageHeader crumbs={heading.crumbs} titlePlain={heading.titlePlain} titleEm={heading.titleEm} subtitle={heading.subtitle} />

      {/* ── Toolbar: view controls (search now lives in the global header) ── */}
      <div className="notes-header-bar">
        <div className="notes-header-actions">
          <button
            type="button"
            className={`notes-icon-btn${viewMode === 'grid' ? ' active' : ''}`}
            title="Grid view"
            onClick={() => setNotesViewMode('grid')}
          >
            <Icon name="grid" size={18} />
          </button>
          <button
            type="button"
            className={`notes-icon-btn${viewMode === 'list' ? ' active' : ''}`}
            title="List view"
            onClick={() => setNotesViewMode('list')}
          >
            <Icon name="list" size={18} />
          </button>
          <button
            type="button"
            className="notes-icon-btn"
            title="Refresh notes"
            onClick={() => loadNotes(true)}
          >
            <Icon name="refresh" size={18} />
          </button>
        </div>
      </div>

      {/* Real navigation (All Notes/Reminders/Labels/Archive/Trash) now
          lives in the one real AppSidebar (NotesShell.tsx), same as every
          other app — this used to duplicate it with its own internal
          sidebar, which is what produced two competing sidebars on screen. */}
      <div className="notes-layout">
        {/* Main Content */}
        <div className="notes-content-area">
          {/* Note Composer (Only when viewing active notes) */}
          {activeFilter !== 'trash' && activeFilter !== 'archive' && (
            <div
              ref={composerRef}
              className={`notes-composer keep-color-${color}`}
            >
              {!isExpanded ? (
                <div className="notes-composer-collapsed" onClick={() => setIsExpanded(true)}>
                  <span>Take a note...</span>
                  <div className="notes-composer-actions" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="notes-icon-btn"
                      title="New checklist"
                      onClick={() => { setIsChecklistMode(true); setIsExpanded(true); }}
                    >
                      <Icon name="checkCircle" size={18} />
                    </button>
                    <button
                      type="button"
                      className="notes-icon-btn"
                      title="New note with drawing"
                      onClick={() => { setShowDrawingModal(true); setIsExpanded(true); }}
                    >
                      <Icon name="edit" size={18} />
                    </button>
                    <button
                      type="button"
                      className="notes-icon-btn"
                      title="New note with image"
                      onClick={() => { fileInputRef.current?.click(); }}
                    >
                      <Icon name="upload" size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="notes-composer-expanded">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <input
                      type="text"
                      className="notes-input-title"
                      placeholder="Title"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className={`notes-icon-btn${isPinned ? ' active' : ''}`}
                      title={isPinned ? 'Unpin note' : 'Pin note'}
                      onClick={() => setIsPinned(!isPinned)}
                    >
                      <Icon name="star" size={18} />
                    </button>
                  </div>

                  {!isChecklistMode ? (
                    <textarea
                      className="notes-input-body"
                      placeholder="Take a note..."
                      value={content}
                      onChange={e => setContent(e.target.value)}
                    />
                  ) : (
                    <div className="notes-checklist-builder">
                      {checklist.map(item => (
                        <div key={item.id} className="notes-checklist-item-row">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => toggleComposerChecklist(item.id)}
                          />
                          <input
                            type="text"
                            className={item.completed ? 'completed' : ''}
                            value={item.text}
                            onChange={e => {
                              const val = e.target.value;
                              setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, text: val } : i));
                            }}
                          />
                          <button
                            type="button"
                            className="notes-icon-btn"
                            onClick={() => removeComposerChecklistItem(item.id)}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </div>
                      ))}
                      <div className="notes-checklist-item-row" style={{ marginTop: 4 }}>
                        <Icon name="plus" size={16} color="var(--ink3)" />
                        <input
                          type="text"
                          placeholder="List item"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addChecklistItem((e.target as HTMLInputElement).value);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Drawings or Attached Images Thumbnail Previews */}
                  {drawing && (
                    <div style={{ position: 'relative', width: 120, height: 80, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={drawing} alt="Sketch" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer' }}
                        onClick={() => setDrawing(null)}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {images.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {images.map((img, idx) => (
                        <div key={idx} style={{ position: 'relative', width: 80, height: 80, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                          <NoteImage src={img} alt="Attachment" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button
                            type="button"
                            style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 12 }}
                            onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Badges / Labels Preview */}
                  <div className="note-card-badges">
                    {reminder && (
                      <span className="note-badge-reminder">
                        <Icon name="clock" size={12} />
                        <span>{new Date(reminder).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    )}
                    {selectedLabels.map(lblId => {
                      const lbl = labels.find(l => l.id === lblId);
                      return lbl ? <span key={lbl.id} className="note-badge-tag">{lbl.name}</span> : null;
                    })}
                    {category && (
                      <span className="note-badge-tag">
                        <Icon name={categoryMeta(category).icon} size={11} /> {categoryMeta(category).label}
                      </span>
                    )}
                  </div>

                  {/* Toolbar & Popovers */}
                  <div className="notes-composer-toolbar">
                    <div className="notes-tool-icons" style={{ position: 'relative' }}>
                      {/* Color Picker Toggle */}
                      <button
                        type="button"
                        className="notes-icon-btn"
                        title="Background color"
                        onClick={() => setActiveColorPopover(activeColorPopover === 'composer' ? null : 'composer')}
                      >
                        <Icon name="color" size={17} />
                      </button>

                      {activeColorPopover === 'composer' && (
                        <div className="keep-color-palette">
                          {COLOR_OPTIONS.map(c => (
                            <button
                              type="button"
                              key={c.id}
                              className="color-swatch-btn"
                              style={{ backgroundColor: c.hex }}
                              title={c.name}
                              onClick={() => { setColor(c.id); setActiveColorPopover(null); }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Reminder — a real user-picked date/time, not a
                          hardcoded "tomorrow at 08:00" (the old behaviour
                          invented a value instead of asking for one). */}
                      <ReminderPicker
                        value={reminder}
                        onChange={setReminder}
                        open={activeReminderPopover === 'composer'}
                        onOpenChange={o => setActiveReminderPopover(o ? 'composer' : null)}
                      />

                      {/* Image Upload */}
                      <button
                        type="button"
                        className="notes-icon-btn"
                        title="Add image"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Icon name="upload" size={17} />
                      </button>

                      {/* Canvas Drawing */}
                      <button
                        type="button"
                        className="notes-icon-btn"
                        title="Draw sketch"
                        onClick={() => setShowDrawingModal(true)}
                      >
                        <Icon name="edit" size={17} />
                      </button>

                      {/* Labels Selector */}
                      <Popover open={activeLabelPopover === 'composer'} onOpenChange={o => setActiveLabelPopover(o ? 'composer' : null)}>
                        <PopoverAnchor asChild>
                          <button
                            type="button"
                            className="notes-icon-btn"
                            title="Add label"
                            onClick={() => setActiveLabelPopover(activeLabelPopover === 'composer' ? null : 'composer')}
                          >
                            <Icon name="tag" size={17} />
                          </button>
                        </PopoverAnchor>
                        <PopoverContent align="start" className="w-40 p-2">
                          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', marginBottom: 6 }}>LABEL NOTE</div>
                          {labels.length === 0 && (
                            <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '4px 0 8px' }}>No labels yet.</div>
                          )}
                          {labels.map(l => (
                            <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={selectedLabels.includes(l.id)}
                                onChange={e => {
                                  if (e.target.checked) setSelectedLabels(prev => [...prev, l.id]);
                                  else setSelectedLabels(prev => prev.filter(id => id !== l.id));
                                }}
                              />
                              <span>{l.name}</span>
                            </label>
                          ))}
                          <Link to="/notes/labels" style={{ display: 'block', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--teal)', fontWeight: 700, textDecoration: 'none' }}>
                            Manage labels
                          </Link>
                        </PopoverContent>
                      </Popover>

                      {/* Related app — tags this note with which app it's
                          about (customer, shipment, calendar, drive, …),
                          same subject_type link 266_notes_migrate_existing.sql
                          used to bring in real notes from other apps, and
                          for customer/invoice/shipment, a specific record
                          within it (subjectId). */}
                      <CategoryPicker
                        value={{ subjectType: category, subjectId: categorySubjectId }}
                        onChange={v => { setCategory(v.subjectType); setCategorySubjectId(v.subjectId); }}
                        open={activeCategoryPopover === 'composer'}
                        onOpenChange={o => setActiveCategoryPopover(o ? 'composer' : null)}
                      />
                    </div>

                    <button type="button" className="notes-done-btn" onClick={saveComposerNote}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleImageUpload(e)}
          />

          {/* Trash Header Banner */}
          {activeFilter === 'trash' && (
            <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 13.5, color: 'var(--ink2)' }}>Notes in Trash are deleted after 30 days.</span>
              <button
                type="button"
                className="notes-done-btn"
                style={{ background: '#dc2626' }}
                onClick={() => {
                  emptyTrash();
                  showAlert('Trash emptied.');
                }}
              >
                Empty Trash
              </button>
            </div>
          )}

          {/* ── Pinned Notes Section ── */}
          {pinnedNotes.length > 0 && activeFilter !== 'trash' && activeFilter !== 'archive' && (
            <div>
              <div className="notes-section-title">PINNED</div>
              <div className={`notes-grid${viewMode === 'list' ? ' list-view' : ''}`}>
                {pinnedNotes.map(n => renderNoteCard(n))}
              </div>
            </div>
          )}

          {/* ── Other / All Notes Section ── */}
          <div>
            {pinnedNotes.length > 0 && activeFilter !== 'trash' && activeFilter !== 'archive' && (
              <div className="notes-section-title" style={{ marginTop: 24 }}>OTHERS</div>
            )}

            {filteredNotes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink3)' }}>
                <Icon name={activeFilter === 'trash' ? 'trash' : activeFilter === 'archive' ? 'archive' : 'document'} size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink2)' }}>
                  {searchQuery.trim() ? 'No notes match your search'
                    : activeFilter === 'trash' ? 'Trash is empty'
                    : activeFilter === 'archive' ? 'No archived notes'
                    : activeFilter === 'reminders' ? 'No reminders set'
                    : activeFilter.startsWith('label:') ? 'No notes with this label'
                    : activeFilter.startsWith('category:') ? 'No notes in this category'
                    : 'No notes yet'}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {activeFilter === 'trash' ? 'Deleted notes show up here for 30 days.'
                    : 'Notes you add will appear here.'}
                </div>
              </div>
            ) : (
              <div className={`notes-grid${viewMode === 'list' ? ' list-view' : ''}`}>
                {otherNotes.map(n => renderNoteCard(n))}
              </div>
            )}

            {/* Real pagination past the first page — GET /v1/notes used to
                be a flat 1000-note fetch with no way to reach anything past
                it. Shown whenever the server reports more exists, regardless
                of which sidebar tab is active: a click here always fetches
                real additional notes, even though (for a label/archive/trash
                view specifically) that batch isn't itself filtered to match
                — a smaller, accepted gap rather than the bigger per-view
                server query it would take to close entirely. */}
            {hasMoreNotes && filteredNotes.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                <Button variant="outline" size="sm" disabled={notesLoading} onClick={() => loadMoreNotes()}>
                  {notesLoading ? 'Loading…' : 'Load more notes'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Note Edit Modal ── */}
      {editingNote && (
        <div className="notes-drawing-modal" onClick={() => { flushAllPendingSaves(); setEditingNote(null); setShowSharePanel(false); setShowHistoryPanel(false); setShowMeetingPanel(false); }}>
          <div className={`notes-drawing-card keep-color-${editingNote.color}`} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <input
                type="text"
                className="notes-input-title"
                value={editingNote.title}
                disabled={!editingNote.canEdit}
                onChange={e => {
                  const val = e.target.value;
                  setEditingNote(prev => prev ? { ...prev, title: val } : prev);
                  scheduleFieldSave('title', { title: val }, editingNote.id);
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {editingNote.canEdit && (
                  <span style={{
                    fontSize: 11.5, color: editorSaveState === 'error' ? 'var(--sign-red, #dc2626)' : 'var(--ink3)',
                    display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, whiteSpace: 'nowrap',
                    opacity: editorSaveState === 'idle' ? 0 : 1, transition: 'opacity 0.15s',
                  }}>
                    {editorSaveState === 'saving' && <>Saving…</>}
                    {editorSaveState === 'saved' && <><Icon name="check" size={12} /> Saved</>}
                    {editorSaveState === 'error' && (
                      <>
                        <Icon name="alertCircle" size={12} /> Not saved
                        <button type="button" onClick={() => flushAllPendingSaves()}
                          style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 11.5 }}>
                          Retry
                        </button>
                      </>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  className={`notes-icon-btn${editingNote.pinned ? ' active' : ''}`}
                  title={editingNote.pinned ? 'Unpin' : 'Pin'}
                  onClick={() => {
                    togglePinNote(editingNote.id);
                    setEditingNote(prev => prev ? { ...prev, pinned: !prev.pinned } : prev);
                  }}
                >
                  <Icon name="star" size={18} />
                </button>
              </div>
            </div>

            {/* Who wrote it, and the note's real access level — no longer a
                fixed "shared with your whole team", since a note can now
                actually be private or shared with a named list
                (282_notes_enterprise.sql). */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)' }}>
                {editingNote.createdBy && peopleById[editingNote.createdBy] && (
                  <PersonAvatar userId={editingNote.createdBy} name={peopleById[editingNote.createdBy].name} size={18} />
                )}
                <span>
                  {editingNote.createdBy && peopleById[editingNote.createdBy] ? `${peopleById[editingNote.createdBy].name} · ` : ''}
                  {VISIBILITY_META[editingNote.visibility].label}
                  {editingNote.visibility === 'shared' && editingNote.shares.length > 0 ? ` with ${editingNote.shares.length}` : ''}
                  {!editingNote.canEdit ? ' · view only' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="notes-icon-btn" title="Version history" onClick={() => setShowHistoryPanel(true)}>
                  <Icon name="timer" size={15} />
                </button>
                {editingNote.isOwner && (
                  <button type="button" className="notes-icon-btn" title="Share & visibility" onClick={() => setShowSharePanel(true)}>
                    <Icon name={VISIBILITY_META[editingNote.visibility].icon} size={15} />
                  </button>
                )}
              </div>
            </div>

            <textarea
              className="notes-input-body"
              style={{ minHeight: 140 }}
              value={editingNote.content}
              disabled={!editingNote.canEdit}
              onChange={e => {
                const val = e.target.value;
                setEditingNote(prev => prev ? { ...prev, content: val } : prev);
                scheduleFieldSave('content', { content: val }, editingNote.id);
              }}
            />

            {/* Checklist items */}
            {editingNote.checklist.length > 0 && (
              <div className="notes-checklist-builder">
                {editingNote.checklist.map(item => (
                  <div key={item.id} className="notes-checklist-item-row">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      disabled={!editingNote.canEdit}
                      onChange={() => {
                        const updated = editingNote.checklist.map(c => c.id === item.id ? { ...c, completed: !c.completed } : c);
                        setEditingNote(prev => prev ? { ...prev, checklist: updated } : prev);
                        updateNote(editingNote.id, { checklist: updated });
                      }}
                    />
                    <input
                      type="text"
                      className={item.completed ? 'completed' : ''}
                      value={item.text}
                      disabled={!editingNote.canEdit}
                      onChange={e => {
                        const text = e.target.value;
                        const updated = editingNote.checklist.map(c => c.id === item.id ? { ...c, text } : c);
                        setEditingNote(prev => prev ? { ...prev, checklist: updated } : prev);
                        scheduleFieldSave(`checklist:${item.id}`, { checklist: updated }, editingNote.id);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="notes-composer-toolbar">
              <div className="notes-tool-icons">
                {editingNote.canEdit && (
                  <>
                    <button
                      type="button"
                      className="notes-icon-btn"
                      onClick={() => trashNote(editingNote.id)}
                      title="Delete note"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                    <button
                      type="button"
                      className="notes-icon-btn"
                      onClick={() => toggleArchiveNote(editingNote.id)}
                      title="Archive note"
                    >
                      <Icon name="archive" size={16} />
                    </button>
                    <CategoryPicker
                      value={{ subjectType: editingNote.subjectType ?? null, subjectId: editingNote.subjectId ?? null }}
                      onChange={v => {
                        updateNote(editingNote.id, { subjectType: v.subjectType, subjectId: v.subjectId });
                        setEditingNote(prev => prev ? { ...prev, subjectType: v.subjectType, subjectId: v.subjectId } : prev);
                      }}
                      open={activeCategoryPopover === editingNote.id}
                      onOpenChange={o => setActiveCategoryPopover(o ? editingNote.id : null)}
                    />
                    <button
                      type="button"
                      className={`notes-icon-btn${editingNote.meetingUrl ? ' active' : ''}`}
                      onClick={() => setShowMeetingPanel(v => !v)}
                      title={editingNote.meetingUrl ? 'Video call attached' : 'Add video call'}
                    >
                      <Icon name="video" size={16} />
                    </button>
                  </>
                )}
                {editingNote.isOwner && (
                  <button
                    type="button"
                    className={`notes-icon-btn${editingNote.legalHold ? ' active' : ''}`}
                    title={editingNote.legalHold ? 'Remove legal hold (allow deletion)' : 'Put on legal hold (exempt from trash auto-purge, block deletion)'}
                    onClick={() => {
                      const legalHold = !editingNote.legalHold;
                      updateNote(editingNote.id, { legalHold });
                      setEditingNote(prev => prev ? { ...prev, legalHold } : prev);
                    }}
                  >
                    <Icon name="shield" size={16} />
                  </button>
                )}
              </div>

              <button type="button" className="notes-done-btn" onClick={() => { flushAllPendingSaves(); setEditingNote(null); setShowSharePanel(false); setShowHistoryPanel(false); setShowMeetingPanel(false); }}>
                Close
              </button>
            </div>

            {showSharePanel && (
              <SharePanel
                note={editingNote}
                onClose={() => setShowSharePanel(false)}
                onChange={(visibility, shares) => {
                  updateNote(editingNote.id, { visibility, shares });
                  setEditingNote(prev => prev ? { ...prev, visibility, shares } : prev);
                }}
              />
            )}

            {showHistoryPanel && (
              <HistoryPanel
                note={editingNote}
                onClose={() => setShowHistoryPanel(false)}
                onRestored={restored => setEditingNote(restored)}
              />
            )}

            {showMeetingPanel && (
              <div style={{ padding: '12px 20px' }}>
                <MeetingLinkPanel
                  title={editingNote.title || 'Meeting'}
                  value={{ meetingUrl: editingNote.meetingUrl ?? null, blissMeetingId: editingNote.blissMeetingId ?? null }}
                  disabled={!editingNote.canEdit}
                  onChange={next => {
                    updateNote(editingNote.id, { meetingUrl: next.meetingUrl, blissMeetingId: next.blissMeetingId });
                    setEditingNote(prev => prev ? { ...prev, meetingUrl: next.meetingUrl, blissMeetingId: next.blissMeetingId ?? null } : prev);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Drawing Canvas Modal ── */}
      {showDrawingModal && (
        <DrawingCanvasModal
          onClose={() => setShowDrawingModal(false)}
          onSave={dataUrl => {
            setDrawing(dataUrl);
            setShowDrawingModal(false);
          }}
        />
      )}

    </div>
  );

  // Helper Renderer for Note Cards
  function renderNoteCard(note: NoteItem) {
    return (
      <div
        key={note.id}
        className={`note-card keep-color-${note.color}`}
        onClick={() => { setEditingNote(note); setShowSharePanel(false); setShowHistoryPanel(false); setShowMeetingPanel(false); }}
      >
        <button
          type="button"
          className={`note-card-pin${note.pinned ? ' pinned' : ''}`}
          onClick={e => {
            e.stopPropagation();
            togglePinNote(note.id);
          }}
        >
          <Icon name="star" size={18} />
        </button>

        {note.title && <div className="note-card-title">{note.title}</div>}
        {note.content && <div className="note-card-content">{note.content}</div>}

        {/* Checklist preview */}
        {note.checklist.length > 0 && (
          <div className="notes-checklist-builder" style={{ margin: '4px 0' }}>
            {note.checklist.slice(0, 5).map(item => (
              <div key={item.id} className="notes-checklist-item-row" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={!note.canEdit}
                  onChange={() => {
                    const updated = note.checklist.map(c => c.id === item.id ? { ...c, completed: !c.completed } : c);
                    updateNote(note.id, { checklist: updated });
                  }}
                />
                <span style={{ fontSize: 13, textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.6 : 1 }}>
                  {item.text}
                </span>
              </div>
            ))}
            {note.checklist.length > 5 && (
              <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 700 }}>
                + {note.checklist.length - 5} more items
              </div>
            )}
          </div>
        )}

        {/* Drawing thumbnail */}
        {note.drawing && (
          <div style={{ height: 100, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)' }}>
            <img src={note.drawing} alt="Sketch" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {/* Image attachments thumbnail gallery */}
        {note.images.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: note.images.length > 1 ? '1fr 1fr' : '1fr', gap: 4, height: 100, borderRadius: 6, overflow: 'hidden' }}>
            {note.images.slice(0, 2).map((img, i) => (
              <NoteImage key={i} src={img} alt="Attachment" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ))}
          </div>
        )}

        {/* Badges */}
        <div className="note-card-badges">
          {note.reminder && (
            <span className="note-badge-reminder">
              <Icon name="clock" size={12} />
              <span>{new Date(note.reminder).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </span>
          )}
          {note.labels.map(lblId => {
            const lbl = labels.find(l => l.id === lblId);
            return lbl ? <span key={lbl.id} className="note-badge-tag">{lbl.name}</span> : null;
          })}
          {note.subjectType && (
            noteLinkPath(note) ? (
              <Link
                to={noteLinkPath(note)!}
                className="note-badge-tag note-badge-category"
                style={{ textDecoration: 'none', cursor: 'pointer' }}
                title={`Open this ${categoryMeta(note.subjectType).label.toLowerCase().replace(/s$/, '')}`}
                onClick={e => e.stopPropagation()}
              >
                <Icon name={categoryMeta(note.subjectType).icon} size={11} /> {categoryMeta(note.subjectType).label}
                <Icon name="externalLink" size={9} />
              </Link>
            ) : (
              <span className="note-badge-tag note-badge-category">
                <Icon name={categoryMeta(note.subjectType).icon} size={11} /> {categoryMeta(note.subjectType).label}
              </span>
            )
          )}
        </div>

        {/* Who wrote it, and the note's real access level — a note can now
            actually be private or shared with a named list, not just
            tenant-wide (282_notes_enterprise.sql). Migrated legacy notes
            (createdBy null) just omit the avatar — no real author to show. */}
        <div className="note-card-footer" onClick={e => e.stopPropagation()}>
          {note.createdBy && peopleById[note.createdBy] && (
            <PersonAvatar userId={note.createdBy} name={peopleById[note.createdBy].name} size={18} title={peopleById[note.createdBy].name} />
          )}
          <span className="note-shared-indicator" title={VISIBILITY_META[note.visibility].hint}>
            <Icon name={VISIBILITY_META[note.visibility].icon} size={12} />
            {VISIBILITY_META[note.visibility].label}
            {note.visibility === 'shared' && note.shares.length > 0 ? ` (${note.shares.length})` : ''}
          </span>
          {note.legalHold && (
            <span className="note-shared-indicator" title="On legal hold — exempt from trash auto-purge">
              <Icon name="shield" size={12} /> Hold
            </span>
          )}
        </div>

        {/* Card Action Bar on Hover — content-mutating actions hidden for a
            view-only collaborator on a shared note (note.canEdit === false);
            they can still open, read and pin it. */}
        <div className="note-card-actions" onClick={e => e.stopPropagation()}>
          {note.trashed ? (
            note.canEdit && (
              <>
                <button
                  type="button"
                  className="notes-icon-btn"
                  title="Restore note"
                  onClick={() => restoreNote(note.id)}
                >
                  <Icon name="refresh" size={15} />
                </button>
                <button
                  type="button"
                  className="notes-icon-btn"
                  title="Delete forever"
                  onClick={() => permanentlyDeleteNote(note.id)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </>
            )
          ) : (
            <>
              {note.canEdit && (
                <>
                  <button
                    type="button"
                    className="notes-icon-btn"
                    title="Archive"
                    onClick={() => toggleArchiveNote(note.id)}
                  >
                    <Icon name="archive" size={15} />
                  </button>
                  <button
                    type="button"
                    className="notes-icon-btn"
                    title="Delete"
                    onClick={() => trashNote(note.id)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="notes-icon-btn"
                title="Duplicate"
                onClick={() => addNote({ ...note, title: `${note.title} (Copy)`, visibility: 'team', shares: [] })}
              >
                <Icon name="copy" size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
};

/* ── Renders a note image, whichever shape it's stored as: a legacy inline
   data URI (drawn straight into <img>) or a `drive:<fileId>` reference,
   resolved through the same authenticated fetch-then-blob-URL pattern
   Cloud's own usePreviewBlob uses — a plain <img src="…/preview"> can't
   carry the Authorization header that route needs. ── */
const NoteImage: React.FC<{ src: string; alt: string; style?: React.CSSProperties }> = ({ src, alt, style }) => {
  const isDrive = src.startsWith('drive:');
  const [resolved, setResolved] = useState<string | null>(isDrive ? null : src);

  useEffect(() => {
    if (!src.startsWith('drive:')) { setResolved(src); return; }
    let alive = true;
    let objectUrl: string | null = null;
    const fileId = src.slice('drive:'.length);
    apiFetchBlob(`/v1/files/${fileId}/preview`).then(blob => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(blob);
      setResolved(objectUrl);
    }).catch(() => {});
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);

  if (!resolved) return <div style={{ ...style, background: 'var(--bg)' }} />;
  return <img src={resolved} alt={alt} style={style} />;
};

/* ── Which categories can link to a SPECIFIC record, not just a category
   tag — subject_id (notes.routes.ts) has always accepted a real record id,
   but nothing in the frontend ever set it for a note created after
   266_notes_migrate_existing.sql's one-time backfill, so every "Related to"
   badge since has been decorative: it names an app, links to nothing.
   Scoped to the three categories with both a real ?search= endpoint AND a
   real navigable detail page today — customer (/v1/crm/search,
   /crm/customers?id=), invoice (/v1/invoices?search=, /finance/invoices?id=
   — that deep-link matched only invoice_number until this same change also
   fixed it to match the real id), and shipment (/v1/shipments?search=,
   /clearos/clearance/:id). The other 8 NOTE_CATEGORIES stay category-only:
   none of their pages have a per-record URL to link to at all (confirmed by
   checking each, not assumed) — building a specific-record picker for them
   would produce the exact same "looks connected, isn't" problem this is
   fixing. */
interface LinkedRecord { subjectType: string | null; subjectId: string | null; }

const LINKABLE_CATEGORIES: Record<string, {
  search: (q: string) => Promise<PickerItem[]>;
  resolve: (id: string) => Promise<PickerItem | null>;
  path: (id: string) => string;
}> = {
  customer: {
    search: async q => {
      const rows = await apiFetch(`/v1/crm/search?q=${encodeURIComponent(q)}`).catch(() => []);
      return (rows || []).filter((r: any) => r.kind === 'customer').map((r: any) => ({ id: r.id, label: r.name, sublabel: r.email || r.phone }));
    },
    resolve: async id => {
      const c = await apiFetch(`/v1/customers/${id}`).catch(() => null);
      return c ? { id: c.id, label: c.name, sublabel: c.email } : null;
    },
    path: id => `/crm/customers?id=${id}`,
  },
  invoice: {
    search: async q => {
      const rows = await apiFetch(`/v1/invoices?search=${encodeURIComponent(q)}`).catch(() => []);
      return (rows || []).map((r: any) => ({ id: r.id, label: r.invoice_number, sublabel: r.client_name }));
    },
    resolve: async id => {
      const inv = await apiFetch(`/v1/invoices/${id}`).catch(() => null);
      return inv ? { id: inv.id, label: inv.invoice_number, sublabel: inv.client_name } : null;
    },
    path: id => `/finance/invoices?id=${id}`,
  },
  shipment: {
    search: async q => {
      const res = await apiFetch(`/v1/shipments?search=${encodeURIComponent(q)}`).catch(() => ({ data: [] }));
      return (res.data || []).map((r: any) => ({ id: r.id, label: r.ref_number, sublabel: [r.bl_number || r.awb_number, r.customer_name].filter(Boolean).join(' · ') }));
    },
    resolve: async id => {
      const s = await apiFetch(`/v1/shipments/${id}`).catch(() => null);
      return s ? { id: s.id, label: s.ref_number, sublabel: s.customer_name } : null;
    },
    path: id => `/clearos/clearance/${id}`,
  },
};

/** Resolves where a note's "Related to" badge should navigate, or null if
 *  it's category-only (no specific record) or an unlinkable category. */
function noteLinkPath(note: { subjectType?: string | null; subjectId?: string | null }): string | null {
  if (!note.subjectType || !note.subjectId) return null;
  return LINKABLE_CATEGORIES[note.subjectType]?.path(note.subjectId) ?? null;
}

/* ── Category picker — tags a note with which app it's about (customer,
   shipment, calendar, drive, …), and for the three LINKABLE_CATEGORIES
   above, a specific record within it. Reuses the existing subject_type
   link 266_notes_migrate_existing.sql already populated for real migrated
   notes; this is what lets a note be manually related to an app (and now a
   real record) from inside the composer/editor too. ── */
const CategoryPicker: React.FC<{
  value: LinkedRecord;
  onChange: (v: LinkedRecord) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ value, onChange, open, onOpenChange }) => {
  const linkable = value.subjectType ? LINKABLE_CATEGORIES[value.subjectType] : null;
  const [recordItem, setRecordItem] = useState<PickerItem | null>(null);

  // Resolve an already-set subjectId to a real display label once, when
  // the popover opens — not on every render, and not for every note in a
  // list (that would be N+1 across the whole page); this only ever runs
  // for the single note currently open in the editor/composer.
  useEffect(() => {
    if (!open || !linkable || !value.subjectId) { setRecordItem(null); return; }
    let cancelled = false;
    linkable.resolve(value.subjectId).then(item => { if (!cancelled) setRecordItem(item); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, value.subjectType, value.subjectId]);

  const badgeLabel = value.subjectType
    ? (recordItem ? `${categoryMeta(value.subjectType).label}: ${recordItem.label}` : categoryMeta(value.subjectType).label)
    : null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <button
          type="button"
          className={`notes-icon-btn${value.subjectType ? ' active' : ''}`}
          title={badgeLabel ? `Related to ${badgeLabel}` : 'Relate to an app'}
          onClick={() => onOpenChange(!open)}
        >
          <Icon name="link" size={17} />
        </button>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-64 p-2">
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 6px 6px' }}>
          Related to
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 220, overflowY: 'auto' }}>
          <button
            type="button"
            className="notes-icon-btn"
            style={{ width: '100%', borderRadius: 6, justifyContent: 'flex-start', gap: 8, padding: '6px 8px', fontSize: 13, color: !value.subjectType ? 'var(--ink)' : 'var(--ink3)', fontWeight: !value.subjectType ? 700 : 500 }}
            onClick={() => { onChange({ subjectType: null, subjectId: null }); onOpenChange(false); }}
          >
            <Icon name="minusCircle" size={15} /> None
          </button>
          {NOTE_CATEGORIES.map(c => (
            <button
              key={c.id}
              type="button"
              className="notes-icon-btn"
              style={{ width: '100%', borderRadius: 6, justifyContent: 'flex-start', gap: 8, padding: '6px 8px', fontSize: 13, color: value.subjectType === c.id ? 'var(--ink)' : 'var(--ink3)', fontWeight: value.subjectType === c.id ? 700 : 500 }}
              onClick={() => {
                // Switching category always clears any previously-picked
                // record — an invoice id means nothing once the category
                // is 'shipment'. Stays open for a linkable category so the
                // record picker below is immediately usable; closes for
                // everything else, matching the old one-click behavior.
                onChange({ subjectType: c.id, subjectId: null });
                if (!LINKABLE_CATEGORIES[c.id]) onOpenChange(false);
              }}
            >
              <Icon name={c.icon} size={15} /> {c.label}
            </button>
          ))}
        </div>

        {linkable && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '0 6px 6px' }}>
              Specific {categoryMeta(value.subjectType).label.toLowerCase()}
            </div>
            <EntityPicker
              value={recordItem}
              onChange={item => { setRecordItem(item); onChange({ subjectType: value.subjectType, subjectId: item?.id ?? null }); }}
              search={linkable.search}
              placeholder={`Search ${categoryMeta(value.subjectType).label.toLowerCase()}…`}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/* ── Interactive Drawing Canvas Component ── */
const DrawingCanvasModal: React.FC<{ onClose: () => void; onSave: (dataUrl: string) => void }> = ({ onClose, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      onSave(canvas.toDataURL());
    }
  };

  return (
    <div className="notes-drawing-modal" onClick={onClose}>
      <div className="notes-drawing-card" onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>Handwritten Canvas Sketch</div>

        <canvas
          ref={canvasRef}
          width={680}
          height={380}
          className="notes-drawing-canvas"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />

        <div className="notes-drawing-tools">
          <div className="notes-swatch-group">
            {['#000000', '#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#ffffff'].map(c => (
              <button
                key={c}
                type="button"
                className={`pen-color-btn${penColor === c ? ' active' : ''}`}
                style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid #ccc' : 'none' }}
                onClick={() => setPenColor(c)}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink2)' }}>Thickness:</span>
            <input
              type="range"
              min="1"
              max="20"
              value={lineWidth}
              onChange={e => setLineWidth(Number(e.target.value))}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="outline" onClick={clearCanvas}>Clear</Button>
            <Button size="sm" onClick={handleSave}>Save to Note</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Share &amp; visibility panel — sets who a note is visible to. Only
   opened for the note's owner (gated where it's rendered, in the edit
   modal above), matching Keep's own model where only the owner manages
   collaborators even though an editor can freely change the content. ── */
const SharePanel: React.FC<{
  note: NoteItem;
  onClose: () => void;
  onChange: (visibility: NoteVisibility, shares: NoteShareEntry[]) => void;
}> = ({ note, onClose, onChange }) => {
  const [visibility, setVisibility] = useState<NoteVisibility>(note.visibility);
  const [shares, setShares] = useState<NoteShareEntry[]>(note.shares);
  const [resolvedPeople, setResolvedPeople] = useState<Record<string, Person>>({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);

  // Resolve display names for anyone already on the share list — they may
  // never have authored a note, so the tenant-wide peopleById cache
  // (usePeopleById, populated from note authors) won't already have them.
  useEffect(() => {
    const missing = shares.map(s => s.userId).filter(id => !resolvedPeople[id]);
    if (missing.length === 0) return;
    fetchPeople({ ids: missing }).then(people => {
      setResolvedPeople(prev => {
        const next = { ...prev };
        for (const p of people) next[p.id] = p;
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shares]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      fetchPeople({ q: query.trim(), limit: 8 }).then(people => {
        if (alive) setResults(people.filter(p => p.id !== note.createdBy && !shares.some(s => s.userId === p.id)));
      }).finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function addPerson(p: Person) {
    setResolvedPeople(prev => ({ ...prev, [p.id]: p }));
    setShares(prev => [...prev, { userId: p.id, permission: 'edit' }]);
    setQuery('');
    setResults([]);
  }
  function removePerson(userId: string) {
    setShares(prev => prev.filter(s => s.userId !== userId));
  }
  function setPermission(userId: string, permission: 'view' | 'edit') {
    setShares(prev => prev.map(s => s.userId === userId ? { ...s, permission } : s));
  }
  function save() {
    onChange(visibility, visibility === 'shared' ? shares : []);
    onClose();
  }

  return (
    <div className="notes-share-panel" onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Share &amp; visibility</div>
        <button type="button" className="notes-icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={14} /></button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(Object.keys(VISIBILITY_META) as NoteVisibility[]).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setVisibility(v)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${visibility === v ? 'var(--teal)' : 'var(--border)'}`,
              background: visibility === v ? 'color-mix(in srgb, var(--teal) 10%, transparent)' : 'transparent',
              color: visibility === v ? 'var(--teal)' : 'var(--ink2)',
            }}
          >
            <Icon name={VISIBILITY_META[v].icon} size={16} />
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>{VISIBILITY_META[v].label}</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 10 }}>{VISIBILITY_META[visibility].hint}</div>

      {visibility === 'shared' && (
        <div>
          {/* Async search-as-you-type is EntityPicker's usual case, but its
              result rows are plain label/sublabel text with no slot for a
              PersonAvatar — and CLAUDE.md requires a real photo on every
              "shared with" row. Swapping to EntityPicker would satisfy one
              design-system rule by breaking a more specific one, so this
              stays a Popover-based dropdown (same primitive, hand-built
              rows) rather than a raw absolutely-positioned div. */}
          <div style={{ marginBottom: 8 }}>
            <Popover open={query.trim().length > 0} onOpenChange={o => { if (!o) setQuery(''); }}>
              <PopoverAnchor asChild>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Add a person by name or email…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </PopoverAnchor>
              <PopoverContent align="start" className="w-(--radix-popover-trigger-width) max-h-50 overflow-y-auto p-1" onOpenAutoFocus={e => e.preventDefault()}>
                {searching && <div style={{ padding: 8, fontSize: 12.5, color: 'var(--ink3)' }}>Searching…</div>}
                {!searching && results.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addPerson(p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <PersonAvatar userId={p.id} name={p.name} size={20} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                      {p.email && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{p.email}</span>}
                    </div>
                  </button>
                ))}
                {!searching && results.length === 0 && (
                  <div style={{ padding: 8, fontSize: 12.5, color: 'var(--ink3)' }}>No matches.</div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {shares.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '4px 0' }}>Nobody added yet — this note is only visible to you until you add someone.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {shares.map(s => {
                const p = resolvedPeople[s.userId];
                return (
                  <div key={s.userId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p ? <PersonAvatar userId={p.id} name={p.name} size={22} /> : <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--bg)' }} />}
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.name ?? s.userId}</span>
                    <Select value={s.permission} onValueChange={v => setPermission(s.userId, v as 'view' | 'edit')}>
                      <SelectTrigger style={{ width: 'auto', minHeight: 26, fontSize: 12 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="edit">Can edit</SelectItem>
                        <SelectItem value="view">Can view</SelectItem>
                      </SelectContent>
                    </Select>
                    <button type="button" className="notes-icon-btn" title="Remove" onClick={() => removePerson(s.userId)}>
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button size="sm" onClick={save}>Save</Button>
      </div>
    </div>
  );
};

/* ── Version history panel — every content edit now snapshots the version
   it replaces (notes.service.ts's updateNote); this is where that becomes
   visible and restorable. Restoring is concurrency-guarded server-side —
   restoreNoteRevision() already refreshes the store with the real current
   note on a 409, so a conflict here just means "try again", not data loss. ── */
const HistoryPanel: React.FC<{
  note: NoteItem;
  onClose: () => void;
  onRestored: (note: NoteItem) => void;
}> = ({ note, onClose, onRestored }) => {
  const peopleById = usePeopleById();
  const [revisions, setRevisions] = useState<NoteRevision[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchNoteRevisions(note.id).then(revs => { if (alive) setRevisions(revs); });
    return () => { alive = false; };
  }, [note.id]);

  async function restore(rev: NoteRevision) {
    setRestoringId(rev.id);
    const result = await restoreNoteRevision(note.id, rev.id, note.updatedAt);
    setRestoringId(null);
    // Either way, restoreNoteRevision() already pushed the real current
    // note into the module store — propagate it into the modal's own local
    // state too so it reflects whatever is actually live now.
    if (result.note) onRestored(result.note);
    if (result.ok) {
      showAlert('Version restored.');
      onClose();
    }
  }

  return (
    <div className="notes-share-panel" onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Version history</div>
        <button type="button" className="notes-icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={14} /></button>
      </div>

      {revisions === null ? (
        <SectionLoading />
      ) : revisions.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '8px 0' }}>No earlier versions yet — every edit from here on is saved here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
          {revisions.map(rev => (
            <div key={rev.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)', minWidth: 0 }}>
                  {rev.changedBy && peopleById[rev.changedBy] ? (
                    <>
                      <PersonAvatar userId={rev.changedBy} name={peopleById[rev.changedBy].name} size={16} />
                      <span>{peopleById[rev.changedBy].name}</span>
                    </>
                  ) : <span>Unknown author</span>}
                  <span>· {new Date(rev.changedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <Button size="xs" variant="outline" disabled={restoringId === rev.id} onClick={() => restore(rev)}>
                  {restoringId === rev.id ? 'Restoring…' : 'Restore'}
                </Button>
              </div>
              {rev.title && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{rev.title}</div>}
              {rev.content && (
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                  {rev.content}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
