import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { PageFooter } from '../components/PageLayout.js';
import { AppHeader } from '../components/AppHeader.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Icon } from '../components/Icon.js';
import './Welcome.css';

const steps = [
  { key: 'foundation', title: 'Set up your organization', description: 'Review your company information, branding, and enabled apps. Invite colleagues and assign their workspace roles.', links: [{ label: 'Company details', to: '/workspace/settings?s=company' }, { label: 'Invite your team', to: '/ondi' }, { label: 'Branding & apps', to: '/workspace/settings?s=branding' }] },
  { key: 'security', title: 'Secure your workspace', description: 'Review your identity and sign-in protection, then configure team roles and access requests in Ondi.', links: [{ label: 'Identity & security', to: '/ondi/personal' }, { label: 'Team roles', to: '/ondi/roles' }] },
  { key: 'finance', title: 'Prepare your accounts', description: 'Review the chart of accounts, tax codes, and payment integrations before creating your first invoice.', links: [{ label: 'Chart of accounts', to: '/finance/accounts/chart-of-accounts' }, { label: 'Tax codes', to: '/finance/tax-codes' }, { label: 'Integrations', to: '/workspace/settings?s=integrations' }] },
  { key: 'automate', title: 'Connect your work', description: 'Choose a workflow template, review its trigger and actions, and adapt it to your organization.', links: [{ label: 'Browse templates', to: '/studio/templates' }, { label: 'Workflow Studio', to: '/studio/workflows' }] },
];

export function Welcome() {
  const { user } = useAuth();
  const [checklist, setChecklist] = useState<Record<string, boolean> | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    apiFetch('/v1/setup-guide/checklist').then(res => {
      if (!live) return;
      setChecklist(res.data);
      const next = steps.findIndex(step => !res.data[step.key]);
      setSelected(next < 0 ? 0 : next);
    }).catch(err => { if (live) setError(err.message || 'Setup progress is unavailable.'); });
    return () => { live = false; };
  }, []);
  const step = steps[selected];
  const done = steps.filter(item => checklist?.[item.key]).length;
  return <div className="app-shell"><div className="app-main"><AppHeader /><div className="welcome-scroll"><main className="welcome-page">
    <PageHeader crumbs={['Workspace', 'Welcome']} titlePlain={`Welcome, ${user?.name?.split(' ')[0] || 'there'}`} titleEm="aboard" subtitle="Your organization is ready. Let’s make this workspace yours." actions={<Button asChild variant="outline"><Link to="/">Open workspace <Icon name="arrowRight" size={16} /></Link></Button>} />
    <div className="welcome-grid"><div className="welcome-primary"><Card className="welcome-setup">
      <div className="welcome-section-head"><h2>Get started</h2><span>{checklist ? `${done} of ${steps.length} phases ready` : 'Workspace setup'}</span></div>
      {!checklist && !error ? <SectionLoading label="Checking your setup…" /> : <><div className="welcome-setup-grid"><nav aria-label="Organization setup">{steps.map((item,index) => <button key={item.key} aria-current={index === selected ? 'step' : undefined} onClick={() => setSelected(index)} data-ui-native-button=""><span className={checklist?.[item.key] ? 'done' : ''}>{checklist?.[item.key] ? <Icon name="check" size={18} /> : index+1}</span><strong>{item.title}</strong></button>)}</nav><section><span className="welcome-kicker">Step {selected+1} · {checklist?.[step.key] ? 'Ready' : 'Next steps'}</span><h3>{step.title}</h3><p>{step.description}</p><div className="welcome-links">{step.links.map((link,index) => <Button key={link.to} asChild variant={index === 0 ? 'default' : 'outline'} size="lg"><Link to={link.to}>{link.label}<Icon name="arrowRight" size={16} /></Link></Button>)}</div><p className="welcome-hint">Progress reflects your workspace records. Return here after completing a setup phase.</p></section></div>{error && <p role="alert" className="welcome-error">{error}</p>}</>}
    </Card><section><h2 className="welcome-learn-title">Explore Hudumika</h2><div className="welcome-learning">{[{ title: 'Bring your customers', text: 'Import existing customers and organize your sales pipeline.', to:'/crm/customers/bulk-upload', icon:'users' as const, action:'Import customers' }, {title:'Workflow templates',text:'Start with a reusable flow and connect your workspace apps.',to:'/studio/templates',icon:'layers' as const,action:'Browse templates'}, {title:'Your first agent task',text:'Describe what needs doing and review a proposed approach.',to:'/agentic',icon:'sparkle' as const,action:'Try the agent'}].map(item => <Card className="welcome-learning-card" key={item.to}><Icon name={item.icon} size={24}/><h3>{item.title}</h3><p>{item.text}</p><Button asChild variant="link"><Link to={item.to}>{item.action}<Icon name="arrowRight" size={16}/></Link></Button></Card>)}</div></section></div>
    <aside><Card className="welcome-resource"><h2>Quick links</h2>{[{label:'Workspace settings',to:'/workspace/settings?s=company'}, {label:'Your identity',to:'/ondi/personal'}, {label:'Apps & extensions',to:'/workspace/settings?s=modules'}, {label:'Get support',to:'/support/tickets'}].map(link => <Link key={link.to} to={link.to}>{link.label}<Icon name="chevronRight" size={16}/></Link>)}<div className="welcome-resource-note"><Icon name="sparkle" size={24}/><h3>Start with your team</h3><p>Give each colleague their own account and the access they need. Manage invitations and roles in Ondi.</p><Button asChild variant="outline"><Link to="/ondi">Open Ondi</Link></Button></div></Card></aside></div><PageFooter />
  </main></div></div></div>;
}
