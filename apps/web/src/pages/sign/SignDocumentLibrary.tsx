import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { COUNTRIES, type SignDocumentDefinition } from '@hudumika/types';
import { apiFetch } from '../../lib/api.js';
import { APP_REGISTRY } from '../../lib/appRegistry.js';
import { useBranding } from '../../hooks/useBranding.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PaginationBar } from '../../components/PaginationBar.js';
import { Button } from '../../components/ui/button.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from '../../components/ui/table.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Card } from '../../components/ui/card.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { Icon } from '../../components/Icon.js';
import { SignTemplateThumbnail } from './SignTemplateThumbnail.js';
import { LAWDEPOT_TEMPLATES } from './LawDepotTemplateCatalog.js';
import './SignDocuments.css';
import './LawDepot.css';

export interface LibraryTemplate {
  id: string;
  name: string;
  description: string | null;
  document_definition: SignDocumentDefinition;
}

interface LibraryDraft {
  id: string;
  title: string;
  jurisdiction: string;
  template_name: string;
  updated_at: string;
  apps?: string[];
  category?: string;
  document_type?: string;
}

export interface LibraryItem {
  id: string;
  name: string;
  description: string;
  apps: string[];
  category: string;
  type: string;
  jurisdictions: string[];
  source: string;
  questions: number;
  definition?: SignDocumentDefinition;
  updated?: string;
}

const TYPES = [
  { value: 'agreement', label: 'Agreements & contracts' },
  { value: 'letter', label: 'Letters & notices' },
  { value: 'policy', label: 'Policies' },
  { value: 'record', label: 'Records & certificates' },
  { value: 'form', label: 'Forms & checklists' },
  { value: 'unclassified', label: 'Unclassified' },
];

const PAGE_SIZES = [12, 24, 48, 96];

