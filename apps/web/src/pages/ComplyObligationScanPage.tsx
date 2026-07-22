import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { useComplyObligationScan } from '../hooks/useComply.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { ComplyWizardPage, WizardField } from './ComplyWizardPage.js';
import './ComplyOS.css';

const SECTORS = [
  { value: 'general_trade',       label: 'General Trade / Retail' },
  { value: 'manufacturing',       label: 'Manufacturing' },
  { value: 'import_export',       label: 'Import / Export' },
  { value: 'food_agri',           label: 'Food & Agri-Export' },
  { value: 'financial_services',  label: 'Financial Services' },
  { value: 'logistics',           label: 'Logistics & Freight' },
  { value: 'technology',          label: 'Technology' },
  { value: 'health',              label: 'Health' },
  { value: 'construction',        label: 'Construction' },
  { value: 'professional_services', label: 'Professional Services' },
];

const EMPLOYEE_BANDS = ['1–5', '6–20', '21–50', '51–200', '200+'];
const SCAN_STEPS = ['Sector', 'Business Details', 'Results'];

export function ComplyObligationScanPage() {
  const navigate = useNavigate();
  const { scan, scanning, error } = useComplyObligationScan();
  const [step, setStep] = useState(0);
  const [sector, setSector] = useState(SECTORS[0].value);
  const [subSector, setSubSector] = useState('');
  const [employeeBand, setEmployeeBand] = useState(EMPLOYEE_BANDS[0]);
  const [ownershipStructure, setOwnershipStructure] = useState('');
  const [result, setResult] = useState<{ obligations_created: number; obligations_matched: number } | null>(null);

  async function handleScan() {
    try {
      const res = await scan({
        sector,
        sub_sector: subSector.trim() || undefined,
        employee_band: employeeBand,
        ownership_structure: ownershipStructure.trim() || undefined,
      });
      setResult(res);
      setStep(2);
    } catch {
      // error already captured by the hook
    }
  }

  return (
    <ComplyWizardPage
      title="AI Obligation Scan"
      subtitle="Tell us about your business and we'll map the certifications you need."
      steps={SCAN_STEPS}
      step={step}
      backTo="/complyos"
      busy={scanning}
      onBack={step < 2 ? () => setStep(s => s - 1) : undefined}
      nextLabel={step === 0 ? undefined : step === 1 ? (scanning ? 'Scanning…' : 'Run Scan') : 'View Obligations'}
      onNext={() => {
        if (step === 0) setStep(1);
        else if (step === 1) handleScan();
        else navigate('/complyos/obligations');
      }}
    >
      {step === 0 && (
        <>
          <WizardField label="Sector">
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SECTORS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </WizardField>
          <WizardField label="Sub-sector (optional)">
            <input className="input-field" value={subSector} onChange={e => setSubSector(e.target.value)} placeholder="e.g. Electronics assembly" />
          </WizardField>
        </>
      )}

      {step === 1 && (
        <>
          <WizardField label="Employee count">
            <Select value={employeeBand} onValueChange={setEmployeeBand}>
              <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYEE_BANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </WizardField>
          <WizardField label="Ownership structure (optional)">
            <input className="input-field" value={ownershipStructure} onChange={e => setOwnershipStructure(e.target.value)} placeholder="e.g. Private limited company, 100% locally owned" />
          </WizardField>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
        </>
      )}

      {step === 2 && result && (
        <div className="comply-note comply-note--success">
          <Icon name="check" size={16} />
          <span>Matched {result.obligations_matched} obligation{result.obligations_matched === 1 ? '' : 's'} for this sector — {result.obligations_created} new obligation{result.obligations_created === 1 ? '' : 's'} added to your compliance list.</span>
        </div>
      )}
    </ComplyWizardPage>
  );
}
