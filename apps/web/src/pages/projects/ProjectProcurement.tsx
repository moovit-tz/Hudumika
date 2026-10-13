import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
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
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(!propsPurchaseRequests && !propsRfqs && !propsPurchaseOrders);
  const [prPage, setPrPage] = useState(1);
  const [prPageSize, setPrPageSize] = useState(25);
  const [rfqPage, setRfqPage] = useState(1);
  const [rfqPageSize, setRfqPageSize] = useState(25);
  const [poPage, setPoPage] = useState(1);
  const [poPageSize, setPoPageSize] = useState(25);
  const [grnPage, setGrnPage] = useState(1);
  const [grnPageSize, setGrnPageSize] = useState(25);

  const [showAddPrModal, setShowAddPrModal] = useState(false);
  const [showAddPoModal, setShowAddPoModal] = useState(false);
  const [showAddGrnModal, setShowAddGrnModal] = useState(false);
  const [showRfqForm, setShowRfqForm] = useState(false);
  const [rfqSuppliers, setRfqSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [rfqTitle, setRfqTitle] = useState('');
  const [rfqScope, setRfqScope] = useState('');
  const [rfqDeadline, setRfqDeadline] = useState('');
  const [rfqRequest, setRfqRequest] = useState('');
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>(['']);

  // PR Form
  const [prNumber, setPrNumber] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prCost, setPrCost] = useState('');
  const [prRequiredDate, setPrRequiredDate] = useState('');
  const [prJustification, setPrJustification] = useState('');

  // PO Form
  const [poNumber, setPoNumber] = useState('');
  const [poSupplier, setPoSupplier] = useState('');
  const [poAmount, setPoAmount] = useState('');
  const [poDeliveryDate, setPoDeliveryDate] = useState('');
  const [poTerms, setPoTerms] = useState('Net 30 Days Upon Inspection');
  useEffect(() => {
    if (showAddPoModal) apiFetch('/v1/suppliers').then(res => setRfqSuppliers(Array.isArray(res) ? res : res.data || []))
      .catch(error => showAlert(error.message || 'Failed to load suppliers', { variant: 'error' }));
  }, [showAddPoModal]);

  // GRN Form
  const [grnNumber, setGrnNumber] = useState('');
  const [grnPoId, setGrnPoId] = useState('');
  const [grnCarrierNote, setGrnCarrierNote] = useState('');
  const [grnNotes, setGrnNotes] = useState('');
  const [grnDescription, setGrnDescription] = useState('');
  const [grnQuantity, setGrnQuantity] = useState('');
  const [grnUnit, setGrnUnit] = useState('units');
  const [grnStatus, setGrnStatus] = useState('pending_inspection');

  const [saving, setSaving] = useState(false);

  useEffect(() => { setPrPage(1); setRfqPage(1); setPoPage(1); setGrnPage(1); }, [activeTab]);

  const loadData = useCallback(async () => {
    if (propsPurchaseRequests && propsRfqs && propsPurchaseOrders && propsGoodsReceipts) {
      setPurchaseRequests(propsPurchaseRequests);
      setRfqs(propsRfqs);
      setPurchaseOrders(propsPurchaseOrders);
      setGoodsReceipts(propsGoodsReceipts);
      setLoadErrors([]);
      return;
    }
    setLoading(true);
    const results = await Promise.allSettled([
      apiFetch(`/v1/project-os/projects/${projectId}/purchase-requests`),
      apiFetch(`/v1/project-os/projects/${projectId}/rfqs`),
      apiFetch(`/v1/project-os/projects/${projectId}/purchase-orders`),
      apiFetch(`/v1/project-os/projects/${projectId}/goods-receipts`),
    ]);
    const labels = ['Requisitions', 'RFQs', 'Purchase orders', 'Goods receipts'];
    const setters = [setPurchaseRequests, setRfqs, setPurchaseOrders, setGoodsReceipts];
    const failed: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') setters[index](Array.isArray(result.value) ? result.value : result.value.data || []);
      else failed.push(labels[index]);
    });
    setLoadErrors(failed);
    setLoading(false);
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
          ...(prNumber.trim() ? { pr_number: prNumber.trim() } : {}),
          title: prTitle.trim(),
          estimated_cost: parseFloat(prCost) || 0,
          required_date: prRequiredDate || null,
          justification: prJustification.trim() || null,
        }),
      });
      showAlert('Purchase request saved', { variant: 'success' });
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
      showAlert('Select a supplier', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/purchase-orders`, {
        method: 'POST',
        body: JSON.stringify({
          ...(poNumber.trim() ? { po_number: poNumber.trim() } : {}),
          supplier_id: poSupplier,
          total_amount: parseFloat(poAmount) || 0,
          expected_delivery_date: poDeliveryDate || null,
          payment_terms: poTerms || null,
          currency,
        }),
      });
      showAlert('Purchase-order draft saved', { variant: 'success' });
      setShowAddPoModal(false);
      setPoSupplier('');
      setPoAmount('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to save purchase-order draft', { variant: 'error' });
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
          ...(grnNumber.trim() ? { grn_number: grnNumber.trim() } : {}),
          carrier_delivery_note_ref: grnCarrierNote.trim() || null,
          inspector_notes: grnNotes.trim() || null,
          status: grnStatus,
          items_received: [{ description: grnDescription.trim(), quantity: Number(grnQuantity), unit: grnUnit.trim() }],
        }),
      });
      showAlert('Goods receipt saved with the recorded inspection status', { variant: 'success' });
      setShowAddGrnModal(false);
      setGrnCarrierNote('');
      setGrnNotes('');
      setGrnDescription(''); setGrnQuantity(''); setGrnStatus('pending_inspection');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to log GRN', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number, valueCurrency = currency) => `${valueCurrency} ${Number(val || 0).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {loadErrors.length > 0 && <Alert variant="warning">
        <AlertTitle>Some procurement sections could not load</AlertTitle>
        <AlertDescription>{loadErrors.join(', ')}. <Button variant="outline" size="sm" onClick={() => loadData()}>Retry</Button></AlertDescription>
      </Alert>}

      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex items-center gap-2" data-ds-tabstrip="">
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'requests'
                ? 'bg-teal-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeTab === 'requests'} data-ui-native-button="" aria-pressed={activeTab === 'requests'}>
            Requisitions (PR) ({loadErrors.includes('Requisitions') ? '—' : purchaseRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('rfqs')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'rfqs'
                ? 'bg-teal-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeTab === 'rfqs'} data-ui-native-button="" aria-pressed={activeTab === 'rfqs'}>
            RFQ Tender Comparison ({loadErrors.includes('RFQs') ? '—' : rfqs.length})
          </button>
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'pos'
                ? 'bg-teal-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeTab === 'pos'} data-ui-native-button="" aria-pressed={activeTab === 'pos'}>
            Purchase Orders (PO) ({loadErrors.includes('Purchase orders') ? '—' : purchaseOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('grns')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'grns'
                ? 'bg-teal-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeTab === 'grns'} data-ui-native-button="" aria-pressed={activeTab === 'grns'}>
            Goods Receipts (GRN) ({loadErrors.includes('Goods receipts') ? '—' : goodsReceipts.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'requests' && (
            <Button size="sm" onClick={() => { setPrNumber(''); setPrTitle(''); setPrCost(''); setPrRequiredDate(''); setPrJustification(''); setShowAddPrModal(true); }} className="bg-primary text-primary-foreground">
              <Icon name="plus" size={14} className="mr-1" /> New Requisition (PR)
            </Button>
          )}
          {activeTab === 'pos' && (
            <Button size="sm" onClick={() => { setPoNumber(''); setPoSupplier(''); setPoAmount(''); setPoDeliveryDate(''); setPoTerms('Net 30 Days Upon Inspection'); setShowAddPoModal(true); }}>
              <Icon name="plus" size={14} className="mr-1" /> New Purchase Order
            </Button>
          )}
          {activeTab === 'grns' && (
            <Button size="sm" onClick={() => { setGrnNumber(''); setGrnPoId(''); setGrnCarrierNote(''); setGrnNotes(''); setGrnDescription(''); setGrnQuantity(''); setGrnUnit('units'); setGrnStatus('pending_inspection'); setShowAddGrnModal(true); }}>
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
            <div className="p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No purchase requisitions raised yet.
            </div>
          ) : (<>
            {paginate(purchaseRequests, prPage, prPageSize).visible.map((pr) => (
              <div
                key={pr.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
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
                  <h3 className="font-bold text-base text-foreground">{pr.title}</h3>
                  {pr.justification && (
                    <p className="text-xs text-muted-foreground mt-1">{pr.justification}</p>
                  )}
                </div>

                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <div>Estimated Cost: <strong className="text-foreground">{formatCurrency(pr.estimated_cost)}</strong></div>
                  <div>Required By: <strong className="text-foreground">{pr.required_date || 'ASAP'}</strong></div>
                </div>
              </div>
            ))}
            <ListPagination total={purchaseRequests.length} page={prPage} pageSize={prPageSize} onPageChange={setPrPage} onPageSizeChange={setPrPageSize} noun="requisitions" />
          </>)}
        </div>
      ) : activeTab === 'rfqs' ? (
        /* RFQ Tender Comparison Grid */
        <div className="space-y-6">
          <Button onClick={async () => {
            try { const rows = await apiFetch('/v1/suppliers'); setRfqSuppliers(Array.isArray(rows) ? rows : rows.data || []); setShowRfqForm(true); }
            catch (error: any) { showAlert(error.message, { variant: 'error' }); }
          }}>New RFQ</Button>
          {showRfqForm && <Card>
            <CardHeader><CardTitle>Request for quotation</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={async e => {
                e.preventDefault(); setSaving(true);
                try {
                  await apiFetch(`/v1/project-os/projects/${projectId}/rfqs`, { method: 'POST', body: JSON.stringify({
                    rfq_number: `RFQ-${crypto.randomUUID().slice(0, 8)}`, title: rfqTitle, scope_description: rfqScope,
                    closing_date: rfqDeadline, purchase_request_id: rfqRequest || null,
                    suppliers: selectedSuppliers.map(supplier_id => ({ supplier_id })),
                  }) });
                  setShowRfqForm(false); setRfqTitle(''); setRfqScope(''); setRfqDeadline(''); setRfqRequest(''); setSelectedSuppliers(['']);
                  await loadData(); propsOnRefresh?.(); showAlert('RFQ saved. Supplier invitations have not been sent.', { variant: 'success' });
                } catch (error: any) { showAlert(error.message, { variant: 'error' }); }
                finally { setSaving(false); }
              }}>
                <label className="block text-sm">RFQ title *<Input required value={rfqTitle} onChange={e => setRfqTitle(e.target.value)} /></label>
                <label className="block text-sm">Scope<Textarea value={rfqScope} onChange={e => setRfqScope(e.target.value)} /></label>
                <div className="text-sm">Submission deadline *<DatePicker date={parseDateOnly(rfqDeadline)} onChange={date => setRfqDeadline(toDateOnlyString(date))} /></div>
                <Combobox value={rfqRequest} onChange={setRfqRequest} placeholder="Optional purchase request"
                  options={[{ value: '', label: 'No linked request' }, ...purchaseRequests.map(pr => ({ value: pr.id, label: `${pr.pr_number}: ${pr.title}` }))]} />
                {selectedSuppliers.map((selected, index) => <div key={index} className="flex gap-2">
                  <Combobox value={selected} onChange={value => setSelectedSuppliers(rows => rows.map((row, i) => i === index ? value : row))}
                    placeholder={`Choose supplier ${index + 1}`} options={rfqSuppliers.map(supplier => ({ value: supplier.id, label: supplier.name }))} />
                  {selectedSuppliers.length > 1 && <Button type="button" variant="outline" onClick={() => setSelectedSuppliers(rows => rows.filter((_, i) => i !== index))}>Remove</Button>}
                </div>)}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={selectedSuppliers.length >= 50} onClick={() => setSelectedSuppliers(rows => [...rows, ''])}>Add supplier</Button>
                  <Button type="button" variant="outline" onClick={() => setShowRfqForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving || !rfqDeadline || selectedSuppliers.some(id => !id)}>Save RFQ</Button>
                </div>
              </form>
            </CardContent>
          </Card>}
          {rfqs.length === 0 ? (
            <div className="p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No active RFQ tender packages.
            </div>
          ) : (<>
            {paginate(rfqs, rfqPage, rfqPageSize).visible.map((rfq) => (
              <div
                key={rfq.id}
                className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono">
                      {rfq.rfq_number}
                    </span>
                    <h3 className="font-bold text-base text-foreground mt-1">{rfq.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{rfq.scope_description}</p>
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
                        <tr className="bg-slate-50 dark:bg-slate-900 text-muted-foreground font-bold border-b border-border">
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
                          const total = s.technical_compliance_score == null || s.commercial_score == null ? null : (s.technical_compliance_score + s.commercial_score) / 2;
                          return (
                            <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                              <td className="p-2.5 font-bold text-foreground">{s.supplier_name}</td>
                              <td className="p-2.5 text-right font-bold text-foreground">
                                {s.quoted_amount != null ? formatCurrency(s.quoted_amount) : 'Pending'}
                              </td>
                              <td className="p-2.5 text-center">{s.delivery_lead_time_days ? `${s.delivery_lead_time_days} Days` : '—'}</td>
                              <td className="p-2.5 text-center font-semibold text-blue-600">{s.technical_compliance_score == null ? '—' : `${s.technical_compliance_score}%`}</td>
                              <td className="p-2.5 text-center font-semibold text-emerald-600">{s.commercial_score == null ? '—' : `${s.commercial_score}%`}</td>
                              <td className="p-2.5 text-center font-black text-teal-600">{total === null ? '—' : `${total.toFixed(1)}%`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            <ListPagination total={rfqs.length} page={rfqPage} pageSize={rfqPageSize} onPageChange={setRfqPage} onPageSizeChange={setRfqPageSize} noun="RFQs" />
          </>)}
        </div>
      ) : activeTab === 'pos' ? (
        /* Purchase Orders List */
        <div className="space-y-4">
          {purchaseOrders.length === 0 ? (
            <div className="p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No Purchase Orders created for this project.
            </div>
          ) : (<>
            {paginate(purchaseOrders, poPage, poPageSize).visible.map((po) => (
              <div
                key={po.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
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
                  <h3 className="font-bold text-base text-foreground">Supplier: {po.supplier_name}</h3>
                  <div className="text-xs text-muted-foreground mt-1">
                    Payment Terms: {po.payment_terms || 'Standard'} • Delivery Target: {po.expected_delivery_date || 'N/A'}
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs">
                  <div className="text-right">
                    <div className="text-muted-foreground">{po.status === 'draft' ? 'Draft Value:' : 'Order Value:'}</div>
                    <div className="text-base font-extrabold text-primary">
                      {formatCurrency(po.total_amount, po.currency)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <ListPagination total={purchaseOrders.length} page={poPage} pageSize={poPageSize} onPageChange={setPoPage} onPageSizeChange={setPoPageSize} noun="orders" />
          </>)}
        </div>
      ) : (
        /* Goods Receipts (GRN) List */
        <div className="space-y-4">
          {goodsReceipts.length === 0 ? (
            <div className="p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No Goods Receipts logged. Log verified delivery notes on site.
            </div>
          ) : (<>
            {paginate(goodsReceipts, grnPage, grnPageSize).visible.map((grn) => (
              <div
                key={grn.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-mono">
                      {grn.grn_number}
                    </span>
                    <Badge variant={grn.status === 'accepted' ? 'success' : grn.status === 'rejected' ? 'error' : 'warning'}>
                      {grn.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-sm text-foreground">
                    Delivery Note: {grn.carrier_delivery_note_ref || 'Not recorded'}
                  </h3>
                  {grn.items_received?.map((item, index) => <p key={index} className="text-sm mt-1">{item.description}{item.quantity != null ? ` · ${item.quantity} ${item.unit}` : ''}</p>)}
                  {grn.inspector_notes && (
                    <p className="text-xs text-muted-foreground mt-1">Inspection Notes: {grn.inspector_notes}</p>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  Received Date: <strong className="text-foreground">{grn.received_date ? String(grn.received_date).slice(0, 10) : 'Today'}</strong>
                </div>
              </div>
            ))}
            <ListPagination total={goodsReceipts.length} page={grnPage} pageSize={grnPageSize} onPageChange={setGrnPage} onPageSizeChange={setGrnPageSize} noun="receipts" />
          </>)}
        </div>
      )}

      {/* MODAL: CREATE PR */}
      <Dialog open={showAddPrModal} onOpenChange={setShowAddPrModal}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Raise Purchase Requisition</DialogTitle></DialogHeader>

            <form onSubmit={handleCreatePr} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Requisition Title *
                </label>
                <Input
                  type="text"
                  required
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  placeholder="e.g., 500 Bags of C30 Portland Cement"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Estimated Cost ({currency})
                  </label>
                  <Input
                    type="number"
                    value={prCost}
                    onChange={(e) => setPrCost(e.target.value)}
                    placeholder="350000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Required On-Site Date
                  </label>
                  <DatePicker date={parseDateOnly(prRequiredDate)} onChange={date => setPrRequiredDate(toDateOnlyString(date))} />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Technical Justification
                </label>
                <Textarea
                  rows={2}
                  value={prJustification}
                  onChange={(e) => setPrJustification(e.target.value)}
                  placeholder="Operational justification for site execution..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddPrModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? 'Saving…' : 'Save requisition'}
                </Button>
              </div>
            </form>
          </DialogContent>
      </Dialog>

      {showAddPoModal && activeTab === 'pos' && (
        <Card>
          <CardHeader><CardTitle>Purchase-order draft</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreatePo} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Supplier *</label>
                <Combobox value={poSupplier} onChange={setPoSupplier} options={rfqSuppliers.map(supplier => ({ value: supplier.id, label: supplier.name }))} placeholder="Choose purchase-order supplier" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="po-number" className="block text-sm font-medium mb-1">Order number *</label>
                  <Input id="po-number" required maxLength={50} value={poNumber} onChange={e => setPoNumber(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="po-amount" className="block text-sm font-medium mb-1">Total amount ({currency}) *</label>
                  <Input id="po-amount" type="number" required min={0} step="0.01" value={poAmount} onChange={e => setPoAmount(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Delivery due date</label>
                <DatePicker date={parseDateOnly(poDeliveryDate)} onChange={date => setPoDeliveryDate(toDateOnlyString(date))} />
              </div>
              <div>
                <label htmlFor="po-terms" className="block text-sm font-medium mb-1">Payment terms</label>
                <Textarea id="po-terms" value={poTerms} onChange={e => setPoTerms(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAddPoModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving || !poSupplier || !poNumber.trim()}>{saving ? 'Saving…' : 'Save Draft'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {showAddGrnModal && activeTab === 'grns' && (
        <Card><CardHeader><CardTitle>Record goods receipt</CardTitle></CardHeader><CardContent>
          <form onSubmit={handleCreateGrn} className="space-y-4">
            <Combobox value={grnPoId} onChange={setGrnPoId} options={purchaseOrders.filter(po => ['issued', 'partially_delivered'].includes(po.status)).map(po => ({ value: po.id, label: po.po_number, sublabel: po.supplier_name }))} placeholder="Select issued purchase order" />
            <label className="block">Receipt number<Input aria-label="Receipt number" required value={grnNumber} onChange={e => setGrnNumber(e.target.value)} /></label>
            <label className="block">Received item<Textarea aria-label="Received item" required value={grnDescription} onChange={e => setGrnDescription(e.target.value)} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>Received quantity<Input aria-label="Received quantity" required type="number" min="0.0001" step="any" value={grnQuantity} onChange={e => setGrnQuantity(e.target.value)} /></label>
              <label>Unit<Input aria-label="Unit" required value={grnUnit} onChange={e => setGrnUnit(e.target.value)} /></label>
            </div>
            <Select value={grnStatus} onValueChange={setGrnStatus}><SelectTrigger aria-label="Inspection status"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="pending_inspection">Pending inspection</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="partially_accepted">Accepted with concession</SelectItem>
            </SelectContent></Select>
            <label className="block">Carrier delivery note<Input aria-label="Carrier delivery note" value={grnCarrierNote} onChange={e => setGrnCarrierNote(e.target.value)} /></label>
            <label className="block">Inspection notes<Textarea aria-label="Inspection notes" value={grnNotes} onChange={e => setGrnNotes(e.target.value)} /></label>
            <p className="text-sm text-muted-foreground">This records receipt evidence. Order completion requires reconciliation of delivered quantities.</p>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowAddGrnModal(false)}>Cancel</Button><Button type="submit" disabled={saving || !grnPoId}>{saving ? 'Saving…' : 'Save Receipt'}</Button></div>
          </form>
        </CardContent></Card>
      )}
    </div>
  );
};
