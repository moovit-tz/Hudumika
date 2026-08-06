import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useBranding } from '../hooks/useBranding.js';

interface CO2Record {
  id: string;
  waybill: string;
  origin: string;
  destination: string;
  mode: string;
  distance_km: number;
  co2_emissions_kg: number;
  carbon_credits_saved: number;
  date: string;
}

export const CarbonCreditsPage: React.FC = () => {
  const branding = useBranding();
  const [loading, setLoading] = useState(true);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalEmissions, setTotalEmissions] = useState(0);
  const [records, setRecords] = useState<CO2Record[]>([]);

  useEffect(() => {
    async function load() {
      try {
        // Fetch from analytics and shipments
        const [analyticsRes, shipmentsRes] = await Promise.all([
          apiFetch('/v1/analytics/kpis'),
          apiFetch('/v1/shipments?limit=100')
        ]);
        
        setTotalCredits(analyticsRes?.kpis?.total_carbon_credits_saved || 0);
        
        const data = Array.isArray(shipmentsRes) ? shipmentsRes : (shipmentsRes?.data ?? []);
        let totalCO2 = 0;
        const mapped: CO2Record[] = [];
        
        for (const s of data) {
          if (s.co2_emissions_kg || s.carbon_credits_saved) {
            totalCO2 += Number(s.co2_emissions_kg || 0);
            
            let details = {} as any;
            try { details = JSON.parse(s.co2_calc_details || '{}'); } catch {}
            
            mapped.push({
              id: s.id,
              waybill: s.waybill || s.tracking_number || s.id.slice(0,8).toUpperCase(),
              origin: details.origin || 'N/A',
              destination: details.destination || 'N/A',
              mode: details.mode || 'AIR',
              distance_km: details.distance_km || 0,
              co2_emissions_kg: Number(s.co2_emissions_kg || 0),
              carbon_credits_saved: Number(s.carbon_credits_saved || 0),
              date: new Date(s.created_at || Date.now()).toLocaleDateString()
            });
          }
        }
        
        setTotalEmissions(totalCO2);
        setRecords(mapped);
      } catch (err) {
        console.error('Failed to load CO2 data', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const printCertificate = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    
    const logoSrc = branding.logoLight || branding.getAppLogo('clearos') || '';
    const logoHtml = logoSrc ? `<img src="${logoSrc}" alt="Logo" style="height: 60px; margin-bottom: 20px;" />` : `<h1 style="color: #059669; margin-bottom: 20px;">${branding.platformName}</h1>`;
    
    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Carbon Offset Certificate</title>
        <style>
          body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; color: #1e293b; background: #ecfdf5; }
          .cert-container { background: #fff; padding: 60px; border: 8px solid #059669; border-radius: 12px; max-width: 800px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
          h1 { color: #064e3b; font-size: 42px; margin: 0 0 10px 0; font-weight: 900; letter-spacing: -0.02em; }
          h2 { color: #059669; font-size: 24px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 40px; }
          p { font-size: 18px; line-height: 1.6; margin-bottom: 30px; }
          .highlight { font-size: 32px; font-weight: 800; color: #059669; display: block; margin: 20px 0; }
          .footer { margin-top: 60px; font-size: 14px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; display: flex; justify-content: space-between; align-items: center; }
          .signature { border-top: 1px solid #1e293b; padding-top: 10px; width: 200px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="cert-container">
          ${logoHtml}
          <h2>Official Certificate</h2>
          <h1>Carbon Offset Achievement</h1>
          <p>This certificate is proudly presented to</p>
          <span style="font-size: 28px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; display: inline-block; min-width: 300px;">Our Valued Partners</span>
          <p style="margin-top: 30px;">For their commitment to sustainable logistics and reducing global carbon emissions.</p>
          
          <span class="highlight">${totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span style="font-weight: 700; font-size: 20px; color: #064e3b;">Metric Tonnes of CO₂ Avoided</span>
          
          <div class="footer">
            <div style="text-align: left;">
              <div>Date Issued: ${new Date().toLocaleDateString()}</div>
              <div>Generated by: ${branding.platformName} Intelligence Suite</div>
            </div>
            <div class="signature">Authorized Signature</div>
          </div>
        </div>
        <script>
          setTimeout(() => window.print(), 500);
        </script>
      </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <PageHeader 
        crumbs={['Analytics', 'Carbon Credits']} 
        titlePlain="Carbon" 
        titleEm="Credits" 
        subtitle="Track and manage your carbon footprint and CO2 offsets."
        actions={
          <button onClick={printCertificate} style={{ background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 'var(--r)', padding: 'var(--ds-btn-py) 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
            <Icon name="award" size={14} /> View Certificate
          </button>
        }
      />

      <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ background: 'var(--white)', padding: 24, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#ecfdf5', color: '#065f46', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="leaf" size={18} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink3)' }}>TOTAL CREDITS SAVED</span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#065f46', letterSpacing: '-0.02em' }}>
              {totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Metric tonnes of CO₂ equivalent avoided.</div>
          </div>

          <div style={{ background: 'var(--white)', padding: 24, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f1f5f9', color: 'var(--ink2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="cloudRain" size={18} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink3)' }}>TOTAL CO₂ EMISSIONS</span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {(totalEmissions / 1000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Metric tonnes of CO₂ emitted from shipments.</div>
          </div>

          <div style={{ background: 'var(--white)', padding: 24, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="package" size={18} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink3)' }}>OFFSET SHIPMENTS</span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#b45309', letterSpacing: '-0.02em' }}>
              {records.length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Total shipments with calculated carbon credits.</div>
          </div>
        </div>

        {/* Records Table */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Shipment Offset Records</h3>
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 600, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Date</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 600, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Waybill</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 600, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Route</th>
                <th style={{ padding: '12px 20px', textAlign: 'center', fontWeight: 600, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Mode</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Distance</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>CO₂ Emitted</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: 'var(--ink3)', borderBottom: '1px solid var(--border)' }}>Credits Saved</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading carbon records...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No carbon records found. Ensure shipments have weight and locations set.</td></tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 20px', color: 'var(--ink2)' }}>{r.date}</td>
                    <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--teal)' }}>{r.waybill}</td>
                    <td style={{ padding: '12px 20px', color: 'var(--ink)' }}>{r.origin} → {r.destination}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                      <span style={{ background: 'var(--bg)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>{r.mode}</span>
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: 'var(--ink2)' }}>{r.distance_km.toLocaleString()} km</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: 'var(--ink)' }}>{r.co2_emissions_kg.toLocaleString()} kg</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: '#065f46' }}>{r.carbon_credits_saved.toFixed(4)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
