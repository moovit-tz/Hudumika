import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { apiToJob } from './clearanceData.js';
import { buildShipmentReportHtml } from './ShipmentDetail.js';
import { Spinner } from '../components/ui/spinner.js';

/**
 * Public, unauthenticated "check progress" page — what the WhatsApp link
 * from the daily shipment-report automation points at (see
 * shipment-report.service.ts / daily-shipment-report.job.ts).
 *
 * Deliberately renders through the exact same buildShipmentReportHtml() the
 * in-app print button and the emailed PDF both derive from, rather than a
 * fourth hand-built layout — same "one report, everywhere" reasoning
 * landed_cost_shares (151) already established, just carried further since
 * this page can literally reuse the function instead of re-deriving markup
 * from a stored payload.
 */
interface SharedPayload {
  shipment: any;
  company: { name: string; logoUrl: string | null; address: string; city: string; country: string };
  stageLabel: string;
}

export const ShipmentReportShared: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch(`/v1/shipments/shared/${token}`)
      .then((data: SharedPayload) => {
        const job = apiToJob(data.shipment);
        setHtml(buildShipmentReportHtml(job, { company: data.company, stageLabel: data.stageLabel }));
      })
      .catch((e: any) => setError(e.message ?? 'Not found'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#f8fafc' }}>
        <Spinner size={36} thickness={3} color="#0b1e3a" trackColor="#e2e8f0" />
        <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading shipment report…</div>
      </div>
    );
  }

  if (error || !html) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#f8fafc', padding: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--red-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="alertCircle" size={28} color="#dc2626" />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Report link not valid</div>
        <div style={{ fontSize: 14, color: 'var(--ink2)', textAlign: 'center' }}>This link may have been removed. Ask your clearing agent for a fresh copy.</div>
      </div>
    );
  }

  return <iframe title="Shipment Report" srcDoc={html} style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }} />;
};
