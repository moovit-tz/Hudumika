import React from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import '../pages/FinOps.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection, SidebarNavItem } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { PageLayout } from '../components/PageLayout.js';
import { FIN_ROLES } from '../lib/permissions.js';
import { useLocale } from '../hooks/useLocale.js';
import type { TFunction } from 'i18next';
import type { FinanceCapabilityKey, UserRole } from '@hudumika/types';
import { useFinanceCapabilities } from '../hooks/useFinanceCapabilities.js';
import { FinanceCapabilityGate } from '../components/FinanceCapabilityGate.js';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';

const L = (load: () => Promise<Record<string, any>>, name: string) =>
  React.lazy(() => load().then(m => ({ default: m[name] })));

const FinanceIndustries = L(() => import('../pages/FinanceIndustries.js'), 'FinanceIndustries');
const FinanceIndustryWorkspace = L(() => import('../pages/FinanceIndustries.js'), 'FinanceIndustryWorkspace');
const FinanceIndustryNew = L(() => import('../pages/FinanceIndustries.js'), 'FinanceIndustryNew');
const FinanceIndustryWorkDetail = L(() => import('../pages/FinanceIndustries.js'), 'FinanceIndustryWorkDetail');
const FinanceIndustryProductionNew = L(() => import('../pages/FinanceIndustries.js'), 'FinanceIndustryProductionNew');
const FinanceIndustryAllocationNew = L(() => import('../pages/FinanceIndustries.js'), 'FinanceIndustryAllocationNew');
const FinanceWorkCosts = L(() => import('../pages/FinanceWorkCosts.js'), 'FinanceWorkCosts');
const FinanceCloseReview = L(() => import('../pages/FinanceCloseReview.js'), 'FinanceCloseReview');
const FinanceTaxPreparation = L(() => import('../pages/FinanceTaxPreparation.js'), 'FinanceTaxPreparation');
const FinanceExpenseReports = L(() => import('../pages/FinanceExpenseReports.js'), 'FinanceExpenseReports');
const FinanceExpenseReportNew = L(() => import('../pages/FinanceExpenseReports.js'), 'FinanceExpenseReportNew');
const FinanceExpenseReportDetail = L(() => import('../pages/FinanceExpenseReports.js'), 'FinanceExpenseReportDetail');

