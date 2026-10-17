import React, { useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Badge } from '../../components/ui/badge.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import {
  LAWDEPOT_CATEGORIES,
  LAWDEPOT_TEMPLATES,
  type LawDepotTemplateItem,
} from './LawDepotTemplateCatalog.js';
import { LawDepotTemplateModal } from './LawDepotTemplateModal.js';
import './LawDepot.css';

interface LawDepotCreationHubProps {
  onSelectTemplate: (templateId: string, templateName?: string) => void;
  onUploadFile: () => void;
  onStartBlankSigning: () => void;
  onWriteScratch: () => void;
}

export function LawDepotCreationHub({
  onSelectTemplate,
  onUploadFile,
  onStartBlankSigning,
  onWriteScratch,
}: LawDepotCreationHubProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [display,setDisplay]=useState<'grid'|'rows'>('grid');

  const displayedTemplates = LAWDEPOT_TEMPLATES.filter(item => {
    const q = search.trim().toLowerCase();
    const matchCat =
      selectedCategory === 'all'
        ? true
        : selectedCategory === '__popular'
          ? !!item.popular
          : item.category === selectedCategory;
    const matchSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.tags.some(t => t.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  return (
    <div className="lawdepot-hub">
      {/* Hero Heading */}
      <div className="lawdepot-hub-hero">
        <h1>Create Your Legal Document or Template</h1>
        <p>
          Select from our comprehensive Hudumika legal library, draft your own custom wording, or upload an existing file for signing.
        </p>
      </div>

      {/* Quick Action Tiles */}
      <div className="lawdepot-hub-quick-actions">
        <div
          className="lawdepot-action-tile"
          onClick={() => onSelectTemplate('starter-sign-llc-operating-agreement', 'LLC Operating Agreement')}
        >
          <FeaturedIcon variant="brand" size="lg" shape="circle">
            <Icon name="briefcase" size={22} />
          </FeaturedIcon>
          <div className="lawdepot-action-tile-copy">
            <h3>LLC Operating Agreement</h3>
            <p>Hudumika verified multi-member or single-member business agreement.</p>
          </div>
          <Icon name="arrowRight" size={16} style={{ color: 'var(--teal)' }} />
        </div>

        <div className="lawdepot-action-tile" onClick={() => setModalOpen(true)}>
          <FeaturedIcon variant="brand" size="lg" shape="circle">
            <Icon name="layers" size={22} />
          </FeaturedIcon>
          <div className="lawdepot-action-tile-copy">
            <h3>Browse 12 Categories</h3>
            <p>Rent &amp; Lease, Services, Loans, IP, Employment, and Family.</p>
          </div>
          <Icon name="arrowRight" size={16} style={{ color: 'var(--teal)' }} />
        </div>

        <div className="lawdepot-action-tile" onClick={onWriteScratch}>
          <FeaturedIcon variant="brand" size="lg" shape="circle">
            <Icon name="edit" size={22} />
          </FeaturedIcon>
          <div className="lawdepot-action-tile-copy">
            <h3>Write Custom Template</h3>
            <p>Author your own clauses, add placeholders, and save to company library.</p>
          </div>
          <Icon name="arrowRight" size={16} style={{ color: 'var(--teal)' }} />
        </div>

        <div className="lawdepot-action-tile" onClick={onUploadFile}>
          <FeaturedIcon variant="gray" size="lg" shape="circle">
            <Icon name="upload" size={22} />
          </FeaturedIcon>
          <div className="lawdepot-action-tile-copy">
            <h3>Upload &amp; eSign File</h3>
            <p>Upload a PDF, Word document, or image to place signature fields.</p>
          </div>
          <Icon name="arrowRight" size={16} style={{ color: 'var(--ink3)' }} />
        </div>
      </div>

      {/* Unified Single-Row Search, Filter & Actions Toolbar */}
      <SearchToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search templates by name, keyword or category…"
        className="lawdepot-hub-toolbar"
        quickFilters={[
          {
            searchable: true,
            label: 'Category',
            value: selectedCategory === 'all' ? null : selectedCategory,
            onChange: value => setSelectedCategory(value || 'all'),
            allLabel: 'All categories',
            options: [
              {
                value: '__popular',
                label: `Popular Templates (${LAWDEPOT_TEMPLATES.filter(t => t.popular).length})`,
                icon: <Icon name="star" size={14} />,
              },
              ...LAWDEPOT_CATEGORIES.map(category => ({
                value: category.name,
                label: `${category.name} (${LAWDEPOT_TEMPLATES.filter(item => item.category === category.name).length})`,
                icon: <Icon name={category.icon} size={14} />,
              })),
            ],
          },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onStartBlankSigning}
              className="lawdepot-hub-start-blank-btn gap-1.5 whitespace-nowrap h-[var(--ctl-h-sm,32px)]"
              title="Start blank signing without a template"
            >
              <Icon name="fileText" size={14} />
              <span>Start blank</span>
            </Button>
            <div role="group" aria-label="Template display" className="lawdepot-hub-view-switcher">
              <Button
                variant={display === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                aria-label="Grid view"
                aria-pressed={display === 'grid'}
                onClick={() => setDisplay('grid')}
                className="h-[var(--ctl-h-sm,32px)] w-[var(--ctl-h-sm,32px)]"
              >
                <Icon name="grid" size={14} />
              </Button>
              <Button
                variant={display === 'rows' ? 'secondary' : 'ghost'}
                size="icon"
                aria-label="Rows view"
                aria-pressed={display === 'rows'}
                onClick={() => setDisplay('rows')}
                className="h-[var(--ctl-h-sm,32px)] w-[var(--ctl-h-sm,32px)]"
              >
                <Icon name="list" size={14} />
              </Button>
            </div>
          </div>
        }
      />

      {(search || selectedCategory !== 'all') && (
        <div className="lawdepot-hub-results-summary">
          <span>
            {displayedTemplates.length} {displayedTemplates.length === 1 ? 'template' : 'templates'} found
            {selectedCategory !== 'all' ? ` in ${selectedCategory === '__popular' ? 'Popular' : selectedCategory}` : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setSelectedCategory('all');
            }}
            className="h-6 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </Button>
        </div>
      )}

      <div className="lawdepot-joined-templates" data-view={display}>
        {displayedTemplates.map(item => (
          <article key={item.id} className="lawdepot-template-cell">
            <div className="lawdepot-card-top">
              <span className="lawdepot-card-category">{item.category}</span>
              {item.popular && <Badge variant="warning">Popular</Badge>}
            </div>
            <h4 className="lawdepot-card-title">{item.name}</h4>
            <p className="lawdepot-card-desc">{item.description}</p>
            <div className="lawdepot-card-actions">
              <Button
                variant="default"
                size="sm"
                className="lawdepot-use-btn"
                aria-label={`Create ${item.name}`}
                onClick={() => onSelectTemplate(item.starterId, item.name)}
              >
                <span>Create Document</span>
                <Icon name="arrowRight" size={14} />
              </Button>
            </div>
          </article>
        ))}
        {displayedTemplates.length===0&&<div className="lawdepot-hub-empty"><Icon name="search" size={24}/><h3>No matching templates</h3><p>Try another search or clear the category filter.</p><Button variant="outline" size="sm" onClick={()=>{setSearch('');setSelectedCategory('all');}}>Clear search and filters</Button></div>}
      </div>

      {/* LawDepot Template Browser Modal */}
      <LawDepotTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelectTemplate={(templateId, name) => {
          setModalOpen(false);
          onSelectTemplate(templateId, name);
        }}
      />
    </div>
  );
}
