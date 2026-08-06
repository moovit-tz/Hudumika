import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { apiFetch } from '../lib/api.js';

/**
 * What the platform has learned, across every tenant.
 *
 * The point of this screen is to find things that are wrong *everywhere* —
 * a Trade Wizard procedure mapped to the wrong permits, a compliance rule
 * that fires on cargo it has no business firing on, a tariff heading the
 * suggester keeps putting first and users keep rejecting. Those are platform
 * defects, and they are invisible inside any single tenant.
 *
 * Nothing here names a tenant or shows a tenant's goods, values or customers.
 * The aggregates are counts of outcomes, which is all that is needed to find
 * a bad rule and all that can be shown without turning a platform console
 * into a window onto other people's trade.
 */

const MIN_LABEL = (n: number | null, min: number) =>
  n == null ? `fewer than ${min} reports` : `${n}%`;

export const SuperAdminIntelligence: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/v1/intel/platform-accuracy')
      .then(setData)
      .catch(e => setError(e?.message ?? 'Could not load platform intelligence.'))
      .finally(() => setLoading(false));
  }, []);

  const min = data?.min_sample ?? 3;
  const wizard: any[] = data?.wizard ?? [];
  const compliance: any[] = data?.compliance ?? [];
  const hs: any[] = data?.hs_codes ?? [];

  // Ranked by how often the ranker was overruled — the direct quality signal.
  const contested = [...hs]
    .filter(h => h.accepted >= min)
    .map(h => ({ ...h, overridePct: h.accepted ? Math.round((h.overrodeTop / h.accepted) * 100) : 0 }))
    .sort((a, b) => b.overridePct - a.overridePct || b.accepted - a.accepted)
    .slice(0, 12);

  const Empty = ({ what }: { what: string }) => (
    <div style={{ padding: '28px 0',textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5, lineHeight: 1.6 }}>
      No {what} reported yet. This fills in as tenants use the apps and report
      back — nothing is inferred in the meantime.
    </div>
  );

  return (
    <div className="sai2-page">
      <style>{`
        .sai2-page { padding: 24px 32px; }
        .sai2-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; margin-top: 12px; align-items: start; }
        .sai2-card { min-width: 0; background: var(--card-bg, var(--white)); border: 1px solid var(--border);
                     border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,.04); overflow: hidden; }
        .sai2-head { padding: 16px 18px; border-bottom: 1px solid var(--border); }
        .sai2-title { font-size: 13.5px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 8px; }
        .sai2-sub { font-size: 11.5px; color: var(--ink3); margin-top: 4px; line-height: 1.5; }
        .sai2-scroll { max-height: 52vh; overflow: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .sai2-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .sai2-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        .sai2-scroll table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .sai2-scroll th { position: sticky; top: 0; z-index: 2; background: var(--card-bg, var(--white));
                          text-align: left; padding: 9px 14px; font-size: 10.5px; font-weight: 700; color: var(--ink3);
                          text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .sai2-scroll td { padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
        .sai2-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        @media (max-width: 900px) { .sai2-page { padding: 14px; } }
      `}</style>

      <PageHeader
        crumbs={['Platform', 'Intelligence']}
        titlePlain="Platform"
        titleEm="Intelligence"
        subtitle="What the apps have got right and wrong, aggregated across every tenant — for finding defects that no single workspace can see."
      />

      {error && (
        <div style={{ margin: '12px 0', padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--red-l)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 12.5, display: 'flex', gap: 8 }}>
          <Icon name="alertCircle" size={15} color="var(--red)" /> {error}
        </div>
      )}

      <div style={{ marginTop: 12, padding: '11px 15px', borderRadius: 'var(--r)', background: 'var(--teal-l)', border: '1px solid var(--teal-m, var(--teal-l))', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <Icon name="shield" size={15} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.55 }}>
          Aggregated outcomes only. No tenant, customer, consignment or value appears on this page —
          a figure below {min} reports is shown as “not enough reports” rather than as a number.
        </span>
      </div>

      <div className="sai2-grid">
        {/* ── Compliance rules ── */}
        <div className="sai2-card">
          <div className="sai2-head">
            <div className="sai2-title"><Icon name="shield" size={15} color="var(--teal)" /> Compliance rules</div>
            <div className="sai2-sub">
              <strong>Missed</strong> is the column that matters: a requirement enforced that the rules never
              predicted costs a delay, where a false alarm only costs a wasted certificate.
            </div>
          </div>
          {loading ? <Empty what="data" /> : compliance.length === 0 ? <Empty what="compliance outcome" /> : (
            <div className="sai2-scroll">
              <table>
                <thead><tr><th>Requirement</th><th className="sai2-num">Reports</th><th className="sai2-num">False alarms</th><th className="sai2-num">Missed</th><th className="sai2-num">Precision</th></tr></thead>
                <tbody>
                  {compliance.map(c => (
                    <tr key={c.requirement}>
                      <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.requirement}</td>
                      <td className="sai2-num" style={{ color: 'var(--ink2)' }}>{c.reported}</td>
                      <td className="sai2-num" style={{ color: c.falsePositive > 0 ? 'var(--gold)' : 'var(--ink3)' }}>{c.falsePositive}</td>
                      <td className="sai2-num" style={{ color: c.missed > 0 ? 'var(--red)' : 'var(--ink3)', fontWeight: c.missed > 0 ? 800 : 400 }}>{c.missed}</td>
                      <td className="sai2-num" style={{ color: c.precisionPct == null ? 'var(--ink3)' : 'var(--ink)', fontWeight: 700 }}>
                        {MIN_LABEL(c.precisionPct, min)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Trade Wizard procedures ── */}
        <div className="sai2-card">
          <div className="sai2-head">
            <div className="sai2-title"><Icon name="compass" size={15} color="var(--teal)" /> Trade Wizard procedures</div>
            <div className="sai2-sub">
              A procedure users keep selecting and then reporting as wrong is mis-mapped in the
              reference data, not misunderstood by the user.
            </div>
          </div>
          {loading ? <Empty what="data" /> : wizard.length === 0 ? <Empty what="wizard outcome" /> : (
            <div className="sai2-scroll">
              <table>
                <thead><tr><th>Procedure</th><th className="sai2-num">Selected</th><th className="sai2-num">Wrong</th><th className="sai2-num">Accuracy</th></tr></thead>
                <tbody>
                  {wizard.map(w => (
                    <tr key={w.procedureId}>
                      <td style={{ color: 'var(--ink)' }}>
                        {w.procedureName ?? w.procedureId}
                        <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--mono, monospace)' }}>{w.procedureId}</div>
                      </td>
                      <td className="sai2-num" style={{ color: 'var(--ink2)' }}>{w.selected}</td>
                      <td className="sai2-num" style={{ color: w.wrong > 0 ? 'var(--red)' : 'var(--ink3)', fontWeight: w.wrong > 0 ? 800 : 400 }}>{w.wrong}</td>
                      <td className="sai2-num" style={{ color: w.accuracyPct == null ? 'var(--ink3)' : 'var(--ink)', fontWeight: 700 }}>
                        {MIN_LABEL(w.accuracyPct, min)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── HS suggester quality ── */}
        <div className="sai2-card" style={{ gridColumn: '1 / -1' }}>
          <div className="sai2-head">
            <div className="sai2-title"><Icon name="search" size={15} color="var(--teal)" /> Where the HS suggester is overruled</div>
            <div className="sai2-sub">
              How often the code people actually declared was <em>not</em> the one ranked first. A high rate
              means the tariff-text ranking is wrong for that heading — the most actionable signal there is
              for improving suggestions, and it carries no tenant's goods description.
            </div>
          </div>
          {loading ? <Empty what="data" /> : contested.length === 0 ? <Empty what="classification" /> : (
            <div className="sai2-scroll">
              <table>
                <thead><tr><th>Declared code</th><th className="sai2-num">Times declared</th><th className="sai2-num">Was not ranked first</th><th className="sai2-num">Override rate</th><th /></tr></thead>
                <tbody>
                  {contested.map(h => (
                    <tr key={h.code}>
                      <td style={{ fontFamily: 'var(--mono, monospace)', fontWeight: 700, color: 'var(--teal)' }}>{h.code}</td>
                      <td className="sai2-num" style={{ color: 'var(--ink2)' }}>{h.accepted}</td>
                      <td className="sai2-num" style={{ color: 'var(--ink2)' }}>{h.overrodeTop}</td>
                      <td className="sai2-num" style={{ fontWeight: 800, color: h.overridePct >= 50 ? 'var(--red)' : h.overridePct >= 25 ? 'var(--gold)' : 'var(--green)' }}>
                        {h.overridePct}%
                      </td>
                      <td>
                        {h.overridePct >= 50
                          ? <Badge variant="error">Ranking likely wrong</Badge>
                          : h.overridePct >= 25 ? <Badge variant="warning">Worth reviewing</Badge>
                          : <Badge variant="success">Ranking holds</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminIntelligence;
