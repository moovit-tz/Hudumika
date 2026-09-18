// ── CMS: platform pages (Hudumika's own) + tenant OneSite pages ──────────

export type CmsPageStatus = 'draft' | 'published' | 'scheduled' | 'trash';
/** §11 — 'standard' keeps the site header/nav and reading-width column;
 *  'full-width' keeps the header/nav but drops the max-width constraint;
 *  'landing' drops the header/nav entirely for a standalone marketing page. */
export type CmsPageTemplate = 'standard' | 'full-width' | 'landing';

export interface CmsPage {
  id:              string;
  tenant_id:       string | null; // null = Hudumika platform page
  site_id?:        string | null; // §23 Multisite
  slug:            string;
  title:           string;
  content:         string; // sanitized HTML
  status:          CmsPageStatus;
  template:        CmsPageTemplate;
  seo_description: string | null;
  /** §27 — overrides the real public URL as the canonical link when set (e.g. this content is also published elsewhere). Empty/null means "use the real URL," the correct default for almost every page. */
  canonical_url:   string | null;
  /** §27 — real "don't index this" control, rendered as <meta name="robots" content="noindex"> on the public page. */
  noindex:         boolean;
  /** §27 — Open Graph image for social link previews; falls back to the site's own logo when unset. */
  og_image:        string | null;
  author_id:       string | null;
  /** Only meaningful when status === 'scheduled' — when the auto-publish job flips it to 'published'. */
  publish_at:      string | null;
  /** Only meaningful when status === 'trash' — when cms-trash-purge.job.ts's 30-day sweep permanently deletes it. */
  trashed_at:      string | null;
  locale?:         string; // §25-26 Localization
  translation_group_id?: string;
  /** §28-29 hreflang — the OTHER published members of this page's translation
   *  group (never includes this page itself); only populated by the public
   *  GET route, undefined everywhere else (admin list/detail never fetch it,
   *  to avoid an N+1 lookup on every page in a list). */
  translations?:   { locale: string; url: string }[];
  created_at:      string;
  updated_at:      string;
}

export interface CreateCmsPageInput {
  slug:             string;
  title:            string;
  site_id?:         string | null;
  content?:         string;
  status?:          CmsPageStatus;
  template?:        CmsPageTemplate;
  seo_description?: string | null;
  canonical_url?:   string | null;
  noindex?:         boolean;
  og_image?:        string | null;
  publish_at?:      string | null;
  locale?:          string;
  translation_group_id?: string | null;
}

export interface UpdateCmsPageInput {
  title?:            string;
  site_id?:          string | null;
  content?:          string;
  status?:           CmsPageStatus;
  template?:         CmsPageTemplate;
  seo_description?:  string | null;
  canonical_url?:    string | null;
  noindex?:          boolean;
  og_image?:         string | null;
  publish_at?:       string | null;
  locale?:           string;
  translation_group_id?: string | null;
}

// ── Posts ──────────────────────────────────────────────────────────────

export type CmsPostStatus = 'draft' | 'published' | 'scheduled' | 'trash';

