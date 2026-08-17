import type { IconName } from '../../../components/Icon.js';

export type FeaturedIconVariant = 'brand' | 'gray' | 'success' | 'warning' | 'error' | 'info';

export interface FileTypeStyle {
  icon: IconName;
  variant: FeaturedIconVariant;
  label: string;
}

/**
 * FeaturedIcon/Badge only expose 6 variants — no dedicated "purple" — so
 * images/video (this app's old bespoke palette used purple for both) fold
 * into 'brand', the same compression MetricCard.tsx's own COLOR_VARIANT map
 * already precedents for exactly this gap.
 */
export const FILE_TYPE_STYLE: Record<string, FileTypeStyle> = {
  folder: { icon: 'folder', variant: 'warning', label: 'Folder' },
  pdf: { icon: 'file', variant: 'error', label: 'PDF' },
  doc: { icon: 'fileText', variant: 'info', label: 'Word' },
  docx: { icon: 'fileText', variant: 'info', label: 'Word' },
  xls: { icon: 'barChart', variant: 'success', label: 'Excel' },
  xlsx: { icon: 'barChart', variant: 'success', label: 'Excel' },
  csv: { icon: 'barChart', variant: 'success', label: 'CSV' },
  ppt: { icon: 'layers', variant: 'warning', label: 'Slides' },
  pptx: { icon: 'layers', variant: 'warning', label: 'Slides' },
  zip: { icon: 'briefcase', variant: 'warning', label: 'Archive' },
  rar: { icon: 'briefcase', variant: 'warning', label: 'Archive' },
  txt: { icon: 'fileText', variant: 'gray', label: 'Text' },
  xml: { icon: 'fileText', variant: 'info', label: 'XML' },
  png: { icon: 'camera', variant: 'brand', label: 'Image' },
  jpg: { icon: 'camera', variant: 'brand', label: 'Image' },
  jpeg: { icon: 'camera', variant: 'brand', label: 'Image' },
  gif: { icon: 'camera', variant: 'brand', label: 'GIF' },
  webp: { icon: 'camera', variant: 'brand', label: 'Image' },
  mp4: { icon: 'monitor', variant: 'brand', label: 'Video' },
  mov: { icon: 'monitor', variant: 'brand', label: 'Video' },
  avi: { icon: 'monitor', variant: 'brand', label: 'Video' },
  mp3: { icon: 'headphones', variant: 'info', label: 'Audio' },
  wav: { icon: 'headphones', variant: 'info', label: 'Audio' },
};

const DEFAULT_STYLE: FileTypeStyle = { icon: 'fileText', variant: 'gray', label: 'File' };

export function fileTypeStyle(type: string): FileTypeStyle {
  return FILE_TYPE_STYLE[(type || '').toLowerCase()] ?? DEFAULT_STYLE;
}

export type PreviewKind = 'image' | 'pdf' | 'video' | null;

const IMAGE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const VIDEO_TYPES = new Set(['mp4', 'mov', 'avi']);

/** What kind of inline viewer (if any) this file type supports. Everything
 *  else (Office docs, archives, audio, etc.) has no zero-dependency way to
 *  render inline — that's an honest limitation, not an oversight, and those
 *  types keep the icon+metadata-only view. */
export function previewKind(type: string): PreviewKind {
  const t = (type || '').toLowerCase();
  if (IMAGE_TYPES.has(t)) return 'image';
  if (t === 'pdf') return 'pdf';
  if (VIDEO_TYPES.has(t)) return 'video';
  return null;
}
