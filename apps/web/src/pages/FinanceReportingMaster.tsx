import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

// --- Types ---
type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
interface Account { id: string; name: string; type: AccountType; code: string; }
interface JournalEntry { id: string; date: string; description: string; accountId: string; debit: number; credit: number; department: string; customer?: string; vendor?: string; projectId?: string; product?: string; qty?: number; status?: 'Paid' | 'Unpaid' | 'Partial'; dueDate?: string; }

// --- MOCK DATA ENGINE ---
const ACCOUNTS: Account[] = [
  { id: 'a1', code: '1000', name: 'Cash & Cash Equivalents', type: 'Asset' },
  { id: 'a2', code: '1200', name: 'Accounts Receivable', type: 'Asset' },
  { id: 'a3', code: '1500', name: 'Inventory', type: 'Asset' },
  { id: 'a4', code: '1600', name: 'Prepaid Expenses', type: 'Asset' },
  { id: 'l1', code: '2000', name: 'Accounts Payable', type: 'Liability' },
  { id: 'l2', code: '2100', name: 'Accrued Liabilities', type: 'Liability' },
  { id: 'l3', code: '2400', name: 'Short-term Debt', type: 'Liability' },
  { id: 'eq1', code: '3000', name: 'Retained Earnings', type: 'Equity' },
  { id: 'eq2', code: '3100', name: 'Owner\'s Equity', type: 'Equity' },
  { id: 'r1', code: '4000', name: 'Service Revenue', type: 'Revenue' },
  { id: 'r2', code: '4100', name: 'Product Sales', type: 'Revenue' },
  { id: 'r3', code: '4200', name: 'Subscription Revenue', type: 'Revenue' },
  { id: 'e1', code: '5000', name: 'Payroll Expense', type: 'Expense' },
  { id: 'e2', code: '5100', name: 'Rent Expense', type: 'Expense' },
  { id: 'e3', code: '5200', name: 'Marketing & Advertising', type: 'Expense' },
  { id: 'e4', code: '5300', name: 'Software Subscriptions', type: 'Expense' },
];

const DEPARTMENTS = ['Sales', 'Engineering', 'Operations', 'Marketing', 'Admin'];

const BUDGETS: Record<string, number> = {
  'r1': 150000, 'r2': 300000, 'r3': 120000,
  'e1': 200000, 'e2': 50000, 'e3': 80000, 'e4': 40000
};

// --- UI Components ---
const REPORTS = [
  { id: 'pl', name: 'Profit & Loss', cat: 'Financial Statements' },
  { id: 'bs', name: 'Balance Sheet', cat: 'Financial Statements' },
  { id: 'cf', name: 'Cash Flow', cat: 'Financial Statements' },
  { id: 'gl', name: 'General Ledger', cat: 'Accounting' },
  { id: 'tb', name: 'Trial Balance', cat: 'Accounting' },
  { id: 'ar', name: 'A/R Aging', cat: 'Payables & Receivables' },
  { id: 'ap', name: 'A/P Aging', cat: 'Payables & Receivables' },
  { id: 'ex', name: 'Expense by Category', cat: 'Analytics' },
  { id: 'sa', name: 'Sales by Product', cat: 'Analytics' },
  { id: 'ba', name: 'Budget vs Actual', cat: 'Analytics' },
];