export interface CmsPost {
  id:         string;
  tenant_id:  string;
  site_id?:   string | null; // §23 Multisite
  slug:       string;
  title:      string;
  content:    string;
  status:     CmsPostStatus;
  author_id:  string | null;
  category:   string | null;
  tags:       string | null;
  /** Added in the same §27 pass that gave Pages the field — Posts never actually had it despite an earlier claim otherwise. */
  seo_description: string | null;
  canonical_url:   string | null;
  noindex:         boolean;
  og_image:        string | null;
  /** Only meaningful when status === 'scheduled'. */
  publish_at: string | null;
  /** Only meaningful when status === 'trash' — when cms-trash-purge.job.ts's 30-day sweep permanently deletes it. */
  trashed_at: string | null;
  locale?:    string; // §25-26 Localization
  translation_group_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCmsPostInput {
  slug?:      string;
  site_id?:   string | null;
  title:      string;
  content?:   string;
  status?:    CmsPostStatus;
  category?:  string;
  tags?:      string;
  seo_description?: string | null;
  canonical_url?:   string | null;
  noindex?:         boolean;
  og_image?:        string | null;
  publish_at?: string | null;
  locale?:    string;
  translation_group_id?: string | null;
  /** §56-57 — a WordPress import needs to preserve the original post's own
   *  publish date (blog chronology/archives depend on it), not stamp every
   *  imported post with "now." Every other caller omits this and gets the
   *  normal DB default. */
  created_at?: string;
}

export interface UpdateCmsPostInput {
  slug?:      string;
  site_id?:   string | null;
  title?:     string;
  content?:   string;
  status?:    CmsPostStatus;
  category?:  string;
  tags?:      string;
  seo_description?: string | null;
  canonical_url?:   string | null;
  noindex?:         boolean;
  og_image?:        string | null;
  publish_at?: string | null;
  locale?:    string;
  translation_group_id?: string | null;
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

// ── Media library ──────────────────────────────────────────────────────

export interface CmsMedia {
  id:          string;
  tenant_id:   string;
  site_id?:    string | null;
  filename:    string;
  /** Publicly servable URL — GET /v1/cms/public/media/:id, no auth needed
   *  (rendered both in the admin editor and on a tenant's public site). */
  url:         string;
  /** §21-22 — a resized WebP variant, generated on upload where the image
   *  type supports it (never SVG). Null means generation failed or the
   *  type doesn't apply — callers fall back to `url` for the thumbnail
   *  slot, never treat a missing thumbnail as a broken upload. */
  thumbnail_url: string | null;
  /** §21-22 — a single flat label, not a real folder tree; null = unfiled. */
  folder:      string | null;
  /** §21-22 — comma-separated, the same plain-TEXT convention CmsPost.tags already uses. */
  tags:        string | null;
  mime_type:   string;
  size:        number;
  uploaded_by: string | null;
  created_at:  string;
}

export interface UpdateCmsMediaInput {
  folder?: string | null;
  tags?:   string | null;
  site_id?: string | null;
}

// ── Site settings (Customize) ─────────────────────────────────────────

// §10 — Design tokens (content-facing). A deliberately small, bounded set —
// not "every design token," which has no natural stopping point — of the
// tokens a tenant can actually see change on their own public site: the
// brand color (already real, below), a heading and body font each drawn
// from the same real, already-vetted font list the platform's own internal
// SuperAdmin design system offers (`useDesignSystem.ts`'s FontId), and a
// corner-radius preset matching that same system's own sharp/rounded/pill
// shape language. A raw font-URL or arbitrary CSS value from a tenant is
// deliberately not accepted — an allow-listed id is validated the same way
// server-side (the zod schema) and client-side (the picker only ever offers
// these five), so there's no CSS/URL injection surface here at all.
export const CMS_FONT_IDS = ['system', 'georgia', 'dm-sans', 'inter', 'cormorant'] as const;
export type CmsFontId = typeof CMS_FONT_IDS[number];

export const CMS_RADIUS_PRESETS = ['sharp', 'rounded', 'pill'] as const;
export type CmsRadiusPreset = typeof CMS_RADIUS_PRESETS[number];

export interface CmsSiteSettings {
  siteTitle:   string;
  tagline:     string;
  logoUrl:     string;
  faviconUrl:  string;
  accentColor: string;
  headingFont: CmsFontId;
  bodyFont:    CmsFontId;
  radius:      CmsRadiusPreset;
  /** Read-only — the tenant's own slug, used to build the /site/:tenantSlug public URL. Never sent on PUT. */
  tenantSlug?: string;
}

// ── Multisite (§23) ───────────────────────────────────────────────────

export interface CmsSite {
  id:          string;
  tenant_id:   string;
  slug:        string;
  name:        string;
  domain:      string | null;
  is_default:  boolean;
  settings:    Record<string, unknown>;
  created_at:  string;
  updated_at:  string;
}

export interface CreateCmsSiteInput {
  slug:        string;
  name:        string;
  domain?:     string | null;
  is_default?: boolean;
  settings?:   Record<string, unknown>;
}

export interface UpdateCmsSiteInput {
  slug?:       string;
  name?:       string;
  domain?:     string | null;
  is_default?: boolean;
  settings?:   Record<string, unknown>;
}

// ── Webhooks (§78) ────────────────────────────────────────────────────
// Real outbound events — content.published-shaped notifications a tenant's
// own integration can subscribe to. Deliberately best-effort: fire-and-
// forget with no retry queue or delivery log yet (disclosed, not hidden).

export type CmsWebhookEvent = 'page.published' | 'post.published' | 'entry.published' | 'media.uploaded';

export interface CmsWebhook {
  id:         string;
  tenant_id:  string;
  url:        string;
  /** Only ever returned once, right after creation — never re-sent on a later GET. Used to compute the X-Hudumika-Signature HMAC on the receiving end. */
  secret?:    string;
  events:     CmsWebhookEvent[];
  enabled:    boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCmsWebhookInput {
  url:     string;
  /** Optional to match the real zod schema and the service's own runtime
   *  handling (`input.events ?? []`) — a webhook created with none simply
   *  never fires until events are added via a later PATCH. */
  events?: CmsWebhookEvent[];
}
export interface UpdateCmsWebhookInput {
  url?:     string;
  events?:  CmsWebhookEvent[];
  enabled?: boolean;
}

// ── Role capabilities (§74) ─────────────────────────────────────────────
// Today access is binary: 'onesite' entitlement + non-CUSTOMER role = full
// access to every CMS area. This is the configurable layer on top —
// additive, not a rewrite: a role/area combination with no row here stays
// fully unrestricted (every tenant's current access, unchanged), and
// ADMIN always bypasses this entirely regardless of what's configured.

export type CmsCapabilityArea = 'pages' | 'posts' | 'comments' | 'media' | 'content' | 'settings' | 'workflow' | 'releases' | 'approvals' | 'sites';

export interface CmsRoleCapability {
  id:          string;
  tenant_id:   string;
  role:        string;
  area:        CmsCapabilityArea;
  can_view:    boolean;
  can_manage:  boolean; // create/edit/delete
  can_publish: boolean;
  updated_by:  string | null;
  created_at:  string;
  updated_at:  string;
}

export interface UpdateCmsRoleCapabilityInput {
  can_view?:    boolean;
  can_manage?:  boolean;
  can_publish?: boolean;
}

// ── Navigation builder (§14) ────────────────────────────────────────────

export interface CmsNavItem {
  id:         string;
  tenant_id:  string;
  site_id?:   string | null;
  label:      string;
  /** A relative path ("/about", "/site/:tenantSlug/blog" segment) or an absolute external URL — not a foreign key, so it can point anywhere a real menu item would. */
  target:     string;
  parent_id:  string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCmsNavItemInput {
  label:      string;
  target:     string;
  parent_id?: string | null;
  site_id?:   string | null;
}
export type UpdateCmsNavItemInput = Partial<CreateCmsNavItemInput>;

/** Public — a nav item nested one level under its parent, for the header to render directly. */
export interface CmsPublicNavItem {
  id:       string;
  label:    string;
  target:   string;
  children: CmsPublicNavItem[];
}

// ── Public site (unauthenticated) ─────────────────────────────────────

export interface CmsPublicPageSummary {
  slug:  string;
  title: string;
}

export interface CmsPublicPostSummary {
  slug:       string;
  title:      string;
  category:   string | null;
  /** Plain-text snippet derived from content — not a separately authored field. */
  excerpt:    string;
  created_at: string;
  author_id?:   string | null;
  /** Resolved server-side (same leftJoin pattern cms-revisions.service.ts uses) — never a bare id on the public site. */
  author_name?: string | null;
}

/** One calendar month that has at least one published post, for the blog's
 *  Archive list (§36) — covers every published post, not just the ~50 the
 *  site index itself caps at. */
export interface CmsPublicArchiveMonth {
  year:  number;
  month: number;
  count: number;
}

// ── Public search (§32) ──────────────────────────────────────────────────

export interface CmsPublicSearchResult {
  type:       'page' | 'post';
  slug:       string;
  title:      string;
  excerpt:    string;
  category:   string | null; // posts only — always null for a page
  created_at: string;
}

export interface CmsPublicPost {
  /** §33 — real internal id, not otherwise exposed on this public shape; needed by the pageview beacon. */
  id:         string;
  slug:       string;
  title:      string;
  content:    string;
  category:   string | null;
  tags:       string | null;
  created_at: string;
  author_id:   string | null;
  author_name: string | null;
  seo_description: string | null;
  canonical_url:   string | null;
  noindex:         boolean;
  og_image:        string | null;
  /** §25-26 Localization / §28-29 hreflang — see CmsPage's own field for what these mean; posts didn't carry either at all until this pass. */
  locale:          string;
  translation_group_id: string | null;
  translations:    { locale: string; url: string }[];
}

// ── Blog comments (§37) ──────────────────────────────────────────────────

export interface CmsPublicComment {
  id:         string;
  author:     string;
  content:    string;
  created_at: string;
}

export interface CreateCmsCommentInput {
  author:   string;
  email?:   string;
  content:  string;
  /** Honeypot — a real visitor never sees or fills this field (hidden via CSS); the server silently accepts-but-discards any submission where it's non-empty. */
  website?: string;
}

export interface CmsPublicSite {
  tenantName: string;
  settings:   CmsSiteSettings;
  pages:      CmsPublicPageSummary[];
  posts:      CmsPublicPostSummary[];
  /** Admin-configured menu (§14) — empty when the tenant hasn't set one up, in which case the public header falls back to its original default (just a Blog link, when there are posts). */
  navItems:   CmsPublicNavItem[];
}

// ── Content Models (§2 of the CMS master brief) ─────────────────────────

export type CmsFieldType =
  | 'text' | 'textarea' | 'richtext' | 'number' | 'boolean'
  | 'date' | 'datetime' | 'email' | 'url' | 'select' | 'tags' | 'image' | 'relation'
  | 'blocks' | 'coordinates' | 'color' | 'phone' | 'currency' | 'repeatable' | 'computed';

export type CmsRepeatableItemType = 'text' | 'number' | 'url' | 'email';

// A 'computed' field's own config: {formula: string} — a small, safe
// arithmetic-only expression (+ - * / and parentheses, numeric literals,
// and {fieldKey} references to sibling fields on the same model), never
// a real expression language and never eval()/new Function() on anything
// tenant-authored. Deliberately can't reference another 'computed' field
// (no chained computation, no evaluation-order problem to solve) — see
// cms-content.service.ts's evaluateFormula/checkComputedConfig.

// ── Block Editor (§5) ────────────────────────────────────────────────────
export type CmsBlockType = 'paragraph' | 'heading' | 'image' | 'list' | 'quote' | 'button' | 'divider' | 'component' | 'form' | 'experiment';

// §34 — a personalization rule attachable to ANY block, not one more
// per-type prop — a "rules layer on top of the renderer," per the master
// brief's own framing of this row. Three real, browser-observable signals,
// not a fabricated "audience segment" this codebase has no real data to
// back: which localStorage-tracked visitor bucket this browser is in (the
// same sticky-assignment mechanism §35's own experiments already use),
// a substring of document.referrer, and a substring of the ?utm_source=
// query param. Every condition actually set must pass (AND) for the block
// to render; a block with no visibility at all always renders, unchanged
// from before this existed. Evaluated only on the real public site
// (BlockPreview.tsx's evaluateBlockVisibility) — the admin canvas/preview
// always shows every block regardless, with a disclosure badge instead.
export interface CmsBlockVisibility {
  visitorType?: 'new' | 'returning';
  referrerContains?: string;
  utmSource?: string;
}

export interface CmsBlock {
  id:   string;
  type: CmsBlockType;
  props: Record<string, unknown>;
  visibility?: CmsBlockVisibility;
}

// ── Component system (§8) ────────────────────────────────────────────────
export interface CmsComponent {
  id:         string;
  tenant_id:  string;
  key:        string;
  name:       string;
  blocks:     CmsBlock[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCmsComponentInput {
  key:     string;
  name:    string;
  blocks?: CmsBlock[];
}
export interface UpdateCmsComponentInput {
  name?:   string;
  blocks?: CmsBlock[];
}

export interface CmsContentModel {
  id:          string;
  tenant_id:   string;
  key:         string;
  name:        string;
  name_plural: string;
  description: string | null;
  icon:        string;
  created_by:  string | null;
  created_at:  string;
  updated_at:  string;
  fields?:     CmsContentField[];
  entry_count?: number;
}

export interface CmsContentField {
  id:         string;
  tenant_id:  string;
  model_id:   string;
  key:        string;
  label:      string;
  field_type: CmsFieldType;
  required:   boolean;
  help_text:  string | null;
  /** Type-specific shape (select options, relation target, …) PLUS two
   *  universal display flags every field type understands regardless of
   *  its own config: `showInList` (opt-in — the public collection index
   *  shows nothing but title/date by default) and `hideInDetail` (opt-out
   *  — the public detail view shows every field with a value by default). */
  config:     Record<string, unknown>;
  sort_order: number;
}

export interface CreateCmsContentModelInput {
  key:          string;
  name:         string;
  name_plural:  string;
  description?: string | null;
  icon?:        string;
}

export interface CreateCmsContentFieldInput {
  key?:        string;
  label:       string;
  field_type:  CmsFieldType;
  required?:   boolean;
  help_text?:  string | null;
  config?:     Record<string, unknown>;
  sort_order?: number;
}
export type UpdateCmsContentFieldInput = Partial<CreateCmsContentFieldInput>;

export type CmsEntryStatus = 'draft' | 'published' | 'scheduled' | 'trash';

export interface CmsContentEntry {
  id:              string;
  tenant_id:       string;
  site_id?:        string | null;
  model_id:        string;
  slug:            string;
  title:           string;
  status:          CmsEntryStatus;
  data:            Record<string, unknown>;
  seo_description: string | null;
  author_id:       string | null;
  publish_at:      string | null;
  locale?:         string;
  translation_group_id?: string;
  created_at:      string;
  updated_at:      string;
}

export interface CreateCmsContentEntryInput {
  slug?:            string;
  site_id?:         string | null;
  title:            string;
  status?:          CmsEntryStatus;
  data?:            Record<string, unknown>;
  seo_description?: string | null;
  publish_at?:      string | null;
  locale?:          string;
  translation_group_id?: string;
}
export type UpdateCmsContentEntryInput = Partial<CreateCmsContentEntryInput>;

// ── Saved filters (§4) ──────────────────────────────────────────────────
export interface CmsSavedFilter {
  id:         string;
  tenant_id:  string;
  model_id:   string;
  name:       string;
  status:     string | null;
  search:     string | null;
  created_by: string | null;
  created_at: string;
}
export interface CreateCmsSavedFilterInput {
  name:    string;
  status?: string | null;
  search?: string | null;
}

/** Public — a published entry rendered on a tenant's dynamic template route. */
export interface CmsPublicContentEntry {
  /** §33 — real internal id, not otherwise exposed on this public shape; needed by the pageview beacon. */
  id:         string;
  slug:       string;
  title:      string;
  data:       Record<string, unknown>;
  created_at: string;
  model: { key: string; name: string; fields: Pick<CmsContentField, 'key' | 'label' | 'field_type' | 'config'>[] };
  components?: Record<string, CmsBlock[]>;
}

export interface CmsPublicContentEntrySummary {
  slug:       string;
  title:      string;
  created_at: string;
  /** §12-13 — values for whichever fields the admin flagged `config.showInList`
   *  on the Content Model editor; omitted entirely when no field is flagged,
   *  matching this route's original (list-shows-nothing-but-title) shape so
   *  a model that's never touched this setting renders identically to before. */
  fields?:    Record<string, unknown>;
}

// ── Revisions (§19) ───────────────────────────────────────────────────────

export type CmsRevisionResourceType = 'page' | 'post' | 'entry';

export interface CmsRevision {
  id:            string;
  tenant_id:     string;
  resource_type: CmsRevisionResourceType;
  resource_id:   string;
  snapshot:      Record<string, unknown>;
  author_id:     string | null;
  author_name:   string | null;
  created_at:    string;
}

// ── Configurable Workflow (§15) ──────────────────────────────────────────

export interface CmsWorkflowState {
  id:           string;
  tenant_id:    string;
  site_id?:     string | null;
  slug:         string;
  name:         string;
  color:        string;
  sort_order:   number;
  is_initial:   boolean;
  is_published: boolean;
  created_at:   string;
  updated_at:   string;
}

export interface CreateCmsWorkflowStateInput {
  slug:          string;
  name:          string;
  color?:        string;
  sort_order?:   number;
  is_initial?:   boolean;
  is_published?: boolean;
  site_id?:      string | null;
}

export interface UpdateCmsWorkflowStateInput {
  name?:         string;
  color?:        string;
  sort_order?:   number;
  is_initial?:   boolean;
  is_published?: boolean;
  site_id?:      string | null;
}

export interface CmsWorkflowTransition {
  id:                string;
  tenant_id:         string;
  site_id?:          string | null;
  from_state_id:     string;
  to_state_id:       string;
  name:              string | null;
  allowed_roles:     string[];
  requires_approval: boolean;
  created_at:        string;
  from_state?:       CmsWorkflowState;
  to_state?:         CmsWorkflowState;
}

export interface CreateCmsWorkflowTransitionInput {
  from_state_id:     string;
  to_state_id:       string;
  name?:             string | null;
  allowed_roles?:    string[];
  required_role?:    string | null;
  requires_approval?: boolean;
  require_approval?:  boolean;
  site_id?:          string | null;
}

// ── Approvals (§16) ──────────────────────────────────────────────────────

export type CmsApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface CmsApproval {
  id:             string;
  tenant_id:      string;
  resource_type:  'page' | 'post' | 'entry';
  resource_id:    string;
  assigned_to:    string;
  assigned_to_name?: string | null;
  assigned_by:    string | null;
  assigned_by_name?: string | null;
  status:         CmsApprovalStatus;
  due_date:       string | null;
  decision_at:    string | null;
  decision_note:  string | null;
  resource_title?: string;
  created_at:     string;
  updated_at:     string;
}

export interface RequestCmsApprovalInput {
  resource_type: 'page' | 'post' | 'entry';
  resource_id:   string;
  assigned_to:   string;
  due_date?:     string | null;
  note?:         string | null;
}

export interface DecideCmsApprovalInput {
  decision: 'approved' | 'rejected';
  note?:    string | null;
}

// ── Content Releases (§18) ───────────────────────────────────────────────

export type CmsReleaseStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface CmsReleaseItem {
  id:            string;
  tenant_id:     string;
  release_id:    string;
  resource_type: 'page' | 'post' | 'entry';
  resource_id:   string;
  target_status: string;
  title?:        string;
  slug?:         string;
  current_status?: string;
  resource_title?: string;
  created_at:    string;
}

export interface CmsRelease {
  id:           string;
  tenant_id:    string;
  site_id?:     string | null;
  name:         string;
  description:  string | null;
  status:       CmsReleaseStatus;
  publish_at:   string | null;
  published_at: string | null;
  created_by:   string | null;
  item_count?:  number;
  items?:       CmsReleaseItem[];
  created_at:   string;
  updated_at:   string;
}

export interface CreateCmsReleaseInput {
  name:         string;
  description?: string | null;
  publish_at?:  string | null;
  site_id?:     string | null;
}

export interface UpdateCmsReleaseInput {
  name?:        string;
  description?: string | null;
  publish_at?:  string | null;
  status?:      CmsReleaseStatus;
  site_id?:     string | null;
}

export interface AddCmsReleaseItemInput {
  resource_type: 'page' | 'post' | 'entry';
  resource_id:   string;
  target_status?: string;
}

// ── Internal Collaboration Comments (§19-20) ─────────────────────────────

export interface CmsContentComment {
  id:            string;
  tenant_id:     string;
  resource_type: 'page' | 'post' | 'entry';
  resource_id:   string;
  author_id:     string;
  author_name?:  string | null;
  parent_id:     string | null;
  content:       string;
  block_id:      string | null;
  resolved:      boolean;
  resolved_by:   string | null;
  resolved_by_name?: string | null;
  resolved_at:   string | null;
  replies?:      CmsContentComment[];
  created_at:    string;
  updated_at:    string;
}

export interface CreateCmsContentCommentInput {
  resource_type: 'page' | 'post' | 'entry';
  resource_id:   string;
  content:       string;
  parent_id?:    string | null;
  block_id?:     string | null;
}

export interface UpdateCmsContentCommentInput {
  content?:     string;
  resolved?:    boolean;
  is_resolved?: boolean;
}

// ── Localization & AI Translation (§25-26) ───────────────────────────────

export interface CmsTranslationSummary {
  translation_group_id: string;
  translations: {
    locale:        string;
    id:            string;
    title:         string;
    status:        string;
    resource_type: 'page' | 'post' | 'entry';
    updated_at:    string;
  }[];
}

export interface TranslateContentInput {
  resource_type: 'page' | 'post' | 'entry';
  resource_id:   string;
  target_locale: string; // e.g. 'sw' | 'en' | 'fr'
}

// ── Forms + form workflows (§30-31) ──────────────────────────────────────
// Deliberately a small, bounded set of scalar field types — the same
// "declare the shape up front" posture §2's repeatable/relation/computed
// field types already established — not a general-purpose form builder
// with every input type imaginable.
export type CmsFormFieldType = 'text' | 'email' | 'textarea' | 'select';

export interface CmsFormField {
  key:      string;
  label:    string;
  type:     CmsFormFieldType;
  required?: boolean;
  /** Only meaningful (and required) when type === 'select'. */
  options?: string[];
}

export interface CmsForm {
  id:              string;
  tenant_id:       string;
  key:             string;
  name:            string;
  fields:          CmsFormField[];
  /** Shown to a visitor after a successful submit; falls back to a generic "Thanks!" line when unset. */
  success_message: string | null;
  /** Best-effort notification on each new submission — sent through the tenant's own configured email settings when present, the platform default otherwise, same as every other tenant-triggered email in this codebase. Never blocks the submit response. */
  notify_email:    string | null;
  created_by:      string | null;
  created_at:      string;
  updated_at:      string;
}

/** A field submitted at create/update time can omit its own `key` — the
 *  service auto-generates one from `label` when absent (CMSFormsService's
 *  own checkFormFields) — unlike CmsFormField itself, which is the
 *  already-stored shape where every field really does have a real key. */
export type CmsFormFieldInput = Omit<CmsFormField, 'key'> & { key?: string };

export interface CreateCmsFormInput {
  key?:             string;
  name:             string;
  fields?:          CmsFormFieldInput[];
  success_message?: string | null;
  notify_email?:    string | null;
}

export interface UpdateCmsFormInput {
  name?:             string;
  fields?:           CmsFormFieldInput[];
  success_message?:  string | null;
  notify_email?:     string | null;
}

export interface CmsFormSubmission {
  id:         string;
  tenant_id:  string;
  form_id:    string;
  data:       Record<string, unknown>;
  created_at: string;
}

/** What the public route actually returns — no notify_email, no created_by, matching the same admin-detail-stays-admin-only posture CmsPublicSite/CmsPublicPage etc. already use. */
export interface CmsPublicForm {
  id:              string;
  key:             string;
  name:            string;
  fields:          CmsFormField[];
  success_message: string | null;
}

// ── Analytics (§33) ──────────────────────────────────────────────────────
// Deliberately just a count — no IP, no user agent, no cookie, no
// per-visitor identity at all, per the brief's own "privacy-conscious"
// framing. One row per (resource, day), incremented in place on each
// beacon hit rather than one row per raw view event.
export type CmsAnalyticsResourceType = 'page' | 'post' | 'entry';

export interface CmsPageviewSummary {
  resource_type: CmsAnalyticsResourceType;
  resource_id:   string;
  /** All-time total across every stored day. */
  total:         number;
  /** Last 30 days, oldest first — {day: 'YYYY-MM-DD', count}. Days with zero views are simply absent, not zero-filled. */
  daily:         { day: string; count: number }[];
}

// ── Experimentation (§35) ─────────────────────────────────────────────────
// Deliberately narrow: two content-author-defined variants, a visitor
// sticky-assigned to one, a real view counter per variant. No conversion
// tracking yet (which variant is actually *winning*, not just evenly
// reached) — real, disclosed future work, not attempted here.
export type CmsExperimentStatus = 'running' | 'stopped';
export type CmsExperimentVariant = 'a' | 'b';

export interface CmsExperiment {
  id:               string;
  tenant_id:        string;
  key:              string;
  name:             string;
  status:           CmsExperimentStatus;
  variant_a_blocks: CmsBlock[];
  variant_b_blocks: CmsBlock[];
  variant_a_views:  number;
  variant_b_views:  number;
  created_by:       string | null;
  created_at:       string;
  updated_at:       string;
}

export interface CreateCmsExperimentInput {
  key?:              string;
  name:              string;
  variant_a_blocks?: CmsBlock[];
  variant_b_blocks?: CmsBlock[];
}

export interface UpdateCmsExperimentInput {
  name?:             string;
  status?:           CmsExperimentStatus;
  variant_a_blocks?: CmsBlock[];
  variant_b_blocks?: CmsBlock[];
}

/** What the public route returns — no view counts, no created_by, same
 *  admin-detail-stays-admin-only posture every other public shape here
 *  already takes. */
export interface CmsPublicExperiment {
  id:     string;
  key:    string;
  status: CmsExperimentStatus;
  variant_a_blocks: CmsBlock[];
  variant_b_blocks: CmsBlock[];
}
