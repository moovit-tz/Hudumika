import { withTenant, dbPlatform } from '../db/client.js';
import { CMSService } from './cms.service.js';

export class ValidationError extends Error {}

export interface CmsTemplateSummary {
  key: string;
  name: string;
  description: string;
  /** Human-readable preview of what installing this template creates — shown on the picker card. */
  seeds: string[];
}

interface TemplatePageSeed {
  slug: string;
  title: string;
  content: string;
}
interface TemplatePostSeed {
  title: string;
  content: string;
  category: string;
  tags: string;
}
interface TemplateNavSeed {
  label: string;
  /** Resolves against the tenant's own real slug, since "Home" must point at
   *  the site's actual public index (/site/:tenantSlug) — there is no
   *  homepage-flagged page in this schema, the index route is always the
   *  generic published-pages/posts listing. */
  target: (tenantSlug: string) => string;
}
interface TemplateDef {
  key: string;
  name: string;
  description: string;
  pages: TemplatePageSeed[];
  posts: TemplatePostSeed[];
  nav: TemplateNavSeed[];
}

const PLACEHOLDER_NOTE = '<p><em>This is starter content from the Corporate template — edit or replace it from the CMS to describe your own business.</em></p>';
const PLACEHOLDER_NOTE_BLOG = '<p><em>This is starter content from the Blog template — edit or replace it from the CMS.</em></p>';

// A small, fixed, in-code catalog rather than an admin-editable "templates"
// table — §45-46 of the CMS brief asks for installable starting points, and
// a starter kit is content (real Pages/Posts/Nav rows a tenant can then
// freely edit), not a new template-authoring surface to build and maintain.
const TEMPLATES: TemplateDef[] = [
  {
    key: 'corporate',
    name: 'Corporate',
    description: 'A business site with About, Services and Contact pages, and a matching nav menu.',
    pages: [
      {
        slug: '/about', title: 'About Us',
        content: `${PLACEHOLDER_NOTE}<h2>Who we are</h2><p>We're a team dedicated to doing great work for our customers. Add your company's story, mission and the people behind it here.</p><h2>What sets us apart</h2><p>Describe what makes your business different — your experience, your approach, or the results you deliver.</p>`,
      },
      {
        slug: '/services', title: 'Services',
        content: `${PLACEHOLDER_NOTE}<h2>What we offer</h2><p>List the services or products your business provides. Break each one into its own section with a short description of the value it delivers.</p><h2>How we work</h2><p>Walk a visitor through what working with you looks like, from first contact to delivery.</p>`,
      },
      {
        slug: '/contact', title: 'Contact',
        content: `${PLACEHOLDER_NOTE}<h2>Get in touch</h2><p>Replace this with your real phone number, email address and physical location.</p><p>Email: hello@example.com<br/>Phone: +255 000 000 000</p>`,
      },
    ],
    posts: [],
    nav: [
      { label: 'Home', target: (slug) => `/site/${slug}` },
      { label: 'About', target: () => '/about' },
      { label: 'Services', target: () => '/services' },
      { label: 'Contact', target: () => '/contact' },
    ],
  },
  {
    key: 'blog',
    name: 'Blog',
    description: 'A personal or company blog with an About page, a welcome post, and a Blog link in the nav.',
    pages: [
      {
        slug: '/about', title: 'About',
        content: `${PLACEHOLDER_NOTE_BLOG}<h2>About this blog</h2><p>Introduce yourself or your company, and describe what readers can expect to find here. Replace this with your own story.</p>`,
      },
    ],
    posts: [
      {
        title: 'Welcome to your new blog', category: 'General', tags: 'welcome',
        content: `${PLACEHOLDER_NOTE_BLOG}<p>This is your first post. Edit or delete it, then start writing — every published post appears on your public blog automatically.</p>`,
      },
    ],
    nav: [
      { label: 'Home', target: (slug) => `/site/${slug}` },
      { label: 'About', target: () => '/about' },
      { label: 'Blog', target: (slug) => `/site/${slug}/blog` },
    ],
  },
];

export interface InstallTemplateResult {
  pagesCreated: number;
  postsCreated: number;
  navItemsCreated: number;
}

export class CMSTemplatesService {
  static listTemplates(): CmsTemplateSummary[] {
    return TEMPLATES.map(t => ({
      key: t.key,
      name: t.name,
      description: t.description,
      seeds: [
        ...t.pages.map(p => `Page: ${p.title}`),
        ...t.posts.map(p => `Post: ${p.title}`),
        `${t.nav.length} navigation links`,
      ],
    }));
  }

  /** Refuses on any tenant that already has a page — a template is only for
   *  a genuinely blank site; installing one onto an already-built site would
   *  silently mix starter placeholder content in among a tenant's real work. */
  static async installTemplate(tenantId: string, userId: string, templateKey: string): Promise<InstallTemplateResult> {
    const template = TEMPLATES.find(t => t.key === templateKey);
    if (!template) throw new ValidationError(`Unknown template "${templateKey}".`);

    const existing = await withTenant(tenantId, trx => trx.selectFrom('cms_pages').select('id')
      .where('tenant_id', '=', tenantId).limit(1).execute());
    if (existing.length > 0) {
      throw new ValidationError('This site already has pages — templates can only be installed on a brand-new, empty site.');
    }

    const tenant = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', tenantId).executeTakeFirstOrThrow();

    let pagesCreated = 0, postsCreated = 0, navItemsCreated = 0;
    for (const p of template.pages) {
      await CMSService.createTenantPage(tenantId, userId, { slug: p.slug, title: p.title, content: p.content, status: 'published' });
      pagesCreated++;
    }
    for (const p of template.posts) {
      await CMSService.createTenantPost(tenantId, userId, { title: p.title, content: p.content, status: 'published', category: p.category, tags: p.tags });
      postsCreated++;
    }
    for (const n of template.nav) {
      await CMSService.createNavItem(tenantId, { label: n.label, target: n.target(tenant.slug) });
      navItemsCreated++;
    }

    return { pagesCreated, postsCreated, navItemsCreated };
  }
}