function buildNav(t: TFunction): SidebarSection[] {
  return [
    {
      items: [
        { label: t('finance.nav.dashboard'), icon: 'barChart', path: '/finance', exact: true },
      ],
    },
    {
      title: t('finance.nav.receivables'),
      items: [
        { label: t('finance.nav.invoices'),      icon: 'receipt',   path: '/finance/invoices'       },
        { label: 'Credit Notes',                 icon: 'minusCircle', path: '/finance/credit-notes' },
        { label: t('finance.nav.quotations'),    icon: 'fileText',  path: '/finance/quotations'     },
        { label: t('finance.nav.deliveryNotes'), icon: 'package',   path: '/finance/delivery-documents' },
      ],
    },
    {
      title: t('finance.nav.payables'),
      items: [
        { label: t('finance.nav.purchaseOrders'), icon: 'shoppingCart', path: '/finance/purchase-orders' },
        { label: t('finance.nav.bills'),           icon: 'receipt',      path: '/finance/bills'           },
        { label: t('finance.nav.vendors'),         icon: 'building',     path: '/finance/vendors'         },
        { label: t('finance.nav.expenses'),        icon: 'creditCard',   path: '/finance/expenses'        },
        { label: 'Expense claims', icon: 'creditCard', path: '/finance/expense-reports' },
      ],
    },
    {
      title: t('finance.nav.accounts'),
      items: [
        { label: t('finance.nav.products'),   icon: 'package',      path: '/finance/products' },
        { label: 'POS', icon: 'shoppingCart', path: '/finance/pos' },
        { label: 'Printer settings', icon: 'printer', path: '/finance/pos/settings' },
        { label: t('finance.nav.taxCodes'),   icon: 'percent',      path: '/finance/tax-codes'},
        {
          label: 'General Ledger', icon: 'bookOpen', path: '/finance/accounts/chart-of-accounts',
          children: [
            { label: t('finance.nav.chartOfAccounts'), icon: 'list',     path: '/finance/accounts/chart-of-accounts' },
            { label: 'Journal Entries',                icon: 'bookOpen', path: '/finance/accounts/journal-entries'   },
            { label: t('finance.nav.ledger'),          icon: 'fileText', path: '/finance/accounts/ledger'            },
            { label: 'Multi-Entity',                   icon: 'building', path: '/finance/accounts/multi-entity'      },
          ],
        },
        {
          label: 'Banking', icon: 'dollarSign', path: '/finance/payments',
          children: [
            { label: t('finance.nav.payments'),    icon: 'dollarSign', path: '/finance/payments'                    },
            { label: 'Bank Reconciliation',        icon: 'building',   path: '/finance/accounts/bank-reconciliation'},
            { label: 'Currency Revaluation',       icon: 'refresh',    path: '/finance/accounts/fx-revaluation'     },
          ],
        },
        {
          label: 'Period Controls', icon: 'lock', path: '/finance/vat-periods',
          children: [
            { label: t('finance.nav.vatPeriods'), icon: 'lock',      path: '/finance/vat-periods'                  },
            { label: 'Period Close',               icon: 'lock',      path: '/finance/accounts/gl-periods'          },
            { label: 'Approval Workflows',         icon: 'userCheck', path: '/finance/accounts/approval-workflows'  },
          ],
        },
        {
          label: 'Assets & Budgets', icon: 'package', path: '/finance/accounts/fixed-assets',
          children: [
            { label: 'Fixed Assets', icon: 'package', path: '/finance/accounts/fixed-assets' },
            { label: 'Budgets',      icon: 'target',  path: '/finance/accounts/budgets'       },
          ],
        },
      ],
    },
    {
      title: t('finance.nav.reports'),
      items: [
        {
          label: 'Income & Revenue', icon: 'trendingUp', path: '/finance/reports/sales',
          children: [
            { label: t('finance.nav.salesReport'),      icon: 'barChart',   path: '/finance/reports/sales'              },
            { label: t('finance.nav.incomeVsExpenses'), icon: 'barChart',   path: '/finance/reports/income-vs-expenses' },
            { label: t('finance.nav.profitLoss'),       icon: 'trendingUp', path: '/finance/accounts/profit-loss'       },
            { label: 'Equity Statement',                icon: 'trendingUp', path: '/finance/accounts/equity-statement'  },
            { label: t('finance.nav.cashFlow'),         icon: 'trendingUp', path: '/finance/reports/cash-flow'          },
          ],
        },
        {
          label: 'Balance & Position', icon: 'layers', path: '/finance/accounts/trial-balance',
          children: [
            { label: t('finance.nav.trialBalance'),    icon: 'barChart', path: '/finance/accounts/trial-balance'   },
            { label: t('finance.nav.balanceSheet'),    icon: 'layers',   path: '/finance/accounts/balance-sheet'   },
            { label: t('finance.nav.agedReceivables'), icon: 'clock',    path: '/finance/accounts/aged-receivables'},
            { label: t('finance.nav.agedPayables'),    icon: 'clock',    path: '/finance/accounts/aged-payables'   },
          ],
        },
        {
          label: 'Tax & Expenses', icon: 'percent', path: '/finance/reports/tax',
          children: [
            { label: t('finance.nav.taxReport'),      icon: 'percent',    path: '/finance/reports/tax'      },
            { label: t('finance.nav.expensesReport'), icon: 'creditCard', path: '/finance/reports/expenses' },
          ],
        },
      ],
    },
    {
      title: t('finance.nav.integrations'),
      items: [
        { label: t('finance.nav.accountingSync'), icon: 'zap', path: '/finance/integrations' },
        { label: 'Accounting deliveries', icon: 'zap', path: '/finance/integrations/deliveries' },
      ],
    },
    {
      title: 'Settings',
      items: [{ label: t('finance.nav.industries', { defaultValue: 'Industries' }), icon: 'building', path: '/finance/industries' }],
    },
  ];
}

const CAPABILITY_BY_PATH: Partial<Record<string, FinanceCapabilityKey>> = {
  // Payables
  '/finance/purchase-orders':                'finance.procurement',
  '/finance/pos/settings': 'finance.pos',
  '/finance/pos':                            'finance.pos',
  // Accounts — advanced accounting
  '/finance/accounts/journal-entries':       'finance.accounting.advanced',
  '/finance/accounts/ledger':                'finance.accounting.advanced',
  '/finance/accounts/multi-entity':          'finance.consolidation',
  '/finance/accounts/bank-reconciliation':   'finance.accounting.advanced',
  '/finance/accounts/gl-periods':            'finance.accounting.advanced',
  '/finance/accounts/approval-workflows':    'finance.accounting.advanced',
  '/finance/accounts/fx-revaluation':        'finance.multi_currency',
  // Accounts — optional modules
  '/finance/accounts/fixed-assets':          'finance.fixed_assets',
  '/finance/accounts/budgets':               'finance.budgets',
  // Advanced reports (require accounting.advanced for meaningful data)
  '/finance/accounts/trial-balance':         'finance.accounting.advanced',
  '/finance/accounts/balance-sheet':         'finance.accounting.advanced',
  '/finance/accounts/equity-statement':      'finance.accounting.advanced',
};

