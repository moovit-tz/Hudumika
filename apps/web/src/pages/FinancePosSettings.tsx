import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Button } from '../components/ui/button.js';
import { Label } from '../components/ui/label.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SwitchRow } from '../components/ui/list-item-row.js';
import { Banner } from '../components/ui/alert.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCompany } from '../data/companyStore.js';
import { loadPosPrintSettings, posPrintKey, printPosReceipt } from '../lib/pos-print.js';
import type { PosSale } from '@hudumika/types';

export function FinancePosSettings() {
  const { user } = useAuth();
  const company = useCompany();
  const key = posPrintKey(user?.tenant_id, user?.id);
  const [settings, setSettings] = useState(() => loadPosPrintSettings(key));
  const [message, setMessage] = useState('');
  function save() { try { localStorage.setItem(key, JSON.stringify(settings)); setMessage('Printer preferences saved for this browser and account.'); } catch { setMessage('Could not save preferences. Browser storage may be unavailable.'); } }
  function testPrint() { printPosReceipt({ sale_number: 'TEST PRINT — NOT A SALE', sold_at: new Date().toISOString(), currency: company.currency || 'TZS', customer_name: 'Sample customer', subtotal: 100, tax_total: 0, discount_total: 0, grand_total: 100, change_due: 0, lines: [{ product_name: 'Sample item', qty: 1, unit_price: 100, line_total: 100 }], payments: [{ method: 'CASH', amount: 100 }] } as PosSale, settings, company.name || 'Hudumika'); }
  return <div className="fin-pos-settings">
    <PageHeader crumbs={['FinOps', 'POS', 'Printer settings']} titlePlain="Printer" titleEm="settings" subtitle="Receipt layout and browser printing preferences for this till." backTo="/finance/pos" backLabel="Return to POS" actions={<><Button variant="outline" onClick={testPrint}>Test print</Button><Button onClick={save}>Save preferences</Button></>} />
    {message && <Banner>{message}</Banner>}
    <div className="fin-settings-grid">
      <SectionCard title="Receipt printing" collapsible={false}>
        <div className="fin-settings-fields"><div><Label htmlFor="pos-paper">Paper format</Label><Select value={settings.paper} onValueChange={paper => setSettings(current => ({ ...current, paper: paper as typeof current.paper }))}><SelectTrigger id="pos-paper"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="58mm">58 mm thermal roll</SelectItem><SelectItem value="80mm">80 mm thermal roll</SelectItem><SelectItem value="A4">A4 / PDF</SelectItem></SelectContent></Select></div>
        <SwitchRow title="Print after checkout" description="Open the browser print dialog after a successful sale. You still confirm the print." checked={settings.autoPrint} onCheckedChange={autoPrint => setSettings(current => ({ ...current, autoPrint }))} />
        <SwitchRow title="Show customer name" description="Include the customer or walk-in label on receipts." checked={settings.showCustomer} onCheckedChange={showCustomer => setSettings(current => ({ ...current, showCustomer }))} />
        <div><Label htmlFor="pos-footer">Receipt footer</Label><Textarea id="pos-footer" maxLength={200} value={settings.footer} onChange={event => setSettings(current => ({ ...current, footer: event.target.value }))} /></div></div>
      </SectionCard>
      <SectionCard title="Printer & drawer connection" collapsible={false}><p>Printing uses your browser’s print dialog. Select the destination printer, matching paper size and margins there.</p><p>Preferences are saved on this browser for your workspace and account.</p><Banner variant="info">Direct ESC/POS printing and cash-drawer pulses are not connected. Browser printing does not control a drawer.</Banner><p><Button variant="outline" asChild><Link to="/finance/pos">Return to checkout</Link></Button></p></SectionCard>
    </div>
  </div>;
}
