import { dbPlatform, withTenant } from '../db/client.js';
import { EmailIntegration } from '../integrations/email.js';
import type { CmsForm, CmsFormField, CmsFormFieldType, CmsFormSubmission, CreateCmsFormInput, UpdateCmsFormInput } from '@hudumika/types';

export class FormValidationError extends Error {}

const FORM_FIELD_TYPES: CmsFormFieldType[] = ['text', 'email', 'textarea', 'select'];
const MAX_FIELDS = 20;

function keyOf(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'field';
}

/** §30-31 — a form's own field config is validated up front the same
 *  "declare the shape before any submission can use it" posture §2's own
 *  relation/repeatable/computed field types already established — every
 *  field needs a real key/label/type, a 'select' field needs at least one
 *  real option, and keys must be unique within the form (a submission is
 *  keyed by field key, a collision would silently overwrite one answer
 *  with another). */
function checkFormFields(fields: unknown): CmsFormField[] {
  if (!Array.isArray(fields)) throw new FormValidationError('Form fields must be a list.');
  if (fields.length > MAX_FIELDS) throw new FormValidationError(`A form can have at most ${MAX_FIELDS} fields.`);
  const seen = new Set<string>();
  const out: CmsFormField[] = [];
  for (const [i, raw] of fields.entries()) {
    const label = String((raw as any)?.label ?? '').trim().slice(0, 120);
    if (!label) throw new FormValidationError(`Field ${i + 1} needs a label.`);
    const type = (raw as any)?.type;
    if (!FORM_FIELD_TYPES.includes(type)) throw new FormValidationError(`Field "${label}" has an invalid type — must be one of: ${FORM_FIELD_TYPES.join(', ')}.`);
    const key = String((raw as any)?.key ?? '').trim() || keyOf(label);
    if (seen.has(key)) throw new FormValidationError(`Duplicate field key "${key}" — every field needs a unique key.`);
    seen.add(key);
    const field: CmsFormField = { key, label, type, required: (raw as any)?.required === true };
    if (type === 'select') {
      const options = Array.isArray((raw as any)?.options) ? (raw as any).options.map((o: unknown) => String(o).trim()).filter(Boolean) : [];
      if (!options.length) throw new FormValidationError(`Field "${label}" is a select field and needs at least one option.`);
      field.options = options.slice(0, 30);
    }
    out.push(field);
  }
  return out;
}

function toForm(row: any): CmsForm {
  return {
    id: row.id, tenant_id: row.tenant_id, key: row.key, name: row.name,
    fields: typeof row.fields === 'string' ? JSON.parse(row.fields) : (row.fields ?? []),
    success_message: row.success_message, notify_email: row.notify_email, created_by: row.created_by,
    created_at: (row.created_at as Date).toISOString(), updated_at: (row.updated_at as Date).toISOString(),
  };
}
function toSubmission(row: any): CmsFormSubmission {
  return {
    id: row.id, tenant_id: row.tenant_id, form_id: row.form_id,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data ?? {}),
    created_at: (row.created_at as Date).toISOString(),
  };
}
function keySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'form';
}

/**
 * §30-31 of the CMS master brief — Forms + form workflows. A tenant
 * defines a form's own field shape once, places it on a page/post/entry
 * via a real 'form' block type (cms-content.service.ts's own BLOCK_TYPES
 * registry), and a visitor's submission is validated against that exact
 * shape server-side (never trusting whatever the client sent) and stored.
 * Deliberately scoped to storage + a best-effort notify email for this
 * first pass — auto-creating a CRM lead from a submission is real,
 * disclosed future work, not attempted here (a separate integration
 * decision: which form maps to which CRM pipeline, not a mechanical
 * extension of this pass).
 */
