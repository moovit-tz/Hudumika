import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { showAlert } from '../lib/alert.js';
import { useOrgAuth, orgApiFetch } from '../hooks/useOrgAuth.js';
import { mapApiInvoice, invoiceTotals, fmtTZS, STATUS_STYLE } from './Billing.js';

interface LinkedAgent {
  customer_id: string;
  customer_name: string;
  account_status: string;
  tenant_id: string;
  tenant_name: string;
}

interface LinkedWorkspace {
  tenant_id: string;
  tenant_name: string;
  slug: string;
}

interface OrgShipment {
  id: string;
  ref_number: string;
  goods_desc: string;
  type: string;
  stage: string;
  tenant_name: string;
  created_at: string;
}

interface OrgShareEntry {
  name: string;
  role: 'Viewer' | 'Editor';
  principal_type?: string | null;
  principal_id?: string | null;
}

interface OrgDocument {
  id: string;
  name: string;
  type: string;
  size: number | null;
  created_at: string;
  tenant_id: string;
  tenant_name: string;
  shared?: OrgShareEntry[];
  can_manage_sharing?: boolean;
}

interface OrgMessage {
  id: string;
  author_type: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface OrgSealLot {
  id: string;
  description: string;
  hs_code: string | null;
  customs_status: string;
  qty_on_hand: string;
  qty_allocated: string;
  uom: string;
  batch: string | null;
  serial: string | null;
  created_at: string;
  compartment_name: string | null;
  tenant_id: string;
  tenant_name: string;
}

interface OrgDispatchRequest {
  id: string;
  lot_id: string;
  lot_description?: string | null;
  lot_uom?: string | null;
  qty_requested: string;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decided_at: string | null;
  fulfillment_order_id: string | null;
  created_at: string;
  tenant_name: string;
}

interface OrgTicket {
  id: string;
  ref: string;
  subject: string;
  description?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: string;
  category: string;
  tenant_id: string;
  tenant_name: string;
  created_at: string;
  updated_at: string;
  messages?: OrgMessage[];
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** mapApiInvoice() (Billing.tsx) formats billDate/dueDate as DD-MM-YYYY, not
 *  ISO — new Date() can't reliably parse that, unlike every other date this
 *  page shows (shipments/documents created_at, both real ISO strings). */
function fmtInvDate(str?: string | null) {
  if (!str) return '—';
  const [d, m, y] = str.split('-');
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STAGE_STYLE: Record<string, { color: string; bg: string }> = {
  CLOSED:    { color: 'var(--green)', bg: 'var(--green-l)' },
  DELIVERED: { color: 'var(--green)', bg: 'var(--green-l)' },
};
function stageStyle(stage: string) {
  return STAGE_STYLE[stage] ?? { color: 'var(--teal)', bg: 'var(--teal-l)' };
}

/* Same small type→icon map as Customers.tsx / CustomerDocuments.tsx — kept
   local rather than shared, per this codebase's existing convention for
   this particular ~15-line lookup. */
const FILE_TYPE_STYLE: Record<string, { icon: IconName; color: string; bg: string }> = {
  pdf:  { icon: 'file',     color: 'var(--red)',    bg: 'var(--red-l)'    },
  doc:  { icon: 'fileText', color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  docx: { icon: 'fileText', color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  xls:  { icon: 'barChart', color: 'var(--green)',  bg: 'var(--green-l)'  },
  xlsx: { icon: 'barChart', color: 'var(--green)',  bg: 'var(--green-l)'  },
  csv:  { icon: 'barChart', color: 'var(--green)',  bg: 'var(--green-l)'  },
  zip:  { icon: 'briefcase',color: 'var(--gold)',   bg: 'var(--gold-l)'   },
  png:  { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
  jpg:  { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
  jpeg: { icon: 'image',    color: 'var(--purple)', bg: 'var(--purple-l)' },
};
function fileTypeStyle(type: string) {
  return FILE_TYPE_STYLE[(type || '').toLowerCase()] ?? { icon: 'file' as IconName, color: 'var(--ink3)', bg: 'var(--bg)' };
}

const TABS = [
  { key: 'shipments', label: 'Shipments',    icon: 'ship' as IconName },
  { key: 'invoices',  label: 'Invoices',     icon: 'fileText' as IconName },
  { key: 'documents', label: 'Documents',    icon: 'folder' as IconName },
  { key: 'goods',     label: 'Stored Goods', icon: 'warehouse' as IconName },
  { key: 'support',   label: 'Support',      icon: 'headphones' as IconName },
];

const TICKET_STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  OPEN:        { label: 'Open',        color: '#0891b2', bg: '#ecfeff' },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--gold)', bg: 'var(--gold-l)' },
  RESOLVED:    { label: 'Resolved',    color: '#059669', bg: 'var(--green-l)' },
  CLOSED:      { label: 'Closed',      color: 'var(--ink2)', bg: '#f3f4f6' },
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const DISPATCH_STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  PENDING:  { label: 'Pending',  color: 'var(--gold)',  bg: 'var(--gold-l)' },
  APPROVED: { label: 'Approved', color: 'var(--green)', bg: 'var(--green-l)' },
  REJECTED: { label: 'Rejected', color: 'var(--red)',   bg: 'var(--red-l)' },
};

/**
 * The org portal — a completely separate identity from the staff/customer
 * app (see useOrgAuth.tsx). One login, three views aggregated across every
 * tenant this organization is linked to as a customer, each row tagged with
 * which agent it belongs to: shipments, invoices, and documents (files a
 * tenant's staff have linked to this org's customer record there). Support
 * ticket aggregation is a further next slice, not built here.
 */
export const OrgShell: React.FC = () => {
  const { orgUser, orgLogout } = useOrgAuth();
  const [tab, setTab]               = useState<'shipments' | 'invoices' | 'documents' | 'goods' | 'support'>('shipments');
  const [agents, setAgents]         = useState<LinkedAgent[]>([]);
  const [workspaces, setWorkspaces] = useState<LinkedWorkspace[]>([]);
  const [shipments, setShipments]   = useState<OrgShipment[]>([]);
  const [invoices, setInvoices]     = useState<any[]>([]);
  const [documents, setDocuments]   = useState<OrgDocument[]>([]);
  const [sealLots, setSealLots]     = useState<OrgSealLot[]>([]);
  const [dispatchRequests, setDispatchRequests] = useState<OrgDispatchRequest[]>([]);
  const [tickets, setTickets]       = useState<OrgTicket[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState(false);
  const [filterTenant, setFilterTenant] = useState<string | 'ALL'>('ALL');

  const [dispatchLot, setDispatchLot]       = useState<OrgSealLot | null>(null);
  const [dispatchQty, setDispatchQty]       = useState('');
  const [dispatchNote, setDispatchNote]     = useState('');
  const [submittingDispatch, setSubmittingDispatch] = useState(false);

  const [selectedTicket, setSelectedTicket]   = useState<OrgTicket | null>(null);
  const [threadLoading, setThreadLoading]     = useState(false);
  const [reply, setReply]                     = useState('');
  const [sendingReply, setSendingReply]       = useState(false);
  const [showNewTicket, setShowNewTicket]     = useState(false);
  const [creatingTicket, setCreatingTicket]   = useState(false);
  const [newTicketTenant, setNewTicketTenant] = useState('');
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketBody, setNewTicketBody]     = useState('');

  const [showLinkAgent, setShowLinkAgent] = useState(false);
  const [claimCode, setClaimCode]         = useState('');
  const [claimingCode, setClaimingCode]   = useState(false);

  const [shareDoc, setShareDoc]     = useState<OrgDocument | null>(null);
  const [shareBusy, setShareBusy]   = useState(false);

  async function submitClaimCode() {
    const code = claimCode.trim();
    if (!code || claimingCode) return;
    setClaimingCode(true);
    try {
      const res = await orgApiFetch('/v1/org/claim', { method: 'POST', body: JSON.stringify({ code }) });
      setShowLinkAgent(false);
      setClaimCode('');
      showAlert(`Linked to ${res.customer_name}.`, { title: 'Agent linked', variant: 'success' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not link with that code');
    } finally {
      setClaimingCode(false);
    }
  }

  const load = () => {
    setLoading(true); setLoadError(false);
    Promise.all([
      orgApiFetch('/v1/org/customers'),
      orgApiFetch('/v1/org/shipments'),
      orgApiFetch('/v1/org/invoices'),
      orgApiFetch('/v1/org/documents'),
      orgApiFetch('/v1/org/seal-lots'),
      orgApiFetch('/v1/org/dispatch-requests'),
      orgApiFetch('/v1/org/tickets'),
      orgApiFetch('/v1/org/workspaces'),
    ])
      .then(([agentRows, shipRes, invRes, docRes, lotRes, dispatchRes, ticketRes, workspaceRows]) => {
        setAgents(Array.isArray(agentRows) ? agentRows : []);
        setShipments(Array.isArray(shipRes?.data) ? shipRes.data : []);
        setInvoices(Array.isArray(invRes?.data) ? invRes.data : []);
        setDocuments(Array.isArray(docRes?.data) ? docRes.data : []);
        setSealLots(Array.isArray(lotRes?.data) ? lotRes.data : []);
        setDispatchRequests(Array.isArray(dispatchRes?.data) ? dispatchRes.data : []);
        setTickets(Array.isArray(ticketRes?.data) ? ticketRes.data : []);
        setWorkspaces(Array.isArray(workspaceRows) ? workspaceRows : []);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  async function submitDispatchRequest() {
    if (!dispatchLot || submittingDispatch) return;
    const qty = Number(dispatchQty);
    if (!qty || qty <= 0) return;
    setSubmittingDispatch(true);
    try {
      await orgApiFetch(`/v1/org/seal-lots/${dispatchLot.id}/dispatch-request?tenant_id=${dispatchLot.tenant_id}`, {
        method: 'POST', body: JSON.stringify({ qty, note: dispatchNote.trim() || undefined }),
      });
      showAlert(`Dispatch request sent to ${dispatchLot.tenant_name}.`, { title: 'Request sent', variant: 'success' });
      setDispatchLot(null); setDispatchQty(''); setDispatchNote('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Could not submit your dispatch request — please try again.');
    } finally {
      setSubmittingDispatch(false);
    }
  }

  async function openTicket(t: OrgTicket) {
    setSelectedTicket(t);
    setThreadLoading(true);
    try {
      const detail = await orgApiFetch(`/v1/org/tickets/${t.id}?tenant_id=${t.tenant_id}`);
      // tenant_id/tenant_name are always trusted from the list row, not the
      // detail response — submitReply() below needs a real tenant_id to
      // target the right agent, and silently losing it here (as it did
      // before the API route selected tenant_id at all) made a reply 404
      // with no visible cause.
      setSelectedTicket({ ...detail, tenant_id: t.tenant_id, tenant_name: t.tenant_name });
    } catch {
      showAlert("Couldn't load this conversation — please try again.");
      setSelectedTicket(null);
    } finally {
      setThreadLoading(false);
    }
  }

  async function submitReply() {
    const content = reply.trim();
    if (!content || !selectedTicket || sendingReply) return;
    setSendingReply(true);
    try {
      const msg = await orgApiFetch(`/v1/org/tickets/${selectedTicket.id}/reply?tenant_id=${selectedTicket.tenant_id}`, {
        method: 'POST', body: JSON.stringify({ content }),
      });
      setSelectedTicket(prev => prev ? { ...prev, messages: [...(prev.messages ?? []), msg] } : prev);
      setReply('');
    } catch (err: any) {
      showAlert(err.message || 'Could not send your message — please try again.');
    } finally {
      setSendingReply(false);
    }
  }

  async function submitNewTicket() {
    if (!newTicketTenant || !newTicketSubject.trim() || !newTicketBody.trim() || creatingTicket) return;
    setCreatingTicket(true);
    try {
      const ticket = await orgApiFetch(`/v1/org/tickets?tenant_id=${newTicketTenant}`, {
        method: 'POST', body: JSON.stringify({ subject: newTicketSubject.trim(), description: newTicketBody.trim(), category: 'Other', priority: 'NORMAL' }),
      });
      setTickets(prev => [{ ...ticket, ref: ticket.ref_number }, ...prev]);
      setShowNewTicket(false);
      setNewTicketSubject(''); setNewTicketBody(''); setNewTicketTenant('');
    } catch (err: any) {
      showAlert(err.message || 'Could not submit your ticket — please try again.');
    } finally {
      setCreatingTicket(false);
    }
  }

  const tenantNames = [...new Set(agents.map(a => a.tenant_name))];
  const byTenant = <T extends { tenant_name: string }>(rows: T[]) =>
    filterTenant === 'ALL' ? rows : rows.filter(r => r.tenant_name === filterTenant);

  const filteredShipments = byTenant(shipments);
  const filteredInvoices  = byTenant(invoices.map(mapApiInvoice).map((inv, i) => ({ ...inv, tenant_name: invoices[i].tenant_name })) as any);
  const filteredDocuments = byTenant(documents);
  const filteredSealLots  = byTenant(sealLots);
  const filteredDispatchRequests = byTenant(dispatchRequests);
  const filteredTickets   = byTenant(tickets);

  async function downloadDoc(doc: OrgDocument) {
    try {
      const res = await fetch(`http://localhost:3001/v1/org/documents/${doc.id}/download?tenant_id=${doc.tenant_id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('hudumika_org_token')}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = doc.name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err: any) {
      showAlert(err.message || 'Download failed');
    }
  }

  // Editor-level sharing edit — only shown for a doc where can_manage_sharing
  // is true (this org itself holds Editor access via cloud_file_shares).
  // Kept to the one safe action of removing a share, matching this
  // codebase's existing "no open-ended picker" discipline for org/customer
  // sharing UI — there's no safe cross-tenant search surface to pick a new
  // principal to add from here.
  async function removeShare(index: number) {
    if (!shareDoc || shareBusy) return;
    setShareBusy(true);
    try {
      const nextShared = (shareDoc.shared ?? []).filter((_, i) => i !== index);
      await orgApiFetch(`/v1/org/documents/${shareDoc.id}/share?tenant_id=${shareDoc.tenant_id}`, {
        method: 'PUT', body: JSON.stringify({ shared: nextShared }),
      });
      setShareDoc(prev => prev ? { ...prev, shared: nextShared } : prev);
      setDocuments(prev => prev.map(d => d.id === shareDoc.id ? { ...d, shared: nextShared } : d));
    } catch (err: any) {
      showAlert(err.message || 'Could not update sharing — please try again.');
    } finally {
      setShareBusy(false);
    }
  }

  if (selectedTicket) {
    const st = TICKET_STATUS_STYLE[selectedTicket.status] ?? TICKET_STATUS_STYLE.OPEN;
    const canReply = selectedTicket.status === 'OPEN' || selectedTicket.status === 'IN_PROGRESS';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <button type="button" onClick={() => setSelectedTicket(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--teal)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font)', padding: 0 }}>
              <Icon name="chevronLeft" size={18} /> Back
            </button>
            <span style={{ fontSize: 12, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{selectedTicket.ref}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 9px' }}>{selectedTicket.tenant_name}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, borderRadius: 20, padding: '2px 9px', marginLeft: 'auto' }}>{st.label}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{selectedTicket.subject}</div>
          {selectedTicket.description && (
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 8, background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>{selectedTicket.description}</div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {threadLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, margin: 'auto' }}>Loading conversation…</div>
          ) : (selectedTicket.messages ?? []).length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 13, margin: 'auto' }}>No replies yet</div>
          ) : (selectedTicket.messages ?? []).map(msg => {
            const isMe = msg.author_type === 'ORG';
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '82%', background: isMe ? 'var(--teal)' : 'var(--white)', color: isMe ? '#fff' : 'var(--ink)', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px', padding: '10px 14px', fontSize: 14, lineHeight: 1.5, border: isMe ? 'none' : '1px solid var(--border)' }}>
                  {msg.content}
                </div>
                <span style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>{isMe ? orgUser?.name : 'Support Agent'} · {fmtTime(msg.created_at)}</span>
              </div>
            );
          })}
        </div>

        {canReply && (
          <div style={{ borderTop: '1px solid var(--border)', background: 'var(--white)', padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'flex-end', maxWidth: 720, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
            <textarea placeholder="Type your message…" value={reply} disabled={sendingReply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(); } }}
              rows={2}
              style={{ flex: 1, resize: 'none', border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--bg)', outline: 'none', lineHeight: 1.5 }}
            />
            <button type="button" onClick={submitReply} disabled={!reply.trim() || sendingReply}
              style={{ background: reply.trim() && !sendingReply ? 'var(--teal)' : 'var(--border)', color: '#fff', border: 'none', borderRadius: 9, width: 44, height: 44, cursor: reply.trim() && !sendingReply ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="send" size={18} color="#fff" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100, background: '#0e1f3d', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="globe" size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{orgUser?.name}</div>
            <div style={{ fontSize: 11.5, opacity: 0.75 }}>Organization portal</div>
          </div>
        </div>
        <button type="button" onClick={orgLogout}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'var(--font)' }}>
          Sign out
        </button>
      </div>

      <div style={{ flex: 1, padding: '28px 24px', maxWidth: 1000, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink3)', fontSize: 13.5 }}>Loading…</div>
        ) : loadError ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '40px 20px', textAlign: 'center' }}>
            <Icon name="alertCircle" size={36} color="var(--red)" />
            <p style={{ color: 'var(--ink2)', fontSize: 14, margin: '12px 0 4px', fontWeight: 600 }}>Couldn't load your data</p>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px' }}>Check your connection and try again.</p>
            <button type="button" onClick={load} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Workspaces this org itself runs — a tenant that self-declared
                this same Organization as its own identity in Workspace ▸
                Settings ▸ Company Information (separate credential, same
                real-world company). */}
            {workspaces.length > 0 && (
              <div style={{ marginBottom: 20, background: 'var(--teal-l)', border: '1px solid var(--teal-m, var(--teal))', borderRadius: 9, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Icon name="building" size={18} color="var(--teal)" />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    You also run your own workspace{workspaces.length > 1 ? 's' : ''} on Hudumika
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                    {workspaces.map(w => w.tenant_name).join(', ')} — sign in there with your staff account to use ComplyOS, NexusHR and other apps directly.
                  </div>
                </div>
                <a href="/login" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none', flexShrink: 0 }}>Go to staff sign-in →</a>
              </div>
            )}

            {/* Linked agents */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Agents handling your business ({agents.length})
                </div>
                <button type="button" onClick={() => setShowLinkAgent(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  <Icon name="link" size={13} /> Link an Agent
                </button>
              </div>
              {agents.length === 0 ? (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '24px', color: 'var(--ink3)', fontSize: 13.5 }}>
                  No clearing agent has linked your organization to a customer record yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                  {agents.map(a => (
                    <div key={a.tenant_id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '14px 16px' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{a.tenant_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3 }}>You're known there as {a.customer_name}</div>
                      <span style={{ display: 'inline-block', marginTop: 8, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: a.account_status === 'Active' ? 'var(--green-l)' : 'var(--bg)', color: a.account_status === 'Active' ? 'var(--green)' : 'var(--ink3)' }}>
                        {a.account_status || 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs + tenant filter */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 4, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
                {TABS.map(t => (
                  <button key={t.key} type="button" onClick={() => setTab(t.key as any)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font)', background: tab === t.key ? 'var(--teal)' : 'transparent', color: tab === t.key ? '#fff' : 'var(--ink2)' }}>
                    <Icon name={t.icon} size={13} />
                    {t.label}
                  </button>
                ))}
              </div>
              {tenantNames.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['ALL', ...tenantNames].map(t => (
                    <button key={t} type="button" onClick={() => setFilterTenant(t as any)}
                      style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: `1.5px solid ${filterTenant === t ? 'var(--teal)' : 'var(--border)'}`, background: filterTenant === t ? 'var(--teal)' : 'var(--white)', color: filterTenant === t ? '#fff' : 'var(--ink2)' }}>
                      {t === 'ALL' ? 'All agents' : t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Shipments */}
            {tab === 'shipments' && (
              filteredShipments.length === 0 ? (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '40px 20px', textAlign: 'center' }}>
                  <Icon name="ship" size={32} color="var(--ink3)" />
                  <p style={{ color: 'var(--ink3)', fontSize: 13.5, margin: '10px 0 0' }}>No shipments yet</p>
                </div>
              ) : (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
                  {filteredShipments.map((s, i) => {
                    const st = stageStyle(s.stage);
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: i < filteredShipments.length - 1 ? '1px solid var(--bg)' : 'none', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{s.ref_number}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.goods_desc}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                          {s.tenant_name}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                          {s.stage}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fmtDate(s.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Invoices */}
            {tab === 'invoices' && (
              filteredInvoices.length === 0 ? (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '40px 20px', textAlign: 'center' }}>
                  <Icon name="fileText" size={32} color="var(--ink3)" />
                  <p style={{ color: 'var(--ink3)', fontSize: 13.5, margin: '10px 0 0' }}>No invoices yet</p>
                </div>
              ) : (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
                  {filteredInvoices.map((inv: any, i: number) => {
                    const st = (STATUS_STYLE as Record<string, { color: string; bg: string }>)[inv.status] ?? { color: 'var(--ink3)', bg: 'var(--bg)' };
                    const total = invoiceTotals(inv).grandTotalTZS;
                    return (
                      <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: i < filteredInvoices.length - 1 ? '1px solid var(--bg)' : 'none', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{inv.id}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>{fmtInvDate(inv.billDate)}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                          {inv.tenant_name}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                          {inv.status}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtTZS(total)}</span>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Documents */}
            {tab === 'documents' && (
              filteredDocuments.length === 0 ? (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '40px 20px', textAlign: 'center' }}>
                  <Icon name="folder" size={32} color="var(--ink3)" />
                  <p style={{ color: 'var(--ink3)', fontSize: 13.5, margin: '10px 0 0' }}>No documents yet</p>
                </div>
              ) : (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
                  {filteredDocuments.map((d, i) => {
                    const ft = fileTypeStyle(d.type);
                    return (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: i < filteredDocuments.length - 1 ? '1px solid var(--bg)' : 'none' }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: ft.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name={ft.icon} size={16} color={ft.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>
                            {d.size != null ? `${(d.size / 1024).toFixed(1)} KB · ` : ''}{fmtDate(d.created_at)}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                          {d.tenant_name}
                        </span>
                        {d.can_manage_sharing && (
                          <button type="button" title="Manage sharing" onClick={() => setShareDoc(d)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'var(--bg)', border: 'none', borderRadius: 8, color: 'var(--ink2)', cursor: 'pointer', flexShrink: 0 }}>
                            <Icon name="users" size={15} />
                          </button>
                        )}
                        <button type="button" title="Download" onClick={() => downloadDoc(d)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'var(--bg)', border: 'none', borderRadius: 8, color: 'var(--teal)', cursor: 'pointer', flexShrink: 0 }}>
                          <Icon name="download" size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Stored Goods */}
            {tab === 'goods' && (
              filteredSealLots.length === 0 ? (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '40px 20px', textAlign: 'center' }}>
                  <Icon name="warehouse" size={32} color="var(--ink3)" />
                  <p style={{ color: 'var(--ink3)', fontSize: 13.5, margin: '10px 0 0' }}>Nothing stored on your behalf yet</p>
                </div>
              ) : (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
                  {filteredSealLots.map((lot, i) => {
                    const available = Number(lot.qty_on_hand);
                    return (
                      <div key={lot.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: i < filteredSealLots.length - 1 ? '1px solid var(--bg)' : 'none', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{lot.description}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>
                            {lot.compartment_name || '—'}{lot.batch ? ` · Batch ${lot.batch}` : ''}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                          {lot.tenant_name}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {available.toLocaleString()} {lot.uom}
                        </span>
                        <button type="button" disabled={available <= 0}
                          onClick={() => { setDispatchLot(lot); setDispatchQty(''); setDispatchNote(''); }}
                          style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: available > 0 ? 'var(--teal)' : 'var(--border)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: available > 0 ? 'pointer' : 'default', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
                          Request Dispatch
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {tab === 'goods' && filteredDispatchRequests.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Your Dispatch Requests
                </div>
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
                  {filteredDispatchRequests.map((r, i) => {
                    const st = DISPATCH_STATUS_STYLE[r.status] ?? DISPATCH_STATUS_STYLE.PENDING;
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: i < filteredDispatchRequests.length - 1 ? '1px solid var(--bg)' : 'none', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{r.lot_description ?? '—'}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>
                            {Number(r.qty_requested).toLocaleString()} {r.lot_uom ?? ''} · {fmtDate(r.created_at)}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                          {r.tenant_name}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                          {st.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Support */}
            {tab === 'support' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <button type="button" onClick={() => setShowNewTicket(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    <Icon name="plus" size={14} /> New Ticket
                  </button>
                </div>
                {filteredTickets.length === 0 ? (
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '40px 20px', textAlign: 'center' }}>
                    <Icon name="headphones" size={32} color="var(--ink3)" />
                    <p style={{ color: 'var(--ink3)', fontSize: 13.5, margin: '10px 0 0' }}>No tickets yet</p>
                  </div>
                ) : (
                  <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
                    {filteredTickets.map((t, i) => {
                      const st = TICKET_STATUS_STYLE[t.status] ?? TICKET_STATUS_STYLE.OPEN;
                      return (
                        <button key={t.id} type="button" onClick={() => openTicket(t)}
                          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: i < filteredTickets.length - 1 ? '1px solid var(--bg)' : 'none', flexWrap: 'wrap', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{t.subject}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1, fontFamily: 'var(--mono)' }}>{t.ref}</div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                            {t.tenant_name}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                            {st.label}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{fmtDate(t.updated_at)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Link an agent modal — redeem a one-time claim code (customers.routes.ts
          POST /:id/claim-code) issued by a tenant's staff and sent only to
          the real customer's own registered email/WhatsApp. */}
      {showLinkAgent && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowLinkAgent(false); }}>
          <div style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Link an Agent</span>
              <button type="button" onClick={() => setShowLinkAgent(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Icon name="x" size={18} color="var(--ink3)" />
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
              Ask your clearing agent for a claim code — they can send one from your customer profile on their side. Enter it below to link your organization.
            </p>
            <input type="text" value={claimCode} onChange={e => setClaimCode(e.target.value)}
              placeholder="Paste your claim code…" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') submitClaimCode(); }}
              style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--mono)', background: 'var(--bg)', boxSizing: 'border-box', marginBottom: 14 }} />
            <button type="button" onClick={submitClaimCode} disabled={!claimCode.trim() || claimingCode}
              style={{ width: '100%', padding: '12px', borderRadius: 9, border: 'none', background: claimCode.trim() && !claimingCode ? 'var(--teal)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: claimCode.trim() && !claimingCode ? 'pointer' : 'default' }}>
              {claimingCode ? 'Linking…' : 'Link Agent'}
            </button>
          </div>
        </div>
      )}

      {/* Request dispatch modal — creates a PENDING seal_dispatch_requests row
          (migration 232) in the warehouse tenant's own data; only that
          tenant's own staff can approve it into a real fulfillment order. */}
      {dispatchLot && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setDispatchLot(null); }}>
          <div style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Request Dispatch</span>
              <button type="button" onClick={() => setDispatchLot(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Icon name="x" size={18} color="var(--ink3)" />
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
              {dispatchLot.description} — {Number(dispatchLot.qty_on_hand).toLocaleString()} {dispatchLot.uom} available at {dispatchLot.tenant_name}.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Quantity ({dispatchLot.uom})</label>
                <input type="number" min={0} max={Number(dispatchLot.qty_on_hand)} value={dispatchQty} onChange={e => setDispatchQty(e.target.value)}
                  placeholder="0" autoFocus
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Note (optional)</label>
                <textarea value={dispatchNote} onChange={e => setDispatchNote(e.target.value)} rows={3}
                  placeholder="Delivery instructions, destination, etc."
                  style={{ width: '100%', resize: 'none', border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', boxSizing: 'border-box', lineHeight: 1.5 }} />
              </div>
              <button type="button" onClick={submitDispatchRequest}
                disabled={!dispatchQty || Number(dispatchQty) <= 0 || Number(dispatchQty) > Number(dispatchLot.qty_on_hand) || submittingDispatch}
                style={{ padding: '12px', borderRadius: 9, border: 'none', background: dispatchQty && Number(dispatchQty) > 0 && Number(dispatchQty) <= Number(dispatchLot.qty_on_hand) && !submittingDispatch ? 'var(--teal)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: dispatchQty && Number(dispatchQty) > 0 && !submittingDispatch ? 'pointer' : 'default' }}>
                {submittingDispatch ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage sharing modal — only reachable from a doc where this org
          holds Editor-level access (can_manage_sharing), scoped to removing
          an existing share; see removeShare()'s own comment for why there's
          no "add" picker here. */}
      {shareDoc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShareDoc(null); }}>
          <div style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Manage Sharing</span>
              <button type="button" onClick={() => setShareDoc(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Icon name="x" size={18} color="var(--ink3)" />
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
              Who has access to <strong>{shareDoc.name}</strong>.
            </p>
            {(shareDoc.shared ?? []).length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '16px 0', textAlign: 'center' }}>No one else has access.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(shareDoc.shared ?? []).map((s, i) => (
                  <div key={`${s.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                      {s.role}
                    </span>
                    <button type="button" title="Remove access" disabled={shareBusy} onClick={() => removeShare(i)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, background: 'none', border: 'none', borderRadius: 6, color: 'var(--red)', cursor: shareBusy ? 'default' : 'pointer', flexShrink: 0, opacity: shareBusy ? 0.5 : 1 }}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New ticket modal */}
      {showNewTicket && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowNewTicket(false); }}>
          <div style={{ background: 'var(--white)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>New Support Ticket</span>
              <button type="button" onClick={() => setShowNewTicket(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Icon name="x" size={18} color="var(--ink3)" />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Which agent?</label>
                <select value={newTicketTenant} onChange={e => setNewTicketTenant(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', boxSizing: 'border-box' }}>
                  <option value="">Select an agent…</option>
                  {agents.map(a => <option key={a.tenant_id} value={a.tenant_id}>{a.tenant_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Subject</label>
                <input type="text" value={newTicketSubject} onChange={e => setNewTicketSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Message</label>
                <textarea value={newTicketBody} onChange={e => setNewTicketBody(e.target.value)} rows={4}
                  placeholder="Provide as much detail as possible…"
                  style={{ width: '100%', resize: 'none', border: '1.5px solid var(--border)', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', boxSizing: 'border-box', lineHeight: 1.5 }} />
              </div>
              <button type="button" onClick={submitNewTicket} disabled={!newTicketTenant || !newTicketSubject.trim() || !newTicketBody.trim() || creatingTicket}
                style={{ padding: '12px', borderRadius: 9, border: 'none', background: newTicketTenant && newTicketSubject.trim() && newTicketBody.trim() && !creatingTicket ? 'var(--teal)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: newTicketTenant && newTicketSubject.trim() && newTicketBody.trim() && !creatingTicket ? 'pointer' : 'default' }}>
                {creatingTicket ? 'Submitting…' : 'Submit Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
