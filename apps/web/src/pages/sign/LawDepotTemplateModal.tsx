import React, { useState, useEffect, useMemo } from 'react';
import type { SignDocumentDefinition } from '@hudumika/types';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SignTemplateThumbnail } from './SignTemplateThumbnail.js';
import {
  LAWDEPOT_CATEGORIES,
  LAWDEPOT_TEMPLATES,
  type LawDepotTemplateItem,
} from './LawDepotTemplateCatalog.js';
import './LawDepot.css';

interface CompanyTemplate {
  id: string;
  name: string;
  description: string | null;
  document_definition: SignDocumentDefinition;
}

interface LawDepotTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string, name: string) => void;
  title?: string;
  subtitle?: string;
}

function getItemDefinition(item: LawDepotTemplateItem | CompanyTemplate): SignDocumentDefinition {
  if ('document_definition' in item && item.document_definition) {
    return item.document_definition;
  }
  const templateItem = item as LawDepotTemplateItem;
  return {
    category: templateItem.category,
    document_type: templateItem.type,
    jurisdictions: ['Tanzania Mainland', 'Kenya', 'Uganda', 'Rwanda', 'Zanzibar'],
    body: `PARTIES & PREMISES\nThis ${templateItem.name.toLowerCase()} is entered into between {{party_one}} and {{party_two}} for {{transaction_scope}}.\n\n1. OPERATIVE TERMS & CONDITIONS\n{{operative_clauses}}\n\n2. FINANCIAL & PAYMENT TERMS\n{{financial_provisions}}\n\n3. GOVERNING LAW & JURISDICTION\nThis document is governed by and construed under the laws of {{jurisdiction}}.\n\nSIGNATURES\nFirst Party: __________________ Date: {{effective_date}}\nSecond Party: _________________ Date: {{effective_date}}`,
    questions: [
      { key: 'party_one', label: 'First Party (Name / Business)', type: 'text', required: true },
      { key: 'party_two', label: 'Second Party (Name / Business)', type: 'text', required: true },
      { key: 'transaction_scope', label: 'Transaction Details', type: 'textarea', required: true },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true },
    ],
  };
}

