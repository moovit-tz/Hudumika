import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover.js';
import { Button } from '../components/ui/button.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { showAlert } from '../lib/alert.js';
import { apiFetchBlob } from '../lib/api.js';
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
  NOTE_CATEGORIES,
  categoryMeta,
  type NoteItem,
  type KeepColor,
  type ChecklistItem,
  type NotesFilterId,
} from '../data/notesStore.js';
import './Notes.css';

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
  const [isChecklistMode, setIsChecklistMode] = useState(false);

  // Active Modals & Popovers State
  const [activeColorPopover, setActiveColorPopover] = useState<string | null>(null); // noteId or 'composer'
  const [activeLabelPopover, setActiveLabelPopover] = useState<string | null>(null); // noteId or 'composer'
  const [activeReminderPopover, setActiveReminderPopover] = useState<string | null>(null);
  const [activeCategoryPopover, setActiveCategoryPopover] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [showDrawingModal, setShowDrawingModal] = useState(false);

  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close composer when clicking outside if title/content empty. Radix
  // Popover content (ReminderPicker, CategoryPicker) renders through a
  // Portal straight onto document.body, so it's never a DOM descendant of
  // composerRef — without this check, picking a reminder or a category
  // read as an "outside" click and silently saved+reset the composer before
  // Done could be pressed. The label picker doesn't need this: it's a
  // hand-rolled absolutely-positioned div, still a real descendant of
  // composerRef, not portaled.
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
                      <button
                        type="button"
                        className="notes-icon-btn"
                        title="Add label"
                        onClick={() => setActiveLabelPopover(activeLabelPopover === 'composer' ? null : 'composer')}
                      >
                        <Icon name="tag" size={17} />
                      </button>

                      {activeLabelPopover === 'composer' && (
                        <div style={{ position: 'absolute', bottom: '100%', left: 0, background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 100 }}>
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
                        </div>
                      )}

                      {/* Related app — tags this note with which app it's
                          about (customer, shipment, calendar, drive, …),
                          same subject_type link 266_notes_migrate_existing.sql
                          used to bring in real notes from other apps. */}
                      <CategoryPicker
                        value={category}
                        onChange={setCategory}
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
          </div>
        </div>
      </div>

      {/* ── Note Edit Modal ── */}
      {editingNote && (
        <div className="notes-drawing-modal" onClick={() => setEditingNote(null)}>
          <div className={`notes-drawing-card keep-color-${editingNote.color}`} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <input
                type="text"
                className="notes-input-title"
                value={editingNote.title}
                onChange={e => {
                  const val = e.target.value;
                  setEditingNote(prev => prev ? { ...prev, title: val } : prev);
                  updateNote(editingNote.id, { title: val });
                }}
              />
              <button
                type="button"
                className={`notes-icon-btn${editingNote.pinned ? ' active' : ''}`}
                onClick={() => {
                  togglePinNote(editingNote.id);
                  setEditingNote(prev => prev ? { ...prev, pinned: !prev.pinned } : prev);
                }}
              >
                <Icon name="star" size={18} />
              </button>
            </div>

            {editingNote.createdBy && peopleById[editingNote.createdBy] && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink3)' }}>
                <PersonAvatar userId={editingNote.createdBy} name={peopleById[editingNote.createdBy].name} size={18} />
                <span>{peopleById[editingNote.createdBy].name} · shared with your whole team</span>
              </div>
            )}

            <textarea
              className="notes-input-body"
              style={{ minHeight: 140 }}
              value={editingNote.content}
              onChange={e => {
                const val = e.target.value;
                setEditingNote(prev => prev ? { ...prev, content: val } : prev);
                updateNote(editingNote.id, { content: val });
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
                      onChange={e => {
                        const text = e.target.value;
                        const updated = editingNote.checklist.map(c => c.id === item.id ? { ...c, text } : c);
                        setEditingNote(prev => prev ? { ...prev, checklist: updated } : prev);
                        updateNote(editingNote.id, { checklist: updated });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="notes-composer-toolbar">
              <div className="notes-tool-icons">
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
                  value={editingNote.subjectType ?? null}
                  onChange={type => {
                    updateNote(editingNote.id, { subjectType: type });
                    setEditingNote(prev => prev ? { ...prev, subjectType: type } : prev);
                  }}
                  open={activeCategoryPopover === editingNote.id}
                  onOpenChange={o => setActiveCategoryPopover(o ? editingNote.id : null)}
                />
              </div>

              <button type="button" className="notes-done-btn" onClick={() => setEditingNote(null)}>
                Close
              </button>
            </div>
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
        onClick={() => setEditingNote(note)}
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
            <span className="note-badge-tag note-badge-category">
              <Icon name={categoryMeta(note.subjectType).icon} size={11} /> {categoryMeta(note.subjectType).label}
            </span>
          )}
        </div>

        {/* Who wrote it, and the platform's real sharing model: every note
            in this tenant is visible to the whole team — there's no
            per-note ACL to show a specific "shared with" list for, so this
            says the true thing instead of fabricating one. Migrated legacy
            notes (createdBy null) just omit the avatar — no real author to
            show. */}
        <div className="note-card-footer" onClick={e => e.stopPropagation()}>
          {note.createdBy && peopleById[note.createdBy] && (
            <PersonAvatar userId={note.createdBy} name={peopleById[note.createdBy].name} size={18} title={peopleById[note.createdBy].name} />
          )}
          <span className="note-shared-indicator" title="Visible to everyone on your team">
            <Icon name="users" size={12} /> Team
          </span>
        </div>

        {/* Card Action Bar on Hover */}
        <div className="note-card-actions" onClick={e => e.stopPropagation()}>
          {note.trashed ? (
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
          ) : (
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
              <button
                type="button"
                className="notes-icon-btn"
                title="Duplicate"
                onClick={() => addNote({ ...note, title: `${note.title} (Copy)` })}
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

/* ── Category picker — tags a note with which app it's about (customer,
   shipment, calendar, drive, …). Reuses the existing subject_type link
   266_notes_migrate_existing.sql already populated for real migrated notes;
   this is what lets a note be manually related to an app from inside the
   composer/editor too. ── */
const CategoryPicker: React.FC<{
  value: string | null;
  onChange: (v: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ value, onChange, open, onOpenChange }) => {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <button
          type="button"
          className={`notes-icon-btn${value ? ' active' : ''}`}
          title={value ? `Related to ${categoryMeta(value).label}` : 'Relate to an app'}
          onClick={() => onOpenChange(!open)}
        >
          <Icon name="link" size={17} />
        </button>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-56 p-2">
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 6px 6px' }}>
          Related to
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 260, overflowY: 'auto' }}>
          <button
            type="button"
            className="notes-icon-btn"
            style={{ width: '100%', borderRadius: 6, justifyContent: 'flex-start', gap: 8, padding: '6px 8px', fontSize: 13, color: !value ? 'var(--ink)' : 'var(--ink3)', fontWeight: !value ? 700 : 500 }}
            onClick={() => { onChange(null); onOpenChange(false); }}
          >
            <Icon name="minusCircle" size={15} /> None
          </button>
          {NOTE_CATEGORIES.map(c => (
            <button
              key={c.id}
              type="button"
              className="notes-icon-btn"
              style={{ width: '100%', borderRadius: 6, justifyContent: 'flex-start', gap: 8, padding: '6px 8px', fontSize: 13, color: value === c.id ? 'var(--ink)' : 'var(--ink3)', fontWeight: value === c.id ? 700 : 500 }}
              onClick={() => { onChange(c.id); onOpenChange(false); }}
            >
              <Icon name={c.icon} size={15} /> {c.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/* ── Reminder picker — a real datetime the user chooses, via the shared
   Popover primitive rather than a hand-rolled absolutely-positioned div. ── */
const ReminderPicker: React.FC<{
  value: string | null;
  onChange: (v: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ value, onChange, open, onOpenChange }) => {
  const [draft, setDraft] = useState(() => (value ? value.slice(0, 16) : ''));

  useEffect(() => { if (open) setDraft(value ? value.slice(0, 16) : ''); }, [open, value]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <button
          type="button"
          className={`notes-icon-btn${value ? ' active' : ''}`}
          title={value ? 'Change reminder' : 'Add reminder'}
          onClick={() => onOpenChange(!open)}
        >
          <Icon name="clock" size={17} />
        </button>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-64 p-3">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
          Remind me
        </div>
        <input
          type="datetime-local"
          className="input-field"
          style={{ width: '100%', boxSizing: 'border-box' }}
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
          {value ? (
            <Button size="xs" variant="ghost" onClick={() => { onChange(null); onOpenChange(false); }}>Remove</Button>
          ) : <span />}
          <Button
            size="xs"
            disabled={!draft}
            onClick={() => {
              if (!draft) return;
              onChange(new Date(draft).toISOString());
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </div>
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
