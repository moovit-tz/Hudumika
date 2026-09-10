import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
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
  currency = 'KES',
}) => {
  const [activeTab, setActiveTab] = useState<'allocations' | 'fleet'>(projectId ? 'allocations' : 'fleet');

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

  // Allocation Form
  const [allocResourceId, setAllocResourceId] = useState('');
  const [allocStart, setAllocStart] = useState('');
  const [allocEnd, setAllocEnd] = useState('');
  const [allocHours, setAllocHours] = useState('80');
  const [allocPct, setAllocPct] = useState('100');

  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (propsResources && (propsAllocations || !projectId)) {
      setResources(propsResources);
      if (propsAllocations) setAllocations(propsAllocations);
      return;
    }
    setLoading(true);
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
    } catch {
      setResources([]);
      setAllocations([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, propsResources, propsAllocations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resName.trim()) {
      showAlert('Resource name is required', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/v1/project-os/resources', {
        method: 'POST',
        body: JSON.stringify({
          resource_type: resType,
          name: resName.trim(),
          code: resCode.trim() || null,
          make_model: resMakeModel.trim() || null,
          capacity_rating: resCapacity.trim() || null,
          cost_rate_hourly: parseFloat(resRateHourly) || 0,
          cost_rate_daily: parseFloat(resRateDaily) || 0,
          currency,
          status: 'available',
        }),
      });
      showAlert('Resource registered in enterprise fleet', { variant: 'success' });
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
    if (!allocResourceId || !projectId) {
      showAlert('Please select an asset to allocate', { variant: 'error' });
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
      showAlert('Resource allocated to project work package', { variant: 'success' });
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

  const formatCurrency = (val: number) => `${currency} ${Number(val || 0).toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          {projectId && (
            <button
              onClick={() => setActiveTab('allocations')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'allocations'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Project Asset Allocations ({allocations.length})
            </button>
          )}
          <button
            onClick={() => setActiveTab('fleet')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'fleet'
                ? 'bg-teal-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Enterprise Machinery & Fleet ({resources.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'allocations' && projectId && (
            <Button size="sm" onClick={() => setShowAddAllocModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
              <Icon name="plus" size={14} className="mr-1" /> Allocate Fleet Asset
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAddResourceModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
            <Icon name="plus" size={14} className="mr-1" /> Register New Asset
          </Button>
        </div>
      </div>

      {loading ? (
        <SectionLoading />
      ) : activeTab === 'allocations' && projectId ? (
        /* Allocations Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allocations.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs">
              No machinery or specialized equipment allocated to this project yet.
            </div>
          ) : (
            allocations.map((al) => (
              <div
                key={al.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                      {al.resource_type ? al.resource_type.replace('_', ' ') : 'Asset'}
                    </span>
                    <h4 className="font-bold text-base text-slate-900 dark:text-white mt-0.5">
                      {al.resource_name || 'Equipment'}
                    </h4>
                  </div>
                  <Badge variant="brand">{al.allocated_pct}% Capacity</Badge>
                </div>

                <div className="text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex justify-between">
                    <span>Planned Operating Hours:</span>
                    <strong className="text-slate-900 dark:text-white">{al.hours_planned} Hrs</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Window:</span>
                    <strong className="text-slate-900 dark:text-white">{al.start_date} → {al.end_date}</strong>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Fleet List */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs">
              No fleet resources registered. Add machinery, cranes, drilling rigs, or specialized equipment.
            </div>
          ) : (
            resources.map((res) => (
              <div
                key={res.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold text-slate-500 font-mono">
                      {res.code || 'ASSET-00'}
                    </span>
                    <Badge variant={res.status === 'available' ? 'success' : res.status === 'allocated' ? 'brand' : 'warning'}>
                      {res.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">{res.name}</h3>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {res.make_model || 'Standard Specification'} {res.capacity_rating && `• ${res.capacity_rating}`}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Hourly Rate:</span>
                    <strong className="text-slate-900 dark:text-white">{formatCurrency(res.cost_rate_hourly)}/hr</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Daily Rate:</span>
                    <strong className="text-slate-900 dark:text-white">{formatCurrency(res.cost_rate_daily)}/day</strong>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL: ADD RESOURCE */}
      {showAddResourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Register Fleet Asset</h3>
              <button onClick={() => setShowAddResourceModal(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateResource} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Asset Type *
                  </label>
                  <select
                    value={resType}
                    onChange={(e: any) => setResType(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  >
                    <option value="heavy_machinery">Heavy Machinery</option>
                    <option value="vehicle">Vehicle / Hauler</option>
                    <option value="equipment">Specialized Equipment</option>
                    <option value="facility">Plant / Facility</option>
                    <option value="personnel">Specialist Personnel</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Asset Code
                  </label>
                  <input
                    type="text"
                    value={resCode}
                    onChange={(e) => setResCode(e.target.value)}
                    placeholder="EQ-CAT-320"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Asset / Equipment Name *
                </label>
                <input
                  type="text"
                  required
                  value={resName}
                  onChange={(e) => setResName(e.target.value)}
                  placeholder="e.g., Caterpillar 320 Hydraulic Excavator"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Make / Model
                  </label>
                  <input
                    type="text"
                    value={resMakeModel}
                    onChange={(e) => setResMakeModel(e.target.value)}
                    placeholder="CAT 320 GC"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Capacity Rating
                  </label>
                  <input
                    type="text"
                    value={resCapacity}
                    onChange={(e) => setResCapacity(e.target.value)}
                    placeholder="22.5 Tonnes"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Hourly Cost ({currency})
                  </label>
                  <input
                    type="number"
                    value={resRateHourly}
                    onChange={(e) => setResRateHourly(e.target.value)}
                    placeholder="4500"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Daily Cost ({currency})
                  </label>
                  <input
                    type="number"
                    value={resRateDaily}
                    onChange={(e) => setResRateDaily(e.target.value)}
                    placeholder="35000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddResourceModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {saving ? 'Registering...' : 'Register Asset'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ALLOCATE ASSET */}
      {showAddAllocModal && projectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Allocate Asset to Project</h3>
              <button onClick={() => setShowAddAllocModal(false)} className="text-slate-400 hover:text-slate-600">
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAllocation} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Asset *
                </label>
                <select
                  required
                  value={allocResourceId}
                  onChange={(e) => setAllocResourceId(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                >
                  <option value="">Select Machinery / Equipment</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code || r.resource_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={allocStart}
                    onChange={(e) => setAllocStart(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={allocEnd}
                    onChange={(e) => setAllocEnd(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Planned Operating Hours
                  </label>
                  <input
                    type="number"
                    value={allocHours}
                    onChange={(e) => setAllocHours(e.target.value)}
                    placeholder="80"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Allocated Capacity (%)
                  </label>
                  <input
                    type="number"
                    value={allocPct}
                    onChange={(e) => setAllocPct(e.target.value)}
                    placeholder="100"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddAllocModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {saving ? 'Allocating...' : 'Allocate Asset'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
