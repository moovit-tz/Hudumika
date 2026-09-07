import React, { useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Icon } from '../../components/Icon.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';

export const BlissAICopilot: React.FC = () => {
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);
  const isMobile = useMediaQuery('(max-width: 900px)');

  return (
    <div style={{ padding: '20px 24px', background: 'var(--bg)', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['Bliss', 'AI Copilot']}
        titlePlain="AI Support"
        titleEm="Copilot"
        subtitle="Configure real-time conversation intent detection, sentiment scoring, and automated reply suggestions."
        actions={
          <Button variant="default" size="sm">
            <Icon name="sparkle" size={14} /> Train AI on Knowledge Base
          </Button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>AI Deflection Rate</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>74.2%</div>
        </div>
        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Avg Response Time Saved</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>4m 12s</div>
        </div>
        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Suggested Replies Used</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>1,420</div>
        </div>
        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Confidence Rating</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)', marginTop: 4 }}>96.8%</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 20 }}>
        <SectionCard title="Live Copilot Conversation Inspector">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--bg)', padding: 16, borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', marginBottom: 6 }}>
                Customer Input
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>
                "Our container MSCU8849120 is incurring demurrage charges because TRA customs clearance is pending. Can you verify why the permit token is blocked?"
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <div style={{ border: '1px solid var(--border)', padding: 14, borderRadius: 'var(--r)', background: 'var(--white)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Detected Intent</div>
                <Badge variant="brand">Customs Permit Verification</Badge>
              </div>

              <div style={{ border: '1px solid var(--border)', padding: 14, borderRadius: 'var(--r)', background: 'var(--white)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>Sentiment Score</div>
                <Badge variant="warning">Frustrated (Low 32%)</Badge>
              </div>
            </div>

            <div style={{ background: 'var(--teal-l)', padding: 16, borderRadius: 'var(--r)', border: '1px solid var(--teal)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--teal)' }}>AI Recommended Response (98% Confidence)</div>
                <Button variant="default" size="sm">Insert to Composer</Button>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }}>
                "Hello! I checked container MSCU8849120 in TRA system. The clearance token was held pending TBS phytosanitary certificate validation. Our compliance team has submitted the certificate, and release is expected within 45 minutes."
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Copilot Settings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700 }}>Auto-Suggestion Confidence Threshold ({confidenceThreshold}%)</label>
              <input
                type="range"
                min="50"
                max="99"
                value={confidenceThreshold}
                onChange={e => setConfidenceThreshold(Number(e.target.value))}
                style={{ width: '100%', marginTop: 6 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700 }}>Tone & Persona</label>
              <select className="input-field" style={{ marginTop: 4 }}>
                <option>Professional & Direct (Default)</option>
                <option>Empathetic & Warm</option>
                <option>Technical & Concise</option>
              </select>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