const SALES_FINANCE_PATHS = new Set([
  '/finance', '/finance/invoices', '/finance/credit-notes', '/finance/quotations',
  '/finance/delivery-documents', '/finance/payments', '/finance/products', '/finance/pos',
  '/finance/reports/sales',
]);

function roleCanSeeFinancePath(role: UserRole | undefined, path: string): boolean {
  if (!role) return false;
  if (role === 'SALES') return SALES_FINANCE_PATHS.has(path);
  return true;
}

const FinanceDashboard       = L(() => import('../pages/FinanceDashboard.js'), 'FinanceDashboard');
const Billing                = L(() => import('../pages/Billing.js'), 'Billing');
const Quotations             = L(() => import('../pages/Quotations.js'), 'Quotations');
const PurchaseOrders         = L(() => import('../pages/PurchaseOrders.js'), 'PurchaseOrders');
const Expenses               = L(() => import('../pages/Expenses.js'), 'Expenses');
const FinanceExpenseNew      = L(() => import('../pages/FinanceExpenseNew.js'), 'FinanceExpenseNew');
const FinanceExpenseCategories = L(() => import('../pages/FinanceExpenseCategories.js'), 'FinanceExpenseCategories');
const Bills                  = L(() => import('../pages/Bills.js'), 'Bills');
const FinanceVendors         = L(() => import('../pages/FinanceVendors.js'), 'FinanceVendors');
const VendorProfilePage      = L(() => import('../pages/VendorProfilePage.js'), 'VendorProfilePage');
const ProductsServices       = L(() => import('../pages/ProductsServices.js'), 'ProductsServices');
const ProductCategoriesPage  = L(() => import('../pages/ProductCategoriesPage.js'), 'ProductCategoriesPage');
const ProductReviewsPage     = L(() => import('../pages/ProductReviewsPage.js'), 'ProductReviewsPage');
const FinanceTaxCodes        = L(() => import('../pages/FinanceTaxCodes.js'), 'FinanceTaxCodes');
const FinanceTaxClassify     = L(() => import('../pages/FinanceTaxClassify.js'), 'FinanceTaxClassify');
const FinanceVatPeriods      = L(() => import('../pages/FinanceVatPeriods.js'), 'FinanceVatPeriods');
const FinancePayments        = L(() => import('../pages/FinancePayments.js'), 'FinancePayments');
const FinanceLedger          = L(() => import('../pages/FinanceLedger.js'), 'FinanceLedger');
const FinanceTrialBalance    = L(() => import('../pages/FinanceTrialBalance.js'), 'FinanceTrialBalance');
const FinanceBalanceSheet    = L(() => import('../pages/FinanceBalanceSheet.js'), 'FinanceBalanceSheet');
const FinanceProfitLoss      = L(() => import('../pages/FinanceProfitLoss.js'), 'FinanceProfitLoss');
const FinanceEquityStatement = L(() => import('../pages/FinanceEquityStatement.js'), 'FinanceEquityStatement');
const FinanceAgedReceivables = L(() => import('../pages/FinanceAgedReceivables.js'), 'FinanceAgedReceivables');
const FinanceAgedPayables    = L(() => import('../pages/FinanceAgedPayables.js'), 'FinanceAgedPayables');
const MultiEntityAccounting  = L(() => import('../pages/MultiEntityAccounting.js'), 'MultiEntityAccounting');
const FinanceReportsHub      = L(() => import('../pages/FinanceReportsHub.js'), 'FinanceReportsHub');
const FinanceSalesReport     = L(() => import('../pages/FinanceSalesReport.js'), 'FinanceSalesReport');
const FinanceExpensesReport  = L(() => import('../pages/FinanceExpensesReport.js'), 'FinanceExpensesReport');
const FinanceIncomeVsExpenses = L(() => import('../pages/FinanceIncomeVsExpenses.js'), 'FinanceIncomeVsExpenses');
const FinanceTaxReport       = L(() => import('../pages/FinanceTaxReport.js'), 'FinanceTaxReport');
const FinanceCashFlow        = L(() => import('../pages/FinanceCashFlow.js'), 'FinanceCashFlow');
const AccountsQuery          = L(() => import('../pages/AccountsQuery.js'), 'AccountsQuery');
const ChartOfAccounts        = L(() => import('../pages/ChartOfAccounts.js'), 'ChartOfAccounts');
const JournalEntries         = L(() => import('../pages/JournalEntries.js'), 'JournalEntries');
const DeliveryDocumentsPage  = L(() => import('../pages/DeliveryDocumentsPage.js'), 'DeliveryDocumentsPage');
const AccountingIntegrations = L(() => import('../pages/AccountingIntegrations.js'), 'AccountingIntegrations');
const AccountingDeliveries   = L(() => import('../pages/AccountingDeliveries.js'), 'AccountingDeliveries');
const RecurringInvoices      = L(() => import('../pages/RecurringInvoices.js'), 'RecurringInvoices');
const CreditNotes            = L(() => import('../pages/CreditNotes.js'), 'CreditNotes');
const FixedAssets            = L(() => import('../pages/FixedAssets.js'), 'FixedAssets');
const Budgets                = L(() => import('../pages/Budgets.js'), 'Budgets');
const BankReconciliation     = L(() => import('../pages/BankReconciliation.js'), 'BankReconciliation');
const GlPeriods              = L(() => import('../pages/GlPeriods.js'), 'GlPeriods');
const ApApprovalWorkflows    = L(() => import('../pages/ApApprovalWorkflows.js'), 'ApApprovalWorkflows');
const FinancePosSettings = L(() => import('../pages/FinancePosSettings.js'), 'FinancePosSettings');
const FinancePos             = L(() => import('../pages/FinancePos.js'), 'FinancePos');
const FinanceFxRevaluation   = L(() => import('../pages/FinanceFxRevaluation.js'), 'FinanceFxRevaluation');

