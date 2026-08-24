import React, { useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar, type SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { NotesApp } from '../pages/NotesApp.js';
import { NotesLabelsPage } from '../pages/NotesLabelsPage.js';
import { PageLayout } from '../components/PageLayout.js';
import { useNotes, useNoteLabels, loadNotes, useNotesSearchQuery, setNotesSearchQuery, categoryMeta } from '../data/notesStore.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';

/** `/notes/label/:labelId` — reads the id straight from the route rather
 *  than an internal-only filter state, same as every other app's sidebar. */
function NotesLabelRoute() {
  const { labelId } = useParams<{ labelId: string }>();
  return <NotesApp filter={`label:${labelId}`} />;
}

/** `/notes/category/:type` — same pattern, for the "which app is this note
 *  about" filter (see NOTE_CATEGORIES in notesStore.ts). */
function NotesCategoryRoute() {
  const { type } = useParams<{ type: string }>();
  return <NotesApp filter={`category:${type}`} />;
}

/** Wires the global header's search box to Notes' own search state — same
 *  appSearch/onAppSearchChange pattern as CloudShell's CloudHeader, so the
 *  page no longer needs its own local search input. */
function NotesHeader() {
  const query = useNotesSearchQuery();
  return (
    <AppHeader
      appSearch={query}
      onAppSearchChange={setNotesSearchQuery}
      appSearchPlaceholder="Search notes, tags, checklists…"
    />
  );
}

export function NotesShell() {
  // Fetched here too (not just inside NotesApp) so the sidebar's own label
  // list/counts are ready before the page underneath finishes loading.
  useEffect(() => { loadNotes(); }, []);
  const notes = useNotes();
  const labels = useNoteLabels();

  const activeCount = notes.filter(n => !n.archived && !n.trashed).length;
  const remindersCount = notes.filter(n => !n.archived && !n.trashed && !!n.reminder).length;
  const archiveCount = notes.filter(n => n.archived && !n.trashed).length;
  const trashCount = notes.filter(n => n.trashed).length;

  // Real counts only — a category only appears once a note is actually
  // tagged with it (either by 266_notes_migrate_existing.sql or by hand via
  // the composer's "Related to" picker), never a fabricated zero-count entry
  // for every possible app up front.
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      if (n.archived || n.trashed || !n.subjectType) continue;
      map.set(n.subjectType, (map.get(n.subjectType) ?? 0) + 1);
    }
    return map;
  }, [notes]);

  const NOTES_NAV: SidebarSection[] = useMemo(() => [
    {
      items: [
        { label: 'All Notes', path: '/notes', icon: 'document', exact: true, ...(activeCount > 0 ? { badge: String(activeCount), badgeVariant: 'count' as const } : {}) },
        { label: 'Reminders', path: '/notes/reminders', icon: 'clock', ...(remindersCount > 0 ? { badge: String(remindersCount), badgeVariant: 'count' as const } : {}) },
      ],
    },
    ...(categoryCounts.size > 0 ? [{
      title: 'Categories',
      items: Array.from(categoryCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => {
          const meta = categoryMeta(type);
          return { label: meta.label, path: `/notes/category/${type}`, icon: meta.icon, badge: String(count), badgeVariant: 'count' as const };
        }),
    }] : []),
    {
      title: 'Labels',
      items: [
        ...labels.map(l => ({ label: l.name, path: `/notes/label/${l.id}`, icon: 'tag' as const })),
        { label: 'Manage labels', path: '/notes/labels', icon: 'edit' as const },
      ],
    },
    {
      items: [
        { label: 'Archive', path: '/notes/archive', icon: 'archive', ...(archiveCount > 0 ? { badge: String(archiveCount), badgeVariant: 'count' as const } : {}) },
        { label: 'Trash', path: '/notes/trash', icon: 'trash', ...(trashCount > 0 ? { badge: String(trashCount), badgeVariant: 'count' as const } : {}) },
      ],
    },
  ], [labels, activeCount, remindersCount, archiveCount, trashCount, categoryCounts]);

  return (
    <WorkspaceApp appId="notes">
      <div className="app-shell" data-notes="true">
        <AppSidebar appId="notes" sections={NOTES_NAV} />
        <div className="app-main">
          <NotesHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<NotesApp filter="all" />} />
                <Route path="reminders" element={<NotesApp filter="reminders" />} />
                <Route path="archive" element={<NotesApp filter="archive" />} />
                <Route path="trash" element={<NotesApp filter="trash" />} />
                <Route path="label/:labelId" element={<NotesLabelRoute />} />
                <Route path="category/:type" element={<NotesCategoryRoute />} />
                <Route path="labels" element={<NotesLabelsPage />} />
                <Route path="*" element={<Navigate to="/notes" replace />} />
              </Route>
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}
