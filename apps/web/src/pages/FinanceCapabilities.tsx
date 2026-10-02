import React, { useMemo, useState } from 'react';
import type { FinanceCapabilityKey, FinanceIndustryKey } from '@hudumika/types';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Switch } from '../components/ui/switch.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import { useFinanceConfiguration } from '../hooks/useFinanceConfiguration.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { useAuth } from '../hooks/useAuth.js';
import './FinanceCapabilities.css';

const categoryLabels = { core: 'Core finance', accounting: 'Accounting', operations: 'Operations', reporting: 'Reporting' } as const;

export function FinanceCapabilities() {
  const { user } = useAuth();
  const canManage = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user?.role ?? '');
  const { data, loading, error, setEnabled } = useFinanceCapabilities();
  const configuration = useFinanceConfiguration();
  const [saving, setSaving] = useState<FinanceCapabilityKey | null>(null);
  const [savingIndustries, setSavingIndustries] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('capabilities');
  const [newLine, setNewLine] = useState({ name: '', code: '' });
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState({ name: '', code: '' });
  const selectedIndustries = configuration.data?.industries ?? [];
  const recommendations = useMemo(() => new Set(configuration.data?.industryDefinitions
    .filter(industry => selectedIndustries.includes(industry.key))
    .flatMap(industry => industry.recommendedCapabilities) ?? []), [configuration.data, selectedIndustries]);
  const recommendedCapabilities = useMemo(() => data?.capabilities.filter(item => item.status === 'available' && recommendations.has(item.key)) ?? [], [data, recommendations]);
  const advancedAccounting = data?.capabilities.find(item => item.key === 'finance.accounting.advanced');
  const canManageBusinessLines = canManage && advancedAccounting?.enabled === true;

  async function toggle(key: FinanceCapabilityKey, enabled: boolean) {
    setSaving(key);
    setMessage('');
    try { await setEnabled(key, enabled); }
    catch (err: any) { setMessage(err.message || 'Unable to update this capability.'); }
    finally { setSaving(null); }
  }

  return (
    <div className="finance-capabilities-page">
      <PageHeader crumbs={['Finance', 'Settings']} titlePlain="Finance" titleEm="capabilities" subtitle="Choose which package-included Finance tools appear in this workspace." />
      {!canManage && <div className="finance-capabilities-alert">You can review this workspace configuration. A tenant administrator manages capability activation, business profiles, and business lines.</div>}
      {loading ? <SectionLoading label="Loading capabilities" /> : error ? <div className="finance-capabilities-alert">{error}</div> : data && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList aria-label="Finance settings sections">
            <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
            <TabsTrigger value="industries">Business profile</TabsTrigger>
            <TabsTrigger value="lines">Business lines</TabsTrigger>
          </TabsList>
          {message && <div className="finance-capabilities-alert" role="alert">{message}</div>}
          <TabsContent value="capabilities">
          <section className="finance-edition-card">
            <div>
              <span className="finance-capabilities-eyebrow">CURRENT EDITION</span>
              <h2>Finance {data.edition === 'advanced' ? 'Advanced' : 'Basic'}</h2>
              <p>Your Hudumika Workspace package controls availability. Turning an available capability off only simplifies this workspace.</p>
              <small>{data.usage.limit == null ? `${data.usage.used} Finance actions this month · Unlimited` : `${data.usage.used.toLocaleString()} of ${data.usage.limit.toLocaleString()} Finance actions this month`}</small>
            </div>
            <Badge variant={data.edition === 'advanced' ? 'brand' : 'gray'}>{data.edition === 'advanced' ? 'Advanced' : 'Basic'}</Badge>
          </section>
          {(Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>).map(category => {
            const items = data.capabilities.filter(item => item.category === category && item.status === 'available');
            if (!items.length) return null;
            return <section className="finance-capability-section" key={category}>
              <header><h2>{categoryLabels[category]}</h2><span>{items.filter(item => item.enabled).length} enabled</span></header>
              <div className="finance-capability-list">
                {items.map(item => <div className="finance-capability-row" key={item.key}>
                  <div className="finance-capability-icon"><Icon name={item.entitled ? 'checkCircle' : 'lock'} size={18} /></div>
                  <div className="finance-capability-copy">
                    <div className="finance-capability-title"><strong>{item.name}</strong><Badge variant={item.state === 'enabled' ? 'success' : item.state === 'available' ? 'warning' : 'gray'}>{item.state === 'not_entitled' ? 'Requires upgrade' : item.state === 'available' ? 'Available' : 'Enabled'}</Badge>{recommendations.has(item.key) && <Badge variant="info">Recommended</Badge>}</div>
                    <p>{item.description}</p>
                    {item.dependencies.length > 0 && <small>Requires {item.dependencies.map(key => data.capabilities.find(cap => cap.key === key)?.name ?? key).join(' and ')}</small>}
                  </div>
                  {item.configurable && <Switch aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`} checked={item.enabled} disabled={!canManage || !item.entitled || saving === item.key} onCheckedChange={checked => void toggle(item.key, checked)} />}
                </div>)}
              </div>
            </section>;
          })}
          </TabsContent>
          <TabsContent value="industries">
            {configuration.loading ? <SectionLoading label="Loading business profile" /> : configuration.error ? <div className="finance-capabilities-alert">{configuration.error}</div> : (
              <div className="finance-profile-setup">
                <section className="finance-setup-summary" aria-label="Business profile setup summary">
                  <div><span className="finance-capabilities-eyebrow">GUIDED SETUP</span><h2>Match Finance to your operations</h2><p>Select every activity that applies. Recommendations configure the workspace; they do not change your package or block setup.</p></div>
                  <div className="finance-setup-metrics">
                    <span><strong>{selectedIndustries.length}</strong> activities</span>
                    <span><strong>{recommendedCapabilities.length}</strong> recommended tools</span>
                    <span><strong>{recommendedCapabilities.filter(item => item.entitled).length}</strong> included</span>
                  </div>
                </section>
                <section className="finance-capability-section finance-configuration-section">
                  <header><div><h2>What does your business do?</h2><span>Choose one or more activities. You can change these later.</span></div>{savingIndustries && <span>Saving…</span>}</header>
                  <div className="finance-industry-grid">
                    {configuration.data?.industryDefinitions.map(industry => {
                      const checked = selectedIndustries.includes(industry.key);
                      return <label className={`finance-industry-option${checked ? ' is-selected' : ''}`} key={industry.key}>
                        <Checkbox disabled={!canManage || savingIndustries} checked={checked} onCheckedChange={async value => {
                          const next = value ? [...selectedIndustries, industry.key] : selectedIndustries.filter(key => key !== industry.key);
                          setMessage(''); setSavingIndustries(true);
                          try { await configuration.saveIndustries(next as FinanceIndustryKey[]); }
                          catch (err: any) { setMessage(err.message || 'Unable to save the business profile.'); }
                          finally { setSavingIndustries(false); }
                        }} />
                        <span><strong>{industry.name}</strong><small>{industry.description}</small></span>
                      </label>;
                    })}
                  </div>
                </section>
                <section className="finance-capability-section finance-recommendations-section">
                  <header><div><h2>Recommended workspace</h2><span>Enable included tools now or continue without them.</span></div></header>
                  {recommendedCapabilities.length ? <div className="finance-recommendation-list">
                    {recommendedCapabilities.map(item => <div className="finance-recommendation-row" key={item.key}>
                      <span className="finance-capability-icon"><Icon name={item.enabled ? 'checkCircle' : item.entitled ? 'settings' : 'lock'} size={18} /></span>
                      <div><strong>{item.name}</strong><small>{item.enabled ? 'Ready to use' : item.entitled ? 'Included in your package and ready to enable' : 'Optional — your current tools remain available'}</small></div>
                      {item.enabled ? <Badge variant="success">Enabled</Badge> : item.entitled ? <Button size="sm" variant="outline" disabled={!canManage || saving === item.key} onClick={() => void toggle(item.key, true)}>Enable</Button> : <Button size="sm" variant="ghost" asChild><Link to="/workspace/billing">View plans</Link></Button>}
                    </div>)}
                  </div> : <div className="finance-recommendations-empty"><Icon name="layers" size={20} /><div><strong>Select an activity to see recommendations</strong><span>Core Finance remains available while you set up the workspace.</span></div></div>}
                  <footer className="finance-setup-footer"><span>Nothing here creates an additional subscription.</span><Button variant="outline" onClick={() => setActiveTab('capabilities')}>Review all capabilities</Button></footer>
                </section>
              </div>
            )}
          </TabsContent>
          <TabsContent value="lines">
            <section className="finance-capability-section finance-configuration-section">
              <header><div><h2>Business lines</h2><span>Management and reporting dimensions—not additional subscriptions.</span></div></header>
              {!advancedAccounting?.entitled && <div className="finance-capabilities-alert">Business-line dimensions require Finance Advanced. Existing lines remain visible after a package change.</div>}
              {advancedAccounting?.entitled && !advancedAccounting.enabled && <div className="finance-capabilities-alert">Enable Advanced accounting to create, rename, archive, or restore business lines.</div>}
              {canManageBusinessLines && <form className="finance-line-form" onSubmit={async event => {
                event.preventDefault();
                if (!newLine.name.trim() || !newLine.code.trim()) return;
                try { await configuration.createBusinessLine(newLine); setNewLine({ name: '', code: '' }); } catch (err: any) { setMessage(err.message); }
              }}>
                <Input aria-label="Business line name" placeholder="Business line name" value={newLine.name} onChange={event => setNewLine(current => ({ ...current, name: event.target.value }))} />
                <Input aria-label="Business line code" placeholder="Code" value={newLine.code} onChange={event => setNewLine(current => ({ ...current, code: event.target.value }))} />
                <Button type="submit"><Icon name="plus" size={16} /> Add line</Button>
              </form>}
              <div className="finance-business-lines">
                {configuration.data?.businessLines.map(line => <div className="finance-business-line" key={line.id}>
                  {editingLine === line.id ? <>
                    <Input value={lineDraft.name} onChange={event => setLineDraft(current => ({ ...current, name: event.target.value }))} />
                    <Input value={lineDraft.code} onChange={event => setLineDraft(current => ({ ...current, code: event.target.value }))} />
                    <Button size="sm" onClick={async () => { await configuration.updateBusinessLine(line.id, lineDraft); setEditingLine(null); }}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingLine(null)}>Cancel</Button>
                  </> : <>
                    <div><strong>{line.name}</strong><small>{line.code}{!line.active ? ' · Archived' : ''}</small></div>
                    {canManageBusinessLines && <Button size="sm" variant="outline" onClick={() => { setEditingLine(line.id); setLineDraft({ name: line.name, code: line.code }); }}>Rename</Button>}
                    {canManageBusinessLines && <Button size="sm" variant="ghost" onClick={() => void configuration.updateBusinessLine(line.id, { active: !line.active })}>{line.active ? 'Archive' : 'Restore'}</Button>}
                  </>}
                </div>)}
                {!configuration.loading && configuration.data?.businessLines.length === 0 && <p className="finance-empty-copy">No business lines yet. Add one when you need segmented reporting.</p>}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
