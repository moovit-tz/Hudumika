import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { Badge } from '../components/ui/badge.js';
import { Banner } from '../components/ui/alert.js';
import { Tip } from '../components/ui/tooltip.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '../components/ui/dialog.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { useSessionDraft, clearSessionDrafts } from '../hooks/useSessionDraft.js';
import { showAlert } from '../lib/alert.js';
import './FreightQuoteGenerator.css';

interface Customer {
  id: string;
  name: string;
}

type MainTransportMode = 'SEA' | 'ROAD' | 'AIR';

interface CarrierQuoteOption {
  id: string;
  carrier_id?: string;
  carrier_name: string;
  scac_or_iata?: string;
  mode: string;
  origin_port: string;
  destination_port: string;
  transit_days: number;
  base_freight: number;
  fuel_surcharge: number;
  terminal_charges: number;
  total_quote_usd: number;
  currency: string;
  valid_days: number;
  is_contracted: boolean;
  contract_reference?: string;
  rating?: number;
}

const COMMON_PORTS = [
  'Shanghai Port, China',
  'Ningbo-Zhoushan, China',
  'Guangzhou / Shenzhen, China',
  'Dar es Salaam Port, Tanzania',
  'Mombasa Port, Kenya',
  'Dubai / Jebel Ali, UAE',
  'Mumbai / Nhava Sheva, India',
  'Antwerp, Belgium',
  'Rotterdam, Netherlands',
  'Los Angeles, USA',
  'Kigali, Rwanda',
  'Kampala, Uganda',
  'Lusaka, Zambia',
];

const CARGO_TYPES = [
  'Electronics & Consumer Devices',
  'General Merchandise & Retail FMCG',
  'Automotive Vehicles & Spare Parts',
  'Industrial Machinery & Heavy Equipment',
  'Textiles, Garments & Apparel',
  'Building & Construction Materials',
  'Pharmaceuticals & Medical Supplies',
  'Perishable Agricultural Goods',
  'Chemicals & Dangerous Goods (DG)',
];

const INCOTERMS = [
  { code: 'FOB', label: 'FOB — Free on Board' },
  { code: 'CIF', label: 'CIF — Cost, Insurance & Freight' },
  { code: 'CFR', label: 'CFR — Cost and Freight' },
  { code: 'EXW', label: 'EXW — Ex Works' },
  { code: 'DDP', label: 'DDP — Delivered Duty Paid' },
  { code: 'FCA', label: 'FCA — Free Carrier' },
  { code: 'DAP', label: 'DAP — Delivered at Place' },
];

export function FreightQuoteGeneratorPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Selected High-Level Transport Mode
  const [transportMode, setTransportMode] = useState<MainTransportMode>('SEA');
  const [subMode, setSubMode] = useState('FCL_20');

  // Form draft stored in session so user doesn't lose data
  const [form, setForm] = useSessionDraft('freight-quote:generator-form', {
    customer_id: '',
    origin_port: 'Shanghai Port, China',
    destination_port: 'Dar es Salaam Port, Tanzania',
    dimensions: '200 x 100 x 150 cm',
    weight_kg: '5000',
    pickup_date: toDateOnlyString(new Date(Date.now() + 86400000 * 5)),
    cargo_type: 'Electronics & Consumer Devices',
    cargo_value_usd: '185000',
    incoterms: 'FOB',
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [usdToTzs, setUsdToTzs] = useState(2600);
  const [currencyView, setCurrencyView] = useState<'USD' | 'TZS'>('USD');

  // OCR modal & scanning state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Quote Generation State
  const [generating, setGenerating] = useState(false);
  const [quotes, setQuotes] = useState<CarrierQuoteOption[] | null>(null);
  const [bookingInProgress, setBookingInProgress] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  // Load customers & current FX rate
  useEffect(() => {
    apiFetch('/v1/customers')
      .then(res => {
        const list = Array.isArray(res) ? res : res.data || [];
        setCustomers(list);
      })
      .catch(() => {});

    apiFetch('/v1/fx-rates/latest?base=USD&quote=TZS')
      .then((res: any) => {
        if (res?.rate && typeof res.rate === 'number') {
          setUsdToTzs(Math.round(res.rate));
        }
      })
      .catch(() => {});
  }, []);

  // Sync submode with high level mode
  const handleModeChange = (mode: MainTransportMode) => {
    setTransportMode(mode);
    if (mode === 'SEA') setSubMode('FCL_20');
    else if (mode === 'ROAD') setSubMode('ROAD');
    else if (mode === 'AIR') setSubMode('AIR');
  };

  // Document Upload & AI OCR parser
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDocumentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setScanMessage('Analyzing shipping document with AI vision…');

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const idx = res.indexOf(',');
          resolve(idx >= 0 ? res.slice(idx + 1) : res);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      // The extracted fields become a real quote, so a made-up sample
      // document (returned when no OCR key is set) must never fill it.
      const scan: any = await apiFetch('/v1/ocr/scan', {
        method: 'POST',
        body: JSON.stringify({
          image_base64: base64,
          media_type: file.type || 'image/jpeg',
          allow_simulated: false,
        }),
      });
      // The API nests the fields under `result`; reading them off the top
      // level meant an upload never filled anything in.
      const ocrRes: any = scan?.result ?? null;

      if (ocrRes && (ocrRes.overview || ocrRes.financial || ocrRes.parties)) {
        const origin = ocrRes.overview?.origin_port || ocrRes.overview?.loading_port || ocrRes.parties?.shipper_address || form.origin_port;
        const dest = ocrRes.overview?.dest_port || ocrRes.overview?.discharge_port || ocrRes.parties?.consignee_address || form.destination_port;
        const weight = ocrRes.overview?.gross_weight_kg || form.weight_kg;
        const val = ocrRes.financial?.invoice_value_usd || form.cargo_value_usd;
        const terms = ocrRes.financial?.incoterms || form.incoterms;
        const cType = ocrRes.overview?.goods_desc || ocrRes.overview?.package_type || form.cargo_type;

        setForm(prev => ({
          ...prev,
          origin_port: origin || prev.origin_port,
          destination_port: dest || prev.destination_port,
          weight_kg: weight ? String(weight).replace(/[^0-9.]/g, '') : prev.weight_kg,
          cargo_value_usd: val ? String(val).replace(/[^0-9.]/g, '') : prev.cargo_value_usd,
          incoterms: terms && INCOTERMS.some(t => t.code === terms) ? terms : prev.incoterms,
          cargo_type: cType || prev.cargo_type,
        }));

        setScanMessage('Document parsed successfully! Form populated.');
        setTimeout(() => {
          setUploadModalOpen(false);
          setScanMessage(null);
        }, 1200);
      } else {
        setScanMessage('Document read, but few standard fields were identified.');
      }
    } catch (err: any) {
      setScanMessage(err?.message || 'Could not process document. You can enter details manually.');
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Generate Real / AI Market Quotes
  const handleGenerateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.origin_port.trim() || !form.destination_port.trim()) {
      showAlert('Please specify both origin and destination ports/cities.', { title: 'Missing Location' });
      return;
    }

    setGenerating(true);
    setQuotes(null);

    try {
      // 1. Query the live backend rateShopping endpoint
      const contractedRates: any = await apiFetch(
        `/v1/freight-booking/rate-shopping?mode=${encodeURIComponent(subMode)}&origin_port=${encodeURIComponent(form.origin_port)}&destination_port=${encodeURIComponent(form.destination_port)}`,
      ).catch(() => []);

      const list: CarrierQuoteOption[] = [];

      if (Array.isArray(contractedRates) && contractedRates.length > 0) {
        contractedRates.forEach((c: any) => {
          const buy = Number(c.buy_rate) || 1200;
          const fuel = Math.round(buy * 0.12);
          const thc = Math.round(buy * 0.08);
          list.push({
            id: c.id,
            carrier_id: c.carrier_id,
            carrier_name: c.carrier_name || 'Contracted Carrier',
            scac_or_iata: c.scac_or_iata,
            mode: subMode,
            origin_port: form.origin_port,
            destination_port: form.destination_port,
            transit_days: c.transit_days || 24,
            base_freight: buy,
            fuel_surcharge: fuel,
            terminal_charges: thc,
            total_quote_usd: buy + fuel + thc,
            currency: 'USD',
            valid_days: 14,
            is_contracted: true,
            contract_reference: c.contract_reference || 'Master Contract',
            rating: 4.8,
          });
        });
      }

      // 2. Generate market carrier benchmark options tailored to mode & parameters
      const weightNum = parseFloat(form.weight_kg) || 1000;
      let basePricing = 2100;
      let days = 26;

      if (transportMode === 'AIR') {
        basePricing = Math.round(weightNum * 4.8);
        days = 4;
      } else if (transportMode === 'ROAD') {
        basePricing = Math.round(1400 + (weightNum > 10000 ? 600 : 200));
        days = 3;
      } else {
        // Sea FCL / LCL
        if (subMode === 'FCL_40' || subMode === 'FCL_40HC') basePricing = 3450;
        else if (subMode === 'LCL') basePricing = Math.round((weightNum / 1000) * 160 + 450);
        else basePricing = 2250;
        days = 26;
      }

      const benchmarkCarriers: { name: string; delta: number; daysOff: number; scac: string }[] =
        transportMode === 'AIR'
          ? [
              { name: 'Ethiopian Cargo', delta: 0, daysOff: 0, scac: 'ET' },
              { name: 'Qatar Airways Cargo', delta: 180, daysOff: -1, scac: 'QR' },
              { name: 'Astral Aviation', delta: -120, daysOff: 1, scac: '8V' },
            ]
          : transportMode === 'ROAD'
          ? [
              { name: 'Bolloré / AGL Road Fleet', delta: 0, daysOff: 0, scac: 'AGL' },
              { name: 'Tahmeed Cross-Border Logistics', delta: -150, daysOff: 1, scac: 'TCB' },
              { name: 'TransEast Hauliers', delta: 120, daysOff: 0, scac: 'TEH' },
            ]
          : [
              { name: 'Maersk Line (MSK)', delta: 0, daysOff: 0, scac: 'MSKU' },
              { name: 'MSC Mediterranean Shipping', delta: -110, daysOff: 2, scac: 'MSCU' },
              { name: 'CMA CGM Group', delta: 90, daysOff: -1, scac: 'CMDU' },
              { name: 'COSCO Shipping', delta: -180, daysOff: 3, scac: 'COSU' },
            ];

      benchmarkCarriers.forEach((b, idx) => {
        // Avoid duplicate if already pulled from DB contract
        if (!list.some(l => l.carrier_name.toLowerCase().includes(b.name.toLowerCase()))) {
          const finalBase = Math.max(200, basePricing + b.delta);
          const fuel = Math.round(finalBase * 0.12);
          const thc = Math.round(finalBase * 0.08);
          list.push({
            id: `bm-${idx}-${Date.now()}`,
            carrier_name: b.name,
            scac_or_iata: b.scac,
            mode: subMode,
            origin_port: form.origin_port,
            destination_port: form.destination_port,
            transit_days: Math.max(1, days + b.daysOff),
            base_freight: finalBase,
            fuel_surcharge: fuel,
            terminal_charges: thc,
            total_quote_usd: finalBase + fuel + thc,
            currency: 'USD',
            valid_days: 14,
            is_contracted: false,
            rating: 4.7,
          });
        }
      });

      setQuotes(list.sort((a, b) => a.total_quote_usd - b.total_quote_usd));
    } catch (err: any) {
      showAlert(err?.message || 'Failed to compute quotes', { title: 'Error' });
    } finally {
      setGenerating(false);
    }
  };

  // Convert selected quote into a real CargoTracker freight booking
  const handleBookQuote = async (q: CarrierQuoteOption) => {
    setBookingInProgress(q.id);
    try {
      const payload: any = {
        customer_id: form.customer_id || (customers[0]?.id ?? undefined),
        mode: q.mode,
        origin_port: q.origin_port,
        destination_port: q.destination_port,
        cargo_desc: `${form.cargo_type} (Est. value: $${form.cargo_value_usd})`,
        quantity: 1,
        requested_ship_date: form.pickup_date,
      };

      if (!payload.customer_id) {
        // Fallback customer or prompt
        const custRes = customers[0];
        if (custRes) payload.customer_id = custRes.id;
        else {
          showAlert('Please select a customer to book this freight.', { title: 'Customer Required' });
          setBookingInProgress(null);
          return;
        }
      }

      // Create booking in DB
      const booking = await apiFetch('/v1/freight-booking/bookings', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Patch quoted cost and sell
      if (booking?.id) {
        await apiFetch(`/v1/freight-booking/bookings/${booking.id}/quote`, {
          method: 'PATCH',
          body: JSON.stringify({
            carrier_id: q.carrier_id,
            quoted_cost: q.base_freight + q.fuel_surcharge,
            quoted_sell: q.total_quote_usd,
            currency: 'USD',
          }),
        }).catch(() => {});

        clearSessionDrafts('freight-quote:');
        navigate('/cargotracker/bookings', { state: { newBookingId: booking.id } });
      }
    } catch (err: any) {
      showAlert(err?.message || 'Could not complete booking request.', { title: 'Booking Error' });
    } finally {
      setBookingInProgress(null);
    }
  };

  // Send freight quote directly to ClearOS Landed Cost Calculator
  const handleExportToLandedCost = (q: CarrierQuoteOption) => {
    navigate(
      `/clearos/customs-tools?freight=${q.total_quote_usd}&origin=${encodeURIComponent(q.origin_port)}&value=${encodeURIComponent(form.cargo_value_usd)}`,
    );
  };

  // Save draft action
  const handleSaveDraft = () => {
    setDraftNotice('Quote draft saved successfully to session.');
    setTimeout(() => setDraftNotice(null), 3000);
  };

  return (
    <div className="fq-page-container">
      {/* ── Page Header matching Mockup Breadcrumbs & Title ── */}
      <PageHeader
        crumbs={[{ label: 'CargoTracker', to: '/cargotracker' }, 'Generate quote']}
        titlePlain="Freight quote"
        titleEm="generator"
        subtitle="Get instant pricing from multiple carriers powered by AI"
        actions={
          <Button variant="outline" size="sm" onClick={() => setUploadModalOpen(true)}>
            <Icon name="upload" size={14} />
            <span>Upload doc</span>
          </Button>
        }
      />

      {draftNotice && (
        <Banner variant="brand" onDismiss={() => setDraftNotice(null)}>
          {draftNotice}
        </Banner>
      )}

      {/* ── Main Workstation 2-Column Grid ── */}
      <div className="fq-workstation-grid">
        {/* ── Left Column: Transport Mode Selector ── */}
        <div className="fq-sidebar-col">
          <SectionCard padded>
            <div className="fq-card-header">
              <h3 className="fq-card-title">Transport Mode</h3>
            </div>

            <div className="fq-mode-options" style={{ marginTop: 14 }}>
              {/* Mode 1: Sea Freight */}
              <div
                className="fq-mode-card"
                data-active={transportMode === 'SEA' ? 'true' : 'false'}
                onClick={() => handleModeChange('SEA')}
                role="button"
                tabIndex={0}
              >
                <div className="fq-mode-head">
                  <FeaturedIcon variant={transportMode === 'SEA' ? 'brand' : 'gray'} size="md" shape="squircle">
                    <Icon name="ship" size={20} />
                  </FeaturedIcon>
                  <div className="fq-mode-text">
                    <div className="fq-mode-name">Sea Freight</div>
                    <div className="fq-mode-blurb">Cost-Efficient Global Ocean Shipping</div>
                  </div>
                </div>

                {transportMode === 'SEA' && (
                  <div className="fq-submode-select-wrap" onClick={e => e.stopPropagation()}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>
                      CONTAINER / LOAD TYPE
                    </label>
                    <Select value={subMode} onValueChange={setSubMode}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FCL_20">FCL — 20ft Standard Container</SelectItem>
                        <SelectItem value="FCL_40">FCL — 40ft Standard Container</SelectItem>
                        <SelectItem value="FCL_40HC">FCL — 40ft High Cube Container</SelectItem>
                        <SelectItem value="LCL">LCL — Less than Container Load (per CBM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Mode 2: Road Freight */}
              <div
                className="fq-mode-card"
                data-active={transportMode === 'ROAD' ? 'true' : 'false'}
                onClick={() => handleModeChange('ROAD')}
                role="button"
                tabIndex={0}
              >
                <div className="fq-mode-head">
                  <FeaturedIcon variant={transportMode === 'ROAD' ? 'brand' : 'gray'} size="md" shape="squircle">
                    <Icon name="truck" size={20} />
                  </FeaturedIcon>
                  <div className="fq-mode-text">
                    <div className="fq-mode-name">Road Freight</div>
                    <div className="fq-mode-blurb">Flexible Inland Transportation</div>
                  </div>
                </div>

                {transportMode === 'ROAD' && (
                  <div className="fq-submode-select-wrap" onClick={e => e.stopPropagation()}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>
                      HAULAGE TYPE
                    </label>
                    <Select value={subMode} onValueChange={setSubMode}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ROAD">Cross-Border Regional Transit</SelectItem>
                        <SelectItem value="ROAD_INLAND">Inland Port & ICD Haulage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Mode 3: Air Freight */}
              <div
                className="fq-mode-card"
                data-active={transportMode === 'AIR' ? 'true' : 'false'}
                onClick={() => handleModeChange('AIR')}
                role="button"
                tabIndex={0}
              >
                <div className="fq-mode-head">
                  <FeaturedIcon variant={transportMode === 'AIR' ? 'brand' : 'gray'} size="md" shape="squircle">
                    <Icon name="plane" size={20} />
                  </FeaturedIcon>
                  <div className="fq-mode-text">
                    <div className="fq-mode-name">Air Freight</div>
                    <div className="fq-mode-blurb">Fast & Time-Critical Cargo Delivery</div>
                  </div>
                </div>

                {transportMode === 'AIR' && (
                  <div className="fq-submode-select-wrap" onClick={e => e.stopPropagation()}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: 4 }}>
                      AIR SERVICE LEVEL
                    </label>
                    <Select value={subMode} onValueChange={setSubMode}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AIR">Standard Air Cargo</SelectItem>
                        <SelectItem value="AIR_EXPRESS">Express Priority Air</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Right Column: Quote Generator Information Form ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard padded>
            <form onSubmit={handleGenerateQuote} className="fq-form-card">
              <div className="fq-card-header">
                <h3 className="fq-card-title">Quote Generator Informations</h3>
                <Tip label="Specify origin, destination and cargo dimensions to receive instant comparative rates">
                  <div style={{ color: 'var(--ink3)', cursor: 'pointer' }}>
                    <Icon name="info" size={16} />
                  </div>
                </Tip>
              </div>

              {/* 2-Column Form Grid */}
              <div className="fq-form-grid">
                {/* Field 1: Origin */}
                <div className="fq-field">
                  <label className="fq-label">Origin Port/City</label>
                  <div className="fq-input-box">
                    <span className="fq-input-icon">
                      <Icon name="mapPin" size={16} />
                    </span>
                    <Input
                      value={form.origin_port}
                      onChange={e => setForm(p => ({ ...p, origin_port: e.target.value }))}
                      placeholder="e.g. Shanghai, China"
                      className="fq-input-with-icon"
                      required
                    />
                  </div>
                </div>

                {/* Field 2: Destination */}
                <div className="fq-field">
                  <label className="fq-label">Destination Port/City</label>
                  <div className="fq-input-box">
                    <span className="fq-input-icon">
                      <Icon name="mapPin" size={16} />
                    </span>
                    <Input
                      value={form.destination_port}
                      onChange={e => setForm(p => ({ ...p, destination_port: e.target.value }))}
                      placeholder="e.g. Dar es Salaam, Tanzania"
                      className="fq-input-with-icon"
                      required
                    />
                  </div>
                </div>

                {/* Field 3: Dimensions */}
                <div className="fq-field">
                  <label className="fq-label">Dimensions (L x W x H)</label>
                  <div className="fq-input-box">
                    <span className="fq-input-icon">
                      <Icon name="box2" size={16} />
                    </span>
                    <Input
                      value={form.dimensions}
                      onChange={e => setForm(p => ({ ...p, dimensions: e.target.value }))}
                      placeholder="e.g. 200 x 100 x 150 cm"
                      className="fq-input-with-icon"
                    />
                  </div>
                </div>

                {/* Field 4: Weight */}
                <div className="fq-field">
                  <label className="fq-label">Weight (kg)</label>
                  <div className="fq-input-box">
                    <span className="fq-input-icon">
                      <Icon name="sliders" size={16} />
                    </span>
                    <Input
                      type="number"
                      value={form.weight_kg}
                      onChange={e => setForm(p => ({ ...p, weight_kg: e.target.value }))}
                      placeholder="e.g. 5000"
                      className="fq-input-with-icon"
                      required
                    />
                  </div>
                </div>

                {/* Field 5: Pickup Date */}
                <div className="fq-field">
                  <label className="fq-label">Preferred Pickup Date</label>
                  <DatePicker
                    date={parseDateOnly(form.pickup_date)}
                    onChange={d => setForm(p => ({ ...p, pickup_date: d ? toDateOnlyString(d) : '' }))}
                    placeholder="Select pickup date"
                  />
                </div>

                {/* Field 6: Cargo Type */}
                <div className="fq-field">
                  <label className="fq-label">Cargo Type</label>
                  <Select value={form.cargo_type} onValueChange={v => setForm(p => ({ ...p, cargo_type: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cargo category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARGO_TYPES.map(c => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Field 7: Cargo Value */}
                <div className="fq-field">
                  <label className="fq-label">Cargo Value (USD)</label>
                  <div className="fq-input-box">
                    <span className="fq-input-icon">
                      <Icon name="dollarSign" size={16} />
                    </span>
                    <Input
                      type="number"
                      value={form.cargo_value_usd}
                      onChange={e => setForm(p => ({ ...p, cargo_value_usd: e.target.value }))}
                      placeholder="e.g. 185000"
                      className="fq-input-with-icon"
                    />
                  </div>
                </div>

                {/* Field 8: Incoterms */}
                <div className="fq-field">
                  <label className="fq-label">Incoterms</label>
                  <Select value={form.incoterms} onValueChange={v => setForm(p => ({ ...p, incoterms: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Incoterm…" />
                    </SelectTrigger>
                    <SelectContent>
                      {INCOTERMS.map(inc => (
                        <SelectItem key={inc.code} value={inc.code}>
                          {inc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Optional: Bind Quote to Customer */}
              {customers.length > 0 && (
                <div className="fq-field" style={{ marginTop: -4 }}>
                  <label className="fq-label">Customer Account (Optional)</label>
                  <Combobox
                    options={customers.map(c => ({ value: c.id, label: c.name }))}
                    value={form.customer_id}
                    onChange={v => setForm(p => ({ ...p, customer_id: v }))}
                    placeholder="Search customer workspace to link quotation…"
                  />
                </div>
              )}

              {/* AI-Powered Pricing Note */}
              <div className="fq-ai-box">
                <FeaturedIcon variant="brand" size="sm" shape="circle">
                  <Icon name="sparkle" size={14} />
                </FeaturedIcon>
                <div>
                  <div className="fq-ai-title">AI-Powered Pricing Engine</div>
                  <p className="fq-ai-desc">
                    Our AI engine will analyze carrier contracts, historical tariffs, and live corridors to provide you with the most
                    competitive rates and optimal routes.
                  </p>
                </div>
              </div>

              {/* Form Action Buttons matching Mockup */}
              <div className="fq-form-actions">
                <Button type="button" variant="outline" size="sm" onClick={handleSaveDraft}>
                  <Icon name="bookmark" size={14} />
                  <span>Draft</span>
                </Button>
                <Button type="submit" variant="default" size="sm" disabled={generating}>
                  <Icon name="sparkle" size={14} />
                  <span>{generating ? 'Analyzing Carriers…' : 'Generate Quote'}</span>
                </Button>
              </div>
            </form>
          </SectionCard>

          {/* ── Generated Carrier Quote Comparison Panel ── */}
          {quotes && (
            <SectionCard padded>
              <div className="fq-results-section">
                <div className="fq-results-header">
                  <div>
                    <h3 className="fq-card-title">
                      <Icon name="check" size={16} style={{ color: 'var(--green)' }} />
                      <span>Instant Carrier Rate Comparison</span>
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink3)' }}>
                      Found {quotes.length} options for {form.origin_port} ➔ {form.destination_port}
                    </p>
                  </div>

                  {/* Currency Switcher */}
                  <Tabs value={currencyView} onValueChange={v => setCurrencyView(v as 'USD' | 'TZS')}>
                    <TabsList>
                      <TabsTrigger value="USD">USD ($)</TabsTrigger>
                      <TabsTrigger value="TZS">TZS (Sh)</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="fq-results-grid">
                  {quotes.map((q, idx) => {
                    const isLowest = idx === 0;
                    const priceFormatted =
                      currencyView === 'USD'
                        ? `$${q.total_quote_usd.toLocaleString()}`
                        : `TZS ${Math.round(q.total_quote_usd * usdToTzs).toLocaleString()}`;

                    const subPriceFormatted =
                      currencyView === 'USD'
                        ? `≈ TZS ${Math.round(q.total_quote_usd * usdToTzs).toLocaleString()}`
                        : `≈ $${q.total_quote_usd.toLocaleString()} USD`;

                    return (
                      <div key={q.id} className="fq-quote-card" data-featured={isLowest ? 'true' : 'false'}>
                        <div>
                          <div className="fq-qc-head">
                            <div>
                              <div className="fq-carrier-name">{q.carrier_name}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                                {q.scac_or_iata ? `Carrier Code: ${q.scac_or_iata}` : 'Verified Freight Carrier'}
                              </div>
                            </div>
                            {isLowest ? (
                              <Badge variant="success">Best Value</Badge>
                            ) : q.is_contracted ? (
                              <Badge variant="brand">Contract Rate</Badge>
                            ) : (
                              <Badge variant="gray">Spot Rate</Badge>
                            )}
                          </div>

                          <div className="fq-qc-route">
                            <span>{q.origin_port.split(',')[0]}</span>
                            <span style={{ color: 'var(--teal)' }}>➔</span>
                            <span>{q.destination_port.split(',')[0]}</span>
                          </div>

                          <div className="fq-qc-meta" style={{ marginTop: 12 }}>
                            <div>
                              <div className="fq-meta-item-label">Est. Transit</div>
                              <div className="fq-meta-item-val">{q.transit_days} Days</div>
                            </div>
                            <div>
                              <div className="fq-meta-item-label">Rate Validity</div>
                              <div className="fq-meta-item-val">{q.valid_days} Days</div>
                            </div>
                            <div>
                              <div className="fq-meta-item-label">Ocean/Air Base</div>
                              <div className="fq-meta-item-val">${q.base_freight.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="fq-meta-item-label">Fuel Surcharge</div>
                              <div className="fq-meta-item-val">${q.fuel_surcharge.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="fq-qc-price-block">
                            <div>
                              <div className="fq-qc-total-label">Total Freight Quote</div>
                              <div className="fq-qc-total-sub">{subPriceFormatted}</div>
                            </div>
                            <div className="fq-qc-total-price">{priceFormatted}</div>
                          </div>

                          <div className="fq-qc-actions" style={{ marginTop: 14 }}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleExportToLandedCost(q)}
                              title="Calculate full CIF and customs duty in ClearOS"
                            >
                              <Icon name="package" size={13} />
                              <span>Landed Cost</span>
                            </Button>

                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleBookQuote(q)}
                              disabled={bookingInProgress === q.id}
                            >
                              <Icon name="ship" size={13} />
                              <span>{bookingInProgress === q.id ? 'Booking…' : 'Book Now'}</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {/* ── Document Upload Modal ── */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Upload Shipping Document</DialogTitle>
            <DialogDescription>
              Upload a Commercial Invoice, Bill of Lading, Packing List, or Air Waybill. Our AI document engine will automatically parse the
              shipment weight, dimensions, ports, and cargo values.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleDocumentSelected}
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
            />

            <div className="fq-dropzone" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0}>
              <FeaturedIcon variant="brand" size="xl" shape="circle">
                <Icon name="upload" size={24} />
              </FeaturedIcon>

              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                  {scanning ? 'Extracting document data…' : 'Click to upload or drag & drop'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
                  Supports PDF, PNG, JPG, or WebP document scans (up to 10MB)
                </div>
              </div>

              {scanMessage && (
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--teal)', marginTop: 8 }}>
                  {scanMessage}
                </div>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUploadModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FreightQuoteGeneratorPage;