export class CMSFormsService {
  static async listForms(tenantId: string): Promise<CmsForm[]> {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('cms_forms').selectAll()
        .where('tenant_id', '=', tenantId).orderBy('created_at', 'desc').execute();
      return rows.map(toForm);
    });
  }

  static async getForm(tenantId: string, id: string): Promise<CmsForm> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx.selectFrom('cms_forms').selectAll()
        .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
      return toForm(row);
    });
  }

  static async createForm(tenantId: string, userId: string, input: CreateCmsFormInput): Promise<CmsForm> {
    if (!input.name?.trim()) throw new FormValidationError('Form name is required.');
    const fields = checkFormFields(input.fields ?? []);
    return withTenant(tenantId, async (trx) => {
      const base = input.key?.trim() || keySlug(input.name);
      let key = base, n = 2;
      while (await trx.selectFrom('cms_forms').select('id').where('tenant_id', '=', tenantId).where('key', '=', key).executeTakeFirst()) {
        key = `${base}-${n}`; n++;
      }
      const row = await trx.insertInto('cms_forms').values({
        tenant_id: tenantId, key, name: input.name.trim(), fields: JSON.stringify(fields),
        success_message: input.success_message?.trim() || null, notify_email: input.notify_email?.trim() || null,
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
      return toForm(row);
    });
  }

  static async updateForm(tenantId: string, id: string, input: UpdateCmsFormInput): Promise<CmsForm> {
    return withTenant(tenantId, async (trx) => {
      const update: Record<string, unknown> = { updated_at: new Date() };
      if (input.name !== undefined) {
        if (!input.name.trim()) throw new FormValidationError('Form name is required.');
        update['name'] = input.name.trim();
      }
      if (input.fields !== undefined) update['fields'] = JSON.stringify(checkFormFields(input.fields));
      if (input.success_message !== undefined) update['success_message'] = input.success_message?.trim() || null;
      if (input.notify_email !== undefined) update['notify_email'] = input.notify_email?.trim() || null;
      const row = await trx.updateTable('cms_forms').set(update)
        .where('id', '=', id).where('tenant_id', '=', tenantId).returningAll().executeTakeFirst();
      // HUD-0130: was executeTakeFirstOrThrow() — a wrong/stale id crashed
      // with Kysely's own raw "no result", surfaced to the client as a 400
      // instead of a clean 404.
      if (!row) throw new Error('Form not found.');
      return toForm(row);
    });
  }

  // No "still has submissions" guard, deliberately — a form's own
  // submissions are a record of what visitors sent, not live content
  // other things reference; ON DELETE CASCADE (migration 478) removes
  // them with the form, the same posture deleting a blog post already
  // takes toward its own comments.
  static async deleteForm(tenantId: string, id: string): Promise<void> {
    await withTenant(tenantId, trx => trx.deleteFrom('cms_forms').where('id', '=', id).where('tenant_id', '=', tenantId).execute());
  }

  static async listSubmissions(tenantId: string, formId: string, params: { limit?: number; offset?: number } = {}): Promise<{ submissions: CmsFormSubmission[]; total: number }> {
    return withTenant(tenantId, async (trx) => {
      const limit = Math.min(params.limit ?? 50, 200);
      const offset = params.offset ?? 0;
      const rows = await trx.selectFrom('cms_form_submissions').selectAll()
        .where('tenant_id', '=', tenantId).where('form_id', '=', formId)
        .orderBy('created_at', 'desc').limit(limit).offset(offset).execute();
      const { count } = await trx.selectFrom('cms_form_submissions')
        .select(({ fn }) => [fn.countAll().as('count')])
        .where('tenant_id', '=', tenantId).where('form_id', '=', formId).executeTakeFirstOrThrow();
      return { submissions: rows.map(toSubmission), total: Number(count) };
    });
  }

  // ── Public (unauthenticated) ─────────────────────────────────────────

  private static async resolveTenantBySlug(tenantSlug: string) {
    return dbPlatform.selectFrom('tenants').select(['id', 'slug']).where('slug', '=', tenantSlug).executeTakeFirst();
  }

  static async getPublicForm(tenantSlug: string, formKey: string) {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;
    return withTenant(tenant.id, async (trx) => {
      const row = await trx.selectFrom('cms_forms').select(['id', 'key', 'name', 'fields', 'success_message'])
        .where('tenant_id', '=', tenant.id).where('key', '=', formKey).executeTakeFirst();
      if (!row) return null;
      return {
        id: row.id, key: row.key, name: row.name,
        fields: typeof row.fields === 'string' ? JSON.parse(row.fields as any) : (row.fields ?? []),
        success_message: row.success_message,
      };
    });
  }

  /** Returns null when the tenant/form can't be resolved (caller 404s);
   *  throws FormValidationError for a real input problem (caller 400s); a
   *  honeypot hit returns as if it succeeded (`{ ok: true }`) — same
   *  "never tell a bot which check it tripped" posture blog comments
   *  (§37) already established. `rawData` is whatever the client sent;
   *  only keys the form's own field config actually declares are ever
   *  looked at or stored — an extra/unexpected key is silently dropped,
   *  not stored verbatim. */
  static async submitForm(tenantSlug: string, formKey: string, rawData: Record<string, unknown>): Promise<{ ok: true; success_message: string | null } | null> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    if (!tenant) return null;

    if (typeof rawData?._hp === 'string' && rawData._hp.trim()) {
      return { ok: true, success_message: null }; // honeypot tripped — silently discard, look successful
    }

    return withTenant(tenant.id, async (trx) => {
      const form = await trx.selectFrom('cms_forms').selectAll()
        .where('tenant_id', '=', tenant.id).where('key', '=', formKey).executeTakeFirst();
      if (!form) return null;
      const fields: CmsFormField[] = typeof form.fields === 'string' ? JSON.parse(form.fields) : (form.fields ?? []);

      const data: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = rawData?.[field.key];
        const value = raw === undefined || raw === null ? '' : String(raw).trim();
        if (!value) {
          if (field.required) throw new FormValidationError(`"${field.label}" is required.`);
          continue;
        }
        if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new FormValidationError(`"${field.label}" must be a valid email.`);
        }
        if (field.type === 'select' && !(field.options ?? []).includes(value)) {
          throw new FormValidationError(`"${field.label}" must be one of the offered options.`);
        }
        data[field.key] = value.slice(0, 5000);
      }

      await trx.insertInto('cms_form_submissions').values({
        tenant_id: tenant.id, form_id: form.id, data: JSON.stringify(data),
      }).execute();

      if (form.notify_email) {
        const rows = fields.map(f => `<p><strong>${f.label}:</strong> ${String(data[f.key] ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</p>`).join('');
        // Best-effort, same posture public-support.routes.ts's own
        // confirmation email already takes — a notification failure
        // doesn't undo a submission that's already safely stored.
        void EmailIntegration.sendEmail({
          to: form.notify_email, tenantId: tenant.id,
          subject: `New submission — ${form.name}`,
          bodyHtml: rows || '<p>(no fields)</p>',
        }).catch(() => {});
      }

      return { ok: true, success_message: form.success_message };
    });
  }
}
