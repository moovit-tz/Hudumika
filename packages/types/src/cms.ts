// ── CMS: platform pages (Hudumika's own) + tenant OneSite pages ──────────

export type CmsPageStatus = 'draft' | 'published';

export interface CmsPage {
  id:              string;
  tenant_id:       string | null; // null = Hudumika platform page
  slug:            string;
  title:           string;
  content:         string; // sanitized HTML
  status:          CmsPageStatus;
  seo_description: string | null;
  author_id:       string | null;
  created_at:      string;
  updated_at:      string;
}

export interface CreateCmsPageInput {
  slug:             string;
  title:            string;
  content?:         string;
  status?:          CmsPageStatus;
  seo_description?: string | null;
}

export interface UpdateCmsPageInput {
  title?:            string;
  content?:          string;
  status?:           CmsPageStatus;
  seo_description?:  string | null;
}

// ── Posts ──────────────────────────────────────────────────────────────

export type CmsPostStatus = 'draft' | 'published' | 'trash';

export interface CmsPost {
  id:         string;
  tenant_id:  string;
  title:      string;
  content:    string;
  status:     CmsPostStatus;
  author_id:  string | null;
  category:   string | null;
  tags:       string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCmsPostInput {
  title:     string;
  content?:  string;
  status?:   CmsPostStatus;
  category?: string;
  tags?:     string;
}

export interface UpdateCmsPostInput {
  title?:    string;
  content?:  string;
  status?:   CmsPostStatus;
  category?: string;
  tags?:     string;
}

// ── Comments ───────────────────────────────────────────────────────────

export type CmsCommentStatus = 'approved' | 'pending' | 'spam';

export interface CmsComment {
  id:         string;
  tenant_id:  string;
  post_id:    string | null;
  author:     string;
  email:      string | null;
  content:    string;
  status:     CmsCommentStatus;
  created_at: string;
}

// ── Site settings (Customize) ─────────────────────────────────────────

export interface CmsSiteSettings {
  siteTitle:   string;
  tagline:     string;
  logoUrl:     string;
  faviconUrl:  string;
  accentColor: string;
  /** Read-only — the tenant's own slug, used to build the /site/:tenantSlug public URL. Never sent on PUT. */
  tenantSlug?: string;
}

// ── Public site (unauthenticated) ─────────────────────────────────────

export interface CmsPublicPageSummary {
  slug:  string;
  title: string;
}

export interface CmsPublicSite {
  tenantName: string;
  settings:   CmsSiteSettings;
  pages:      CmsPublicPageSummary[];
}
