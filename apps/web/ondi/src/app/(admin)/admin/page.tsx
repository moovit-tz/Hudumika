'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SectionHeader, StatCard, KYCRow, AlertCard, EmptyState, ShieldLogo } from '@/components/ui';

// ─── MFA Management Component ─────────────────────────────────────────────────
function MfaManagement() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/mfa/stats')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { setStats(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[10px] border border-red-500/20 bg-red-500/5 p-8 text-center">
        <p className="text-red-400 font-bold mb-1">API Unavailable</p>
        <p className="text-slate-500 text-sm">Could not reach the Ondi API: {error}</p>
        <p className="text-slate-600 text-xs mt-2">Make sure the server is running on port 7020.</p>
      </div>
    );
  }

  const formatDate = (s: string | null) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleString(); } catch { return s; }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Enrollments" value={stats?.totalEnrollments ?? 0} accent="#6366f1" />
        <StatCard label="TOTP Enrollments" value={stats?.byMethod?.totp ?? 0} accent="#10b981" />
        <StatCard label="Push Enrollments" value={stats?.byMethod?.push ?? 0} accent="#f59e0b" />
      </div>

      {/* Recent activity table */}
      <div className="rounded-[10px] border border-white/8 bg-white/3 p-5">
        <SectionHeader title="Recent MFA Enrollments" />
        {(!stats?.recentActivity || stats.recentActivity.length === 0) ? (
          <div className="text-center py-12 text-slate-500 text-sm">No MFA enrollments yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left py-3 px-2 text-slate-500 text-xs font-bold uppercase tracking-wider">App Name</th>
                  <th className="text-left py-3 px-2 text-slate-500 text-xs font-bold uppercase tracking-wider">Phone</th>
                  <th className="text-left py-3 px-2 text-slate-500 text-xs font-bold uppercase tracking-wider">Method</th>
                  <th className="text-left py-3 px-2 text-slate-500 text-xs font-bold uppercase tracking-wider">Enrolled</th>
                  <th className="text-left py-3 px-2 text-slate-500 text-xs font-bold uppercase tracking-wider">Last Used</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentActivity.map((row: any, i: number) => (
                  <tr key={row.enrollmentId ?? i} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="py-3 px-2 font-semibold text-white">{row.appName ?? '—'}</td>
                    <td className="py-3 px-2 text-slate-400 font-mono text-xs">{row.phone ?? '—'}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                        row.method === 'push'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-purple-500/15 text-purple-400'
                      }`}>
                        {row.method ?? 'totp'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-slate-400 text-xs">{formatDate(row.enrolledAt)}</td>
                    <td className="py-3 px-2 text-slate-500 text-xs">{formatDate(row.lastUsed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function AdminConsole() {
  const [activeNav, setActiveNav] = useState('kyc');
  const [auditSearch, setAuditSearch] = useState('');

  // API datasets
  const [kycSubmissions, setKycSubmissions] = useState<any[]>([]);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  const [kybSubmissions, setKybSubmissions] = useState<any[]>([]);
  const [kybLoading, setKybLoading] = useState(false);
  const [kybError, setKybError] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // Fetch functions
  const fetchKYC = async () => {
    setKycLoading(true);
    setKycError(null);
    try {
      const res = await fetch('/api/admin/kyc/submissions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setKycSubmissions(data);
    } catch (err: any) {
      setKycError(err.message);
    } finally {
      setKycLoading(false);
    }
  };

  const fetchKYB = async () => {
    setKybLoading(true);
    setKybError(null);
    try {
      const res = await fetch('/api/admin/kyb/submissions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setKybSubmissions(data);
    } catch (err: any) {
      setKybError(err.message);
    } finally {
      setKybLoading(false);
    }
  };

  const fetchAlerts = async () => {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const res = await fetch('/api/admin/audit/fraud-alerts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err: any) {
      setAlertsError(err.message);
    } finally {
      setAlertsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetch('/api/admin/audit/logs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAuditLogs(data.logs || []);
    } catch (err: any) {
      setAuditError(err.message);
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchMetrics = async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const res = await fetch('/api/admin/metrics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMetrics(data);
    } catch (err: any) {
      setMetricsError(err.message);
    } finally {
      setMetricsLoading(false);
    }
  };

  // Run on tab change or initial mount
  useEffect(() => {
    if (activeNav === 'kyc') fetchKYC();
    else if (activeNav === 'kyb') fetchKYB();
    else if (activeNav === 'alerts') fetchAlerts();
    else if (activeNav === 'audit') fetchAuditLogs();
    else if (activeNav === 'metrics') fetchMetrics();
  }, [activeNav]);

  // Load counts for badges initially
  useEffect(() => {
    fetch('/api/admin/kyc/submissions')
      .then(r => r.json())
      .then(d => setKycSubmissions(d))
      .catch(() => {});
    fetch('/api/admin/kyb/submissions')
      .then(r => r.json())
      .then(d => setKybSubmissions(d))
      .catch(() => {});
    fetch('/api/admin/audit/fraud-alerts')
      .then(r => r.json())
      .then(d => setAlerts(d.alerts || []))
      .catch(() => {});
  }, []);

  const handleResolveKYC = async (id: string, status: 'VERIFIED' | 'REJECTED') => {
    try {
      const res = await fetch(`/api/admin/kyc/submissions/${id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to resolve KYC');
      setKycSubmissions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResolveKYB = async (id: string, status: 'VERIFIED' | 'REJECTED') => {
    try {
      const res = await fetch(`/api/admin/kyb/submissions/${id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to resolve KYB');
      setKybSubmissions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Nav badges
  const pendingKycCount = kycSubmissions.filter(s => s.status === 'PENDING' || s.status === 'REVIEW').length;
  const pendingKybCount = kybSubmissions.filter(s => s.status === 'PENDING' || s.status === 'REVIEW').length;
  const openAlertsCount = alerts.filter(a => a.status === 'OPEN' || a.status === 'INVESTIGATING').length;

  const NAV = [
    { key: 'kyc',     label: 'KYC Queue',      icon: '🪪', badge: pendingKycCount || undefined },
    { key: 'kyb',     label: 'KYB Queue',      icon: '🏢', badge: pendingKybCount || undefined },
    { key: 'alerts',  label: 'Fraud Alerts',   icon: '🚨', badge: openAlertsCount || undefined },
    { key: 'audit',   label: 'Audit Logs',     icon: '📜'            },
    { key: 'metrics', label: 'Metrics',        icon: '📊'            },
    { key: 'mfa',     label: 'MFA Management', icon: '🔐'            },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-[#FAFAFA] flex overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-60 border-r border-white/8 bg-[#08080A] flex flex-col shrink-0">
        <div className="h-16 flex items-center px-5 border-b border-white/5 gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-linear-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.4)] text-white">
            <ShieldLogo size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Ondi Admin</p>
            <p className="text-[10px] text-slate-500">Compliance Console</p>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map(n => (
            <button
              key={n.key}
              onClick={() => setActiveNav(n.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-semibold transition-all ${
                activeNav === n.key
                  ? 'bg-purple-600/10 text-purple-300 border border-purple-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{n.icon}</span>
              <span className="flex-1 text-left">{n.label}</span>
              {n.badge && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-400 min-w-5 text-center">
                  {n.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto h-screen">
        <header className="h-16 sticky top-0 z-50 border-b border-white/8 bg-[#08080A]/80 backdrop-blur-md flex items-center justify-between px-6">
          <h1 className="text-base font-bold text-white capitalize">{NAV.find(n => n.key === activeNav)?.label}</h1>
        </header>
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          {/* KYC Tab */}
          {activeNav === 'kyc' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="Pending Review" value={kycSubmissions.filter(s => s.status === 'PENDING').length} accent="#f59e0b" />
                <StatCard label="In Review" value={kycSubmissions.filter(s => s.status === 'REVIEW').length} accent="#6366f1" />
                <StatCard label="Verified" value={kycSubmissions.filter(s => s.status === 'VERIFIED').length} accent="#10b981" />
                <StatCard label="Rejected" value={kycSubmissions.filter(s => s.status === 'REJECTED').length} accent="#ef4444" />
              </div>
              <div className="rounded-[10px] border border-white/8 bg-white/3 p-5">
                <SectionHeader title="KYC Submissions" />
                {kycLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : kycError ? (
                  <div className="text-red-400 text-center py-8">Error loading KYC: {kycError}</div>
                ) : kycSubmissions.length === 0 ? (
                  <EmptyState icon="🪪" title="No Submissions" desc="No KYC submissions found in the database." />
                ) : (
                  <div className="space-y-3">
                    {kycSubmissions.map((k) => (
                      <KYCRow
                        key={k.id}
                        name={k.fullName || k.user?.phoneNumber || 'Anonymous'}
                        docType={k.documentType}
                        status={k.status}
                        submittedAt={new Date(k.createdAt).toLocaleString()}
                        onApprove={() => handleResolveKYC(k.id, 'VERIFIED')}
                        onReject={() => handleResolveKYC(k.id, 'REJECTED')}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* KYB Tab */}
          {activeNav === 'kyb' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="Pending Review" value={kybSubmissions.filter(s => s.status === 'PENDING').length} accent="#f59e0b" />
                <StatCard label="In Review" value={kybSubmissions.filter(s => s.status === 'REVIEW').length} accent="#6366f1" />
                <StatCard label="Verified" value={kybSubmissions.filter(s => s.status === 'VERIFIED').length} accent="#10b981" />
                <StatCard label="Rejected" value={kybSubmissions.filter(s => s.status === 'REJECTED').length} accent="#ef4444" />
              </div>
              <div className="rounded-[10px] border border-white/8 bg-white/3 p-5">
                <SectionHeader title="KYB Submissions" />
                {kybLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : kybError ? (
                  <div className="text-red-400 text-center py-8">Error loading KYB: {kybError}</div>
                ) : kybSubmissions.length === 0 ? (
                  <EmptyState icon="🏢" title="No Submissions" desc="No KYB submissions found in the database." />
                ) : (
                  <div className="space-y-3">
                    {kybSubmissions.map((k) => (
                      <KYCRow
                        key={k.id}
                        name={k.businessName || k.organization?.businessName || 'Anonymous Org'}
                        docType={`Reg: ${k.registrationNumber}`}
                        status={k.status}
                        submittedAt={new Date(k.createdAt).toLocaleString()}
                        onApprove={() => handleResolveKYB(k.id, 'VERIFIED')}
                        onReject={() => handleResolveKYB(k.id, 'REJECTED')}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Fraud Alerts Tab */}
          {activeNav === 'alerts' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              {alertsLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : alertsError ? (
                <div className="text-red-400 text-center py-8">Error loading Alerts: {alertsError}</div>
              ) : alerts.length === 0 ? (
                <EmptyState icon="🚨" title="No Alerts" desc="No fraud or security alerts registered." />
              ) : (
                <div className="space-y-4">
                  {alerts.map((a) => (
                    <AlertCard
                      key={a.id}
                      type={a.type}
                      severity={a.severity}
                      description={a.description}
                      status={a.status}
                      createdAt={new Date(a.createdAt).toLocaleString()}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Audit Logs Tab */}
          {activeNav === 'audit' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-[10px] text-sm focus:outline-none focus:border-purple-500 text-white"
                />
              </div>
              {auditLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : auditError ? (
                <div className="text-red-400 text-center py-8">Error loading Audit Logs: {auditError}</div>
              ) : auditLogs.length === 0 ? (
                <EmptyState icon="📜" title="No Logs" desc="No audit logs registered in the database." />
              ) : (
                <div className="overflow-x-auto rounded-[10px] border border-white/8 bg-white/3 p-5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/8 text-left text-slate-500 text-xs font-bold uppercase tracking-wider">
                        <th className="py-3 px-2">Action</th>
                        <th className="py-3 px-2">Actor</th>
                        <th className="py-3 px-2">Entity</th>
                        <th className="py-3 px-2">Severity</th>
                        <th className="py-3 px-2">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs
                        .filter(log =>
                          log.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
                          log.performedBy.toLowerCase().includes(auditSearch.toLowerCase()) ||
                          log.entityId.toLowerCase().includes(auditSearch.toLowerCase())
                        )
                        .map((row: any, i: number) => (
                          <tr key={row.id ?? i} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                            <td className="py-3 px-2 font-semibold text-white">{row.action}</td>
                            <td className="py-3 px-2 text-slate-400 font-mono text-xs">{row.performedBy}</td>
                            <td className="py-3 px-2 text-slate-400 font-mono text-xs">{row.entityType} ({row.entityId.slice(0, 8)}...)</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                                row.severity === 'CRITICAL' ? 'bg-red-500/15 text-red-400' :
                                row.severity === 'WARNING' ? 'bg-amber-500/15 text-amber-400' :
                                'bg-blue-500/15 text-blue-400'
                              }`}>
                                {row.severity}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-slate-400 text-xs">{new Date(row.timestamp).toLocaleString()}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {/* Metrics Tab */}
          {activeNav === 'metrics' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              {metricsLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : metricsError ? (
                <div className="text-red-400 text-center py-8">Error loading Metrics: {metricsError}</div>
              ) : !metrics ? (
                <div className="text-slate-400 text-center py-8">No metrics data available.</div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-white mb-3">Identity & Users</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard label="Total Users" value={metrics.platform?.totalUsers ?? 0} accent="#6366f1" />
                      <StatCard label="New Users (24h)" value={metrics.platform?.newUsers24h ?? 0} accent="#10b981" />
                      <StatCard label="Verified (L1)" value={metrics.platform?.verifiedUsers ?? 0} accent="#3b82f6" />
                      <StatCard label="Gov Verified (L2)" value={metrics.platform?.govVerifiedUsers ?? 0} accent="#8b5cf6" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white mb-3">Authentication Health</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard label="Successful Logins" value={metrics.auth?.loginSuccess24h ?? 0} accent="#10b981" />
                      <StatCard label="Failed Logins" value={metrics.auth?.loginFailed24h ?? 0} accent="#ef4444" />
                      <StatCard label="Success Rate" value={metrics.auth?.loginSuccessRate ?? '0%'} accent="#3b82f6" />
                      <StatCard label="OTPs Issued (24h)" value={metrics.auth?.otpIssued24h ?? 0} accent="#8b5cf6" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white mb-3">KYC Pipeline</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard label="Pending Review" value={metrics.kyc?.pending ?? 0} accent="#f59e0b" />
                      <StatCard label="Verified" value={metrics.kyc?.verified ?? 0} accent="#10b981" />
                      <StatCard label="Rejected" value={metrics.kyc?.rejected ?? 0} accent="#ef4444" />
                      <StatCard label="Approval Rate" value={metrics.kyc?.approvalRate ?? 'N/A'} accent="#6366f1" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white mb-3">Credit Engine</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard label="Active Accounts" value={metrics.credit?.activeLoans ?? 0} accent="#3b82f6" />
                      <StatCard label="Defaulted Accounts" value={metrics.credit?.defaultedLoans ?? 0} accent="#ef4444" />
                      <StatCard label="Default Rate" value={metrics.credit?.defaultRate ?? 'N/A'} accent="#f59e0b" />
                      <StatCard label="New Loans (Week)" value={metrics.credit?.loansIssuedThisWeek ?? 0} accent="#10b981" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white mb-3">Security & Risk</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <StatCard label="Open Fraud Alerts" value={metrics.fraud?.openAlerts ?? 0} accent="#ef4444" />
                      <StatCard label="Critical Alerts" value={metrics.fraud?.criticalAlerts ?? 0} accent="#f43f5e" />
                      <StatCard label="Total Audit Chain Size" value={metrics.governance?.totalAuditEntries ?? 0} accent="#6366f1" />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* MFA Tab */}
          {activeNav === 'mfa' && <MfaManagement />}
        </div>
      </main>
    </div>
  );
}