export function LawDepotTemplateModal({
  open,
  onClose,
  onSelectTemplate,
  title = 'Select a Verified Legal Template',
  subtitle = 'Browse verified categories covering business, real estate, logistics, trade, and legal agreements.',
}: LawDepotTemplateModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [popularOnly, setPopularOnly] = useState(false);
  const [companyTemplates, setCompanyTemplates] = useState<CompanyTemplate[]>([]);
  const [, setLoadingCompany] = useState(false);
  const [previewItem, setPreviewItem] = useState<LawDepotTemplateItem | CompanyTemplate | null>(null);
  const [previewLang, setPreviewLang] = useState<'en' | 'sw' | 'zh'>('en');

  useEffect(() => {
    if (!open) return;
    setLoadingCompany(true);
    apiFetch('/v1/sign/document-library')
      .then(res => {
        if (res?.company) setCompanyTemplates(res.company);
      })
      .catch(() => {})
      .finally(() => setLoadingCompany(false));
  }, [open]);

  // Combine LawDepot templates and company templates
  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list: (LawDepotTemplateItem | CompanyTemplate)[] = [];

    if (selectedCategory === 'company') {
      list = companyTemplates;
    } else if (selectedCategory === 'popular') {
      list = LAWDEPOT_TEMPLATES.filter(t => t.popular);
    } else if (selectedCategory === 'all') {
      list = LAWDEPOT_TEMPLATES;
    } else {
      list = LAWDEPOT_TEMPLATES.filter(t => t.category === selectedCategory);
    }

    if (popularOnly && selectedCategory !== 'popular') {
      list = list.filter(item => ('popular' in item ? item.popular : false));
    }

    if (q) {
      list = list.filter(item => {
        const nameMatch = item.name.toLowerCase().includes(q);
        const descMatch = (item.description || '').toLowerCase().includes(q);
        const tagMatch = 'tags' in item && item.tags.some(t => t.toLowerCase().includes(q));
        const catMatch = ('category' in item ? item.category : item.document_definition?.category || '').toLowerCase().includes(q);
        return nameMatch || descMatch || tagMatch || catMatch;
      });
    }

    return list;
  }, [search, selectedCategory, popularOnly, companyTemplates]);

  const activeCategoryMeta = useMemo(() => {
    if (selectedCategory === 'all') {
      return {
        name: 'All Legal Templates',
        description: `Explore all ${LAWDEPOT_TEMPLATES.length} verified templates and commercial contracts.`,
        icon: 'grid' as const,
      };
    }
    if (selectedCategory === 'popular') {
      return {
        name: 'Popular Starters',
        description: 'Most frequently used business contracts, leases, NDAs, and corporate documents.',
        icon: 'star' as const,
      };
    }
    if (selectedCategory === 'company') {
      return {
        name: 'Company Templates',
        description: 'Custom legal agreements and reusable templates created by your organization.',
        icon: 'briefcase' as const,
      };
    }
    const found = LAWDEPOT_CATEGORIES.find(c => c.name === selectedCategory);
    return (
      found || {
        name: selectedCategory,
        description: 'Verified legal document outlines ready for instant electronic signature.',
        icon: 'fileText' as const,
      }
    );
  }, [selectedCategory]);

  if (!open) return null;

  return (
    <div className="lawdepot-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lawdepot-modal-card" onClick={e => e.stopPropagation()}>
        {/* Modal Top Header */}
        <div className="lawdepot-modal-header">
          <div className="lawdepot-modal-header-copy">
            <div className="lawdepot-modal-badge">
              <Icon name="layers" size={14} />
              <span>HUDUMIKA TEMPLATE LIBRARY</span>
            </div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          {/* Quick Search & Popular filter in header */}
          <div className="lawdepot-header-actions">
            <div className="lawdepot-search-input-wrap">
              <Icon name="search" size={16} className="lawdepot-search-icon" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search contracts, lease, NDA, LLC..."
                className="lawdepot-search-input"
                autoFocus
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearch('')}
                  className="lawdepot-search-clear"
                  aria-label="Clear search"
                >
                  <Icon name="close" size={14} />
                </Button>
              )}
            </div>

            <Button
              variant={popularOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPopularOnly(v => !v)}
              className={`lawdepot-popular-btn ${popularOnly ? 'active' : ''}`}
              title="Show popular templates only"
            >
              <Icon name="star" size={14} />
              <span className="lawdepot-popular-btn-label">Popular only</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close template chooser"
              className="lawdepot-close-btn"
            >
              <Icon name="close" size={18} />
            </Button>
          </div>
        </div>

        {/* Modal Body: Two-Pane Split Layout (Zero Horizontal Scroll!) */}
        <div className="lawdepot-modal-split-body">
          {/* Left Category Sidebar */}
          <aside className="lawdepot-modal-sidebar" aria-label="Document categories">
            <div className="lawdepot-sidebar-section">
              <div className="lawdepot-sidebar-label">DISCOVER</div>
              <button
                type="button"
                className={`lawdepot-sidebar-nav-btn ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                <Icon name="grid" size={15} />
                <span className="lawdepot-sidebar-nav-text">All Templates</span>
                <Badge variant={selectedCategory === 'all' ? 'brand' : 'gray'}>
                  {LAWDEPOT_TEMPLATES.length}
                </Badge>
              </button>

              <button
                type="button"
                className={`lawdepot-sidebar-nav-btn ${selectedCategory === 'popular' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('popular')}
              >
                <Icon name="star" size={15} />
                <span className="lawdepot-sidebar-nav-text">Popular Starters</span>
                <Badge variant={selectedCategory === 'popular' ? 'warning' : 'gray'}>
                  {LAWDEPOT_TEMPLATES.filter(t => t.popular).length}
                </Badge>
              </button>

              <button
                type="button"
                className={`lawdepot-sidebar-nav-btn ${selectedCategory === 'company' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('company')}
              >
                <Icon name="briefcase" size={15} />
                <span className="lawdepot-sidebar-nav-text">Company Templates</span>
                <Badge variant={selectedCategory === 'company' ? 'brand' : 'gray'}>
                  {companyTemplates.length}
                </Badge>
              </button>
            </div>

            <div className="lawdepot-sidebar-section">
              <div className="lawdepot-sidebar-label">
                <span>CATEGORIES</span>
                <span className="lawdepot-sidebar-count">{LAWDEPOT_CATEGORIES.length}</span>
              </div>
              <div className="lawdepot-sidebar-cat-list">
                {LAWDEPOT_CATEGORIES.map(cat => {
                  const count = LAWDEPOT_TEMPLATES.filter(t => t.category === cat.name).length;
                  const isActive = selectedCategory === cat.name;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`lawdepot-sidebar-cat-btn ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat.name)}
                      title={cat.description}
                    >
                      <Icon name={cat.icon} size={15} className="lawdepot-cat-icon" />
                      <span className="lawdepot-cat-name">{cat.name}</span>
                      <span className="lawdepot-cat-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Right Main Cards Workspace */}
          <main className="lawdepot-modal-content">
            {/* Active Category Header Strip */}
            <div className="lawdepot-content-header">
              <div className="lawdepot-content-header-info">
                <div className="lawdepot-content-title-row">
                  <Icon name={activeCategoryMeta.icon} size={18} className="lawdepot-active-cat-icon" />
                  <h3 className="lawdepot-active-cat-title">{activeCategoryMeta.name}</h3>
                  <Badge variant="outline" className="lawdepot-active-cat-count">
                    {filteredTemplates.length} {filteredTemplates.length === 1 ? 'template' : 'templates'}
                  </Badge>
                </div>
                <p className="lawdepot-active-cat-desc">{activeCategoryMeta.description}</p>
              </div>

              {/* Mobile Category Select (Visible only on mobile/narrow screens where sidebar collapses) */}
              <div className="lawdepot-mobile-category-select">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger aria-label="Select category">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Templates ({LAWDEPOT_TEMPLATES.length})</SelectItem>
                    <SelectItem value="popular">Popular Templates</SelectItem>
                    <SelectItem value="company">Company Templates ({companyTemplates.length})</SelectItem>
                    {LAWDEPOT_CATEGORIES.map(c => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Template Cards Scroll Pane */}
            <div className="lawdepot-cards-scroll-pane">
              {filteredTemplates.length === 0 ? (
                <div className="lawdepot-empty-results">
                  <FeaturedIcon variant="gray" size="lg">
                    <Icon name="search" size={24} />
                  </FeaturedIcon>
                  <h3>No matching templates found</h3>
                  <p>
                    {search
                      ? `No templates matched "${search}" in ${activeCategoryMeta.name}.`
                      : 'No templates available in this category.'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {search && (
                      <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                        Clear search
                      </Button>
                    )}
                    {selectedCategory !== 'all' && (
                      <Button variant="default" size="sm" onClick={() => setSelectedCategory('all')}>
                        Browse all categories
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="lawdepot-templates-grid">
                  {filteredTemplates.map(item => {
                    const isCompany = 'document_definition' in item;
                    const templateId = isCompany ? item.id : (item as LawDepotTemplateItem).starterId;
                    const name = item.name;
                    const category = isCompany ? item.document_definition.category : (item as LawDepotTemplateItem).category;
                    const description = isCompany
                      ? item.description || 'Custom reusable template created by your company.'
                      : (item as LawDepotTemplateItem).description;
                    const isPopular = !isCompany && (item as LawDepotTemplateItem).popular;
                    const docType = isCompany ? item.document_definition.document_type || 'template' : (item as LawDepotTemplateItem).type;
                    const definition = getItemDefinition(item);

                    return (
                      <div key={item.id} className="lawdepot-template-card">
                        {/* Authentic Legal Parchment Preview Banner */}
                        <button
                          type="button"
                          className="lawdepot-card-thumbnail-btn"
                          onClick={() => setPreviewItem(item)}
                          aria-label={`Preview ${name}`}
                        >
                          <SignTemplateThumbnail name={name} definition={definition} />
                          <span className="lawdepot-card-thumbnail-hover">
                            <Icon name="eye" size={14} />
                            <span>Quick Preview</span>
                          </span>
                        </button>

                        {/* Card Content Body */}
                        <div className="lawdepot-card-body">
                          <div className="lawdepot-card-top">
                            <span className="lawdepot-card-category">{category}</span>
                            <div className="lawdepot-card-badges">
                              {isPopular && <Badge variant="warning">Popular</Badge>}
                              {isCompany && <Badge variant="brand">Company</Badge>}
                              <Badge variant="outline" className="lawdepot-card-type-badge">
                                {docType}
                              </Badge>
                            </div>
                          </div>

                          <h4 className="lawdepot-card-title">
                            <button
                              type="button"
                              className="lawdepot-card-title-btn"
                              onClick={() => setPreviewItem(item)}
                            >
                              {name}
                            </button>
                          </h4>

                          <p className="lawdepot-card-desc">{description}</p>

                          {/* Card Metadata */}
                          <div className="lawdepot-card-meta">
                            <span>
                              <Icon name="checkCircle" size={12} className="lawdepot-meta-icon" />
                              4 guided decisions
                            </span>
                            <span>Multi-jurisdiction</span>
                          </div>

                          {/* Responsive Card Action Bar: Key button has words, secondary uses icon */}
                          <div className="lawdepot-card-actions">
                            <Button
                              variant="default"
                              size="sm"
                              className="lawdepot-use-btn"
                              onClick={() => {
                                onSelectTemplate(templateId, name);
                                onClose();
                              }}
                            >
                              <span>Use Template</span>
                              <Icon name="arrowRight" size={14} />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="lawdepot-preview-btn"
                              onClick={() => setPreviewItem(item)}
                              title={`Preview ${name}`}
                              aria-label={`Preview ${name}`}
                            >
                              <Icon name="eye" size={14} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Modal Footer */}
        <div className="lawdepot-modal-footer">
          <span className="lawdepot-footer-hint">
            <Icon name="shield" size={14} className="lawdepot-footer-shield" />
            Supported across Kenya, Tanzania, Uganda, Rwanda, UAE, UK, US and custom jurisdictions.
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* High-Fidelity Parchment Preview Modal */}
        {previewItem && (
          <div className="lawdepot-quick-preview-overlay" onClick={() => setPreviewItem(null)}>
            <div className="lawdepot-quick-preview-pane" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
              <div className="lawdepot-quick-preview-header">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="lawdepot-card-category">
                      {'document_definition' in previewItem ? previewItem.document_definition.category : previewItem.category}
                    </span>
                    <Badge variant="brand">Verified Template</Badge>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{previewItem.name}</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="lawdepot-lang-switcher" role="radiogroup" aria-label="Preview language">
                    {(['en', 'sw', 'zh'] as const).map(l => (
                      <button
                        key={l}
                        type="button"
                        className={`lawdepot-lang-btn ${previewLang === l ? 'active' : ''}`}
                        onClick={() => setPreviewLang(l)}
                      >
                        {l === 'en' ? 'EN' : l === 'sw' ? 'SW' : '中文'}
                      </button>
                    ))}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setPreviewItem(null)}>
                    <Icon name="close" size={16} />
                  </Button>
                </div>
              </div>

              <div className="lawdepot-quick-preview-body" style={{ padding: 20, overflowY: 'auto' }}>
                <div className="lawdepot-parchment-sheet" style={{ minHeight: 'auto', padding: '32px 36px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                  <div className="lawdepot-parchment-header" style={{ paddingBottom: 16, marginBottom: 20 }}>
                    <span className="lawdepot-parchment-seal-text" style={{ fontSize: 9 }}>HUDUMIKA VERIFIED LEGAL ARCHIVE</span>
                    <div className="lawdepot-parchment-title" style={{ fontSize: 17 }}>{previewItem.name}</div>
                    <div className="lawdepot-parchment-subtitle" style={{ fontSize: 11 }}>
                      Verified Execution Outlines &bull; 4 Decision Points &bull; Multi-Jurisdiction
                    </div>
                  </div>

                  <div className="lawdepot-parchment-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
                    {(() => {
                      const def = getItemDefinition(previewItem);
                      const text = def.translations?.[previewLang]?.body || def.body || previewItem.description;
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
                                marginTop: 14,
                                marginBottom: 4,
                                color: 'var(--ink)',
                                letterSpacing: '0.04em',
                                fontSize: 13.5,
                              }}
                            >
                              {para.trim()}
                            </div>
                          );
                        }
                        const parts = para.split(/(\{\{[a-z0-9_]+\}\})/gi);
                        return (
                          <p key={idx} style={{ margin: '0 0 10px 0' }}>
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

              <div className="lawdepot-quick-preview-footer">
                <Button variant="outline" onClick={() => setPreviewItem(null)}>
                  Cancel
                </Button>
                <Button
                  variant="default"
                  className="lawdepot-use-btn"
                  onClick={() => {
                    const id = 'document_definition' in previewItem ? previewItem.id : (previewItem as LawDepotTemplateItem).starterId;
                    onSelectTemplate(id, previewItem.name);
                    setPreviewItem(null);
                    onClose();
                  }}
                >
                  <span>Start Building Document</span>
                  <Icon name="arrowRight" size={14} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
