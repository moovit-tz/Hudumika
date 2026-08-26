import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import './Store.css';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

export const StoreDeveloperPortal: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    developer_name: '',
    category: 'business',
    short_desc: '',
    long_desc: '',
    features: '',
    permissions: '',
    icon_url: '',
    webhook_url: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        features: formData.features.split('\n').filter(f => f.trim()),
        permissions: formData.permissions.split('\n').filter(p => p.trim()),
      };

      await apiFetch('/v1/store/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit app');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="store-main" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <Icon name="checkCircle" size={48} color="var(--green)" style={{ marginBottom: '20px' }} />
        <h2>Submission Successful!</h2>
        <p style={{ color: 'var(--ink3)', marginTop: '10px' }}>Your app has been submitted and is pending review by the Hudumika Admin team. You will be notified once it is approved.</p>
        <button className="btn btn-primary" onClick={() => navigate('/store')} style={{ marginTop: '30px' }}>
          Back to Store
        </button>
      </div>
    );
  }

  return (
    <div className="store-main">
      <PageHeader
        crumbs={['Store', 'Developer Portal']}
        titlePlain="Submit a new"
        titleEm="app"
        subtitle="Publish an integration to the Hudumika Store for review by the Admin team."
      />

      <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '20px' }}>
        {error && <div style={{ background: 'var(--red-l)', color: 'var(--red)', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #fca5a5' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>App Name *</label>
              <input type="text" name="name" required value={formData.name} onChange={handleChange} className="store-search-input" style={{ width: '100%', minHeight: 'var(--ctl-h)' }} placeholder="e.g., My Awesome App" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Developer / Company Name *</label>
              <input type="text" name="developer_name" required value={formData.developer_name} onChange={handleChange} className="store-search-input" style={{ width: '100%', minHeight: 'var(--ctl-h)' }} placeholder="e.g., Acme Corp" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Category *</label>
              <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
                <SelectTrigger className="store-search-input" style={{ width: '100%', minHeight: 'var(--ctl-h)' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business Tools</SelectItem>
                  <SelectItem value="productivity">Productivity</SelectItem>
                  <SelectItem value="communication">Communication</SelectItem>
                  <SelectItem value="utility">Utilities</SelectItem>
                  <SelectItem value="ai">AI & Analytics</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>App Icon URL</label>
              <input type="url" name="icon_url" value={formData.icon_url} onChange={handleChange} className="store-search-input" style={{ width: '100%', minHeight: 'var(--ctl-h)' }} placeholder="https://example.com/icon.png" />
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Short Description * (Max 150 chars)</label>
            <input type="text" name="short_desc" required maxLength={150} value={formData.short_desc} onChange={handleChange} className="store-search-input" style={{ width: '100%', minHeight: 'var(--ctl-h)' }} placeholder="Briefly describe what your app does" />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Long Description *</label>
            <textarea name="long_desc" required value={formData.long_desc} onChange={handleChange} className="store-search-input" style={{ width: '100%', minHeight: '100px', padding: '12px' }} placeholder="Provide a detailed description of your app and its benefits" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Key Features (One per line)</label>
              <textarea name="features" value={formData.features} onChange={handleChange} className="store-search-input" style={{ width: '100%', minHeight: '120px', padding: '12px' }} placeholder="Feature 1&#10;Feature 2" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Required Permissions (One per line)</label>
              <textarea name="permissions" value={formData.permissions} onChange={handleChange} className="store-search-input" style={{ width: '100%', minHeight: '120px', padding: '12px' }} placeholder="Read CRM contacts&#10;Write shipment statuses" />
            </div>
          </div>

          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Webhook URL (Optional)</label>
            <input type="url" name="webhook_url" value={formData.webhook_url} onChange={handleChange} className="store-search-input" style={{ width: '100%', minHeight: 'var(--ctl-h)' }} placeholder="https://your-api.com/hudumika/webhook" />
            <p style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>We will send event notifications to this URL.</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/store')}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit App for Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
