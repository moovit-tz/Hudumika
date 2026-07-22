import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { getHudumikaFooterHtml } from '../lib/watermark.js';
import { apiFetch } from '../lib/api.js';
import { formatDashedDigits9, badgeVariantForStatus } from '../lib/complyBrelaFormat.js';
import './ComplyOS.css';

export interface BrelaEntity {
  id: string;
  reg_number: string;
  name: string;
  // Local reference records use the 4 literal values below; live BRELA
  // results carry the portal's own free-text subtype/status strings (e.g.
  // "Private company Limited by shares"), which don't reliably map onto a
  // fixed enum — so this stays `string` rather than a narrower union.
  type: 'Private Limited Company' | 'Public Limited Company' | 'Business Name' | 'Branch of Foreign Company' | (string & {});
  status: 'Registered' | 'Active' | 'Pending Annual Return' | 'Dissolved' | (string & {});
  incorporation_date: string;
  tin: string;
  vrn?: string;
  registered_office: string;
  region: string;
  district: string;
  directors: string[];
  shareholders: string[];
  last_annual_return_year: number;
  next_filing_due: string;
  compliance_score: number;
}

export const BRELA_ENTITY_DATABASE: BrelaEntity[] = [
  {
    id: 'brela-aleka',
    reg_number: '137644169',
    name: 'ALEKA HOLDINGS LIMITED',
    type: 'Private Limited Company',
    status: 'Registered',
    incorporation_date: '2019-05-14',
    tin: '137-644-169',
    vrn: '40092831-A',
    registered_office: 'Dar Es Salaam, Kinondoni, Mikocheni, 14112, MIKOCHENI LIGHT INDUSTRIAL AREA, SOLDERING RD, 44, D, G3',
    region: 'Dar es Salaam',
    district: 'Kinondoni',
    directors: ['Aleka Managing Director', 'Aleka Trustee'],
    shareholders: ['Aleka Holdings Group Ltd (100%)'],
    last_annual_return_year: 2025,
    next_filing_due: '2026-05-14',
    compliance_score: 95,
  },
  {
    id: 'brela-001',
    reg_number: '148920-TZ',
    name: 'HUDUMIKA LLC',
    type: 'Private Limited Company',
    status: 'Registered',
    incorporation_date: '2021-03-15',
    tin: '142-980-311',
    vrn: '40019283-V',
    registered_office: 'Plot 45, Samora Avenue, Tower 3, 7th Floor',
    region: 'Dar es Salaam',
    district: 'Ilala',
    directors: ['Viden Kimaro', 'Amani Said', 'Sarah John'],
    shareholders: ['Hudumika Holdings Ltd (80%)', 'Viden Kimaro (20%)'],
    last_annual_return_year: 2025,
    next_filing_due: '2026-03-15',
    compliance_score: 98,
  },
  {
    id: 'brela-002',
    reg_number: '109283-TZ',
    name: 'KILIMANJARO LOGISTICS & FREIGHT LTD',
    type: 'Private Limited Company',
    status: 'Registered',
    incorporation_date: '2018-07-22',
    tin: '108-449-012',
    vrn: '40082910-K',
    registered_office: 'Bandari Road, Yard 12, Kurasini',
    region: 'Dar es Salaam',
    district: 'Temeke',
    directors: ['Josephat Masawe', 'Grace Mbeke'],
    shareholders: ['Josephat Masawe (60%)', 'Grace Mbeke (40%)'],
    last_annual_return_year: 2025,
    next_filing_due: '2026-07-22',
    compliance_score: 92,
  },
  {
    id: 'brela-003',
    reg_number: '084920-TZ',
    name: 'AZAM GRAIN MILLERS TANZANIA LTD',
    type: 'Public Limited Company',
    status: 'Registered',
    incorporation_date: '2010-11-04',
    tin: '101-982-441',
    vrn: '40001928-A',
    registered_office: 'Tazara Industrial Area, Nyerere Road',
    region: 'Dar es Salaam',
    district: 'Ilala',
    directors: ['Said Salim Bakhresa', 'Abubakar Bakhresa'],
    shareholders: ['Bakhresa Group PLC (100%)'],
    last_annual_return_year: 2025,
    next_filing_due: '2026-11-04',
    compliance_score: 96,
  },
  {
    id: 'brela-004',
    reg_number: '127394-TZ',
    name: 'VODACOM TANZANIA PUBLIC LIMITED COMPANY',
    type: 'Public Limited Company',
    status: 'Registered',
    incorporation_date: '1999-12-10',
    tin: '100-293-884',
    vrn: '40000192-V',
    registered_office: '7th Floor, Vodacom Tower, Ursino Estate, Bagamoyo Road',
    region: 'Dar es Salaam',
    district: 'Kinondoni',
    directors: ['Philip Besiimire', 'Thomas Chalumeau', 'Margaret Ikongo'],
    shareholders: ['Vodafamily South Africa (75%)', 'Tanzania Public Floating (25%)'],
    last_annual_return_year: 2025,
    next_filing_due: '2026-12-10',
    compliance_score: 100,
  },
  {
    id: 'brela-005',
    reg_number: '159032-TZ',
    name: 'SERENGETI CLEARING & FORWARDING SERVICES',
    type: 'Business Name',
    status: 'Pending Annual Return',
    incorporation_date: '2022-01-18',
    tin: '155-902-113',
    registered_office: 'Gerezani Street, Block C, Room 4',
    region: 'Dar es Salaam',
    district: 'Ilala',
    directors: ['Rashid Hassan Mwinyi'],
    shareholders: ['Rashid Hassan Mwinyi (100%)'],
    last_annual_return_year: 2024,
    next_filing_due: '2025-01-18',
    compliance_score: 64,
  },
  {
    id: 'brela-006',
    reg_number: '048291-TZ',
    name: 'CRDB BANK PUBLIC LIMITED COMPANY',
    type: 'Public Limited Company',
    status: 'Registered',
    incorporation_date: '1996-06-30',
    tin: '100-009-211',
    vrn: '40000082-C',
    registered_office: 'CRDB HQ, Azikiwe Street',
    region: 'Dar es Salaam',
    district: 'Ilala',
    directors: ['Abdulmajid Nsekela', 'Ally Laay', 'Fred Msemwa'],
    shareholders: ['DANIDA Investment Fund (21%)', 'PSSSF (14%)', 'Public Investors (65%)'],
    last_annual_return_year: 2025,
    next_filing_due: '2026-06-30',
    compliance_score: 100,
  },
];

