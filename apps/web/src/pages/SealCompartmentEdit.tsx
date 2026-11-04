import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface Compartment {
  id: string;
  code: string;
  name: string;
  warehouse_type: string;
  jurisdiction: string;
  default_storage_days: number;
  guarantee_id: string | null;
  storage_fee_per_day: string;
  storage_fee_currency: string;
  handling_fee_flat: string;
  storage_fee_per_cbm_per_day: string;
  billing_method: 'flat_per_lot' | 'per_cbm';
  geofence_id: string | null;
  active: boolean;
  licence_number?: string | null;
  licence_expiry?: string | null;
  customs_office_code?: string | null;
  logo_url?: string | null;
}

const WAREHOUSE_TYPES = [
  'public_bonded',
  'private_bonded',
  'cfs',
  'icd',
  'virtual_icd',
  'free_zone',
  'duty_free_retail',
  'excise',
  'sorting_centre',
  'fulfillment_centre',
  'standard_warehouse',
];

export function SealCompartmentEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [warehouseType, setWarehouseType] = useState('cfs');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [licenceExpiry, setLicenceExpiry] = useState('');
  const [customsOfficeCode, setCustomsOfficeCode] = useState('');
  const [jurisdiction, setJurisdiction] = useState('TZ');
  const [defaultStorageDays, setDefaultStorageDays] = useState(180);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);

  // Billing Fields
  const [billingMethod, setBillingMethod] = useState<'flat_per_lot' | 'per_cbm'>('flat_per_lot');
  const [storageFeePerDay, setStorageFeePerDay] = useState('0');
  const [storageFeeCurrency, setStorageFeeCurrency] = useState('TZS');
  const [handlingFeeFlat, setHandlingFeeFlat] = useState('0');
  const [storageFeePerCbmPerDay, setStorageFeePerCbmPerDay] = useState('0');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/compartments/${id}`)
      .then(res => {
        const c: Compartment = res.compartment;
        setCode(c.code || '');
        setName(c.name || '');
        setWarehouseType(c.warehouse_type || 'cfs');
        setLicenceNumber(c.licence_number || '');
        setLicenceExpiry(c.licence_expiry ? c.licence_expiry.split('T')[0] : '');
        setCustomsOfficeCode(c.customs_office_code || '');
        setJurisdiction(c.jurisdiction || 'TZ');
        setDefaultStorageDays(c.default_storage_days || 180);
        setLogoUrl(c.logo_url || '');
        setLogoPreviewFailed(false);

        setBillingMethod(c.billing_method || 'flat_per_lot');
        setStorageFeePerDay(c.storage_fee_per_day || '0');
        setStorageFeeCurrency(c.storage_fee_currency || 'TZS');
        setHandlingFeeFlat(c.handling_fee_flat || '0');
        setStorageFeePerCbmPerDay(c.storage_fee_per_cbm_per_day || '0');
      })
      .catch(err => showAlert(err.message || 'Failed to load compartment'))
      .finally(() => setLoading(false));
  }, [id]);

  function handleLogoFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showAlert('Logo file size must be under 3MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
        setLogoPreviewFailed(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !code.trim() || !name.trim()) return;

    setSaving(true);
    try {
      await apiFetch(`/v1/seal/compartments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          warehouseType,
          licenceNumber: licenceNumber.trim() || null,
          licenceExpiry: licenceExpiry || null,
          customsOfficeCode: customsOfficeCode.trim() || null,
          jurisdiction,
          defaultStorageDays: Number(defaultStorageDays),
          logoUrl: logoUrl.trim() || null,
          billingMethod,
          storageFeePerDay: Number(storageFeePerDay) || 0,
          storageFeeCurrency,
          handlingFeeFlat: Number(handlingFeeFlat) || 0,
          storageFeePerCbmPerDay: Number(storageFeePerCbmPerDay) || 0,
        }),
      });
      window.dispatchEvent(new Event('seal-warehouses-updated'));
      showAlert('Compartment updated successfully!', { variant: 'success' });
      navigate(`/seal/compartments/${id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to update compartment');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="seal-page">
        <SectionLoading label="Loading compartment configuration…" />
      </div>
    );
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={[
          { label: 'SEAL', to: '/seal' },
          { label: 'Compartments', to: '/seal/compartments' },
          { label: code || 'Detail', to: `/seal/compartments/${id}` },
          'Edit',
        ]}
        titlePlain="Edit this"
        titleEm="compartment"
        subtitle="Licence, fees and billing method for this perimeter."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(`/seal/compartments/${id}`)}>
            <Icon name="arrowLeft" size={14} />
            <span>Back to Compartment</span>
          </Button>
        }
      />

      {/* Main Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Section 1: Facility Branding & Logo */}
        <div className="seal-card" style={{ padding: 24 }}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--ink)',
              margin: '0 0 16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="image" size={18} style={{ color: 'var(--seal)' }} />
            Facility Branding & Logo
          </h2>

          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Logo Preview Container */}
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: 'var(--r)',
                border: '2px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: 'var(--bg)',
                position: 'relative',
              }}
            >
              {logoUrl && !logoPreviewFailed ? (
                <img
                  src={logoUrl}
                  alt="Facility Logo"
                  onError={() => setLogoPreviewFailed(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: logoUrl ? 'var(--red)' : 'var(--ink3)', padding: 10 }}>
                  <Icon name={logoUrl ? 'alertCircle' : 'warehouse'} size={28} />
                  <div style={{ fontSize: 10, marginTop: 4, fontWeight: 600 }}>
                    {logoUrl ? "Couldn't load image" : 'No Logo'}
                  </div>
                </div>
              )}
            </div>

            {/* Logo Controls */}
            <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="seal-field-label" style={{ display: 'block', marginBottom: 4 }}>
                  Upload Logo Image
                </label>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/svg+xml, image/webp"
                  onChange={handleLogoFileUpload}
                  style={{ fontSize: 13, display: 'block', marginTop: 4 }}
                />
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                  Supports PNG, JPG, SVG, or WEBP (Max 3MB).
                </div>
              </div>

              <div>
                <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                  Or Image URL
                </label>
                <Input
                  type="url"
                  value={logoUrl}
                  onChange={e => {
                    setLogoUrl(e.target.value);
                    setLogoPreviewFailed(false);
                  }}
                  placeholder="https://example.com/logo.png"
                />
              </div>

              {logoUrl && (
                <div>
                  <Button type="button" variant="outline" size="xs" onClick={() => setLogoUrl('')}>
                    Remove Logo
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Perimeter Core Details */}
        <div className="seal-card" style={{ padding: 24 }}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--ink)',
              margin: '0 0 16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="layers" size={18} style={{ color: 'var(--seal)' }} />
            Perimeter Specifications
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Compartment Code
              </label>
              <Input value={code} onChange={e => setCode(e.target.value)} required />
            </div>

            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Compartment / Warehouse Name
              </label>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>

            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Warehouse Type
              </label>
              <Select value={warehouseType} onValueChange={setWarehouseType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WAREHOUSE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, ' ').toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Jurisdiction
              </label>
              <Input
                value={jurisdiction}
                onChange={e => setJurisdiction(e.target.value.toUpperCase())}
                maxLength={3}
                required
              />
            </div>

            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Default Storage Limit (Days)
              </label>
              <Input
                type="number"
                value={defaultStorageDays}
                onChange={e => setDefaultStorageDays(Number(e.target.value))}
                required
              />
            </div>
          </div>
        </div>

        {/* Section 3: Customs Licensing */}
        <div className="seal-card" style={{ padding: 24 }}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--ink)',
              margin: '0 0 16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="shield" size={18} style={{ color: 'var(--seal)' }} />
            Customs Licensing & Compliance
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                License Number
              </label>
              <Input
                value={licenceNumber}
                onChange={e => setLicenceNumber(e.target.value)}
                placeholder="BW-TZ-9821"
              />
            </div>

            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                License Expiry Date
              </label>
              <DatePicker
                date={parseDateOnly(licenceExpiry)}
                onChange={d => setLicenceExpiry(toDateOnlyString(d))}
                placeholder="Select date"
                triggerClassName="w-full"
              />
            </div>

            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Customs Office Code
              </label>
              <Input
                value={customsOfficeCode}
                onChange={e => setCustomsOfficeCode(e.target.value)}
                placeholder="TZDAR01"
              />
            </div>
          </div>
        </div>

        {/* Section 4: FinOps Billing Rates */}
        <div className="seal-card" style={{ padding: 24 }}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--ink)',
              margin: '0 0 16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="dollarSign" size={18} style={{ color: 'var(--seal)' }} />
            FinOps Billing & Storage Fees
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Billing Method
              </label>
              <Select value={billingMethod} onValueChange={v => setBillingMethod(v as 'flat_per_lot' | 'per_cbm')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat_per_lot">Flat Rate per Lot / Day</SelectItem>
                  <SelectItem value="per_cbm">Volume Rate (per CBM m³ / Day)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {billingMethod === 'flat_per_lot' ? (
              <div>
                <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                  Storage Fee / Day
                </label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={storageFeePerDay}
                  onChange={e => setStorageFeePerDay(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                  Storage Fee / CBM / Day
                </label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={storageFeePerCbmPerDay}
                  onChange={e => setStorageFeePerCbmPerDay(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                Currency
              </label>
              <Input
                value={storageFeeCurrency}
                onChange={e => setStorageFeeCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>

            <div>
              <label className="seal-field-label" style={{ display: 'block', marginBottom: 6 }}>
                One-Time Handling Fee
              </label>
              <Input
                type="number"
                min="0"
                step="any"
                value={handlingFeeFlat}
                onChange={e => setHandlingFeeFlat(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
          <Button type="button" variant="outline" onClick={() => navigate(`/seal/compartments/${id}`)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving Changes…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