export function SignDocumentLibrary({ importing = false }: { importing?: boolean } = {}) {
  const navigate = useNavigate();
  const branding = useBranding();
  const [params, setParams] = useSearchParams();

  const [items, setItems] = useState<LibraryTemplate[]>([]);
  const [starters, setStarters] = useState<LibraryTemplate[]>([]);
  const [drafts, setDrafts] = useState<LibraryDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Parchment Preview Modal state
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [previewLang, setPreviewLang] = useState<'en' | 'sw' | 'zh'>('en');

  const view = params.get('tab') === 'drafts' ? 'drafts' : 'library';
  const search = params.get('q') || '';
  const category = params.get('category');
  const app = params.get('app');
  const type = params.get('type');
  const source = params.get('source');
  const jurisdiction = params.get('jurisdiction');
  const requestedSize = Number(params.get('size'));
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 12;
  const requestedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [display, setDisplay] = useState<'grid' | 'rows'>(() => {
    try {
      return localStorage.getItem('hudumika_sign_library_view') === 'rows' ? 'rows' : 'grid';
    } catch {
      return 'grid';
    }
  });

  function setParam(key: string, value: string | null) {
    setParams(
      previous => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true }
    );
  }

  function clearFilters() {
    setParams(
      previous => {
        const next = new URLSearchParams(previous);
        for (const key of ['q', 'category', 'app', 'type', 'source', 'jurisdiction', 'page']) next.delete(key);
        return next;
      },
      { replace: true }
    );
  }

  function changeDisplay(value: 'grid' | 'rows') {
    setDisplay(value);
    try {
      localStorage.setItem('hudumika_sign_library_view', value);
    } catch {
      // Keep session usable
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch('/v1/sign/document-library'),
      apiFetch('/v1/sign/generated-documents'),
    ])
      .then(([library, documents]) => {
        if (active) {
          setItems(library?.company || []);
          setStarters(library?.starters || []);
          setDrafts(documents || []);
        }
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const appName = (id: string) => branding.getAppName(id, APP_REGISTRY.find(item => item.id === id)?.name || id);

  const all: LibraryItem[] = useMemo(() => {
    if (view === 'drafts') {
      return drafts.map(draft => ({
        id: draft.id,
        name: draft.title,
        description: draft.template_name,
        apps: draft.apps || [],
        category: draft.category || 'Company documents',
        type: draft.document_type || 'unclassified',
        jurisdictions: [draft.jurisdiction],
        source: 'draft',
        questions: 0,
        updated: draft.updated_at,
      }));
    }

    const mapFromStarters = [...items, ...starters].map(item => ({
      id: item.id,
      name: item.name,
      description: item.description || 'Reusable verified legal document.',
      apps: item.document_definition?.apps || [],
      category: item.document_definition?.category || 'General',
      type: item.document_definition?.document_type || 'unclassified',
      jurisdictions: item.document_definition?.jurisdiction_clauses
        ? Object.keys(item.document_definition.jurisdiction_clauses)
        : item.document_definition?.jurisdictions || [],
      source: item.id.startsWith('starter-') ? 'starter' : 'company',
      questions: item.document_definition?.questions?.length || 4,
      definition: item.document_definition,
    }));

    // If starters list is already rich, return it
    if (mapFromStarters.length > 10) return mapFromStarters;

    // Gracefully supplement from LAWDEPOT_TEMPLATES for comprehensive catalogue
    const existingIds = new Set(mapFromStarters.map(s => s.id));
    const extraItems: LibraryItem[] = LAWDEPOT_TEMPLATES.filter(
      lt => !existingIds.has(lt.starterId) && !existingIds.has(lt.id)
    ).map(lt => ({
      id: lt.starterId,
      name: lt.name,
      description: lt.description,
      apps: ['sign'],
      category: lt.category,
      type: lt.type,
      jurisdictions: ['Tanzania Mainland', 'Kenya', 'Uganda', 'Rwanda', 'Zanzibar'],
      source: 'starter',
      questions: 4,
      definition: {
        category: lt.category,
        document_type: lt.type,
        jurisdictions: ['Tanzania Mainland', 'Kenya', 'Uganda', 'Rwanda', 'Zanzibar'],
        body: `PARTIES\nThis agreement is made between {{party_one}} and {{party_two}}.\n\n1. PURPOSE & RECITALS\n{{transaction_details}}\n\n2. RIGHTS & OBLIGATIONS\n{{operative_covenants}}\n\n3. FINANCIAL & COMMERCIAL TERMS\n{{financial_details}}\n\n4. GOVERNING LAW & JURISDICTION\nThis document shall be governed by and construed in accordance with the laws of {{jurisdiction}}.\n\nSIGNATURES\nFirst Party: __________________ Date: {{effective_date}}\nSecond Party: _________________ Date: {{effective_date}}`,
        questions: [
          { key: 'party_one', label: 'First Party (Name & Address)', type: 'text', required: true },
          { key: 'party_two', label: 'Second Party (Name & Address)', type: 'text', required: true },
          { key: 'effective_date', label: 'Effective Date', type: 'date', required: true },
          { key: 'transaction_details', label: 'Transaction Details', type: 'textarea', required: true },
        ],
      },
    }));

    return [...mapFromStarters, ...extraItems];
  }, [view, drafts, items, starters]);

  const categories = useMemo(() => [...new Set(all.map(item => item.category))].sort(), [all]);

  const filtered = useMemo(() => {
    return all.filter(
      item =>
        (!category || item.category === category) &&
        (!app || (app === '__general' ? item.apps.length === 0 : item.apps.length === 0 || item.apps.includes(app))) &&
        (!type || item.type === type) &&
        (view === 'drafts' || !source || item.source === source) &&
        (!jurisdiction ||
          (jurisdiction === '__any'
            ? item.jurisdictions.length === 0
            : item.jurisdictions.length === 0 || item.jurisdictions.includes(jurisdiction))) &&
        `${item.name} ${item.description} ${item.category} ${item.apps.map(appName).join(' ')} ${item.type}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
    );
  }, [all, category, app, type, view, source, jurisdiction, search, appName]);

  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const activeFilters = [app, category, type, jurisdiction, view === 'library' ? source : null].filter(Boolean).length;
  const jurisdictions = useMemo(
    () => [...new Set([...COUNTRIES.map(country => country.name), ...all.flatMap(item => item.jurisdictions)])].sort(),
    [all]
  );

  function destination(item: LibraryItem) {
    if (item.source === 'draft') return `/sign/editor?mode=resume&draft=${item.id}`;
    if (item.definition?.editor_html) return `/sign/editor?mode=compose&source=${item.id}`;
    if (importing) return `/sign/editor?mode=preview&source=${item.id}`;
    return `/sign/editor?source=${item.id}`;
  }

  const actions = (item: LibraryItem) => (
    <div className="sign-library-item-actions">
      <Tip label="Preview document">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPreviewItem(item)}
          aria-label={`Preview document ${item.name}`}
        >
          <Icon name="eye" size={18} />
        </Button>
      </Tip>
      <Tip label={item.source === 'draft' ? 'Continue editing' : 'Use template'}>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => navigate(destination(item), { state: { librarySearch: params.toString() } })}
          aria-label={`${item.source === 'draft' ? 'Continue editing' : 'Use template'} ${item.name}`}
        >
          <Icon name={item.source === 'draft' ? 'edit' : 'arrowRight'} size={18} />
        </Button>
      </Tip>
    </div>
  );

  const thumbnail = (item: LibraryItem) =>
    item.definition ? (
      <button
        type="button"
        className="sign-library-thumbnail-button"
        onClick={() => setPreviewItem(item)}
        aria-label={`Preview ${item.name}`}
      >
        <SignTemplateThumbnail name={item.name} definition={item.definition} />
      </button>
    ) : (
      <FeaturedIcon variant="brand" size="sm">
        <Icon name="fileText" size={16} />
      </FeaturedIcon>
    );

  const apps = (item: LibraryItem) => (
    <div className="sign-library-apps">
      {item.apps.length ? (
        <>
          {item.apps.slice(0, 2).map(id => (
            <Badge key={id} variant="gray">
              {appName(id)}
            </Badge>
          ))}
          {item.apps.length > 2 && (
            <Badge
              variant="gray"
              title={item.apps.slice(2).map(appName).join(', ')}
              aria-label={`Additional apps: ${item.apps.slice(2).map(appName).join(', ')}`}
            >
              +{item.apps.length - 2}
            </Badge>
          )}
        </>
      ) : (
        <Badge variant="gray">Company-wide</Badge>
      )}
    </div>
  );

  const origin = (item: LibraryItem) => (
    <Badge className="sign-library-origin" variant={item.source === 'starter' ? 'warning' : 'gray'}>
      {item.source === 'starter' ? 'Verified outline' : item.source === 'draft' ? 'Draft' : 'Company template'}
    </Badge>
  );

  return (
    <div className="sign-library">
      <PageHeader
        crumbs={['eSign', 'Templates']}
        titlePlain="Document"
        titleEm="library"
        subtitle={
          importing
            ? 'Preview a template, choose location and language, then answer the key decisions.'
            : 'Contracts, agreements and business records for every industry in your workspace.'
        }
        actions={
          <Button onClick={() => navigate('/sign/editor?mode=author')}>
            <Icon name="plus" size={15} />
            Create template
          </Button>
        }
      />

      <div className="sign-library-controls" aria-label="Document library controls">
      <Tabs
        className="sign-library-view-tabs"
        value={view}
        onValueChange={value => setParam('tab', value === 'library' ? null : value)}
      >
        <TabsList aria-label="Template views">
          <TabsTrigger value="library">
            <span className="ds-tabs-trigger-label">Templates</span> <Badge className="sign-library-tab-count" variant="gray">{all.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="drafts">
            <span className="ds-tabs-trigger-label">Drafts</span> <Badge className="sign-library-tab-count" variant="gray">{drafts.length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>
          <SearchToolbar
            search={search}
            onSearch={value => setParam('q', value)}
            placeholder="Search templates…"
            quickFilters={[
              {
                searchable: true,
                value: app,
                onChange: value => setParam('app', value),
                allLabel: 'All apps',
                options: [
                  { value: '__general', label: 'Company-wide' },
                  ...APP_REGISTRY.map(item => ({ value: item.id, label: appName(item.id) })),
                ],
              },
              {
                searchable: true,
                value: category,
                onChange: value => setParam('category', value),
                allLabel: 'All categories',
                options: categories.map(value => ({ value, label: `${value} (${all.filter(item => item.category === value).length})` })),
              },
            ]}
            activeFilterCount={activeFilters}
            filterContent={close => (
              <div className="sign-library-filter-panel">
                <strong>Filter documents</strong>
                <label>
                  Document type
                  <Select
                    value={type || '__all'}
                    onValueChange={value => setParam('type', value === '__all' ? null : value)}
                  >
                    <SelectTrigger aria-label="Document type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All document types</SelectItem>
                      {TYPES.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {view === 'library' && (
                  <label>
                    Template source
                    <Select
                      value={source || '__all'}
                      onValueChange={value => setParam('source', value === '__all' ? null : value)}
                    >
                      <SelectTrigger aria-label="Template source">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All template sources</SelectItem>
                        <SelectItem value="starter">Verified templates</SelectItem>
                        <SelectItem value="company">Company templates</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                )}
                <label>
                  Jurisdiction choice
                  <Combobox
                    value={jurisdiction || '__all'}
                    onChange={value => setParam('jurisdiction', value === '__all' ? null : value)}
                    options={[
                      { value: '__all', label: 'All jurisdictions' },
                      { value: '__any', label: 'Choose per document' },
                      ...jurisdictions.map(value => ({ value, label: value })),
                    ]}
                  />
                </label>
                <p>Templates allow jurisdiction selection; this does not certify local legal suitability.</p>
                <div>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                  <Button size="sm" onClick={close}>
                    Done
                  </Button>
                </div>
              </div>
            )}
            actions={
              <div className="sign-library-view-switch" role="group" aria-label="Library display">
                <Button
                  variant={display === 'grid' ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-label="Grid view"
                  aria-pressed={display === 'grid'}
                  onClick={() => changeDisplay('grid')}
                >
                  <Icon name="grid" size={16} />
                </Button>
                <Button
                  variant={display === 'rows' ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-label="Rows view"
                  aria-pressed={display === 'rows'}
                  onClick={() => changeDisplay('rows')}
                >
                  <Icon name="list" size={16} />
                </Button>
              </div>
            }
          />
      </div>

        <>
          {error && <Banner variant="error">{error}</Banner>}

          <div className="sign-library-results" aria-live="polite">
            <span>
              {filtered.length} {view === 'drafts' ? 'drafts' : 'templates'}
              {activeFilters || search ? ' matching your search and filters' : ''}
            </span>
            {(activeFilters > 0 || search) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            )}
          </div>

          {loading ? (
            <SectionLoading label="Loading your document library…" />
          ) : !filtered.length ? (
            <Card className="sign-library-empty">
              <FeaturedIcon variant="gray" size="lg">
                <Icon name="search" size={24} />
              </FeaturedIcon>
              <h2>No matching {view === 'drafts' ? 'drafts' : 'templates'}</h2>
              <p>Try another search or clear the filters.</p>
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </Card>
          ) : display === 'grid' ? (
            <div className="sign-library-grid">
              {paginated.map(item => (
                <Card key={item.id} className="sign-library-item">
                  {thumbnail(item)}
                  <div className="sign-library-item-top"><span className="sign-library-category" title={item.category}>{item.category}</span>{origin(item)}</div>
                  <h2>
                    <button
                      type="button"
                      className="sign-library-title-button"
                      onClick={() => setPreviewItem(item)}
                    >
                      {item.name}
                    </button>
                  </h2>
                  <p>{item.description}</p>
                  {apps(item)}
                  <div className="sign-library-meta">
                    <span>{TYPES.find(option => option.value === item.type)?.label || item.type}</span>
                    <span>
                      {item.source === 'draft'
                        ? new Date(item.updated!).toLocaleDateString()
                        : `${item.questions} guided decisions`}
                    </span>
                  </div>
                  {actions(item)}
                </Card>
              ))}
            </div>
          ) : (
            <div className="sign-library-rows">
              <Table className="sign-library-table">
                <TableCaption className="sr-only">Document templates and drafts. Preview a document before using it.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead className="sign-library-table-category">Category</TableHead>
                    <TableHead className="sign-library-table-apps">Apps</TableHead>
                    <TableHead className="sign-library-table-source">Source</TableHead>
                    <TableHead className="sign-library-table-details">{view === 'drafts' ? 'Updated' : 'Decisions'}</TableHead>
                    <TableHead className="sign-library-table-actions"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="sign-library-row-title">
                          {thumbnail(item)}
                          <div>
                            <h2><button type="button" className="sign-library-title-button" onClick={() => setPreviewItem(item)}>{item.name}</button></h2>
                            <p>{TYPES.find(option => option.value === item.type)?.label || item.type}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="sign-library-table-category"><span className="sign-library-table-category-name">{item.category}</span></TableCell>
                      <TableCell className="sign-library-table-apps">{apps(item)}</TableCell>
                      <TableCell className="sign-library-table-source">{origin(item)}</TableCell>
                      <TableCell className="sign-library-table-details">{item.source === 'draft' ? new Date(item.updated!).toLocaleDateString() : `${item.questions} decisions`}</TableCell>
                      <TableCell className="sign-library-table-actions">
                        {actions(item)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!loading && (
            <PaginationBar
              page={safePage}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={value => setParam('page', String(value))}
              onPageSizeChange={value => setParam('size', String(value))}
              pageSizeOptions={PAGE_SIZES}
              itemLabel={view === 'drafts' ? 'draft' : 'template'}
            />
          )}

          <p className="sign-library-footnote">
            Prewritten templates support English, Kiswahili and Simplified Chinese. Complete the transaction facts and
            check the execution guidance for the selected jurisdiction.
          </p>
        </>

      {/* Interactive Parchment Preview Modal */}
      {previewItem && (
        <div
          className="sign-library-modal-overlay"
          onClick={() => setPreviewItem(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="sign-library-modal-card" onClick={e => e.stopPropagation()}>
            <div className="sign-library-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <FeaturedIcon variant="brand" size="md">
                  <Icon name="fileText" size={20} />
                </FeaturedIcon>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="sign-library-category">{previewItem.category}</span>
                    <Badge variant="outline">{previewItem.type}</Badge>
                    <Badge variant="gray">{previewItem.questions} decision points</Badge>
                  </div>
                  <h2 style={{ margin: '3px 0 0 0', fontSize: 18, fontWeight: 700 }}>{previewItem.name}</h2>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="lawdepot-lang-switcher" role="radiogroup" aria-label="Preview language">
                  {(['en', 'sw', 'zh'] as const).map(l => (
                    <button
                      key={l}
                      type="button"
                      className={`lawdepot-lang-btn ${previewLang === l ? 'active' : ''}`}
                      onClick={() => setPreviewLang(l)}
                    >
                      {l === 'en' ? 'English' : l === 'sw' ? 'Kiswahili' : '简体中文'}
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPreviewItem(null)}
                  aria-label="Close document preview"
                >
                  <Icon name="close" size={18} />
                </Button>
              </div>
            </div>

            <div className="sign-library-modal-body">
              <div className="lawdepot-parchment-sheet">
                <div className="lawdepot-parchment-header">
                  <span className="lawdepot-parchment-seal-text">HUDUMIKA VERIFIED LEGAL ARCHIVE</span>
                  <div className="lawdepot-parchment-title">{previewItem.name}</div>
                  <div className="lawdepot-parchment-subtitle">
                    {previewItem.category} &bull; Standard Execution Outlines &bull; Supported in East Africa &amp;
                    Common Law
                  </div>
                </div>

                <div className="lawdepot-parchment-body">
                  {(() => {
                    const text =
                      previewItem.definition?.translations?.[previewLang]?.body ||
                      previewItem.definition?.body ||
                      previewItem.description;

                    const paragraphs = (text || '').split('\n\n').filter(Boolean);
                    return paragraphs.map((para, idx) => {
                      const isHeader =
                        /^[0-9]+\.\s+[A-Z0-9\s&/_-]+$/.test(para.trim()) ||
                        /^[A-Z0-9\s&/_-]{3,}$/.test(para.trim());
                      if (isHeader) {
                        return (
                          <div
                            key={idx}
                            style={{
                              fontWeight: 'bold',
                              marginTop: 18,
                              marginBottom: 6,
                              color: 'var(--ink)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {para.trim()}
                          </div>
                        );
                      }
                      const parts = para.split(/(\{\{[a-z0-9_]+\}\})/gi);
                      return (
                        <p key={idx} style={{ margin: '0 0 12px 0', lineHeight: 1.8 }}>
                          {parts.map((part, pIdx) => {
                            if (part.startsWith('{{') && part.endsWith('}}')) {
                              const token = part.slice(2, -2).replace(/_/g, ' ');
                              return (
                                <mark key={pIdx} className="lawdepot-variable-highlight">
                                  [{token}]
                                </mark>
                              );
                            }
                            return part;
                          })}
                        </p>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            <div className="sign-library-modal-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink3)' }}>
                <Icon name="checkCircle" size={16} style={{ color: 'var(--teal)' }} />
                <span>Multi-jurisdiction compliant &bull; Multi-language instant translation &bull; Audit trail ready</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Button variant="outline" onClick={() => setPreviewItem(null)}>
                  Close
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    const dest = destination(previewItem);
                    setPreviewItem(null);
                    navigate(dest);
                  }}
                >
                  <Icon name="arrowRight" size={15} />
                  Use This Template
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
