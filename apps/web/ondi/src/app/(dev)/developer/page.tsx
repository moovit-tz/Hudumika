'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, X, KeyRound } from 'lucide-react';
import { ShieldLogo, SectionHeader, EmptyState, CodeBlock } from '@/components/ui';

const ACTIVE_ORG_KEY = 'ondi_active_org_id';
const ALLOWED_SCOPES = ['openid', 'profile', 'trust', 'credit', 'kyc', 'transactions'];

interface OAuthApp {
  id: string;
  clientId: string;
  name: string;
  scopes: string[];
  logoUrl: string | null;
  isFirstParty: boolean;
}

interface NewClientSecret {
  clientId: string;
  clientSecret: string;
}

export default function DeveloperConsole() {
  const [activeSection, setActiveSection] = useState('apps');
  const [orgId, setOrgId] = useState<string | null>(null);

  const [apps, setApps] = useState<OAuthApp[] | null>(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', redirectUris: '', scopes: ['openid'] as string[] });
  const [justCreated, setJustCreated] = useState<NewClientSecret | null>(null);

  async function fetchWithToken(path: string, options: RequestInit = {}) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }

  function loadApps(id: string) {
    setError('');
    fetchWithToken(`/api/enterprise/clients?orgId=${id}`)
      .then(res => setApps(Array.isArray(res) ? res : []))
      .catch(err => setError(err.message === 'insufficient_permission'
        ? 'Only Owners and Admins can manage registered apps.'
        : 'Could not load registered apps.'));
  }

  useEffect(() => {
    const id = localStorage.getItem(ACTIVE_ORG_KEY);
    if (!id) return;
    setOrgId(id);
    loadApps(id);
  }, []);

  function toggleScope(scope: string) {
    setForm(f => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter(s => s !== scope) : [...f.scopes, scope],
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    setError('');
    try {
      const redirectUris = form.redirectUris.split(',').map(s => s.trim()).filter(Boolean);
      const res = await fetchWithToken('/api/enterprise/clients', {
        method: 'POST',
        body: JSON.stringify({ orgId, name: form.name, redirectUris, scopes: form.scopes }),
      });
      setJustCreated({ clientId: res.clientId, clientSecret: res.clientSecret });
      setShowCreate(false);
      setForm({ name: '', redirectUris: '', scopes: ['openid'] });
      loadApps(orgId);
    } catch (err: any) {
      setError(err.message === 'redirect_uris_required' ? 'At least one redirect URI is required.'
        : err.message === 'openid_scope_required' ? 'The openid scope is required for user login apps.'
        : 'Could not register the app.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(clientId: string) {
    if (!orgId) return;
    try {
      await fetchWithToken(`/api/enterprise/clients/${clientId}?orgId=${orgId}`, { method: 'DELETE' });
      loadApps(orgId);
    } catch {
      setError('Could not remove the app.');
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#FAFAFA] flex overflow-hidden font-sans">
      <aside className="w-60 border-r border-white/8 bg-[#08080A] flex flex-col shrink-0">
        <div className="h-16 flex items-center px-5 border-b border-white/5 gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)] text-white">
            <ShieldLogo size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Ondi Dev</p>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {['apps', 'keys', 'usage', 'docs'].map(key => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-semibold transition-all cursor-pointer ${
                activeSection === key ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'text-slate-400'
              }`}
            >
              {key.toUpperCase()}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto h-screen p-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold">Developer Console</h1>
        </header>

        {!orgId ? (
          <EmptyState icon="🏢" title="No organization selected" desc="Select an organization from the enterprise dashboard to manage its registered apps." />
        ) : activeSection === 'apps' ? (
          <div className="space-y-6">
            <SectionHeader
              title="Registered Apps"
              sub="OAuth clients that can request Ondi identity data on this organization's behalf."
              action={
                <button
                  onClick={() => setShowCreate(v => !v)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase rounded-[10px] tracking-wide transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Plus size={14} /> Register App
                </button>
              }
            />

            {error && <p className="text-xs text-red-400 font-medium bg-red-500/10 border border-red-500/20 rounded-[10px] p-3">{error}</p>}

            {justCreated && (
              <div className="rounded-[10px] border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-emerald-300 flex items-center gap-2"><KeyRound size={15} /> App registered — copy the secret now</p>
                  <button onClick={() => setJustCreated(null)} className="text-slate-400 hover:text-white cursor-pointer"><X size={16} /></button>
                </div>
                <p className="text-xs text-slate-500">This is the only time the client secret is shown. Store it securely.</p>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Client ID</p>
                  <CodeBlock code={justCreated.clientId} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Client Secret</p>
                  <CodeBlock code={justCreated.clientSecret} />
                </div>
              </div>
            )}

            {showCreate && (
              <form onSubmit={handleCreate} className="space-y-4 p-5 rounded-[10px] border border-white/8 bg-white/3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">App name</label>
                  <input
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Bliss Support"
                    className="w-full px-3 py-2.5 rounded-[8px] bg-black/30 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Redirect URIs (comma-separated)</label>
                  <input
                    value={form.redirectUris}
                    onChange={e => setForm({ ...form, redirectUris: e.target.value })}
                    placeholder="https://app.example.com/callback"
                    className="w-full px-3 py-2.5 rounded-[8px] bg-black/30 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-2">Scopes</label>
                  <div className="flex flex-wrap gap-2">
                    {ALLOWED_SCOPES.map(scope => (
                      <button
                        type="button"
                        key={scope}
                        onClick={() => toggleScope(scope)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          form.scopes.includes(scope)
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            : 'bg-white/3 border-white/10 text-slate-400'
                        }`}
                      >
                        {scope}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-white/10 text-slate-400 text-xs font-bold uppercase rounded-[10px] cursor-pointer">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 disabled:text-slate-500 text-black text-xs font-bold uppercase rounded-[10px] cursor-pointer">{saving ? 'Registering…' : 'Register'}</button>
                </div>
              </form>
            )}

            {apps === null ? (
              <p className="text-sm text-slate-500 text-center py-10">Loading apps…</p>
            ) : apps.length === 0 ? (
              <EmptyState icon="🔌" title="No apps registered yet" desc="Register an app to get a client ID and secret for OAuth sign-in with Ondi." />
            ) : (
              <div className="space-y-3">
                {apps.map(app => (
                  <div key={app.id} className="p-5 rounded-[10px] border border-white/8 bg-white/3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{app.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">{app.clientId}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {app.scopes.map(s => (
                          <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-slate-400 border border-white/10">{s}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(app.clientId)}
                      className="p-2 border border-rose-500/20 text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all rounded-[8px] cursor-pointer shrink-0"
                      title="Delete app"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon="🚧" title="Not built yet" desc={`The ${activeSection.toUpperCase()} section doesn't exist yet — only app registration is live today.`} />
        )}
      </main>
    </div>
  );
}
