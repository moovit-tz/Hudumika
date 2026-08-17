export const CATEGORY_EXT = {
  documents: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'ppt', 'txt', 'xml'],
  images: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  media: ['mp4', 'mp3', 'mov', 'avi', 'wav'],
} as const;

export type Category = 'documents' | 'images' | 'media' | 'other';

export function categoryOf(type: string): Category {
  const t = (type || '').toLowerCase();
  if ((CATEGORY_EXT.documents as readonly string[]).includes(t)) return 'documents';
  if ((CATEGORY_EXT.images as readonly string[]).includes(t)) return 'images';
  if ((CATEGORY_EXT.media as readonly string[]).includes(t)) return 'media';
  return 'other';
}

export interface CategoryBreakdown {
  documents: { count: number; bytes: number };
  images: { count: number; bytes: number };
  media: { count: number; bytes: number };
  other: { count: number; bytes: number };
}

/**
 * Leaf files only — a folder's own `size` is a rolled-up total of its
 * children (see files.routes.ts's bumpParentCount), so including folder
 * rows here would double-count every file once directly and again through
 * each ancestor folder above it.
 */
export function categorizeBytes(files: { type: string; size: number | null }[]): CategoryBreakdown {
  const out: CategoryBreakdown = {
    documents: { count: 0, bytes: 0 },
    images: { count: 0, bytes: 0 },
    media: { count: 0, bytes: 0 },
    other: { count: 0, bytes: 0 },
  };
  for (const f of files) {
    if (f.type === 'folder') continue;
    const cat = out[categoryOf(f.type)];
    cat.count += 1;
    cat.bytes += f.size ?? 0;
  }
  return out;
}
