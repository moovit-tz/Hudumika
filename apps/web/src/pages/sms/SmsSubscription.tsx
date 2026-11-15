import React, { useState } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showAlert } from '../../lib/alert.js';
import './Sms.css';

interface PackageItem {
  id: string;
  name: string;
  category: 'bundles' | 'monthly' | 'payg';
  channel: 'sms' | 'whatsapp' | 'voice' | 'email';
  units: number;
  unitLabel: string;
  price: string;
  originalPrice?: string;
  discountBadge?: string;
  rateDescription: string;
  features: string[];
  highlight?: boolean;
}

const PACKAGES: PackageItem[] = [
  {
    id: 'starter-sms',
    name: 'Starter SMS Pack',
    category: 'bundles',
    channel: 'sms',
    units: 500,
    unitLabel: 'SMS Units',
    price: 'Not configured',
    rateDescription: 'Pricing and validity depend on your connected provider.',
    features: ['Provider connection required', 'Workspace delivery history'],
  },
  {
    id: 'growth-sms',
    name: 'Growth SMS Bundle',
    category: 'bundles',
    channel: 'sms',
    units: 2500,
    unitLabel: 'SMS Units',
    price: 'Not configured',
    rateDescription: 'Pricing and validity depend on your connected provider.',
    features: ['Provider connection required', 'Workspace delivery history'],
    highlight: true,
  },
  {
    id: 'business-sms',
    name: 'Business Pro Bundle',
    category: 'bundles',
    channel: 'sms',
    units: 10000,
    unitLabel: 'SMS Units',
    price: 'Not configured',
    rateDescription: 'Pricing and validity depend on your connected provider.',
    features: ['Provider connection required', 'Workspace delivery history'],
  },
  {
    id: 'enterprise-sms',
    name: 'Enterprise Volume Plan',
    category: 'monthly',
    channel: 'sms',
    units: 50000,
    unitLabel: 'SMS Units',
    price: 'Not configured',
    rateDescription: 'Pricing and validity depend on your connected provider.',
    features: ['Provider connection required', 'Workspace delivery history'],
  },
  {
    id: 'voice-pack',
    name: 'Voice Broadcast Pack',
    category: 'bundles',
    channel: 'voice',
    units: 500,
    unitLabel: 'Voice Minutes',
    price: 'Not configured',
    rateDescription: 'Voice delivery is unavailable until a provider is connected.',
    features: ['Voice provider connection required'],
  },
  {
    id: 'whatsapp-pack',
    name: 'WhatsApp Business Pack',
    category: 'payg',
    channel: 'whatsapp',
    units: 1000,
    unitLabel: 'Conversations',
    price: 'Not configured',
    rateDescription: 'WhatsApp delivery is not connected.',
    features: ['WhatsApp provider connection required'],
  },
];