export const FinanceReportingMaster: React.FC = () => {
  const [activeReport, setActiveReport] = useState('pl');
  const [dateRange, setDateRange] = useState('all_time');
  const [filterDept, setFilterDept] = useState('All');
  const [currency, setCurrency] = useState('TZS');
  const [filterSaved, setFilterSaved] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedEmail, setSchedEmail] = useState('');
  const [schedFreq, setSchedFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [schedFmt, setSchedFmt] = useState<'PDF' | 'Excel'>('PDF');
  const [schedDone, setSchedDone] = useState(false);
  const [modalData, setModalData] = useState<{ title: string; entries: JournalEntry[] } | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // API data state
  const [apiData, setApiData] = useState<{ invoices: any[]; bills: any[] }>({ invoices: [], bills: [] });
  const [dataLoading, setDataLoading] = useState(true);

  // Mobile resize
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Fetch journal data from API
  useEffect(() => {
    setDataLoading(true);
    apiFetch('/v1/reports/journal')
      .then((d: any) => setApiData({ invoices: d.invoices ?? [], bills: d.bills ?? [] }))
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, []);

  // Load / Save filters
  useEffect(() => {
    try {
      const saved = localStorage.getItem('fin_reports_filter');
      if (saved) {
        const p = JSON.parse(saved);
        if (p.dateRange) setDateRange(p.dateRange);
        if (p.filterDept) setFilterDept(p.filterDept);
        if (p.currency) setCurrency(p.currency);
      }
    } catch(e) {}
  }, []);

  function saveFilters() {
    localStorage.setItem('fin_reports_filter', JSON.stringify({ dateRange, filterDept, currency }));
    setFilterSaved(true);
    setTimeout(() => setFilterSaved(false), 2200);
  }

  const fmt = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num);

  function exportPDF() {
    const reportName = REPORTS.find(r => r.id === activeReport)?.name ?? 'Report';
    const el = document.getElementById('frm-print-area');
    if (!el) return;
    const w = window.open('', '_blank', 'width=960,height=700');
    if (!w) return;
    const rangeLbl = dateRange === 'all_time' ? 'All Time' : dateRange === 'this_year' ? 'This Year' : 'This Month';
    w.document.write(`<!DOCTYPE html><html><head>
      <title>${reportName} – Hudumika</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#111827;padding:36px}
        .ph{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px;padding-bottom:14px;border-bottom:2px solid #0f172a}
        .ph-co{font-size:20px;font-weight:800;color:#0f172a}
        .ph-meta{font-size:11.5px;color:#6b7280;line-height:1.6;text-align:right}
        h3{font-size:18px;font-weight:700;color:#0f172a;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;margin-bottom:24px}
        td,th{padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:left}
        th{background:#f9fafb;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280}
        tr:last-child td{border-bottom:none}
        @media print{body{padding:16px}}
      </style>
    </head><body>
      <div class="ph">
        <span class="ph-co">Hudumika</span>
        <span class="ph-meta">${reportName}<br>${rangeLbl}${filterDept !== 'All' ? ' · ' + filterDept : ''} · ${currency}<br>Printed ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
      </div>
      ${el.innerHTML}
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  }

  function exportCSV() {
    const reportName = REPORTS.find(r => r.id === activeReport)?.name ?? 'Report';
    const headers = ['Date', 'Entry ID', 'Description', 'Account Code', 'Account', 'Department', 'Entity', 'Debit', 'Credit', 'Status'];
    const rows = filteredEntries.map(e => {
      const acc = ACCOUNTS.find(a => a.id === e.accountId);
      return [e.date, e.id, e.description, acc?.code ?? '', acc?.name ?? e.accountId, e.department, e.customer ?? e.vendor ?? '', e.debit || '', e.credit || '', e.status ?? ''];
    });
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportName.replace(/\s+/g, '_')}_${dateRange}_${currency}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function submitSchedule() {
    if (!schedEmail.trim()) return;
    const existing = JSON.parse(localStorage.getItem('fin_schedules') ?? '[]');
    existing.push({ report: activeReport, email: schedEmail, freq: schedFreq, fmt: schedFmt, currency, ts: new Date().toISOString() });
    localStorage.setItem('fin_schedules', JSON.stringify(existing));
    setSchedDone(true);
    setTimeout(() => { setSchedDone(false); setShowSchedule(false); setSchedEmail(''); }, 2000);
  }

  // Build journal entries from API data
  const JOURNAL_ENTRIES = useMemo(() => {
    const entries: JournalEntry[] = [];
    apiData.invoices.forEach((inv: any) => {
      entries.push({
        id: `inv-${inv.id}-dr`,
        date: inv.date ? String(inv.date).split('T')[0] : new Date().toISOString().split('T')[0],
        description: `Invoice ${inv.ref}`,
        accountId: 'a2', // Accounts Receivable
        debit: Number(inv.amount) || 0,
        credit: 0,
        department: 'Sales',
        customer: inv.entity ?? undefined,
        status: inv.status === 'PAID' ? 'Paid' : inv.status === 'PARTIAL' ? 'Partial' : 'Unpaid',
      });
      entries.push({
        id: `inv-${inv.id}-cr`,
        date: inv.date ? String(inv.date).split('T')[0] : new Date().toISOString().split('T')[0],
        description: `Revenue ${inv.ref}`,
        accountId: 'r1',
        debit: 0,
        credit: Number(inv.amount) || 0,
        department: 'Sales',
        customer: inv.entity ?? undefined,
      });
    });
    apiData.bills.forEach((bill: any) => {
      entries.push({
        id: `bill-${bill.id}-dr`,
        date: bill.date ? String(bill.date).split('T')[0] : new Date().toISOString().split('T')[0],
        description: `Bill ${bill.ref}`,
        accountId: 'e1',
        debit: Number(bill.amount) || 0,
        credit: 0,
        department: 'Operations',
        vendor: bill.entity ?? undefined,
        status: bill.status === 'PAID' ? 'Paid' : bill.status === 'PARTIAL' ? 'Partial' : 'Unpaid',
      });
      entries.push({
        id: `bill-${bill.id}-cr`,
        date: bill.date ? String(bill.date).split('T')[0] : new Date().toISOString().split('T')[0],
        description: `Payable ${bill.ref}`,
        accountId: 'l1',
        debit: 0,
        credit: Number(bill.amount) || 0,
        department: 'Operations',
        vendor: bill.entity ?? undefined,
      });
    });
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }, [apiData]);

  // Filter entries based on controls
  const filteredEntries = useMemo(() => {
    return JOURNAL_ENTRIES.filter(e => {
      if (filterDept !== 'All' && e.department !== filterDept) return false;
      const d = new Date(e.date);
      const now = new Date();
      if (dateRange === 'this_year' && d.getFullYear() !== now.getFullYear()) return false;
      if (dateRange === 'this_month' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
      return true;
    });
  }, [JOURNAL_ENTRIES, dateRange, filterDept]);

  // --- Reports Logic ---
  const getBal = (accId: string) => {
    const acc = ACCOUNTS.find(a => a.id === accId);
    if (!acc) return 0;
    const es = filteredEntries.filter(e => e.accountId === accId);
    const debits = es.reduce((s,x) => s + x.debit, 0);
    const credits = es.reduce((s,x) => s + x.credit, 0);
    return ['Asset','Expense'].includes(acc.type) ? (debits - credits) : (credits - debits);
  };

  const renderPL = () => {
    const revs = ACCOUNTS.filter(a => a.type === 'Revenue');
    const exps = ACCOUNTS.filter(a => a.type === 'Expense');
    const revTotal = revs.reduce((s,a) => s + getBal(a.id), 0);
    const expTotal = exps.reduce((s,a) => s + getBal(a.id), 0);
    const net = revTotal - expTotal;

    return (
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 24, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, color: 'var(--navy)' }}>Profit & Loss Statement</h3>
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr style={{ background: 'var(--bg)' }}><td colSpan={2} style={{ padding: '10px 16px', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--ink2)' }}>Income</td></tr>
            {revs.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 24px', cursor: 'pointer', color: 'var(--blue)', fontWeight: 500 }} onClick={() => setModalData({ title: a.name, entries: filteredEntries.filter(e => e.accountId === a.id) })}>{a.name}</td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(getBal(a.id))}</td>
              </tr>
            ))}
            <tr><td style={{ padding: 12, fontWeight: 700 }}>Total Income</td><td style={{ padding: 12, textAlign: 'right', fontWeight: 800 }}>{fmt(revTotal)}</td></tr>

            <tr style={{ background: 'var(--bg)' }}><td colSpan={2} style={{ padding: '10px 16px', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--ink2)', marginTop: 20 }}>Expenses</td></tr>
            {exps.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 24px', cursor: 'pointer', color: 'var(--blue)', fontWeight: 500 }} onClick={() => setModalData({ title: a.name, entries: filteredEntries.filter(e => e.accountId === a.id) })}>{a.name}</td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(getBal(a.id))}</td>
              </tr>
            ))}
            <tr><td style={{ padding: 12, fontWeight: 700 }}>Total Expenses</td><td style={{ padding: 12, textAlign: 'right', fontWeight: 800 }}>{fmt(expTotal)}</td></tr>

            <tr style={{ borderTop: '2px solid var(--border)', fontSize: 16 }}>
              <td style={{ padding: '16px 12px', fontWeight: 800 }}>Net Income</td>
              <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 800, color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(net)}</td>
            </tr>
          </tbody>
        </table></div>
      </div>
    );
  };

  const renderBalanceSheet = () => {
    const assets = ACCOUNTS.filter(a => a.type === 'Asset');
    const liabs = ACCOUNTS.filter(a => a.type === 'Liability');
    const eq = ACCOUNTS.filter(a => a.type === 'Equity');

    const assetTot = assets.reduce((s,a) => s + getBal(a.id), 0);
    const liabTot = liabs.reduce((s,a) => s + getBal(a.id), 0);
    const eqTot = eq.reduce((s,a) => s + getBal(a.id), 0);
    
    // Calculate current net income to add to equity
    const revTotal = ACCOUNTS.filter(a => a.type === 'Revenue').reduce((s,a) => s + getBal(a.id), 0);
    const expTotal = ACCOUNTS.filter(a => a.type === 'Expense').reduce((s,a) => s + getBal(a.id), 0);
    const netIncome = revTotal - expTotal;
    const finalEq = eqTot + netIncome;

    return (
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 24, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, color: 'var(--navy)' }}>Balance Sheet</h3>
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {/* ASSETS */}
            <tr style={{ background: 'var(--bg)' }}><td colSpan={2} style={{ padding: '10px 16px', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--ink2)' }}>Assets</td></tr>
            {assets.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 24px', cursor: 'pointer', color: 'var(--blue)' }} onClick={() => setModalData({ title: a.name, entries: filteredEntries.filter(e => e.accountId === a.id) })}>{a.name}</td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(getBal(a.id))}</td>
              </tr>
            ))}
            <tr><td style={{ padding: 12, fontWeight: 700 }}>Total Assets</td><td style={{ padding: 12, textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmt(assetTot)}</td></tr>

            {/* LIABILITIES */}
            <tr style={{ background: 'var(--bg)' }}><td colSpan={2} style={{ padding: '10px 16px', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--ink2)', marginTop: 20 }}>Liabilities</td></tr>
            {liabs.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 24px', cursor: 'pointer', color: 'var(--blue)' }} onClick={() => setModalData({ title: a.name, entries: filteredEntries.filter(e => e.accountId === a.id) })}>{a.name}</td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(getBal(a.id))}</td>
              </tr>
            ))}
            <tr><td style={{ padding: 12, fontWeight: 700 }}>Total Liabilities</td><td style={{ padding: 12, textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmt(liabTot)}</td></tr>

            {/* EQUITY */}
            <tr style={{ background: 'var(--bg)' }}><td colSpan={2} style={{ padding: '10px 16px', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--ink2)', marginTop: 20 }}>Equity</td></tr>
            {eq.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 24px', cursor: 'pointer', color: 'var(--blue)' }} onClick={() => setModalData({ title: a.name, entries: filteredEntries.filter(e => e.accountId === a.id) })}>{a.name}</td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(getBal(a.id))}</td>
              </tr>
            ))}
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 24px', color: 'var(--ink2)' }}>Current Year Net Income</td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(netIncome)}</td>
            </tr>
            <tr><td style={{ padding: 12, fontWeight: 700 }}>Total Equity</td><td style={{ padding: 12, textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmt(finalEq)}</td></tr>
            
            {/* FINAL */}
            <tr style={{ borderTop: '2px solid var(--border)', fontSize: 16 }}>
              <td style={{ padding: '16px 12px', fontWeight: 800 }}>Total Liabilities & Equity</td>
              <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmt(liabTot + finalEq)}</td>
            </tr>
          </tbody>
        </table></div>
      </div>
    );
  };

  const renderTrialBalance = () => {
    let totDeb = 0; let totCred = 0;
    return (
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, color: 'var(--navy)' }}>Trial Balance</h3>
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              <th style={{ padding: 12 }}>Account Code</th>
              <th style={{ padding: 12 }}>Account Name</th>
              <th style={{ padding: 12, textAlign: 'right' }}>Debit</th>
              <th style={{ padding: 12, textAlign: 'right' }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {ACCOUNTS.map(a => {
              const bal = getBal(a.id);
              if (bal === 0) return null;
              const isDeb = ['Asset','Expense'].includes(a.type) ? bal > 0 : bal < 0;
              const absBal = Math.abs(bal);
              if (isDeb) totDeb += absBal; else totCred += absBal;
              
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 12, fontWeight: 600, color: 'var(--ink3)' }}>{a.code}</td>
                  <td style={{ padding: 12, cursor: 'pointer', color: 'var(--blue)' }} onClick={() => setModalData({ title: a.name, entries: filteredEntries.filter(e => e.accountId === a.id) })}>{a.name}</td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{isDeb ? fmt(absBal) : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{!isDeb ? fmt(absBal) : '-'}</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: '2px solid var(--border)', fontSize: 14 }}>
              <td colSpan={2} style={{ padding: 12, fontWeight: 800 }}>Totals</td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmt(totDeb)}</td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{fmt(totCred)}</td>
            </tr>
          </tbody>
        </table></div>
      </div>
    );
  };

  const renderARAging = () => {
    const unpaids = filteredEntries.filter(e => e.accountId === 'a2' && e.status === 'Unpaid' && e.debit > 0);
    const byCust: Record<string, { current: number, d30: number, d60: number, d90: number }> = {};
    const now = new Date();
    
    unpaids.forEach(e => {
      const c = e.customer || 'Unknown';
      if (!byCust[c]) byCust[c] = { current: 0, d30: 0, d60: 0, d90: 0 };
      const due = new Date(e.dueDate || e.date);
      const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 3600 * 24));
      
      if (diff <= 0) byCust[c].current += e.debit;
      else if (diff <= 30) byCust[c].d30 += e.debit;
      else if (diff <= 60) byCust[c].d60 += e.debit;
      else byCust[c].d90 += e.debit;
    });

    return (
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, color: 'var(--navy)' }}>A/R Aging Summary</h3>
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'right' }}>
              <th style={{ padding: 12, textAlign: 'left' }}>Customer</th>
              <th style={{ padding: 12 }}>Current</th>
              <th style={{ padding: 12 }}>1 - 30 Days</th>
              <th style={{ padding: 12 }}>31 - 60 Days</th>
              <th style={{ padding: 12 }}>61 - 90+ Days</th>
              <th style={{ padding: 12 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(byCust).map(c => {
              const row = byCust[c];
              const tot = row.current + row.d30 + row.d60 + row.d90;
              return (
                <tr key={c} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 12, fontWeight: 700, color: 'var(--blue)', cursor: 'pointer' }} onClick={() => setModalData({ title: c, entries: unpaids.filter(x => x.customer === c) })}>{c}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{row.current > 0 ? fmt(row.current) : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{row.d30 > 0 ? fmt(row.d30) : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{row.d60 > 0 ? fmt(row.d60) : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right', color: row.d90 > 0 ? 'var(--red)' : 'inherit' }}>{row.d90 > 0 ? fmt(row.d90) : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 800 }}>{fmt(tot)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    );
  };

  const renderAPAging = () => {
    const unpaids = filteredEntries.filter(e => e.accountId === 'l1' && e.status === 'Unpaid' && e.credit > 0);
    const byVend: Record<string, { current: number, d30: number, d60: number, d90: number }> = {};
    const now = new Date();
    
    unpaids.forEach(e => {
      const v = e.vendor || 'Unknown';
      if (!byVend[v]) byVend[v] = { current: 0, d30: 0, d60: 0, d90: 0 };
      const due = new Date(e.dueDate || e.date);
      const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 3600 * 24));
      
      if (diff <= 0) byVend[v].current += e.credit;
      else if (diff <= 30) byVend[v].d30 += e.credit;
      else if (diff <= 60) byVend[v].d60 += e.credit;
      else byVend[v].d90 += e.credit;
    });

    return (
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, color: 'var(--navy)' }}>A/P Aging Summary</h3>
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'right' }}>
              <th style={{ padding: 12, textAlign: 'left' }}>Vendor</th>
              <th style={{ padding: 12 }}>Current</th>
              <th style={{ padding: 12 }}>1 - 30 Days</th>
              <th style={{ padding: 12 }}>31 - 60 Days</th>
              <th style={{ padding: 12 }}>61 - 90+ Days</th>
              <th style={{ padding: 12 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(byVend).map(v => {
              const row = byVend[v];
              const tot = row.current + row.d30 + row.d60 + row.d90;
              return (
                <tr key={v} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 12, fontWeight: 700, color: 'var(--blue)', cursor: 'pointer' }} onClick={() => setModalData({ title: v, entries: unpaids.filter(x => x.vendor === v) })}>{v}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{row.current > 0 ? fmt(row.current) : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{row.d30 > 0 ? fmt(row.d30) : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>{row.d60 > 0 ? fmt(row.d60) : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right', color: row.d90 > 0 ? 'var(--red)' : 'inherit' }}>{row.d90 > 0 ? fmt(row.d90) : '-'}</td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 800 }}>{fmt(tot)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    );
  };

  const renderExpenseChart = () => {
    const exps = ACCOUNTS.filter(a => a.type === 'Expense');
    const data = exps.map(a => ({ name: a.name, val: getBal(a.id) })).filter(d => d.val > 0).sort((a,b)=>b.val-a.val);
    const max = Math.max(...data.map(d => d.val), 1);

    return (
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, color: 'var(--navy)' }}>Expense by Category</h3>

        {/* CSS Chart */}
        <div style={{ marginBottom: 32 }}>
          {data.map(d => (
            <div key={d.name} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                <span>{d.name}</span>
                <span>{fmt(d.val)}</span>
              </div>
              <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(d.val/max)*100}%`, height: '100%', background: 'var(--teal)', borderRadius: 4, transition: 'width 1s' }} />
              </div>
            </div>
          ))}
        </div>

        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {data.map(d => (
              <tr key={d.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 0' }}>{d.name}</td>
                <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600 }}>{fmt(d.val)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    );
  };

  const renderSalesByProduct = () => {
    const revs = filteredEntries.filter(e => ACCOUNTS.find(a => a.id === e.accountId)?.type === 'Revenue' && e.credit > 0 && e.product);
    const byProd: Record<string, { qty: number, rev: number }> = {};
    
    revs.forEach(e => {
      const p = e.product!;
      if (!byProd[p]) byProd[p] = { qty: 0, rev: 0 };
      byProd[p].qty += e.qty || 1;
      byProd[p].rev += e.credit;
    });

    return (
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, color: 'var(--navy)' }}>Sales by Product/Service</h3>
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              <th style={{ padding: 12 }}>Product/Service</th>
              <th style={{ padding: 12, textAlign: 'right' }}>Quantity Sold</th>
              <th style={{ padding: 12, textAlign: 'right' }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(byProd).sort((a,b)=>byProd[b].rev - byProd[a].rev).map(p => (
              <tr key={p} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 12, fontWeight: 600 }}>{p}</td>
                <td style={{ padding: 12, textAlign: 'right' }}>{byProd[p].qty}</td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 800 }}>{fmt(byProd[p].rev)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    );
  };

  const renderBudgetVsActual = () => {
    const tracked = ACCOUNTS.filter(a => ['Revenue', 'Expense'].includes(a.type));

    return (
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, color: 'var(--navy)' }}>Budget vs Actual</h3>
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
              <th style={{ padding: 12 }}>Account</th>
              <th style={{ padding: 12, textAlign: 'right' }}>Actual</th>
              <th style={{ padding: 12, textAlign: 'right' }}>Budget</th>
              <th style={{ padding: 12, textAlign: 'right' }}>Difference</th>
              <th style={{ padding: 12, textAlign: 'right' }}>% Used</th>
            </tr>
          </thead>
          <tbody>
            {tracked.map(a => {
              const actual = getBal(a.id);
              const budget = BUDGETS[a.id] || 0;
              const diff = actual - budget;
              const pct = budget > 0 ? (actual / budget) * 100 : 0;
              const isOver = a.type === 'Expense' ? actual > budget : actual < budget; // Over budget for exp, under budget for rev
              
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 12, fontWeight: 600 }}>{a.name}</td>
                  <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(actual)}</td>
                  <td style={{ padding: 12, textAlign: 'right', color: 'var(--ink3)' }}>{fmt(budget)}</td>
                  <td style={{ padding: 12, textAlign: 'right', color: isOver ? 'var(--red)' : 'var(--green)' }}>{fmt(Math.abs(diff))}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      <span>{pct.toFixed(1)}%</span>
                      <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct > 100 ? 'var(--red)' : 'var(--teal)' }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    );
  };

  const renderGeneralLedger = () => {
    return (
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 24, border: '1px solid var(--border)' }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, color: 'var(--navy)' }}>General Ledger</h3>
        {ACCOUNTS.map(a => {
          const accEntries = filteredEntries.filter(e => e.accountId === a.id);
          if (accEntries.length === 0) return null;
          let runBal = 0;
          return (
            <div key={a.id} style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginBottom: 8, paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>{a.code} - {a.name} ({a.type})</div>
              <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left', color: 'var(--ink3)' }}>
                    <th style={{ padding: '8px 12px' }}>Date</th>
                    <th style={{ padding: '8px 12px' }}>Ref</th>
                    <th style={{ padding: '8px 12px' }}>Description</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Debit</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Credit</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {accEntries.reverse().map(e => {
                    if (['Asset','Expense'].includes(a.type)) runBal += (e.debit - e.credit);
                    else runBal += (e.credit - e.debit);
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 12 }}>{e.date}</td>
                        <td style={{ padding: 12, color: 'var(--ink3)' }}>{e.id.toUpperCase()}</td>
                        <td style={{ padding: 12 }}>{e.description}</td>
                        <td style={{ padding: 12, textAlign: 'right', color: e.debit ? 'var(--ink)' : 'var(--ink3)' }}>{e.debit ? fmt(e.debit) : '-'}</td>
                        <td style={{ padding: 12, textAlign: 'right', color: e.credit ? 'var(--ink)' : 'var(--ink3)' }}>{e.credit ? fmt(e.credit) : '-'}</td>
                        <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(runBal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCashFlow = () => {
    const cashAccs = ACCOUNTS.filter(a => a.id === 'a1'); // just cash for simple mock
    const cashEntries = filteredEntries.filter(e => cashAccs.find(a => a.id === e.accountId));
    
    const opIn = cashEntries.filter(e => e.debit > 0 && e.description.includes('Invoice')).reduce((s,x)=>s+x.debit,0);
    const opOut = cashEntries.filter(e => e.credit > 0 && e.description.includes('Payment')).reduce((s,x)=>s+x.credit,0);
    const netOp = opIn - opOut;
    
    const finIn = cashEntries.filter(e => e.debit > 0 && e.description.includes('Capital')).reduce((s,x)=>s+x.debit,0);
    
    const netChange = netOp + finIn;

    return (
      <div style={{ background: 'var(--white)', borderRadius: 9, padding: 24, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ marginBottom: 20, fontSize: 18, color: 'var(--navy)' }}>Statement of Cash Flows (Direct Method)</h3>
        <div className="rtbl-wrap"><table className="rtbl" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr style={{ background: 'var(--bg)' }}><td colSpan={2} style={{ padding: '10px 16px', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--ink2)' }}>Operating Activities</td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 24px', cursor: 'pointer', color: 'var(--blue)' }} onClick={() => setModalData({ title: 'Cash from Customers', entries: cashEntries.filter(e => e.debit > 0 && e.description.includes('Invoice')) })}>Cash received from Customers</td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(opIn)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 24px', cursor: 'pointer', color: 'var(--blue)' }} onClick={() => setModalData({ title: 'Cash paid to Vendors', entries: cashEntries.filter(e => e.credit > 0 && e.description.includes('Payment')) })}>Cash paid to Vendors</td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(opOut)}</td>
            </tr>
            <tr><td style={{ padding: 12, fontWeight: 700 }}>Net Cash from Operating Activities</td><td style={{ padding: 12, textAlign: 'right', fontWeight: 800 }}>{fmt(netOp)}</td></tr>

            <tr style={{ background: 'var(--bg)' }}><td colSpan={2} style={{ padding: '10px 16px', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', color: 'var(--ink2)', marginTop: 20 }}>Financing Activities</td></tr>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 24px', cursor: 'pointer', color: 'var(--blue)' }} onClick={() => setModalData({ title: 'Capital Injection', entries: cashEntries.filter(e => e.debit > 0 && e.description.includes('Capital')) })}>Owner's Capital Injection</td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{fmt(finIn)}</td>
            </tr>
            <tr><td style={{ padding: 12, fontWeight: 700 }}>Net Cash from Financing Activities</td><td style={{ padding: 12, textAlign: 'right', fontWeight: 800 }}>{fmt(finIn)}</td></tr>

            <tr style={{ borderTop: '2px solid var(--border)', fontSize: 16 }}>
              <td style={{ padding: '16px 12px', fontWeight: 800 }}>Net Increase in Cash</td>
              <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 800, color: netChange >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(netChange)}</td>
            </tr>
          </tbody>
        </table></div>
      </div>
    );
  };

  const renderActiveReport = () => {
    switch (activeReport) {
      case 'pl': return renderPL();
      case 'bs': return renderBalanceSheet();
      case 'cf': return renderCashFlow();
      case 'gl': return renderGeneralLedger();
      case 'tb': return renderTrialBalance();
      case 'ar': return renderARAging();
      case 'ap': return renderAPAging();
      case 'ex': return renderExpenseChart();
      case 'sa': return renderSalesByProduct();
      case 'ba': return renderBudgetVsActual();
      default: return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Report "{REPORTS.find(r=>r.id===activeReport)?.name}" is under construction.</div>;
    }
  };

  /* ── shared micro-styles ── */
  const sel: React.CSSProperties = {
    height: 34, fontSize: 13, padding: '0 10px',
    border: '1.5px solid var(--border)', borderRadius: 7,
    background: 'var(--white)', color: 'var(--ink)',
    fontFamily: 'var(--font)', outline: 'none', cursor: 'pointer',
  };
  const tbBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '0 14px', height: 34, borderRadius: 7,
    border: '1.5px solid var(--border)', background: 'var(--white)',
    color: 'var(--ink2)', fontSize: 12.5, fontWeight: 600,
    fontFamily: 'var(--font)', cursor: 'pointer', flexShrink: 0,
  };
  const iconBtn: React.CSSProperties = {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', cursor: 'pointer', borderRadius: 7, color: 'var(--ink2)', flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'var(--font)', background: 'var(--bg)' }}>

      {/* ── Filter Topbar ── */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'flex-end', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>

        {/* Mobile: hamburger + active report label */}
        {isMobile && (
          <button type="button" style={iconBtn} onClick={() => setSidebarOpen(o => !o)} title="Reports menu">
            <Icon name="menu" size={19} strokeWidth={2} />
          </button>
        )}
        {isMobile && (
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {REPORTS.find(r => r.id === activeReport)?.name}
          </span>
        )}

        {/* Filters */}
        {!isMobile && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date Range</span>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger aria-label="Date range" style={{ ...sel, width: 148, height: 'auto' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_time">All Time</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Department</span>
              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger aria-label="Filter by department" style={{ ...sel, width: 150, height: 'auto' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Departments</SelectItem>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Currency</span>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger aria-label="Currency" style={{ ...sel, width: 96, height: 'auto' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="TZS">TZS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button type="button" title="Save filters" style={tbBtn} onClick={saveFilters}>Save Filters</button>
          </>
        )}

        {/* Mobile: compact date picker */}
        {isMobile && (
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger aria-label="Date range" style={{ ...sel, flex: 1, minWidth: 0, height: 'auto' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all_time">All Time</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
            </SelectContent>
          </Select>
        )}

        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <div className="frm-actions">
          <button type="button" className={`frm-btn frm-btn--save${filterSaved ? ' frm-btn--saved' : ''}`} onClick={saveFilters} title="Save current filters">
            <Icon name={filterSaved ? 'check' : 'bookmark'} size={13} color={filterSaved ? 'var(--teal)' : 'var(--ink2)'} />
            {filterSaved ? 'Saved' : 'Save Filters'}
          </button>
          <div className="frm-actions-sep" />
          <button type="button" className="frm-btn frm-btn--pdf" onClick={exportPDF} title="Export report as PDF">
            <Icon name="fileText" size={13} />
            PDF
          </button>
          <button type="button" className="frm-btn frm-btn--excel" onClick={exportCSV} title="Download report as CSV/Excel">
            <Icon name="barChart2" size={13} />
            Excel
          </button>
          <button type="button" className="frm-btn frm-btn--schedule" onClick={() => setShowSchedule(true)} title="Schedule automated report delivery">
            <Icon name="clock" size={13} color="#fff" />
            {!isMobile && 'Schedule'}
          </button>
        </div>
      </div>

      {/* ── Body (sidebar + content) ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Mobile backdrop */}
        {isMobile && sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 98 }} />
        )}

        {/* ── Sidebar ── */}
        <div style={{
          width: 240, background: 'var(--white)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
          ...(isMobile ? {
            position: 'fixed', top: 0, left: 0, bottom: 0, width: 280, zIndex: 99,
            boxShadow: '4px 0 28px rgba(0,0,0,0.18)',
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.22s cubic-bezier(.4,0,.2,1)',
          } : {}),
        }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--navy)' }}>Enterprise Reporting</span>
            {isMobile && (
              <button type="button" onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4, display: 'flex' }}>
                <Icon name="x" size={18} strokeWidth={2} />
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0 28px' }}>
            {Array.from(new Set(REPORTS.map(r => r.cat))).map(cat => (
              <div key={cat} style={{ marginBottom: 20 }}>
                <div style={{ padding: '0 20px 4px', fontSize: 10.5, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat}</div>
                {REPORTS.filter(r => r.cat === cat).map(r => {
                  const isActive = activeReport === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => { setActiveReport(r.id); if (isMobile) setSidebarOpen(false); }}
                      style={{
                        width: '100%', textAlign: 'left', background: isActive ? 'var(--teal-l)' : 'none',
                        border: 'none', borderLeft: `3px solid ${isActive ? 'var(--teal)' : 'transparent'}`,
                        padding: 'var(--ds-btn-py) 20px', cursor: 'pointer', fontSize: 14,
                        fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--teal)' : 'var(--ink)',
                        fontFamily: 'var(--font)', transition: 'background 0.1s', display: 'block', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: isMobile ? '14px 12px' : '28px 32px', minWidth: 0 }}>
          <style dangerouslySetInnerHTML={{ __html: `
            .frm-content table { width: 100%; }
            .frm-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -2px; }
            .frm-wrap table { min-width: 480px; }
            .frm-card { background: var(--white); border-radius: 12px; padding: 24px; border: 1px solid var(--border); }
            @media (max-width: 767px) {
              .frm-card { padding: 14px 12px !important; border-radius: 8px !important; }
              .frm-card h3 { font-size: 15px !important; margin-bottom: 14px !important; }
            }
            .frm-tr:hover { background: var(--bg) !important; }
          ` }} />
          <div className="frm-content" id="frm-print-area">
            {dataLoading
              ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>Loading report data…</div>
              : renderActiveReport()
            }
          </div>
        </div>
      </div>

      {/* ── Schedule Modal ── */}
      {showSchedule && (
        <div className="frm-modal-overlay" onClick={() => setShowSchedule(false)}>
          <div className="frm-modal" onClick={e => e.stopPropagation()}>
            <div className="frm-modal-hd">
              <div>
                <div className="frm-modal-title">Schedule Report Delivery</div>
                <div className="frm-modal-sub">{REPORTS.find(r => r.id === activeReport)?.name}</div>
              </div>
              <button type="button" className="frm-modal-x" onClick={() => setShowSchedule(false)} title="Close"><Icon name="x" size={20} strokeWidth={2} /></button>
            </div>
            {schedDone ? (
              <div className="frm-sched-done">
                <Icon name="checkCircle" size={36} color="var(--teal)" />
                <span>Schedule saved! You'll receive the report at <strong>{schedEmail}</strong>.</span>
              </div>
            ) : (
              <div className="frm-modal-body">
                <div className="frm-modal-field">
                  <label className="frm-modal-label">Delivery Email</label>
                  <input type="email" className="frm-modal-input" placeholder="you@company.com" value={schedEmail} onChange={e => setSchedEmail(e.target.value)} />
                </div>
                <div className="frm-modal-row">
                  <div className="frm-modal-field">
                    <label className="frm-modal-label">Frequency</label>
                    <Select value={schedFreq} onValueChange={v => setSchedFreq(v as 'daily' | 'weekly' | 'monthly')}>
                      <SelectTrigger aria-label="Frequency" className="frm-modal-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="frm-modal-field">
                    <label className="frm-modal-label">Format</label>
                    <Select value={schedFmt} onValueChange={v => setSchedFmt(v as 'PDF' | 'Excel')}>
                      <SelectTrigger aria-label="Format" className="frm-modal-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PDF">PDF</SelectItem>
                        <SelectItem value="Excel">Excel / CSV</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="frm-sched-preview">
                  <Icon name="clock" size={13} color="var(--teal)" />
                  <span>
                    You'll receive the <strong>{REPORTS.find(r => r.id === activeReport)?.name}</strong> as <strong>{schedFmt}</strong> — {schedFreq === 'daily' ? 'every day at 07:00' : schedFreq === 'weekly' ? 'every Monday at 07:00' : 'on the 1st of each month'} — filtered by <strong>{filterDept === 'All' ? 'all departments' : filterDept}</strong> in <strong>{currency}</strong>.
                  </span>
                </div>
              </div>
            )}
            {!schedDone && (
              <div className="frm-modal-ft">
                <button type="button" className="frm-modal-cancel" onClick={() => setShowSchedule(false)}>Cancel</button>
                <button type="button" className="frm-modal-confirm" disabled={!schedEmail.trim()} onClick={submitSchedule}>
                  <Icon name="clock" size={13} color="#fff" /> Activate Schedule
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Drill-down Modal ── */}
      {modalData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--white)', width: '100%', maxWidth: 920, maxHeight: '90vh', borderRadius: 9, display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.22)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{modalData.title} Transactions</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3 }}>{modalData.entries.length} records</div>
              </div>
              <button type="button" onClick={() => setModalData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink2)', padding: 4, display: 'flex' }}>
                <Icon name="x" size={22} strokeWidth={2} />
              </button>
            </div>
            <div style={{ overflowY: 'auto', overflowX: 'auto', flex: 1, padding: '0 4px' }}>
              <table className="rtbl" style={{ borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left', fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {['Date','Ref','Description','Party','Debit','Credit'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: i >= 4 ? 'right' : 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modalData.entries.map(e => (
                    <tr key={e.id} className="frm-tr" style={{ borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>{e.date}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--ink3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{e.id.toUpperCase()}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 500 }}>{e.description}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--ink2)' }}>{e.customer || e.vendor || '–'}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.debit > 0 ? fmt(e.debit) : '–'}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{e.credit > 0 ? fmt(e.credit) : '–'}</td>
                    </tr>
                  ))}
                  {modalData.entries.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>No transactions found for this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
