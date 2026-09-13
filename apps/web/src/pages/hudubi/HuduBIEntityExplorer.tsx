// ─── HuduBIEntityExplorer.tsx — Phase M5, the semantic layer's first real
// cross-app join, made visible. Not a graph browser — one real question
// answered: "what does this platform know about this customer, across
// every app that's registered a resolver for them?" (semantic_entities,
// migration 433). Starts with Sign; the registry's shape grows from real
// need, not the reverse — see hudubi-entity.service.ts's own header.
import React, { useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { EntityPicker, type PickerItem } from '../../components/EntityPicker.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';

async function searchCustomers(q: string): Promise<PickerItem[]> {
  const res = await apiFetch(`/v1/customers?search=${encodeURIComponent(q)}`).catch(() => []);
  const list = Array.isArray(res) ? res : (res.data ?? []);
  return list.slice(0, 25).map((c: any) => ({ id: c.id, label: c.name, sublabel: c.email || undefined }));
}

interface Resolution {
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  registered_apps: Array<{ app: string; table_name: string; description: string | null }>;
  hits: Array<{ app: string; table_name: string; record_id: string; matched_via: string; summary: string }>;
}

const MATCH_LABEL: Record<string, { label: string; variant: 'success' | 'info' }> = {
  client_id: { label: 'Direct link', variant: 'success' },
  email: { label: 'Email match', variant: 'info' },
  user_id: { label: 'Account match', variant: 'info' },
};

export function HuduBIEntityExplorer() {
  const [selected, setSelected] = useState<PickerItem | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSelect(item: PickerItem | null) {
    setSelected(item);
    setResolution(null);
    if (!item) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/v1/hudubi/entities/customer/${item.id}`);
      setResolution(res);
    } catch {
      setResolution(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 4px' }}>
      <PageHeader
        crumbs={['HuduBI', 'Semantic Layer']}
        titlePlain="Entity"
        titleEm="explorer"
        subtitle="What this platform knows about a customer, resolved across every app that registers a link to them — not just their CRM record."
      />

      <div style={{ maxWidth: 420, marginBottom: 20 }}>
        <EntityPicker value={selected} onChange={onSelect} search={searchCustomers} placeholder="Search for a customer…" />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 280, gap: 12, color: 'var(--ink3)', textAlign: 'center', padding: 32 }}>
            <Icon name="search" size={32} strokeWidth={1.25} />
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Search for a customer to resolve them across apps</div>
          </div>
        ) : loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Resolving…</div>
        ) : !resolution ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Could not resolve this customer.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
            <SectionCard title="Registered resolvers">
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 10 }}>
                Every app that has told the semantic layer how to find this customer's own records.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {resolution.registered_apps.map(a => (
                  <div key={`${a.app}-${a.table_name}`} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                    <Badge variant="gray" style={{ textTransform: 'uppercase', fontSize: 10 }}>{a.app}</Badge>
                    <code style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{a.table_name}</code>
                    <span style={{ color: 'var(--ink3)' }}>— {a.description}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title={`Resolved records (${resolution.hits.length})`} padded={false}>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', padding: '2px 18px 12px' }}>
                Real rows found for {resolution.customer_name}{resolution.customer_email ? ` (${resolution.customer_email})` : ''} across those apps.
              </div>
              {resolution.hits.length === 0 ? (
                <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>Nothing found for this customer yet.</div>
              ) : resolution.hits.map((h, i) => {
                const m = MATCH_LABEL[h.matched_via] ?? { label: h.matched_via, variant: 'info' as const };
                return (
                  <div key={h.record_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < resolution.hits.length - 1 ? '1px solid var(--bg)' : 'none' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="stamp" size={16} color="var(--teal)" strokeWidth={1.75} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{h.summary}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{h.app} · {h.table_name}</div>
                    </div>
                    <Badge variant={m.variant}>{m.label}</Badge>
                  </div>
                );
              })}
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}
