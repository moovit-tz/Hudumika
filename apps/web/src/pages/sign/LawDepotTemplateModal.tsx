import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
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
  document_definition: {
    category: string;
    document_type?: string;
    questions?: unknown[];
  };
}

interface LawDepotTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string, name: string) => void;
  title?: string;
  subtitle?: string;
}

export function LawDepotTemplateModal({
  open,
  onClose,
  onSelectTemplate,
  title = 'Import a Legal Template',
  subtitle = 'Choose from verified legal outlines across 12 business and personal categories.',
}: LawDepotTemplateModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [popularOnly, setPopularOnly] = useState(false);
  const [companyTemplates, setCompanyTemplates] = useState<CompanyTemplate[]>([]);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [previewItem, setPreviewItem] = useState<LawDepotTemplateItem | CompanyTemplate | null>(null);

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

    if (selectedCategory === 'company') {
      return companyTemplates.filter(item => {
        const matchesQuery = !q || item.name.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q);
        return matchesQuery;
      });
    }

    return LAWDEPOT_TEMPLATES.filter(item => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesPopular = !popularOnly || item.popular;
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tags.some(t => t.toLowerCase().includes(q));
      return matchesCategory && matchesPopular && matchesQuery;
    });
  }, [search, selectedCategory, popularOnly, companyTemplates]);

  if (!open) return null;

  return (
    <div className="lawdepot-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lawdepot-modal-card" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="lawdepot-modal-header">
          <div className="lawdepot-modal-header-copy">
            <div className="lawdepot-modal-badge">
              <Icon name="layers" size={14} />
              <span>Hudumika Template Library</span>
            </div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close template chooser">
            <Icon name="close" size={18} />
          </Button>
        </div>

        {/* Search & Filter Bar */}
        <div className="lawdepot-modal-search-row">
          <div className="lawdepot-search-input-wrap">
            <Icon name="search" size={16} className="lawdepot-search-icon" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contracts, LLC operating agreement, lease, bill of sale, NDA..."
              className="lawdepot-search-input"
              autoFocus
            />
            {search && (
              <Button variant="ghost" size="icon" onClick={() => setSearch('')} className="lawdepot-search-clear">
                <Icon name="close" size={14} />
              </Button>
            )}
          </div>
          <Button
            variant={popularOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPopularOnly(v => !v)}
            className="lawdepot-popular-btn"
          >
            <Icon name="star" size={14} />
            <span>Popular only</span>
          </Button>
        </div>

        {/* Categories Strip */}
        <div className="lawdepot-categories-bar" role="tablist">
          <button
            type="button"
            className={`lawdepot-category-tab ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            <Icon name="grid" size={14} />
            <span>All Categories</span>
            <Badge variant="gray">{LAWDEPOT_TEMPLATES.length}</Badge>
          </button>

          {LAWDEPOT_CATEGORIES.map(cat => {
            const count = LAWDEPOT_TEMPLATES.filter(t => t.category === cat.name).length;
            return (
              <button
                key={cat.id}
                type="button"
                className={`lawdepot-category-tab ${selectedCategory === cat.name ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.name)}
              >
                <Icon name={cat.icon} size={14} />
                <span>{cat.name}</span>
                <Badge variant="gray">{count}</Badge>
              </button>
            );
          })}

          <button
            type="button"
            className={`lawdepot-category-tab ${selectedCategory === 'company' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('company')}
          >
            <Icon name="briefcase" size={14} />
            <span>Company Templates</span>
            <Badge variant="brand">{companyTemplates.length}</Badge>
          </button>
        </div>

        {/* Template Grid / Content */}
        <div className="lawdepot-modal-body">
          {filteredTemplates.length === 0 ? (
            <div className="lawdepot-empty-results">
              <FeaturedIcon variant="gray" size="lg">
                <Icon name="search" size={24} />
              </FeaturedIcon>
              <h3>No matching templates found</h3>
              <p>Try searching for a different keyword or select another category above.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('all');
                  setPopularOnly(false);
                }}
              >
                Reset filters
              </Button>
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

                return (
                  <div key={item.id} className="lawdepot-template-card">
                    <div className="lawdepot-card-top">
                      <span className="lawdepot-card-category">{category}</span>
                      {isPopular && <Badge variant="warning">Popular</Badge>}
                      {isCompany && <Badge variant="brand">Company</Badge>}
                    </div>
                    <h4 className="lawdepot-card-title">{name}</h4>
                    <p className="lawdepot-card-desc">{description}</p>
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
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewItem(item)}
                        title="View details"
                      >
                        <Icon name="fileText" size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="lawdepot-modal-footer">
          <span className="lawdepot-footer-hint">
            <Icon name="shield" size={14} />
            Supported across Kenya, Tanzania, Uganda, Rwanda, UAE, UK, US and custom jurisdictions.
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Detail Quick Preview Drawer */}
        {previewItem && (
          <div className="lawdepot-quick-preview-overlay" onClick={() => setPreviewItem(null)}>
            <div className="lawdepot-quick-preview-pane" onClick={e => e.stopPropagation()}>
              <div className="lawdepot-quick-preview-header">
                <div>
                  <Badge variant="brand">Template Overview</Badge>
                  <h3>{previewItem.name}</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setPreviewItem(null)}>
                  <Icon name="close" size={16} />
                </Button>
              </div>
              <div className="lawdepot-quick-preview-body">
                <p>
                  {'description' in previewItem && previewItem.description
                    ? previewItem.description
                    : 'A comprehensive prewritten legal document template designed to be customized with transaction-specific facts and signed electronically.'}
                </p>
                <div className="lawdepot-feature-list">
                  <div className="lawdepot-feature-item">
                    <Icon name="check" size={16} />
                    <span>Real-time questionnaire: fill party details, dates, and terms easily</span>
                  </div>
                  <div className="lawdepot-feature-item">
                    <Icon name="check" size={16} />
                    <span>Live parchment preview updating instantaneously as you answer</span>
                  </div>
                  <div className="lawdepot-feature-item">
                    <Icon name="check" size={16} />
                    <span>Multi-language options: English, Kiswahili, and Simplified Chinese</span>
                  </div>
                  <div className="lawdepot-feature-item">
                    <Icon name="check" size={16} />
                    <span>1-click transition to eSign placement canvas for instant signatures</span>
                  </div>
                  <div className="lawdepot-feature-item">
                    <Icon name="check" size={16} />
                    <span>Save as reusable company template for future team transactions</span>
                  </div>
                </div>
              </div>
              <div className="lawdepot-quick-preview-footer">
                <Button variant="outline" onClick={() => setPreviewItem(null)}>
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    const id = 'document_definition' in previewItem ? previewItem.id : (previewItem as LawDepotTemplateItem).starterId;
                    onSelectTemplate(id, previewItem.name);
                    setPreviewItem(null);
                    onClose();
                  }}
                >
                  Start Building Document
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
