import React, { useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';

export function HuduBIModels() {
  const [selectedModel, setSelectedModel] = useState('Executive Insights Engine v3.1');

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#fafafa', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        crumbs={['HuduBI', 'Machine Learning']}
        titlePlain="AI & Machine Learning"
        titleEm="models center"
        subtitle="Predictive models, accuracy tracking, anomaly detection engines, and model training pipelines"
      />

      {/* Model Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {[
          { name: 'Executive Insights Engine v3.1', task: 'Strategic Synthesis & Board Deck Summaries', accuracy: '97.8%', status: 'ACTIVE', version: 'v3.1' },
          { name: 'Revenue Forecasting v2.7', task: '4-Quarter Revenue & ARR Projection', accuracy: '96.2%', status: 'ACTIVE', version: 'v2.7' },
          { name: 'Customer Churn Predictor v3.2', task: 'Early Attrition Risk Flagging', accuracy: '94.5%', status: 'ACTIVE', version: 'v3.2' },
          { name: 'Financial Anomaly Detector v1.9', task: 'Real-time Outlier & Fraud Detection', accuracy: '99.1%', status: 'ACTIVE', version: 'v1.9' },
        ].map(m => (
          <div
            key={m.name}
            onClick={() => setSelectedModel(m.name)}
            style={{ background: '#fff', border: selectedModel === m.name ? '2px solid #18181B' : '1px solid #e5e7eb', borderRadius: 14, padding: 20, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#18181B', color: '#fff' }}>
                {m.version}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#d1fae5', color: '#065f46' }}>
                {m.status}
              </span>
            </div>

            <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{m.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{m.task}</div>

            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#9ca3af' }}>Accuracy Score</span>
              <span style={{ fontWeight: 800, color: '#10b981' }}>{m.accuracy}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Model Performance & Retraining Log */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Selected Model: {selectedModel}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Training Datasets</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 4 }}>18.4M Samples</div>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Inference Latency</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 4 }}>38 ms / query</div>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Drift Score</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981', marginTop: 4 }}>0.02 (Low)</div>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Last Retrained</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 4 }}>Yesterday 6:12 PM</div>
          </div>
        </div>
      </div>
    </div>
  );
}
