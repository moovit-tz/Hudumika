import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { apiFetch } from '../lib/api.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

/**
 * Full customer onboarding — a dedicated page, not a modal, per this
 * platform's design-system rule for anything beyond a trivial one-shot input
 * (see CLAUDE.md / the OnboardingWizard & TradeWizard precedent). Reached
 * from any "create new customer" prompt that needs more than just a name —
 * e.g. Billing.tsx's invoice-customer picker, whose old inline `onCreate`
 * only ever POSTed `{ name }` with no way to capture contact/tax/address
 * details up front.
 *
 * `?returnTo=<path>` — where to land after a successful save. The created
 * customer is appended as `?customer_id=<id>&new=1`, the exact query-param
 * shape Billing.tsx's InvoiceEditor already knows how to consume (it was
 * originally built for "Create Invoice" links from a customer's own profile
 * page) — no new "resume" plumbing needed on that end.
 * `?name=<prefill>` — pre-fills Company Name with whatever the user had
 * already typed into the picker before choosing to create a new customer.
 */
export const CustomerOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') || '';

  const [name, setName] = useState(params.get('name') || '');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneWa, setPhoneWa] = useState('');
  const [category, setCategory] = useState<'enterprise' | 'sme' | 'individual'>('sme');
  const [preferredChannel, setPreferredChannel] = useState<'WHATSAPP' | 'EMAIL' | 'WECHAT'>('WHATSAPP');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [website, setWebsite] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function backHref() {
    return returnTo || '/crm/customers';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Company name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch('/v1/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          contact_name: contactName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          phone_wa: phoneWa.trim() || undefined,
          category,
          preferred_channel: preferredChannel,
          tax_id: taxId.trim() || undefined,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          country: country.trim() || undefined,
          website: website.trim() || undefined,
        }),
      });

      if (returnTo) {
        const sep = returnTo.includes('?') ? '&' : '?';
        navigate(`${returnTo}${sep}customer_id=${created.id}&new=1`);
      } else {
        navigate('/crm/customers');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create customer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '14px 24px', flexShrink: 0 }}>
        <Link
          to={backHref()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', marginBottom: 10 }}
        >
          <Icon name="chevronLeft" size={13} /> Back
        </Link>
        <PageHeader
          crumbs={['CRM', 'New customer']}
          titlePlain="New"
          titleEm="customer"
          subtitle={returnTo ? "Full details now — you'll return to where you left off once saved." : 'Add a full customer profile to the CRM.'}
        />
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {error && <Banner variant="error">{error}</Banner>}

          <SectionCard title="Company">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: isMobile ? 'auto' : '1 / 3' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Company Name *</label>
                <input type="text" className="input-field" placeholder="Acme Imports Ltd" required value={name} onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Category</label>
                <Select value={category} onValueChange={v => setCategory(v as typeof category)}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="sme">SME</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>TIN / Tax ID</label>
                <input type="text" className="input-field" placeholder="123-456-789" value={taxId} onChange={e => setTaxId(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Website</label>
                <input type="text" className="input-field" placeholder="https://acme.co.tz" value={website} onChange={e => setWebsite(e.target.value)} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Contact">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Contact Person</label>
                <input type="text" className="input-field" placeholder="John Doe" value={contactName} onChange={e => setContactName(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Email</label>
                <input type="email" className="input-field" placeholder="info@acme.co.tz" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Phone</label>
                <input type="text" className="input-field" placeholder="+255700000000" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>WhatsApp Number</label>
                <input type="text" className="input-field" placeholder="+255712345678" value={phoneWa} onChange={e => setPhoneWa(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Preferred Channel</label>
                <Select value={preferredChannel} onValueChange={v => setPreferredChannel(v as typeof preferredChannel)}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="WECHAT">WeChat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Address">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: isMobile ? 'auto' : '1 / 3' }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Street Address</label>
                <input type="text" className="input-field" placeholder="14 Harbor Road" value={address} onChange={e => setAddress(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>City</label>
                <input type="text" className="input-field" placeholder="Dar es Salaam" value={city} onChange={e => setCity(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 4 }}>Country</label>
                <input type="text" className="input-field" placeholder="Tanzania" value={country} onChange={e => setCountry(e.target.value)} />
              </div>
            </div>
          </SectionCard>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Link to={backHref()} className="btn btn-secondary btn-sm">Cancel</Link>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving…' : returnTo ? 'Save & Continue' : 'Create Customer'}
            </button>
          </div>

        </div>
      </form>
    </div>
  );
};
