import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
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
    try {
      const [pRes, prRes] = await Promise.all([
        apiFetch('/v1/project-os/portfolios'),
        apiFetch('/v1/project-os/programs'),
      ]);
      setPortfolios(Array.isArray(pRes) ? pRes : pRes.data || []);
      setPrograms(Array.isArray(prRes) ? prRes : prRes.data || []);
    } catch {
      setPortfolios([]);
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  }, [propsPortfolios, propsPrograms]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreatePortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portfolioName || !portfolioCode) {
      showAlert('Please provide both portfolio name and code', { variant: 'error' });
      return;
    }

    try {
      await apiFetch('/v1/project-os/portfolios', {
        method: 'POST',
        body: JSON.stringify({
          name: portfolioName,
          code: portfolioCode,
          allocated_budget: parseFloat(portfolioBudget) || 0,
          target_roi: parseFloat(portfolioRoi) || null,
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
    }
  };

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!programName || !programCode) {
      showAlert('Please provide both program name and code', { variant: 'error' });
      return;
    }

    try {
      await apiFetch('/v1/project-os/programs', {
        method: 'POST',
        body: JSON.stringify({
          name: programName,
          code: programCode,
          portfolio_id: programPortfolioId || null,
          budget: parseFloat(programBudget) || 0,
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
    }
  };

  const formatCurrency = (val: number) => `$${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      {/* Top Header & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Portfolios & Strategic Programs
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Top-level organizational structures aligning capital investments, target ROI, and benefits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('portfolios')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'portfolios'
                  ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Portfolios ({portfolios.length})
            </button>
            <button
              onClick={() => setActiveTab('programs')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'programs'
                  ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Programs ({programs.length})
            </button>
          </div>

          <Button
            size="sm"
            onClick={() => (activeTab === 'portfolios' ? setShowCreatePortfolioModal(true) : setShowCreateProgramModal(true))}
            className="bg-teal-600 hover:bg-teal-700 text-white"
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
            <div className="col-span-full p-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500">
              <Icon name="layers" size={32} className="mx-auto mb-3 text-slate-400" />
              <p className="text-sm font-semibold">No Portfolios Created Yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Create a portfolio to organize strategic business units and group related programs.
              </p>
            </div>
          ) : (
            portfolios.map((port) => (
              <div
                key={port.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
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
                  <h3 className="font-bold text-base text-slate-900 dark:text-white line-clamp-1">
                    {port.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 min-h-[32px]">
                    {port.description || 'No strategic description provided.'}
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Allocated Budget:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatCurrency(port.allocated_budget)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Target ROI:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {port.target_roi ? `${port.target_roi}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Active Projects:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {port.project_count || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Programs Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.length === 0 ? (
            <div className="col-span-full p-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500">
              <Icon name="briefcase" size={32} className="mx-auto mb-3 text-slate-400" />
              <p className="text-sm font-semibold">No Programs Created Yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Create a program to coordinate multiple related capital projects.
              </p>
            </div>
          ) : (
            programs.map((prog) => (
              <div
                key={prog.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
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
                  <h3 className="font-bold text-base text-slate-900 dark:text-white line-clamp-1">
                    {prog.name}
                  </h3>
                  <div className="text-[11px] text-teal-600 dark:text-teal-400 font-medium mt-0.5">
                    Portfolio: {prog.portfolio_name || 'Unassigned'}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 min-h-[32px]">
                    {prog.description || 'No program charter scope.'}
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Program Budget:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatCurrency(prog.budget)}
                    </span>
                  </div>
                  {prog.target_benefits && prog.target_benefits.length > 0 && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                      <span className="font-bold text-slate-700 dark:text-slate-200">Target Benefits: </span>
                      {prog.target_benefits.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* CREATE PORTFOLIO MODAL */}
      {showCreatePortfolioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Create Strategic Portfolio
              </h3>
              <button
                onClick={() => setShowCreatePortfolioModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePortfolio} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Portfolio Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={portfolioName}
                    onChange={(e) => setPortfolioName(e.target.value)}
                    placeholder="e.g., East Africa Energy"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Portfolio Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={portfolioCode}
                    onChange={(e) => setPortfolioCode(e.target.value)}
                    placeholder="e.g., PORT-ENG-01"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Allocated Budget ($)
                  </label>
                  <input
                    type="number"
                    value={portfolioBudget}
                    onChange={(e) => setPortfolioBudget(e.target.value)}
                    placeholder="50000000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Target ROI (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={portfolioRoi}
                    onChange={(e) => setPortfolioRoi(e.target.value)}
                    placeholder="18.5"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Strategic Description
                </label>
                <textarea
                  rows={3}
                  value={portfolioDesc}
                  onChange={(e) => setPortfolioDesc(e.target.value)}
                  placeholder="Strategic objectives and goals of this portfolio..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreatePortfolioModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-teal-600 hover:bg-teal-700 text-white">
                  Create Portfolio
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PROGRAM MODAL */}
      {showCreateProgramModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Create Capital Program
              </h3>
              <button
                onClick={() => setShowCreateProgramModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateProgram} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Program Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={programName}
                    onChange={(e) => setProgramName(e.target.value)}
                    placeholder="e.g., Geothermal Well Drilling"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Program Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={programCode}
                    onChange={(e) => setProgramCode(e.target.value)}
                    placeholder="e.g., PRG-GEO-2026"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Parent Portfolio
                  </label>
                  <select
                    value={programPortfolioId}
                    onChange={(e) => setProgramPortfolioId(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="">No Portfolio (Independent)</option>
                    {portfolios.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Program Budget ($)
                  </label>
                  <input
                    type="number"
                    value={programBudget}
                    onChange={(e) => setProgramBudget(e.target.value)}
                    placeholder="12000000"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Target Benefits & Realization
                </label>
                <input
                  type="text"
                  value={programBenefit}
                  onChange={(e) => setProgramBenefit(e.target.value)}
                  placeholder="e.g., 250MW grid generation, 35% operating cost reduction"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Program Description
                </label>
                <textarea
                  rows={2}
                  value={programDesc}
                  onChange={(e) => setProgramDesc(e.target.value)}
                  placeholder="Program scope and operational governance..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateProgramModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-teal-600 hover:bg-teal-700 text-white">
                  Create Program
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
