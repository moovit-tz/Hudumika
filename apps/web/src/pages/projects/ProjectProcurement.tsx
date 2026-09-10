import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import type {
  ProjectPurchaseRequest,
  ProjectRfq,
  ProjectPurchaseOrder,
  ProjectGoodsReceipt,
} from '@hudumika/types';

interface ProjectProcurementProps {
  projectId: string;
  purchaseRequests?: ProjectPurchaseRequest[];
  rfqs?: (ProjectRfq & { suppliers?: any[] })[];
  purchaseOrders?: ProjectPurchaseOrder[];
  goodsReceipts?: ProjectGoodsReceipt[];
  onRefresh?: () => void;
  currency?: string;
}

export const ProjectProcurement: React.FC<ProjectProcurementProps> = ({
  projectId,
  purchaseRequests: propsPurchaseRequests,
  rfqs: propsRfqs,
  purchaseOrders: propsPurchaseOrders,
  goodsReceipts: propsGoodsReceipts,
  onRefresh: propsOnRefresh,
  currency = 'KES',
}) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'rfqs' | 'pos' | 'grns'>('requests');

  const [purchaseRequests, setPurchaseRequests] = useState<ProjectPurchaseRequest[]>(propsPurchaseRequests || []);
  const [rfqs, setRfqs] = useState<(ProjectRfq & { suppliers?: any[] })[]>(propsRfqs || []);
  const [purchaseOrders, setPurchaseOrders] = useState<ProjectPurchaseOrder[]>(propsPurchaseOrders || []);
  const [goodsReceipts, setGoodsReceipts] = useState<ProjectGoodsReceipt[]>(propsGoodsReceipts || []);
  const [loading, setLoading] = useState(!propsPurchaseRequests && !propsRfqs && !propsPurchaseOrders);

  const [showAddPrModal, setShowAddPrModal] = useState(false);
  const [showAddPoModal, setShowAddPoModal] = useState(false);
  const [showAddGrnModal, setShowAddGrnModal] = useState(false);

  // PR Form
  const [prNumber, setPrNumber] = useState(`PR-${Math.floor(1000 + Math.random() * 9000)}`);
  const [prTitle, setPrTitle] = useState('');
  const [prCost, setPrCost] = useState('');
  const [prRequiredDate, setPrRequiredDate] = useState('');
  const [prJustification, setPrJustification] = useState('');

  // PO Form
  const [poNumber, setPoNumber] = useState(`PO-${Math.floor(1000 + Math.random() * 9000)}`);
  const [poSupplier, setPoSupplier] = useState('');
  const [poAmount, setPoAmount] = useState('');
  const [poDeliveryDate, setPoDeliveryDate] = useState('');
  const [poTerms, setPoTerms] = useState('Net 30 Days Upon Inspection');

  // GRN Form
  const [grnNumber, setGrnNumber] = useState(`GRN-${Math.floor(1000 + Math.random() * 9000)}`);
  const [grnPoId, setGrnPoId] = useState('');
  const [grnCarrierNote, setGrnCarrierNote] = useState('');
  const [grnNotes, setGrnNotes] = useState('');

  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (propsPurchaseRequests && propsRfqs && propsPurchaseOrders && propsGoodsReceipts) {
      setPurchaseRequests(propsPurchaseRequests);
      setRfqs(propsRfqs);
      setPurchaseOrders(propsPurchaseOrders);
      setGoodsReceipts(propsGoodsReceipts);
      return;
    }
    setLoading(true);
    try {
      const [prRes, rfqRes, poRes, grnRes] = await Promise.all([
        apiFetch(`/v1/project-os/projects/${projectId}/purchase-requests`),
        apiFetch(`/v1/project-os/projects/${projectId}/rfqs`),
        apiFetch(`/v1/project-os/projects/${projectId}/purchase-orders`),
        apiFetch(`/v1/project-os/projects/${projectId}/goods-receipts`),
      ]);
      setPurchaseRequests(Array.isArray(prRes) ? prRes : prRes.data || []);
      setRfqs(Array.isArray(rfqRes) ? rfqRes : rfqRes.data || []);
      setPurchaseOrders(Array.isArray(poRes) ? poRes : poRes.data || []);
      setGoodsReceipts(Array.isArray(grnRes) ? grnRes : grnRes.data || []);
    } catch {
      setPurchaseRequests([]);
      setRfqs([]);
      setPurchaseOrders([]);
      setGoodsReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, propsPurchaseRequests, propsRfqs, propsPurchaseOrders, propsGoodsReceipts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreatePr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prTitle.trim()) {
      showAlert('Purchase Request title is required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/purchase-requests`, {
        method: 'POST',
        body: JSON.stringify({
          pr_number: prNumber.trim(),
          title: prTitle.trim(),
          estimated_cost: parseFloat(prCost) || 0,
          required_date: prRequiredDate || null,
          justification: prJustification.trim() || null,
        }),
      });
      showAlert('Purchase Request submitted for approval', { variant: 'success' });
      setShowAddPrModal(false);
      setPrTitle('');
      setPrCost('');
      setPrJustification('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create PR', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poSupplier.trim()) {
      showAlert('Supplier name is required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/purchase-orders`, {
        method: 'POST',
        body: JSON.stringify({
          po_number: poNumber.trim(),
          supplier_name: poSupplier.trim(),
          total_amount: parseFloat(poAmount) || 0,
          expected_delivery_date: poDeliveryDate || null,
          payment_terms: poTerms || null,
          currency,
        }),
      });
      showAlert('Purchase Order issued successfully', { variant: 'success' });
      setShowAddPoModal(false);
      setPoSupplier('');
      setPoAmount('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to issue PO', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grnPoId) {
      showAlert('Purchase Order selection is required for GRN', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/goods-receipts`, {
        method: 'POST',
        body: JSON.stringify({
          po_id: grnPoId,
          grn_number: grnNumber.trim(),
          carrier_delivery_note_ref: grnCarrierNote.trim() || null,
          inspector_notes: grnNotes.trim() || null,
          status: 'accepted',
        }),
      });
      showAlert('Goods Receipt Note logged and verified', { variant: 'success' });
      setShowAddGrnModal(false);
      setGrnCarrierNote('');
      setGrnNotes('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to log GRN', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) => `${currency} ${Number(val || 0).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'requests'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Requisitions (PR) ({purchaseRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('rfqs')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'rfqs'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            RFQ Tender Comparison ({rfqs.length})
          </button>
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'pos'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Purchase Orders (PO) ({purchaseOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('grns')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'grns'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Goods Receipts (GRN) ({goodsReceipts.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'requests' && (
            <Button size="sm" onClick={() => setShowAddPrModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
              <Icon name="plus" size={14} className="mr-1" /> New Requisition (PR)
            </Button>
          )}
          {activeTab === 'pos' && (
            <Button size="sm" onClick={() => setShowAddPoModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
              <Icon name="plus" size={14} className="mr-1" /> Issue Purchase Order
            </Button>
          )}
          {activeTab === 'grns' && (
            <Button size="sm" onClick={() => setShowAddGrnModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
              <Icon name="plus" size={14} className="mr-1" /> Log Delivery (GRN)
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <SectionLoading />
      ) : activeTab === 'requests' ? (
        /* Requisitions PR List */
        <div className="space-y-4">
          {purchaseRequests.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs">
              No purchase requisitions raised yet.
            </div>
          ) : (
            purchaseRequests.map((pr) => (
              <div
                key={pr.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded font-mono">
                      {pr.pr_number}
                    </span>
                    <Badge variant={pr.status === 'approved' ? 'success' : pr.status === 'converted_to_po' ? 'brand' : 'warning'}>
                      {pr.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">{pr.title}</h3>
                  {pr.justification && (
                    <p className="text-xs text-slate-500 mt-1">{pr.justification}</p>
                  )}
                </div>

                <div className="flex items-center gap-6 text-xs text-slate-500">
                  <div>Estimated Cost: <strong className="text-slate-900 dark:text-white">{formatCurrency(pr.estimated_cost)}</strong></div>
                  <div>Required By: <strong className="text-slate-900 dark:text-white">{pr.required_date || 'ASAP'}</strong></div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : activeTab === 'rfqs' ? (
        /* RFQ Tender Comparison Grid */
        <div className="space-y-6">
          {rfqs.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs">
              No active RFQ tender packages.
            </div>
          ) : (
            rfqs.map((rfq) => (
              <div
                key={rfq.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono">
                      {rfq.rfq_number}
                    </span>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white mt-1">{rfq.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{rfq.scope_description}</p>
                  </div>
                  <Badge variant={rfq.status === 'awarded' ? 'success' : 'brand'}>
                    {rfq.status.toUpperCase()}
                  </Badge>
                </div>

                {/* Tender Side-by-Side Scoring Matrix */}
                {rfq.suppliers && rfq.suppliers.length > 0 && (
                  <div className="overflow-x-auto pt-2">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                          <th className="p-2.5">Bidding Supplier</th>
                          <th className="p-2.5 text-right">Quoted Amount</th>
                          <th className="p-2.5 text-center">Lead Time</th>
                          <th className="p-2.5 text-center">Tech Score</th>
                          <th className="p-2.5 text-center">Comm Score</th>
                          <th className="p-2.5 text-center">Total Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {rfq.suppliers.map((s: any) => {
                          const total = ((s.technical_compliance_score || 0) + (s.commercial_score || 0)) / 2;
                          return (
                            <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                              <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">{s.supplier_name}</td>
                              <td className="p-2.5 text-right font-bold text-slate-900 dark:text-white">
                                {s.quoted_amount ? formatCurrency(s.quoted_amount) : 'Pending'}
                              </td>
                              <td className="p-2.5 text-center">{s.delivery_lead_time_days ? `${s.delivery_lead_time_days} Days` : '—'}</td>
                              <td className="p-2.5 text-center font-semibold text-blue-600">{s.technical_compliance_score || 0}%</td>
                              <td className="p-2.5 text-center font-semibold text-emerald-600">{s.commercial_score || 0}%</td>
                              <td className="p-2.5 text-center font-black text-teal-600">{total.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : activeTab === 'pos' ? (
        /* Purchase Orders List */
        <div className="space-y-4">
          {purchaseOrders.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs">
              No Purchase Orders created for this project.
            </div>
          ) : (
            purchaseOrders.map((po) => (
              <div
                key={po.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-mono">
                      {po.po_number}
                    </span>
                    <Badge variant={po.status === 'fulfilled' ? 'success' : po.status === 'issued' ? 'brand' : 'warning'}>
                      {po.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">Supplier: {po.supplier_name}</h3>
                  <div className="text-xs text-slate-500 mt-1">
                    Payment Terms: {po.payment_terms || 'Standard'} • Delivery Target: {po.expected_delivery_date || 'N/A'}
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs">
                  <div className="text-right">
                    <div className="text-slate-400">Total Committed:</div>
                    <div className="text-base font-extrabold text-teal-600 dark:text-teal-400">
                      {formatCurrency(po.total_amount)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Goods Receipts (GRN) List */
        <div className="space-y-4">
          {goodsReceipts.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs">
              No Goods Receipts logged. Log verified delivery notes on site.
            </div>
          ) : (
            goodsReceipts.map((grn) => (
              <div
                key={grn.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-mono">
                      {grn.grn_number}
                    </span>
                    <Badge variant={grn.status === 'accepted' ? 'success' : 'warning'}>
                      {grn.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Delivery Note: {grn.carrier_delivery_note_ref || 'Standard Carrier'}
                  </h3>
                  {grn.inspector_notes && (
                    <p className="text-xs text-slate-500 mt-1">Inspection Notes: {grn.inspector_notes}</p>
                  )}
                </div>

                <div className="text-xs text-slate-500">
                  Received Date: <strong className="text-slate-900 dark:text-white">{grn.received_date ? String(grn.received_date).slice(0, 10) : 'Today'}</strong>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL: CREATE PR */}
      {showAddPrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Raise Purchase Requisition</h3>
              <button onClick={() => setShowAddPrModal(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePr} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Requisition Title *
                </label>
                <input
                  type="text"
                  required
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  placeholder="e.g., 500 Bags of C30 Portland Cement"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Estimated Cost ({currency})
                  </label>
                  <input
                    type="number"
                    value={prCost}
                    onChange={(e) => setPrCost(e.target.value)}
                    placeholder="350000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Required On-Site Date
                  </label>
                  <input
                    type="date"
                    value={prRequiredDate}
                    onChange={(e) => setPrRequiredDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Technical Justification
                </label>
                <textarea
                  rows={2}
                  value={prJustification}
                  onChange={(e) => setPrJustification(e.target.value)}
                  placeholder="Operational justification for site execution..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddPrModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {saving ? 'Submitting...' : 'Submit Requisition'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PO */}
      {showAddPoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Issue Purchase Order</h3>
              <button onClick={() => setShowAddPoModal(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePo} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  required
                  value={poSupplier}
                  onChange={(e) => setPoSupplier(e.target.value)}
                  placeholder="e.g., Bamburi Cement Ltd"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Total Amount ({currency})
                  </label>
                  <input
                    type="number"
                    value={poAmount}
                    onChange={(e) => setPoAmount(e.target.value)}
                    placeholder="340000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Delivery Due Date
                  </label>
                  <input
                    type="date"
                    value={poDeliveryDate}
                    onChange={(e) => setPoDeliveryDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Payment Terms
                </label>
                <input
                  type="text"
                  value={poTerms}
                  onChange={(e) => setPoTerms(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddPoModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {saving ? 'Issuing...' : 'Issue PO'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE GRN */}
      {showAddGrnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Log Goods Receipt (GRN)</h3>
              <button onClick={() => setShowAddGrnModal(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGrn} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Matching Purchase Order *
                </label>
                <select
                  required
                  value={grnPoId}
                  onChange={(e) => setGrnPoId(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                >
                  <option value="">Select PO</option>
                  {purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.po_number} — {po.supplier_name} ({formatCurrency(po.total_amount)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Carrier Delivery Note #
                </label>
                <input
                  type="text"
                  value={grnCarrierNote}
                  onChange={(e) => setGrnCarrierNote(e.target.value)}
                  placeholder="e.g., DN-88491"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Quality Inspector Notes
                </label>
                <textarea
                  rows={2}
                  value={grnNotes}
                  onChange={(e) => setGrnNotes(e.target.value)}
                  placeholder="Material inspection result and verification remarks..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddGrnModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {saving ? 'Logging...' : 'Confirm Goods Receipt'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