export function SmsSubscription() {
  usePageSEO('Subscriptions & Wallet Bundles', 'Purchase SMS, WhatsApp, Voice bundles, manage workspace messaging credits, and review usage rates.');

  const [activeCategory, setActiveCategory] = useState<'all' | 'bundles' | 'monthly' | 'payg'>('all');
  const [search, setSearch] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<PackageItem | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('1000');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card' | 'bank'>('mpesa');
  const [mpesaPhone, setMpesaPhone] = useState('+254712345678');
  const [processingPayment, setProcessingPayment] = useState(false);

  const filteredPackages = PACKAGES.filter((p) => {
    const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
    const matchesSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.channel.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSelectPackage = (pkg: PackageItem) => {
    showAlert(`${pkg.name} checkout is unavailable because no payment provider is connected. No payment was taken.`);
  };
  const handleExecutePayment = () => {
    showAlert('Payment is unavailable because no payment provider is connected. No payment was taken.');
  };

  return (
    <div className="sms-container">
      <PageHeader
        crumbs={[{ label: 'SMS & Messaging', to: '/sms' }, 'Subscription & Bundles']}
        titlePlain="Subscription &"
        titleEm="Bundles"
        subtitle="View messaging channels and provider readiness."
      />

      <div role="status" style={{ padding: '12px 16px', marginBottom: 16, border: '1px solid var(--amber, #f59e0b)', borderRadius: 'var(--r)', background: 'var(--amber-l, #fffbeb)', color: 'var(--ink)' }}>
        Checkout and live credit balances are not connected. Package prices and balances shown here are not billable or purchasable.
      </div>

      {/* Top Wallet Balance Strip */}
      <div className="sms-wallet-strip">
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            WORKSPACE WALLET
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.5px' }}>
              —
            </span>
            <span style={{ fontSize: 14, color: 'var(--ink3)', fontWeight: 600 }}>units available</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="sms-channel-pill">
            <Icon name="messageSquare" size={16} color="var(--teal)" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>SMS</div>
              <strong style={{ fontSize: 13, color: 'var(--ink)' }}>Unavailable</strong>
            </div>
          </div>
          <div className="sms-channel-pill">
            <Icon name="message" size={16} color="var(--green)" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>WHATSAPP</div>
              <strong style={{ fontSize: 13, color: 'var(--ink)' }}>Unavailable</strong>
            </div>
          </div>
          <div className="sms-channel-pill">
            <Icon name="phone" size={16} color="var(--blue)" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>VOICE</div>
              <strong style={{ fontSize: 13, color: 'var(--ink)' }}>Unavailable</strong>
            </div>
          </div>
          <div className="sms-channel-pill">
            <Icon name="mail" size={16} color="var(--purple)" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>EMAIL</div>
              <strong style={{ fontSize: 13, color: 'var(--ink)' }}>Unavailable</strong>
            </div>
          </div>

          <Button variant="outline" onClick={() => showAlert('Wallet top-ups are unavailable because no payment provider is connected.')}>
            <Icon name="plus" size={14} /> Top Up
          </Button>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div className="sms-filter-pills">
          <button
            type="button"
            className={`sms-filter-pill ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
            data-ui-native-button=""
          >
            All Packages
          </button>
          <button
            type="button"
            className={`sms-filter-pill ${activeCategory === 'bundles' ? 'active' : ''}`}
            onClick={() => setActiveCategory('bundles')}
            data-ui-native-button=""
          >
            Bundles
          </button>
          <button
            type="button"
            className={`sms-filter-pill ${activeCategory === 'monthly' ? 'active' : ''}`}
            onClick={() => setActiveCategory('monthly')}
            data-ui-native-button=""
          >
            Monthly Plans
          </button>
          <button
            type="button"
            className={`sms-filter-pill ${activeCategory === 'payg' ? 'active' : ''}`}
            onClick={() => setActiveCategory('payg')}
            data-ui-native-button=""
          >
            Pay As You Go
          </button>
        </div>

        <div style={{ width: 280 }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search packages…"
          />
        </div>
      </div>

      {/* Package Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
        {filteredPackages.map((pkg) => (
          <div
            key={pkg.id}
            className={`sms-package-card ${pkg.highlight ? 'highlight' : ''}`}
          >
            {pkg.discountBadge && (
              <div className="sms-package-badge">{pkg.discountBadge}</div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Icon
                  name={pkg.channel === 'voice' ? 'phone' : pkg.channel === 'whatsapp' ? 'message' : 'messageSquare'}
                  size={16}
                  color="var(--teal)"
                />
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>
                  {pkg.channel}
                </span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', margin: '4px 0 6px' }}>
                {pkg.name}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{pkg.rateDescription}</div>
            </div>

            <div style={{ padding: '14px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)' }}>
                  {pkg.price}
                </span>
                {pkg.originalPrice && (
                  <span style={{ fontSize: 14, color: 'var(--ink3)', textDecoration: 'line-through' }}>
                    {pkg.originalPrice}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
                {pkg.units.toLocaleString()} {pkg.unitLabel}
              </div>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              {pkg.features.map((feat, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink2)' }}>
                  <Icon name="check" size={14} color="var(--teal)" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            <Button
              variant={pkg.highlight ? 'default' : 'outline'}
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => handleSelectPackage(pkg)}
            >
              Select Package
            </Button>
          </div>
        ))}
      </div>

      {/* Checkout is intentionally unavailable until a payment provider is integrated. */}
      {showTopUpModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setShowTopUpModal(false)}
        >
          <div
            style={{
              background: 'var(--white)',
              borderRadius: 'var(--card-radius, 14px)',
              padding: 24,
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
                {selectedPackage ? `Checkout: ${selectedPackage.name}` : 'Wallet Top Up'}
              </h3>
              <button aria-label="Close"
                type="button"
                onClick={() => setShowTopUpModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}
                data-ui-native-button=""
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            {selectedPackage ? (
              <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 'var(--r)', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Package selected</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                  {selectedPackage.units.toLocaleString()} {selectedPackage.unitLabel}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>
                  {selectedPackage.price}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                  Units to Purchase
                </label>
                <Input
                  type="number"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  placeholder="e.g. 1000" aria-label="Units to Purchase" />
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
                Select Payment Method
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('mpesa')}
                  style={{
                    border: `1px solid ${paymentMethod === 'mpesa' ? 'var(--green)' : 'var(--border)'}`,
                    background: paymentMethod === 'mpesa' ? 'var(--green-l, #dcfce7)' : 'var(--white)',
                    padding: '10px 8px',
                    borderRadius: 'var(--r-sm)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: 'var(--ink)',
                  }}
                  data-ui-native-button=""
                >
                  M-Pesa STK
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  style={{
                    border: `1px solid ${paymentMethod === 'card' ? 'var(--teal)' : 'var(--border)'}`,
                    background: paymentMethod === 'card' ? 'var(--teal-l)' : 'var(--white)',
                    padding: '10px 8px',
                    borderRadius: 'var(--r-sm)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: 'var(--ink)',
                  }}
                  data-ui-native-button=""
                >
                  Card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  style={{
                    border: `1px solid ${paymentMethod === 'bank' ? 'var(--blue)' : 'var(--border)'}`,
                    background: paymentMethod === 'bank' ? 'var(--blue-l, #dbeafe)' : 'var(--white)',
                    padding: '10px 8px',
                    borderRadius: 'var(--r-sm)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: 'var(--ink)',
                  }}
                  data-ui-native-button=""
                >
                  Bank Wire
                </button>
              </div>
            </div>

            {paymentMethod === 'mpesa' && (
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                  M-Pesa Phone Number
                </label>
                <Input
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="+2547XXXXXXXX" aria-label="M-Pesa Phone Number" />
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                  You will receive a prompt on your phone to complete PIN entry.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <Button variant="outline" onClick={() => undefined}>
                Cancel
              </Button>
              <Button disabled>
                Payment provider unavailable
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
