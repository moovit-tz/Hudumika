// ─── draftStore.ts — local-only autosave for an in-progress envelope ──────
// SignEditor's document/title/recipients/fields live in React state until a
// real Save/Send persists them server-side — a reload before that loses all
// of it. IndexedDB (not localStorage) holds the draft: a freshly-uploaded
// document is a base64 data URL that can run into several MB, comfortably
// past localStorage's ~5MB per-origin quota, where IndexedDB has no such
// ceiling in practice. Keyed by envelopeId when editing an existing draft,
// or the fixed key 'new' for a not-yet-created envelope — recovering "I was
// mid-edit on this envelope" and "I hadn't saved this new one yet" are both
// the same shape of problem.
const DB_NAME = 'hudumika-sign-drafts';
const STORE = 'drafts';

export interface SignDraft {
  title: string;
  message: string;
  orderMode: 'sequential' | 'parallel';
  requireOtp: boolean;
  fileName: string | null;
  documentData: string | null;
  sourceFileId: string | null;
  recipients: unknown[];
  fields: unknown[];
  pendingChangeSummary: { summary: string; details?: unknown } | null;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function draftKey(envelopeId: string | undefined): string {
  return envelopeId ?? 'new';
}

export async function saveDraft(key: string, draft: SignDraft): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(draft, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Best-effort — a private-browsing tab or a quota error should never
    // block editing, just silently mean nothing was cached this time.
  }
}

export async function loadDraft(key: string): Promise<SignDraft | null> {
  try {
    const db = await openDb();
    const draft = await new Promise<SignDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return draft;
  } catch {
    return null;
  }
}

export async function clearDraft(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Nothing to do — the draft will just linger harmlessly until overwritten.
  }
}

// A draft counts as worth keeping/restoring only once it diverges from the
// blank "just opened the editor" state — otherwise every fresh visit would
// write (and later "restore") an empty shell.
export function isMeaningfulDraft(d: Pick<SignDraft, 'title' | 'documentData' | 'sourceFileId' | 'recipients' | 'fields'>): boolean {
  const hasRecipientContent = Array.isArray(d.recipients) && d.recipients.some((r) => {
    const rec = r as { name?: string; email?: string };
    return !!(rec.name?.trim() || rec.email?.trim());
  });
  return !!(d.title.trim() || d.documentData || d.sourceFileId || hasRecipientContent || (Array.isArray(d.fields) && d.fields.length > 0));
}
