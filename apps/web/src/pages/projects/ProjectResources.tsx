import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { useAuth } from '../../hooks/useAuth.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { Input } from '../../components/ui/input.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../../components/ui/date-picker.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import type {
  ProjectResource,
  ProjectResourceAllocation,
  ProjectResourceType,
} from '@hudumika/types';

interface ProjectResourcesProps {
  projectId?: string;
  resources?: ProjectResource[];
  allocations?: ProjectResourceAllocation[];
  onRefresh?: () => void;
  currency?: string;
}

export const ProjectResources: React.FC<ProjectResourcesProps> = ({
  projectId,
  resources: propsResources,
  allocations: propsAllocations,
  onRefresh: propsOnRefresh,
  currency = 'TZS',
}) => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const canManageFleet = !!user && ['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'].includes(user.role);
  const [activeTab, setActiveTab] = useState<'allocations' | 'fleet'>(projectId ? 'allocations' : 'fleet');

  // Pagination
  const [allocPage, setAllocPage] = useState(1);
  const [allocPageSize, setAllocPageSize] = useState(25);
  const [fleetPage, setFleetPage] = useState(1);
  const [fleetPageSize, setFleetPageSize] = useState(25);

  const [resources, setResources] = useState<ProjectResource[]>(propsResources || []);
  const [allocations, setAllocations] = useState<ProjectResourceAllocation[]>(propsAllocations || []);
  const [loading, setLoading] = useState(!propsResources);

  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [showAddAllocModal, setShowAddAllocModal] = useState(false);

  // Resource Form
  const [resType, setResType] = useState<ProjectResourceType>('heavy_machinery');
  const [resName, setResName] = useState('');
  const [resCode, setResCode] = useState('');
  const [resMakeModel, setResMakeModel] = useState('');
  const [resCapacity, setResCapacity] = useState('');
  const [resRateHourly, setResRateHourly] = useState('');
  const [resRateDaily, setResRateDaily] = useState('');
  const [editingResource, setEditingResource] = useState<ProjectResource | null>(null);
  const [resStatus, setResStatus] = useState<ProjectResource['status']>('available');

  // Allocation Form
  const [allocResourceId, setAllocResourceId] = useState('');
  const [allocStart, setAllocStart] = useState('');
  const [allocEnd, setAllocEnd] = useState('');
  const [allocHours, setAllocHours] = useState('80');
  const [allocPct, setAllocPct] = useState('100');

  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadData = useCallback(async () => {
    if (propsResources && (propsAllocations || !projectId)) {
      setResources(propsResources);
      if (propsAllocations) setAllocations(propsAllocations);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const promises: Promise<any>[] = [apiFetch('/v1/project-os/resources')];
      if (projectId) {
        promises.push(apiFetch(`/v1/project-os/projects/${projectId}/allocations`));
      }
      const [resData, allocData] = await Promise.all(promises);
      setResources(Array.isArray(resData) ? resData : resData.data || []);
      if (allocData) {
        setAllocations(Array.isArray(allocData) ? allocData : allocData.data || []);
      }
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load resources');
    } finally {
      setLoading(false);
    }
  }, [projectId, propsResources, propsAllocations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset pagination on tab change
  useEffect(() => {
    setAllocPage(1);
    setFleetPage(1);
  }, [activeTab]);

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resName.trim()) {
      showAlert('Resource name is required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(editingResource ? `/v1/project-os/resources/${editingResource.id}` : '/v1/project-os/resources', {
        method: editingResource ? 'PATCH' : 'POST',
        body: JSON.stringify({
          resource_type: resType,
          name: resName.trim(),
          code: resCode.trim() || null,
          make_model: resMakeModel.trim() || null,
          capacity_rating: resCapacity.trim() || null,
          cost_rate_hourly: resRateHourly === '' ? undefined : Number(resRateHourly),
          cost_rate_daily: resRateDaily === '' ? undefined : Number(resRateDaily),
          currency,
          status: editingResource ? resStatus : 'available',
        }),
      });
      showAlert(editingResource ? 'Asset updated' : 'Resource registered in enterprise fleet', { variant: 'success' });
      setEditingResource(null);
      setShowAddResourceModal(false);
      setResName('');
      setResCode('');
      setResMakeModel('');
      setResCapacity('');
      setResRateHourly('');
      setResRateDaily('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to register resource', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocResourceId || !projectId || !allocStart || !allocEnd) {
      showAlert('Select an asset and both allocation dates', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/project-os/projects/${projectId}/allocations`, {
        method: 'POST',
        body: JSON.stringify({
          resource_id: allocResourceId,
          start_date: allocStart,
          end_date: allocEnd,
          hours_planned: parseFloat(allocHours) || 0,
          allocated_pct: parseInt(allocPct, 10) || 100,
        }),
      });
      showAlert('Resource allocation saved', { variant: 'success' });
      setShowAddAllocModal(false);
      setAllocResourceId('');
      setAllocStart('');
      setAllocEnd('');
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err.message || 'Failed to allocate resource', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number, rateCurrency = currency) => `${rateCurrency} ${Number(val || 0).toLocaleString()}`;
  function editResource(resource: ProjectResource) {
    setEditingResource(resource); setResName(resource.name); setResCode(resource.code || ''); setResType(resource.resource_type);
    setResMakeModel(resource.make_model || ''); setResCapacity(resource.capacity_rating || '');
    setResRateHourly(String(resource.cost_rate_hourly)); setResRateDaily(String(resource.cost_rate_daily)); setResStatus(resource.status); setShowAddResourceModal(true);
  }
  async function releaseAllocation(id: string) {
    setSaving(true);
    try { await apiFetch(`/v1/project-os/projects/${projectId}/allocations/${id}/release`, { method: 'POST' }); await loadData(); propsOnRefresh?.(); showAlert('Allocation released; history retained', { variant: 'success' }); }
    catch (err: any) { showAlert(err.message, { variant: 'error' }); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex items-center gap-2" data-ds-tabstrip="">
          {projectId && (
            <button
              onClick={() => setActiveTab('allocations')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'allocations'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
             data-ds-selected={activeTab === 'allocations'} data-ui-native-button="" aria-pressed={activeTab === 'allocations'}>
              Project Asset Allocations ({allocations.length})
            </button>
          )}
          <button
            onClick={() => setActiveTab('fleet')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'fleet'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
           data-ds-selected={activeTab === 'fleet'} data-ui-native-button="" aria-pressed={activeTab === 'fleet'}>
            Enterprise Machinery & Fleet ({resources.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'allocations' && projectId && (
            <Button size="sm" onClick={() => setShowAddAllocModal(true)}>
              <Icon name="plus" size={14} className="mr-1" /> Allocate Fleet Asset
            </Button>
          )}
          <Button size="sm" onClick={() => { setEditingResource(null); setResName(''); setResCode(''); setResMakeModel(''); setResCapacity(''); setResRateHourly(''); setResRateDaily(''); setShowAddResourceModal(true); }}>
            <Icon name="plus" size={14} className="mr-1" /> Register New Asset
          </Button>
        </div>
      </div>

      {loadError && <Card><CardContent className="pt-4"><p role="alert">{loadError}</p><Button variant="outline" onClick={loadData}>Retry</Button></CardContent></Card>}
      {loading ? (
        <SectionLoading />
      ) : activeTab === 'allocations' && projectId ? (
        /* Allocations Grid */
        <>
        <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
          {allocations.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No machinery or specialized equipment allocated to this project yet.
            </div>
          ) : (
            paginate(allocations, allocPage, allocPageSize).visible.map((al) => (
              <div
                key={al.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                      {al.resource_type ? al.resource_type.replace('_', ' ') : 'Asset'}
                    </span>
                    <h4 className="font-bold text-base text-foreground mt-0.5">
                      {al.resource_name || 'Equipment'}
                    </h4>
                  </div>
                  <Badge variant="brand">{al.allocated_pct}% Capacity</Badge>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant={al.status === 'RELEASED' ? 'gray' : 'brand'}>{al.status || 'CONFIRMED'}</Badge>{['REQUESTED', 'CONFIRMED'].includes(al.status || 'CONFIRMED') && <Button size="sm" variant="outline" disabled={saving} onClick={() => void releaseAllocation(al.id)}>Release allocation</Button>}</div>

                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
                  <div className="flex justify-between">
                    <span>Planned Operating Hours:</span>
                    <strong className="text-foreground">{al.hours_planned} Hrs</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Allocation Window:</span>
                    <strong className="text-foreground">{al.start_date} → {al.end_date}</strong>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <ListPagination total={allocations.length} page={allocPage} pageSize={allocPageSize} onPageChange={setAllocPage} onPageSizeChange={setAllocPageSize} noun="allocations" />
        </>
      ) : (<>
        {/* Fleet List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-muted rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground text-xs">
              No fleet resources registered. Add machinery, cranes, drilling rigs, or specialized equipment.
            </div>
          ) : (<>
            {paginate(resources, fleetPage, fleetPageSize).visible.map((res) => (
              <div
                key={res.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold text-muted-foreground font-mono">
                      {res.code || 'No code'}
                    </span>
                    <Badge variant={res.status === 'available' ? 'success' : res.status === 'allocated' ? 'brand' : 'warning'}>
                      {res.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-base text-foreground">{res.name}</h3>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {res.make_model || 'Specifications not recorded'} {res.capacity_rating && `• ${res.capacity_rating}`}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hourly Rate:</span>
                    <strong className="text-foreground">{formatCurrency(res.cost_rate_hourly, res.currency)}/hr</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Daily Rate:</span>
                    <strong className="text-foreground">{formatCurrency(res.cost_rate_daily, res.currency)}/day</strong>
                  </div>
                  {canManageFleet && <Button size="sm" variant="outline" onClick={() => editResource(res)}>Edit asset</Button>}
                </div>
              </div>
            ))}
          </>)}
        </div>
        <ListPagination total={resources.length} page={fleetPage} pageSize={fleetPageSize} onPageChange={setFleetPage} onPageSizeChange={setFleetPageSize} noun="assets" />
      </>)}

      {/* Resource registration */}
      <Dialog open={showAddResourceModal} onOpenChange={setShowAddResourceModal}>
        <DialogContent size="md">
          <form onSubmit={handleCreateResource}>
            <DialogHeader>
              <DialogTitle>{editingResource ? 'Edit Fleet Asset' : 'Register Fleet Asset'}</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">


              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Asset Type *
                  </label>
                  <Select
                    value={resType}
                    disabled={!!editingResource}
                    onValueChange={value => setResType(value as ProjectResourceType)}
                  >
                    <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="heavy_machinery">Heavy Machinery</SelectItem>
                      <SelectItem value="vehicle">Vehicle / Hauler</SelectItem>
                      <SelectItem value="equipment">Specialized Equipment</SelectItem>
                      <SelectItem value="tool">Tool</SelectItem>
                      <SelectItem value="facility">Plant / Facility</SelectItem>
                      <SelectItem value="personnel">Specialist Personnel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Asset Code
                  </label>
                  <Input
                    type="text"
                    aria-label="Asset code" value={resCode}
                    disabled={!!editingResource}
                    onChange={(e) => setResCode(e.target.value)}
                    placeholder="EQ-CAT-320"

                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Asset / Equipment Name *
                </label>
                <Input
                  type="text"
                  required
                  aria-label="Asset name" value={resName}
                  onChange={(e) => setResName(e.target.value)}
                  placeholder="e.g., Caterpillar 320 Hydraulic Excavator"

                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Make / Model
                  </label>
                  <Input
                    type="text"
                    aria-label="Make or model" value={resMakeModel}
                    onChange={(e) => setResMakeModel(e.target.value)}
                    placeholder="CAT 320 GC"

                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Capacity Rating
                  </label>
                  <Input
                    type="text"
                    aria-label="Capacity rating" value={resCapacity}
                    onChange={(e) => setResCapacity(e.target.value)}
                    placeholder="22.5 Tonnes"

                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Hourly Cost ({editingResource?.currency || currency})
                  </label>
                  <Input
                    type="number" min="0" step="any"
                    aria-label="Hourly cost" value={resRateHourly}
                    onChange={(e) => setResRateHourly(e.target.value)}
                    placeholder="4500"

                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Daily Cost ({editingResource?.currency || currency})
                  </label>
                  <Input
                    type="number" min="0" step="any"
                    aria-label="Daily cost" value={resRateDaily}
                    onChange={(e) => setResRateDaily(e.target.value)}
                    placeholder="35000"

                  />
                </div>
              </div>

              {editingResource && <div><label>Availability</label><Select value={resStatus} onValueChange={value => setResStatus(value as ProjectResource['status'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['available', 'allocated', 'maintenance', 'decommissioned'].map(value => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div>}
            </DialogBody>
            <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddResourceModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? 'Saving…' : editingResource ? 'Save asset' : 'Register Asset'}
                </Button>
            </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>

      {/* Dated allocation */}
      <Dialog open={showAddAllocModal && Boolean(projectId)} onOpenChange={setShowAddAllocModal}>
        <DialogContent size="md">
          <form onSubmit={handleCreateAllocation}>
            <DialogHeader>
              <DialogTitle>Allocate Asset to Project</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">


              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  Select Asset *
                </label>
                <Combobox
                  value={allocResourceId}
                  onChange={setAllocResourceId}
                  options={resources.filter(resource => ['available', 'allocated'].includes(resource.status)).map(resource => ({ value: resource.id, label: resource.name, sublabel: resource.code || resource.resource_type }))}
                  placeholder="Select machinery or equipment"
                  searchPlaceholder="Search fleet assets"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Start Date
                  </label>
                  <DatePicker date={parseDateOnly(allocStart)} onChange={date => setAllocStart(toDateOnlyString(date))} placeholder="Start date" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    End Date
                  </label>
                  <DatePicker date={parseDateOnly(allocEnd)} onChange={date => setAllocEnd(toDateOnlyString(date))} placeholder="End date" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Planned Operating Hours
                  </label>
                  <Input
                    type="number" min="0" step="any"
                    aria-label="Planned operating hours" value={allocHours}
                    onChange={(e) => setAllocHours(e.target.value)}
                    placeholder="80"

                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Allocated Capacity (%)
                  </label>
                  <Input
                    type="number"
                    min={1} max={100} step={1} aria-label="Allocated capacity percentage" value={allocPct}
                    onChange={(e) => setAllocPct(e.target.value)}
                    placeholder="100"

                  />
                </div>
              </div>

            </DialogBody>
            <DialogFooter>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddAllocModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? 'Allocating...' : 'Allocate Asset'}
                </Button>
            </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