export function ComplyBrelaSearch() {
  const navigate = useNavigate();

  // BRELA ORS Form State — progressive disclosure: pick object type, then
  // pick which field to search by, then fill in the one relevant input.
  const [objectType, setObjectType] = useState<'Company' | 'Business name' | null>(null);
  const [searchBy, setSearchBy] = useState<'number' | 'name' | null>(null);
  const [incNumber, setIncNumber] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);
  const [importedStatus, setImportedStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Once a result is imported it's removed from this table (it now lives in
  // Company Directory as a draft profile) — tracked by reg_number since live
  // results get a freshly-generated `id` on every search.
  const [importedRegNumbers, setImportedRegNumbers] = useState<Set<string>>(new Set());
  const [importingRegNumber, setImportingRegNumber] = useState<string | null>(null);
  // Tracks whether the last search actually reached live BRELA data, so the
  // UI can be honest about it instead of silently mixing local reference
  // records in as if they were live results — BRELA has no public API and
  // its portal sits behind a WAF that blocks most non-browser requests, so
  // 'reference' is the expected outcome in most environments, not a bug.
  const [searchStatus, setSearchStatus] = useState<'idle' | 'live' | 'reference'>('idle');

  // Live / Captured Search Results (supports search by EITHER name OR incorporation number)
  const capturedResults = useMemo(() => {
    const rawNum = incNumber.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const rawName = companyName.trim().toLowerCase();

    if (!rawNum && !rawName) {
      return BRELA_ENTITY_DATABASE;
    }

    return BRELA_ENTITY_DATABASE.filter(item => {
      const itemNumClean = item.reg_number.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matchNum = rawNum ? itemNumClean.includes(rawNum) : false;
      const matchName = rawName ? item.name.toLowerCase().includes(rawName) : false;

      let matches = false;
      if (rawNum && rawName) {
        matches = matchNum || matchName;
      } else if (rawNum) {
        matches = matchNum;
      } else if (rawName) {
        matches = matchName;
      } else {
        matches = true;
      }

      const matchType = objectType === 'Company' ? item.type.includes('Company') : item.type === 'Business Name';
      return matches && matchType;
    });
  }, [incNumber, companyName, objectType]);

  const [liveSearchResults, setLiveSearchResults] = useState<BrelaEntity[] | null>(null);

  const displayResults = useMemo(() => {
    const results = liveSearchResults && liveSearchResults.length > 0 ? liveSearchResults : capturedResults;
    return results.filter(r => !importedRegNumbers.has(r.reg_number));
  }, [liveSearchResults, capturedResults, importedRegNumbers]);

  const handleLiveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);

    try {
      const res = await apiFetch('/v1/comply/brela-search', {
        method: 'POST',
        body: JSON.stringify({ objectType, incNumber, companyName }),
      });

      if (res?.success && Array.isArray(res.results) && res.results.length > 0) {
        // BRELA's public search only returns reg_number/name/type/status/
        // address/incorporation_date — TIN, directors, shareholders, filing
        // dates, and compliance score aren't part of that response. Leave
        // them honestly blank/empty rather than inventing plausible-looking
        // values, since these render as "Not available from BRELA public
        // search" (or are simply omitted) instead of fabricated data.
        const parsed: BrelaEntity[] = res.results.map((r: any, idx: number) => ({
          id: `brela-live-${idx}-${Date.now()}`,
          reg_number: r.reg_number,
          name: r.name,
          type: r.type || (objectType === 'Business name' ? 'Business Name' : 'Private Limited Company'),
          status: r.status || 'Registered',
          incorporation_date: r.incorporation_date ? String(r.incorporation_date).slice(0, 10) : '',
          tin: 'Not available from BRELA public search',
          registered_office: r.registered_office || 'Tanzania Registered Address',
          region: '',
          district: '',
          directors: [],
          shareholders: [],
          last_annual_return_year: 0,
          next_filing_due: '',
          compliance_score: 0,
        }));
        setLiveSearchResults(parsed);
        setSearchStatus('live');
      } else {
        setLiveSearchResults(null);
        setSearchStatus('reference');
      }
    } catch {
      setLiveSearchResults(null);
      setSearchStatus('reference');
    } finally {
      setSearching(false);
    }
  };

  const handleClearForm = () => {
    setObjectType(null);
    setSearchBy(null);
    setIncNumber('');
    setCompanyName('');
    setLiveSearchResults(null);
    setSearchStatus('idle');
  };

  const handleSelectObjectType = (type: 'Company' | 'Business name') => {
    setObjectType(type);
    setSearchBy(null);
    setIncNumber('');
    setCompanyName('');
  };

  const handleSelectSearchBy = (by: 'number' | 'name') => {
    setSearchBy(by);
    setIncNumber('');
    setCompanyName('');
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIncNumber(e.target.value.replace(/\D/g, '').slice(0, 9));
  };

  // Atomically creates a draft company profile (customers table, holding
  // state) and the linked Vault certificate — see
  // ComplyService.importBrelaCompany. The row then disappears from this
  // results table (it now lives in Company Directory) until the tenant
  // reviews and marks the profile complete, which is what actually moves it
  // into the live CRM.
  const handleImportToVault = async (entity: BrelaEntity) => {
    setImportingRegNumber(entity.reg_number);
    setImportError(null);
    try {
      await apiFetch('/v1/comply/brela-import', {
        method: 'POST',
        body: JSON.stringify({
          reg_number: entity.reg_number,
          name: entity.name,
          entity_type: entity.type,
          status: entity.status,
          incorporation_date: entity.incorporation_date || null,
          registered_office: entity.registered_office,
          tin: entity.tin,
        }),
      });
      setImportedRegNumbers(prev => new Set(prev).add(entity.reg_number));
      setImportedStatus(entity.name);
      setTimeout(() => setImportedStatus(null), 6000);
    } catch (err: any) {
      setImportError(err.message?.includes('already exists')
        ? `"${entity.name}" (${entity.reg_number}) is already in the Vault.`
        : `Could not import "${entity.name}": ${err.message || 'unknown error'}`);
      setTimeout(() => setImportError(null), 5000);
    } finally {
      setImportingRegNumber(null);
    }
  };

  const handlePrintCertificate = (entity: BrelaEntity) => {
    const footerHtml = getHudumikaFooterHtml('ComplyOS');
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>BRELA ORS Public Registry Search - ${entity.name}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; color: #0f172a; line-height: 1.5; }
    .header { border-bottom: 2.5px solid #eab308; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 11px; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; background: #f8fafc; }
    .label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
    .val { font-size: 14px; font-weight: 700; color: #0b1e3a; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size: 20px; font-weight: 800; color: #0b1e3a;">BRELA ONLINE REGISTRATION SYSTEM (ORS)</div>
      <div style="font-size: 12px; color: #64748b;">Public Business Registry Verification Result · Captured via ComplyOS</div>
    </div>
    <div class="badge">${entity.status}</div>
  </div>

  <div style="margin-bottom: 20px;">
    <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 6px 0; color: #0b1e3a;">${entity.name}</h1>
    <div style="font-size: 13px; color: #64748b;">Incorporation / Compliance Number: <strong>${entity.reg_number}</strong></div>
  </div>

  <div class="grid">
    <div class="box">
      <div class="label">Object Type</div>
      <div class="val">${entity.type}</div>
    </div>
    <div class="box">
      <div class="label">Status</div>
      <div class="val">${entity.status}</div>
    </div>
    <div class="box" style="grid-column: span 2;">
      <div class="label">Registered Address</div>
      <div class="val">${entity.registered_office}</div>
    </div>
  </div>

  ${footerHtml}
</body>
</html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400);
    }
  };

  return (
    <div className="comply-page">
      {/* Page Title Header */}
      <div className="comply-page-hdr">
        <div>
          <h1 className="comply-page-title">BRELA Search</h1>
          <p className="comply-page-sub">
            Search Tanzania's BRELA business registry and capture verified company records into ComplyOS.
          </p>
        </div>
        <div className="comply-action-row">
          <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => navigate('/complyos/brela-search/history')}>
            <Icon name="clock" size={13} />
            <span>History</span>
          </button>
          <a
            href="https://ors.brela.go.tz/orsreg/searchbusinesspublic"
            target="_blank"
            rel="noreferrer"
            className="comply-btn-secondary comply-btn-sm"
          >
            <Icon name="externalLink" size={13} />
            <span>Open BRELA ORS Portal</span>
          </a>
        </div>
      </div>

      {importedStatus && (
        <div className="comply-import-toast">
          <div className="comply-import-toast-icon">
            <Icon name="check" size={18} color="var(--green)" strokeWidth={2.5} />
          </div>
          <div className="comply-import-toast-body">
            <div className="comply-import-toast-title">Captured &ldquo;{importedStatus}&rdquo;</div>
            <div className="comply-import-toast-sub">Draft company profile created and Vault doc imported. Complete the profile to move it into the CRM.</div>
          </div>
          <button type="button" className="comply-btn-primary comply-btn-sm" onClick={() => navigate('/complyos/companies')}>
            <Icon name="briefcase" size={13} />
            <span>Open Company Directory</span>
          </button>
        </div>
      )}
      {importError && (
        <div className="comply-note comply-note--error comply-note--icon comply-mb-24">
          <Icon name="alertTriangle" size={15} />
          <span>{importError}</span>
        </div>
      )}

      {/* ── BRELA Search Form (Replicating BRELA Official Form) ── */}
      <form onSubmit={handleLiveSearch} className="comply-card comply-mb-24">
        <div className="comply-form-hero">
          <div className="comply-form-hero-icon">
            <Icon name="filter" size={20} color="var(--comply)" />
          </div>
          <div style={{ flex: 1 }}>
            <div className="comply-form-hero-title">Search the BRELA Registry</div>
            <div className="comply-form-hero-sub">Tanzania BRELA Public Registry — Online Registration System (ORS)</div>
          </div>
        </div>

        <div className="comply-form-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="comply-form-hint">
            <Icon name="info" size={13} />
            <span>Pick an object type, choose how you want to search, then enter the one relevant detail.</span>
          </div>

          <BrelaStepper
            objectType={objectType}
            searchBy={searchBy}
            hasValue={searchBy === 'number' ? incNumber.length > 0 : companyName.trim().length > 0}
          />

          {/* Step 1 — Object type */}
          <div className="comply-field-row">
            <label className="comply-step-label">Object type</label>
            <div className="comply-tile-row">
              <div
                className={`comply-tile${objectType === 'Company' ? ' comply-tile--active' : ''}`}
                onClick={() => handleSelectObjectType('Company')}
              >
                <div className="comply-tile-icon">
                  <Icon name="building" size={20} color={objectType === 'Company' ? 'var(--comply)' : 'var(--ink3)'} />
                </div>
                <div>
                  <div className="comply-tile-title">Company</div>
                  <div className="comply-tile-sub">Registered under the Companies Act</div>
                </div>
              </div>
              <div
                className={`comply-tile${objectType === 'Business name' ? ' comply-tile--active' : ''}`}
                onClick={() => handleSelectObjectType('Business name')}
              >
                <div className="comply-tile-icon">
                  <Icon name="briefcase" size={20} color={objectType === 'Business name' ? 'var(--comply)' : 'var(--ink3)'} />
                </div>
                <div>
                  <div className="comply-tile-title">Business Name</div>
                  <div className="comply-tile-sub">Sole proprietorship or partnership</div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 — Search by, only once an object type is chosen */}
          {objectType && (
            <div className="comply-field-row">
              <label className="comply-step-label">Search by</label>
              <div className="comply-choice-row">
                <div
                  className={`comply-choice-card${searchBy === 'number' ? ' comply-choice-card--active' : ''}`}
                  onClick={() => handleSelectSearchBy('number')}
                >
                  <Icon name="hash" size={16} color={searchBy === 'number' ? 'var(--comply)' : 'var(--ink3)'} />
                  <span>{objectType === 'Business name' ? 'Registration number' : 'Incorporation number'}</span>
                </div>
                <div
                  className={`comply-choice-card${searchBy === 'name' ? ' comply-choice-card--active' : ''}`}
                  onClick={() => handleSelectSearchBy('name')}
                >
                  <Icon name="fileText" size={16} color={searchBy === 'name' ? 'var(--comply)' : 'var(--ink3)'} />
                  <span>{objectType === 'Business name' ? 'Business Name' : 'Company name'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — the single relevant input, only once a search-by method is chosen */}
          {searchBy === 'number' && (
            <div className="comply-field-row">
              <label className="comply-field-label">
                {objectType === 'Business name' ? 'Registration number' : 'Incorporation number'}
              </label>
              <input
                type="text"
                className="input-field"
                value={incNumber}
                onChange={handleNumberChange}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={9}
                placeholder="e.g. 137644169"
              />
            </div>
          )}
          {searchBy === 'name' && (
            <div className="comply-field-row">
              <label className="comply-field-label">
                {objectType === 'Business name' ? 'Business Name' : 'Company name'}
              </label>
              <input
                type="text"
                className="input-field"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="e.g. ALEKA HOLDINGS LIMITED"
              />
            </div>
          )}

          {/* Action Buttons — no "Back": BRELA Search is a sidebar destination,
              not a drill-down flow, so a stack-navigation Back button doesn't
              apply here (History, above, is the actual related destination). */}
          <div className="comply-action-row comply-form-actions" style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button type="submit" className="comply-btn-primary" disabled={searching || !searchBy || (searchBy === 'number' ? !incNumber : !companyName)}>
              <Icon name="search" size={15} />
              <span>{searching ? 'Searching BRELA…' : 'Search BRELA'}</span>
            </button>
            <button type="button" className="comply-btn-secondary" onClick={handleClearForm} disabled={searching}>
              <Icon name="refresh" size={14} />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </form>

      {/* ── Results — only appear after an actual search, cards not a table ── */}
      {searchStatus !== 'idle' && (
        <>
          {searchStatus === 'live' && (
            <div className="comply-note comply-note--success comply-note--icon">
              <Icon name="checkCircle" size={15} />
              <span><strong>Live from BRELA</strong> — these results were fetched from the BRELA ORS portal just now, not local reference data.</span>
            </div>
          )}
          {searchStatus === 'reference' && (
            <div className="comply-note comply-note--warning comply-note--icon">
              <Icon name="alertTriangle" size={15} />
              <span><strong>Showing local reference data</strong> — the BRELA ORS portal didn't return live results for this query (it has no public API and blocks most automated requests). The records below are Hudumika's own reference set, not live BRELA data. Use "Open BRELA ORS Portal" above to search the official site directly.</span>
            </div>
          )}

          {displayResults.length === 0 ? (
            <div className="comply-card">
              <div className="comply-empty-hint" style={{ textAlign: 'center', padding: 32 }}>
                No matching BRELA ORS record found for <strong>"{incNumber || companyName}"</strong>.
              </div>
            </div>
          ) : (
            <div className="comply-result-grid">
              {displayResults.map(entity => (
                <div className="comply-result-card" key={entity.id}>
                  <div className="comply-result-hdr">
                    <div className="comply-result-icon">
                      <Icon name={entity.type === 'Business Name' ? 'briefcase' : 'building'} size={17} color="var(--comply)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="comply-result-name">{entity.name}</div>
                      <div className="comply-result-tin">
                        <span className="comply-result-tin-label">TIN</span>
                        {formatDashedDigits9(entity.reg_number)}
                      </div>
                    </div>
                    <span className={`comply-badge comply-badge--${badgeVariantForStatus(entity.status)}`}>{entity.status}</span>
                  </div>

                  <div className="comply-result-address">{entity.registered_office}</div>

                  <div className="comply-result-actions">
                    <button
                      type="button"
                      className="comply-btn-secondary comply-btn-sm"
                      onClick={() => handleImportToVault(entity)}
                      disabled={importingRegNumber === entity.reg_number}
                    >
                      {importingRegNumber === entity.reg_number
                        ? <span style={{ display: 'inline-flex', animation: 'spin 0.8s linear infinite' }}><Icon name="refresh" size={13} /></span>
                        : <Icon name="plus" size={13} />}
                      <span>{importingRegNumber === entity.reg_number ? 'Importing…' : 'Import to ComplyOS'}</span>
                    </button>
                    <button type="button" className="comply-btn-secondary comply-btn-sm" onClick={() => handlePrintCertificate(entity)} title="Print BRELA Summary">
                      <Icon name="printer" size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Numbered progress stepper for the search form above ── */
function BrelaStepper({ objectType, searchBy, hasValue }: {
  objectType: 'Company' | 'Business name' | null;
  searchBy: 'number' | 'name' | null;
  hasValue: boolean;
}) {
  const steps = [
    { label: 'Object Type', done: objectType !== null },
    { label: 'Search By',   done: searchBy !== null },
    { label: 'Details',     done: hasValue },
  ];
  const activeIndex = steps.findIndex(s => !s.done);

  return (
    <div className="comply-stepper">
      {steps.map((step, i) => (
        <React.Fragment key={step.label}>
          <div className="comply-stepper-step">
            <div className={`comply-stepper-circle${step.done ? ' comply-stepper-circle--done' : i === activeIndex ? ' comply-stepper-circle--active' : ''}`}>
              {step.done ? <Icon name="check" size={13} color="#fff" strokeWidth={3} /> : i + 1}
            </div>
            <span className={`comply-stepper-label${i === activeIndex ? ' comply-stepper-label--active' : ''}`}>{step.label}</span>
          </div>
          {i < steps.length - 1 && <div className={`comply-stepper-connector${step.done ? ' comply-stepper-connector--done' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}
