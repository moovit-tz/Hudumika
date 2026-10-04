import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Textarea } from '../components/ui/textarea.js';
import { Input } from '../components/ui/input.js';
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '../components/ui/dialog.js';
import { PageHeader } from '../components/PageHeader.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { EmailBlockBuilder, blocksToEmailHtml, type EmailBlock } from '../components/EmailBlockBuilder.js';
import { ColorSwatchPicker } from '../components/ui/color-swatch-picker.js';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { showConfirm } from '../lib/confirm.js';
import { showAlert } from '../lib/alert.js';
import type { EmailTemplateView, EmailTemplateCategory, EmailTemplateGroup } from '@hudumika/types';
import './EmailTemplates.css';

// group file imports
import { MY_MERGE_VARS, MKT_CAT_LABEL } from './email_templates/shared.js';
import { PublishToStoreDialog, SimpleWysiwygEditor } from './email_templates/editors.js';
import { AdvancedBuilderDialog } from './email_templates/builder.js';
import { MyTemplatesTab, MarketplaceTab } from './email_templates/tabs.js';

// re-exports for external callers
export { MY_MERGE_VARS };

// ═════════════════════════════════════════════════════════════════════════════
// 5. MAIN EMAIL TEMPLATES PAGE ROOT
// ═════════════════════════════════════════════════════════════════════════════

export function EmailTemplates() {
  const [tab, setTab] = useState<'mine' | 'marketplace'>('mine');

  return (
    <div className="email-templates-page">
      <Tabs value={tab} onValueChange={v => setTab(v as any)} className="email-templates-root">
        <div className="email-templates-topbar">
          <div className="email-templates-title-lockup">
            <PageHeader
              crumbs={['Email', 'Templates']}
              titlePlain="Email"
              titleEm="templates"
              subtitle="Reusable templates for compose, notifications, and automated workflows."
            />
          </div>
          <div className="email-templates-tablist-wrap">
            <TabsList className="email-templates-tablist">
              <TabsTrigger value="mine">
                <Icon name="layers" size={14} /> My Templates
              </TabsTrigger>
              <TabsTrigger value="marketplace">
                <Icon name="package" size={14} /> Marketplace
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="mine" className="email-templates-tabcontent">
          <MyTemplatesTab onGoToMarketplace={() => setTab('marketplace')} />
        </TabsContent>
        <TabsContent value="marketplace" className="email-templates-tabcontent">
          <MarketplaceTab onBack={() => setTab('mine')} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