export function FinOpsShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLocale();
  const { user } = useAuth();
  const { data: financeAccess } = useFinanceCapabilities();
  const enabled = new Set(financeAccess?.capabilities.filter(item => item.enabled).map(item => item.key));
  const visibleItems = (items: SidebarNavItem[]): SidebarNavItem[] => items.flatMap(item => {
    const children = item.children ? visibleItems(item.children) : undefined;
    if (item.children && !children?.length) return [];
    if (!item.children && (!roleCanSeeFinancePath(user?.role, item.path) || (CAPABILITY_BY_PATH[item.path] && !enabled.has(CAPABILITY_BY_PATH[item.path]!)))) return [];
    return [{ ...item, ...(children ? { children, path: children.some(child => child.path === item.path) ? item.path : children[0].path } : {}) }];
  });
  const NAV = buildNav(t).map(section => ({
    ...section,
    // Capability-linked destinations stay hidden until access is resolved.
    // This avoids briefly exposing every Advanced module during the initial
    // entitlement request or after a package change refresh.
    items: visibleItems(section.items),
  })).filter(section => section.items.length > 0);
  React.useEffect(() => {
    function openTill(event: KeyboardEvent) {
      if (event.key !== 'F1' || !enabled.has('finance.pos') || !roleCanSeeFinancePath(user?.role, '/finance/pos') || document.querySelector('[role="dialog"]')) return;
      event.preventDefault(); navigate('/finance/pos');
    }
    window.addEventListener('keydown', openTill);
    return () => window.removeEventListener('keydown', openTill);
  }, [financeAccess, navigate]);
  const gated = (capability: FinanceCapabilityKey, page: React.ReactNode) => <FinanceCapabilityGate capability={capability}><RequireRoles roles={FIN_ROLES}>{page}</RequireRoles></FinanceCapabilityGate>;
  if (location.pathname.replace(/\/$/, '') === '/finance/pos') {
    return <WorkspaceApp appId="finops"><div className="fin-pos-workspace" data-finops="true">{gated('finance.pos', <FinancePos />)}</div></WorkspaceApp>;
  }
  return (
    <WorkspaceApp appId="finops">
      <div className="app-shell" data-finops="true">
        <AppSidebar appId="finops" sections={NAV} />
        <div className="app-main">
          <AppHeader appActions={enabled.has('finance.pos') && roleCanSeeFinancePath(user?.role, '/finance/pos') ? <Button asChild size="sm" variant="secondary"><Link to="/finance/pos"><Icon name="shoppingCart" size={15} />POS <kbd>F1</kbd></Link></Button> : undefined} />
          <div className="app-shell-content">
      <Routes>
        <Route path="overview" element={<Navigate to="/finance" replace />} />

        <Route element={<PageLayout />}>
          <Route index element={<RequireRoles roles={FIN_ROLES}><FinanceDashboard /></RequireRoles>} />
          <Route path="industries" element={<RequireRoles roles={['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE']}><FinanceIndustries /></RequireRoles>} />
          <Route path="industries/:industry" element={<RequireRoles roles={['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE']}><FinanceIndustryWorkspace /></RequireRoles>} />
          <Route path="industries/:industry/new" element={<RequireRoles roles={['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE']}><FinanceIndustryNew /></RequireRoles>} />
          <Route path="industries/:industry/:id" element={<RequireRoles roles={['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE']}><FinanceIndustryWorkDetail /></RequireRoles>} />
          <Route path="industries/:industry/:id/costs" element={gated('finance.accounting.advanced', <RequireRoles roles={['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE']}><FinanceWorkCosts /></RequireRoles>)} />
          <Route path="industries/:industry/:id/production/new" element={gated('finance.inventory', <RequireRoles roles={['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE']}><FinanceIndustryProductionNew /></RequireRoles>)} />
          <Route path="industries/:industry/:id/allocation/new" element={gated('finance.inventory', <RequireRoles roles={['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE']}><FinanceIndustryAllocationNew /></RequireRoles>)} />
          {/* Receivables */}
          <Route path="invoices"       element={<RequireRoles roles={FIN_ROLES}><Billing /></RequireRoles>} />
          <Route path="invoices/recurring" element={<RequireRoles roles={FIN_ROLES}><RecurringInvoices /></RequireRoles>} />
          <Route path="credit-notes"     element={<RequireRoles roles={FIN_ROLES}><CreditNotes /></RequireRoles>} />
          <Route path="credit-notes/new" element={<RequireRoles roles={FIN_ROLES}><CreditNotes /></RequireRoles>} />
          <Route path="quotations"     element={<RequireRoles roles={FIN_ROLES}><Quotations /></RequireRoles>} />
          <Route path="delivery-documents" element={<RequireRoles roles={FIN_ROLES}><DeliveryDocumentsPage /></RequireRoles>} />
          <Route path="delivery-notes" element={<Navigate to="/finance/delivery-documents" replace />} />

          {/* Payables */}
          <Route path="purchase-orders" element={gated('finance.procurement', <PurchaseOrders />)} />
          <Route path="bills"           element={<RequireRoles roles={FIN_ROLES}><Bills /></RequireRoles>} />
          <Route path="vendors"         element={<RequireRoles roles={FIN_ROLES}><FinanceVendors /></RequireRoles>} />
          <Route path="vendors/:id"     element={<RequireRoles roles={FIN_ROLES}><VendorProfilePage /></RequireRoles>} />
          <Route path="vendors/:id/:tab" element={<RequireRoles roles={FIN_ROLES}><VendorProfilePage /></RequireRoles>} />
          <Route path="expenses"        element={<RequireRoles roles={FIN_ROLES}><Expenses /></RequireRoles>} />
          <Route path="expense-reports" element={<RequireRoles roles={FIN_ROLES}><FinanceExpenseReports /></RequireRoles>} />
          <Route path="expense-reports/new" element={<RequireRoles roles={FIN_ROLES}><FinanceExpenseReportNew /></RequireRoles>} />
          <Route path="expense-reports/:id" element={<RequireRoles roles={FIN_ROLES}><FinanceExpenseReportDetail /></RequireRoles>} />
          <Route path="expenses/new"    element={<RequireRoles roles={FIN_ROLES}><FinanceExpenseNew /></RequireRoles>} />
          <Route path="expenses/categories" element={<RequireRoles roles={FIN_ROLES}><FinanceExpenseCategories /></RequireRoles>} />

          {/* Accounts */}
          <Route path="payments"  element={<RequireRoles roles={FIN_ROLES}><FinancePayments /></RequireRoles>} />
          <Route path="products"             element={<RequireRoles roles={FIN_ROLES}><ProductsServices /></RequireRoles>} />
          <Route path="products/categories" element={<RequireRoles roles={FIN_ROLES}><ProductCategoriesPage /></RequireRoles>} />
          <Route path="products/reviews"    element={<RequireRoles roles={FIN_ROLES}><ProductReviewsPage /></RequireRoles>} />
          <Route path="pos/settings" element={gated('finance.pos', <FinancePosSettings />)} />
          <Route path="pos"       element={gated('finance.pos', <FinancePos />)} />
          <Route path="tax-codes" element={<RequireRoles roles={FIN_ROLES}><FinanceTaxCodes /></RequireRoles>} />
          <Route path="tax-codes/classify" element={<RequireRoles roles={FIN_ROLES}><FinanceTaxClassify /></RequireRoles>} />
          <Route path="vat-periods" element={<RequireRoles roles={FIN_ROLES}><FinanceVatPeriods /></RequireRoles>} />
          <Route path="vat-periods/:id/preparation" element={<RequireRoles roles={['SUPER_ADMIN','ADMIN','TENANT_ADMIN','FINANCE']}><FinanceTaxPreparation /></RequireRoles>} />
          <Route path="accounts">
            <Route index                  element={<RequireRoles roles={FIN_ROLES}><AccountsQuery /></RequireRoles>} />
            <Route path="chart-of-accounts" element={<RequireRoles roles={FIN_ROLES}><ChartOfAccounts /></RequireRoles>} />
            <Route path="journal-entries" element={gated('finance.accounting.advanced', <JournalEntries />)} />
            <Route path="ledger"          element={gated('finance.accounting.advanced', <FinanceLedger />)} />
            <Route path="trial-balance"   element={gated('finance.accounting.advanced', <FinanceTrialBalance />)} />
            <Route path="balance-sheet"   element={gated('finance.accounting.advanced', <FinanceBalanceSheet />)} />
            <Route path="profit-loss"     element={<RequireRoles roles={FIN_ROLES}><FinanceProfitLoss /></RequireRoles>} />
            <Route path="equity-statement" element={gated('finance.accounting.advanced', <FinanceEquityStatement />)} />
            <Route path="aged-receivables"element={<RequireRoles roles={FIN_ROLES}><FinanceAgedReceivables /></RequireRoles>} />
            <Route path="aged-payables"   element={<RequireRoles roles={FIN_ROLES}><FinanceAgedPayables /></RequireRoles>} />
            <Route path="multi-entity"    element={gated('finance.consolidation', <MultiEntityAccounting />)} />
            <Route path="fixed-assets"    element={gated('finance.fixed_assets', <FixedAssets />)} />
            <Route path="budgets"         element={gated('finance.budgets', <Budgets />)} />
            <Route path="bank-reconciliation" element={gated('finance.accounting.advanced', <BankReconciliation />)} />
            <Route path="gl-periods"      element={gated('finance.accounting.advanced', <GlPeriods />)} />
            <Route path="gl-periods/:id/review" element={gated('finance.accounting.advanced', <RequireRoles roles={['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE']}><FinanceCloseReview /></RequireRoles>)} />
            <Route path="approval-workflows" element={gated('finance.accounting.advanced', <ApApprovalWorkflows />)} />
            <Route path="fx-revaluation" element={gated('finance.multi_currency', <FinanceFxRevaluation />)} />
          </Route>

          {/* Reports */}
          <Route path="reports">
            {/* Without this index, /finance/reports matched the parent and
                rendered nothing — a blank page while every child worked. */}
            <Route index                     element={<RequireRoles roles={FIN_ROLES}><FinanceReportsHub /></RequireRoles>} />
            <Route path="sales"              element={<RequireRoles roles={FIN_ROLES}><FinanceSalesReport /></RequireRoles>} />
            <Route path="expenses"           element={<RequireRoles roles={FIN_ROLES}><FinanceExpensesReport /></RequireRoles>} />
            <Route path="income-vs-expenses" element={<RequireRoles roles={FIN_ROLES}><FinanceIncomeVsExpenses /></RequireRoles>} />
            <Route path="tax"                element={<RequireRoles roles={FIN_ROLES}><FinanceTaxReport /></RequireRoles>} />
            <Route path="cash-flow"          element={<RequireRoles roles={FIN_ROLES}><FinanceCashFlow /></RequireRoles>} />
          </Route>

          {/* Integrations */}
          <Route path="integrations" element={<RequireRoles roles={FIN_ROLES}><AccountingIntegrations /></RequireRoles>} />
          <Route path="integrations/deliveries" element={<RequireRoles roles={FIN_ROLES}><AccountingDeliveries /></RequireRoles>} />
        </Route>

        <Route path="*" element={<Navigate to="/finance" replace />} />
      </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}
