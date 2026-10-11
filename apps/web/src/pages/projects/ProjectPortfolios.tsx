import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import React, { useState, useEffect, useCallback } from 'react';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { money } from './projectData.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import type { ProjectPortfolio, ProjectProgram } from '@hudumika/types';

interface ProjectPortfoliosProps {
  portfolios?: (ProjectPortfolio & { project_count?: number; total_contract_value?: number })[];
  programs?: (ProjectProgram & { portfolio_name?: string; program_manager_name?: string })[];
  loading?: boolean;
  onRefresh?: () => void;
  onSelectProject?: (projectId: string) => void;
}

export const ProjectPortfolios: React.FC<ProjectPortfoliosProps> = ({
  portfolios: propsPortfolios,
  programs: propsPrograms,
  loading: propsLoading,
  onRefresh: propsOnRefresh,
  onSelectProject,
}) => {
  const [activeTab, setActiveTab] = useState<'portfolios' | 'programs'>('portfolios');
  const [portfolios, setPortfolios] = useState<any[]>(propsPortfolios || []);
  const [programs, setPrograms] = useState<any[]>(propsPrograms || []);
  const [loading, setLoading] = useState(propsLoading !== undefined ? propsLoading : (!propsPortfolios || !propsPrograms));

  const [showCreatePortfolioModal, setShowCreatePortfolioModal] = useState(false);
  const [showCreateProgramModal, setShowCreateProgramModal] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [portfolioCurrency, setPortfolioCurrency] = useState('TZS');
  const [programCurrency, setProgramCurrency] = useState('TZS');
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<{ type: 'portfolio' | 'program'; id: string; name: string } | null>(null);
  const [portPage, setPortPage] = useState(1);
  const [portPageSize, setPortPageSize] = useState(25);
  const [progPage, setProgPage] = useState(1);
  const [progPageSize, setProgPageSize] = useState(25);

  // Form states
  const [portfolioName, setPortfolioName] = useState('');
  const [portfolioCode, setPortfolioCode] = useState('');
  const [portfolioBudget, setPortfolioBudget] = useState('');
  const [portfolioRoi, setPortfolioRoi] = useState('');
  const [portfolioDesc, setPortfolioDesc] = useState('');

  const [programName, setProgramName] = useState('');
  const [programCode, setProgramCode] = useState('');
  const [programPortfolioId, setProgramPortfolioId] = useState('');
  const [programBudget, setProgramBudget] = useState('');
  const [programBenefit, setProgramBenefit] = useState('');
  const [programDesc, setProgramDesc] = useState('');

  const loadData = useCallback(async () => {
    if (propsPortfolios && propsPrograms) {
      setPortfolios(propsPortfolios);
      setPrograms(propsPrograms);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [pRes, prRes, projectRes] = await Promise.all([
        apiFetch('/v1/project-os/portfolios'),
        apiFetch('/v1/project-os/programs'),
        apiFetch('/v1/tasks/projects'),
      ]);
      setPortfolios(Array.isArray(pRes) ? pRes : pRes.data || []);
      setPrograms(Array.isArray(prRes) ? prRes : prRes.data || []);
      setProjects(Array.isArray(projectRes) ? projectRes : projectRes.data || []);
    } catch (err: any) {
      setLoadError(err.message || 'Unable to load portfolios and programs');
    } finally {
      setLoading(false);
    }
  }, [propsPortfolios, propsPrograms]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreatePortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!portfolioName || !portfolioCode) {
      showAlert('Please provide both portfolio name and code', { variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/v1/project-os/portfolios', {
        method: 'POST',
        body: JSON.stringify({
          name: portfolioName,
          code: portfolioCode,
          allocated_budget: parseFloat(portfolioBudget) || 0,
          currency: portfolioCurrency,
          target_roi: portfolioRoi === '' ? null : Number(portfolioRoi),
          description: portfolioDesc || null,
          status: 'active',
        }),
      });

      setShowCreatePortfolioModal(false);
      setPortfolioName('');
      setPortfolioCode('');
      setPortfolioBudget('');
      setPortfolioRoi('');
      setPortfolioDesc('');
      showAlert('Portfolio created successfully', { variant: 'success' });
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to create portfolio', { variant: 'error' });
    } finally { setSaving(false); }
  };

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!programName || !programCode) {
      showAlert('Please provide both program name and code', { variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/v1/project-os/programs', {
        method: 'POST',
        body: JSON.stringify({
          name: programName,
          code: programCode,
          portfolio_id: programPortfolioId || null,
          budget: parseFloat(programBudget) || 0,
          currency: programCurrency,
          target_benefits: programBenefit ? [programBenefit] : [],
          description: programDesc || null,
          status: 'active',
        }),
      });

      setShowCreateProgramModal(false);
      setProgramName('');
      setProgramCode('');
      setProgramPortfolioId('');
      setProgramBudget('');
      setProgramBenefit('');
      setProgramDesc('');
      showAlert('Program created successfully', { variant: 'success' });
      if (propsOnRefresh) propsOnRefresh();
      loadData();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to create program', { variant: 'error' });
    } finally { setSaving(false); }
  };

  const formatCurrency = (val: number) => Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      {loadError && <Card><CardContent className="pt-4"><p role="alert">{loadError}</p><Button variant="outline" onClick={() => void loadData()}>Retry</Button></CardContent></Card>}
      {/* Top Header & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Portfolios & Strategic Programs
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Top-level organizational structures aligning capital investments, target ROI, and benefits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-border" data-ds-tabstrip="">
            <button
              onClick={() => setActiveTab('portfolios')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'portfolios'
                  ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
             data-ds-selected={activeTab === 'portfolios'} data-ui-native-button="" aria-pressed={activeTab === 'portfolios'}>
              Portfolios ({portfolios.length})
            </button>
            <button
              onClick={() => setActiveTab('programs')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'programs'
                  ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
             data-ds-selected={activeTab === 'programs'} data-ui-native-button="" aria-pressed={activeTab === 'programs'}>
              Programs ({programs.length})
            </button>
          </div>

          <Button
            size="sm"
            onClick={() => (activeTab === 'portfolios' ? setShowCreatePortfolioModal(true) : setShowCreateProgramModal(true))}
            className="bg-primary text-primary-foreground"
          >
            <Icon name="plus" size={14} className="mr-1.5" />
            New {activeTab === 'portfolios' ? 'Portfolio' : 'Program'}
          </Button>
        </div>
      </div>

      {loading ? (
        <SectionLoading />
      ) : activeTab === 'portfolios' ? (
        /* Portfolios Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {portfolios.length === 0 ? (
            <div className="col-span-full p-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground">
              <Icon name="layers" size={32} className="mx-auto mb-3 text-slate-400" />
              <p className="text-sm font-semibold">No Portfolios Created Yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Create a portfolio to organize strategic business units and group related programs.
              </p>
            </div>
          ) : (
            paginate(portfolios, portPage, portPageSize).visible.map((port) => (
              <div
                key={port.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800">
                      {port.code}
                    </span>
                    <Badge variant={port.status === 'active' ? 'success' : 'gray'}>
                      {port.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-base text-foreground line-clamp-1">
                    {port.name}
                  </h3>
                  <p className="text-xs text-muted-foreground dark:text-slate-400 mt-1 line-clamp-2 min-h-[32px]">
                    {port.description || 'No strategic description provided.'}
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Allocated Budget:</span>
                    <span className="font-bold text-foreground">
                      {money(port.allocated_budget, port.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Target ROI:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {port.target_roi != null ? `${port.target_roi}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Linked Projects:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {port.project_count || 0}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedGroup({ type: 'portfolio', id: port.id, name: port.name })}>View projects</Button>
                </div>
              </div>
            ))
          )}
          <ListPagination total={portfolios.length} page={portPage} pageSize={portPageSize} onPageChange={setPortPage} onPageSizeChange={setPortPageSize} noun="portfolios" />
        </div>
      ) : (
        /* Programs Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.length === 0 ? (
            <div className="col-span-full p-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-muted-foreground">
              <Icon name="briefcase" size={32} className="mx-auto mb-3 text-slate-400" />
              <p className="text-sm font-semibold">No Programs Created Yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Create a program to coordinate multiple related capital projects.
              </p>
            </div>
          ) : (
            paginate(programs, progPage, progPageSize).visible.map((prog) => (
              <div
                key={prog.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                      {prog.code}
                    </span>
                    <Badge variant={prog.status === 'active' ? 'brand' : 'gray'}>
                      {prog.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-base text-foreground line-clamp-1">
                    {prog.name}
                  </h3>
                  <div className="text-[11px] text-teal-600 dark:text-teal-400 font-medium mt-0.5">
                    Portfolio: {prog.portfolio_name || 'Unassigned'}
                  </div>
                  <p className="text-xs text-muted-foreground dark:text-slate-400 mt-1 line-clamp-2 min-h-[32px]">
                    {prog.description || 'No program charter scope.'}
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Program Budget:</span>
                    <span className="font-bold text-foreground">
                      {money(prog.budget, prog.currency)}
                    </span>
                  </div>
                  {prog.target_benefits && prog.target_benefits.length > 0 && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                      <span className="font-bold text-slate-700 dark:text-slate-200">Target Benefits: </span>
                      {prog.target_benefits.join(', ')}
                    </div>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setSelectedGroup({ type: 'program', id: prog.id, name: prog.name })}>View projects</Button>
                </div>
              </div>
            ))
          )}
          <ListPagination total={programs.length} page={progPage} pageSize={progPageSize} onPageChange={setProgPage} onPageSizeChange={setProgPageSize} noun="programs" />
        </div>
      )}

      {/* LINKED PROJECTS DIALOG */}
      <Dialog open={!!selectedGroup} onOpenChange={open => { if (!open) setSelectedGroup(null); }}>
        <DialogContent size="md">
          <DialogHeader style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
            <DialogTitle style={{ fontSize: 16, fontWeight: 800 }}>
              {selectedGroup?.name} &bull; Linked Projects
            </DialogTitle>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
              Projects assigned to this strategic {selectedGroup?.type}.
            </div>
          </DialogHeader>
          <DialogBody style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {selectedGroup && projects.filter(project => (selectedGroup.type === 'portfolio' ? project.portfolio_id : project.program_id) === selectedGroup.id).map(project => (
              <div
                key={project.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 'var(--r)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface, var(--white))',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{project.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                    {project.status.replace('_', ' ')} &bull; {money(project.baseline_budget, project.currency)}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setSelectedGroup(null); onSelectProject?.(project.id); }}>
                  Open Project &rarr;
                </Button>
              </div>
            ))}
            {selectedGroup && !projects.some(project => (selectedGroup.type === 'portfolio' ? project.portfolio_id : project.program_id) === selectedGroup.id) && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                No projects are linked to this {selectedGroup.type} yet. Assign projects via project edit details.
              </div>
            )}
          </DialogBody>
          <DialogFooter style={{ padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
            <Button variant="outline" onClick={() => setSelectedGroup(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREATE PORTFOLIO MODAL */}
      <Dialog open={showCreatePortfolioModal} onOpenChange={setShowCreatePortfolioModal}>
        <DialogContent size="md">
          <form onSubmit={handleCreatePortfolio} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <DialogHeader style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <DialogTitle style={{ fontSize: 16, fontWeight: 800 }}>Create Strategic Portfolio</DialogTitle>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                Group programs and business units to track high-level budgets and target ROI.
              </div>
            </DialogHeader>

            <DialogBody style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Portfolio Name *</label>
                  <Input
                    type="text"
                    required
                    value={portfolioName}
                    onChange={(e) => setPortfolioName(e.target.value)}
                    placeholder="e.g. Infrastructure & Energy"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Portfolio Code *</label>
                  <Input
                    type="text"
                    required
                    value={portfolioCode}
                    onChange={(e) => setPortfolioCode(e.target.value)}
                    placeholder="e.g. PORT-ENG-01"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Currency</label>
                  <Select value={portfolioCurrency} onValueChange={setPortfolioCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['TZS', 'KES', 'USD', 'EUR', 'GBP', 'UGX'].map(code => (
                        <SelectItem key={code} value={code}>{code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Allocated Budget</label>
                  <Input
                    type="number"
                    value={portfolioBudget}
                    onChange={(e) => setPortfolioBudget(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Target ROI (%)</label>
                  <Input
                    type="number"
                    step="0.1"
                    value={portfolioRoi}
                    onChange={(e) => setPortfolioRoi(e.target.value)}
                    placeholder="15.0"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Strategic Objectives</label>
                <Textarea
                  rows={3}
                  value={portfolioDesc}
                  onChange={(e) => setPortfolioDesc(e.target.value)}
                  placeholder="Strategic charter, market focus, and targets..."
                />
              </div>
            </DialogBody>

            <DialogFooter style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button type="button" variant="outline" onClick={() => setShowCreatePortfolioModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Portfolio'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CREATE PROGRAM MODAL */}
      <Dialog open={showCreateProgramModal} onOpenChange={setShowCreateProgramModal}>
        <DialogContent size="md">
          <form onSubmit={handleCreateProgram} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <DialogHeader style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <DialogTitle style={{ fontSize: 16, fontWeight: 800 }}>Create Capital Program</DialogTitle>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                Coordinate multiple related projects under a common delivery program.
              </div>
            </DialogHeader>

            <DialogBody style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Program Name *</label>
                  <Input
                    type="text"
                    required
                    value={programName}
                    onChange={(e) => setProgramName(e.target.value)}
                    placeholder="e.g. Geothermal Well Drilling"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Program Code *</label>
                  <Input
                    type="text"
                    required
                    value={programCode}
                    onChange={(e) => setProgramCode(e.target.value)}
                    placeholder="e.g. PRG-GEO-2026"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Currency</label>
                  <Select value={programCurrency} onValueChange={setProgramCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['TZS', 'KES', 'USD', 'EUR', 'GBP', 'UGX'].map(code => (
                        <SelectItem key={code} value={code}>{code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Program Budget</label>
                  <Input
                    type="number"
                    value={programBudget}
                    onChange={(e) => setProgramBudget(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Parent Portfolio</label>
                  <Combobox
                    value={programPortfolioId}
                    onChange={setProgramPortfolioId}
                    options={[{ value: '', label: 'No Portfolio', sublabel: 'Independent' }, ...portfolios.map(p => ({ value: p.id, label: p.name, sublabel: p.code }))]}
                    placeholder="Select portfolio"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Target Benefits</label>
                <Input
                  type="text"
                  value={programBenefit}
                  onChange={(e) => setProgramBenefit(e.target.value)}
                  placeholder="e.g. 250MW grid generation, 35% cost reduction"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Program Description</label>
                <Textarea
                  rows={2}
                  value={programDesc}
                  onChange={(e) => setProgramDesc(e.target.value)}
                  placeholder="Program scope and operational governance..."
                />
              </div>
            </DialogBody>

            <DialogFooter style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button type="button" variant="outline" onClick={() => setShowCreateProgramModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Program'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
