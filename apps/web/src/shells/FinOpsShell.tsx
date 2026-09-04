import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/FinOps.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { PageLayout } from '../components/PageLayout.js';
import { FIN_ROLES } from '../lib/permissions.js';
import { useLocale } from '../hooks/useLocale.js';
import type { TFunction } from 'i18next';

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
      ],
    },
    {
      title: t('finance.nav.accounts'),
      items: [
        { label: t('finance.nav.payments'),         icon: 'dollarSign', path: '/finance/payments'                     },
        { label: t('finance.nav.products'),         icon: 'package',    path: '/finance/products'                     },
        { label: t('finance.nav.taxCodes'),         icon: 'percent',    path: '/finance/tax-codes'                    },
        { label: t('finance.nav.vatPeriods'),       icon: 'lock',       path: '/finance/vat-periods'                  },
        { label: t('finance.nav.chartOfAccounts'),  icon: 'list',       path: '/finance/accounts/chart-of-accounts'   },
        { label: 'Journal Entries',                 icon: 'bookOpen',   path: '/finance/accounts/journal-entries'     },
        { label: t('finance.nav.ledger'),           icon: 'fileText',   path: '/finance/accounts/ledger'              },
        { label: 'Multi-Entity',                    icon: 'building',   path: '/finance/accounts/multi-entity'        },
        { label: 'Fixed Assets',                    icon: 'package',    path: '/finance/accounts/fixed-assets'        },
        { label: 'Budgets',                         icon: 'target',      path: '/finance/accounts/budgets'             },
        { label: 'Bank Reconciliation',              icon: 'building',    path: '/finance/accounts/bank-reconciliation' },
        { label: 'Period Close',                     icon: 'lock',        path: '/finance/accounts/gl-periods'          },
      ],
    },
    {
      title: t('finance.nav.reports'),
      items: [
        { label: t('finance.nav.salesReport'),      icon: 'barChart',    path: '/finance/reports/sales'              },
        { label: t('finance.nav.incomeVsExpenses'), icon: 'barChart',    path: '/finance/reports/income-vs-expenses' },
        { label: t('finance.nav.cashFlow'),         icon: 'trendingUp',  path: '/finance/reports/cash-flow'          },
        { label: t('finance.nav.taxReport'),        icon: 'percent',     path: '/finance/reports/tax'                },
        { label: t('finance.nav.expensesReport'),   icon: 'creditCard',  path: '/finance/reports/expenses'           },
        { label: t('finance.nav.trialBalance'),     icon: 'barChart',   path: '/finance/accounts/trial-balance'       },
        { label: t('finance.nav.balanceSheet'),     icon: 'layers',     path: '/finance/accounts/balance-sheet'       },
        { label: t('finance.nav.profitLoss'),       icon: 'trendingUp', path: '/finance/accounts/profit-loss'         },
        { label: 'Equity Statement',                icon: 'trendingUp', path: '/finance/accounts/equity-statement'    },
        { label: t('finance.nav.agedReceivables'),  icon: 'clock',      path: '/finance/accounts/aged-receivables'    },
        { label: t('finance.nav.agedPayables'),     icon: 'clock',      path: '/finance/accounts/aged-payables'       },
      ],
    },
    {
      title: t('finance.nav.integrations'),
      items: [
        { label: t('finance.nav.accountingSync'), icon: 'zap', path: '/finance/integrations' },
      ],
    },
  ];
}

import { FinanceDashboard }       from '../pages/FinanceDashboard.js';
import { Billing }                from '../pages/Billing.js';
import { Quotations }             from '../pages/Quotations.js';
import { PurchaseOrders }         from '../pages/PurchaseOrders.js';
import { Expenses }               from '../pages/Expenses.js';
import { FinanceExpenseNew }      from '../pages/FinanceExpenseNew.js';
import { FinanceExpenseCategories } from '../pages/FinanceExpenseCategories.js';
import { Bills }                  from '../pages/Bills.js';
import { FinanceVendors }         from '../pages/FinanceVendors.js';
// One catalog, surfaced in both apps: /finance/products and /clearos/products
// render the same component over the same /v1/products table.
import { ProductsServices }        from '../pages/ProductsServices.js';
import { FinanceTaxCodes }        from '../pages/FinanceTaxCodes.js';
import { FinanceTaxClassify }     from '../pages/FinanceTaxClassify.js';
import { FinanceVatPeriods }      from '../pages/FinanceVatPeriods.js';
import { FinancePayments }        from '../pages/FinancePayments.js';
import { FinanceLedger }          from '../pages/FinanceLedger.js';
import { FinanceTrialBalance }    from '../pages/FinanceTrialBalance.js';
import { FinanceBalanceSheet }    from '../pages/FinanceBalanceSheet.js';
import { FinanceProfitLoss }      from '../pages/FinanceProfitLoss.js';
import { FinanceEquityStatement } from '../pages/FinanceEquityStatement.js';
import { FinanceAgedReceivables } from '../pages/FinanceAgedReceivables.js';
import { FinanceAgedPayables }    from '../pages/FinanceAgedPayables.js';
import { MultiEntityAccounting }  from '../pages/MultiEntityAccounting.js';
import { FinanceReportsHub } from '../pages/FinanceReportsHub.js';
import { FinanceSalesReport }          from '../pages/FinanceSalesReport.js';
import { FinanceExpensesReport }       from '../pages/FinanceExpensesReport.js';
import { FinanceIncomeVsExpenses }     from '../pages/FinanceIncomeVsExpenses.js';
import { FinanceTaxReport }            from '../pages/FinanceTaxReport.js';
import { FinanceCashFlow }             from '../pages/FinanceCashFlow.js';
import { AccountsQuery }               from '../pages/AccountsQuery.js';
import { ChartOfAccounts }            from '../pages/ChartOfAccounts.js';
import { JournalEntries }             from '../pages/JournalEntries.js';
import { DeliveryDocumentsPage }       from '../pages/DeliveryDocumentsPage.js';
import { AccountingIntegrations }      from '../pages/AccountingIntegrations.js';
import { RecurringInvoices }           from '../pages/RecurringInvoices.js';
import { CreditNotes }                 from '../pages/CreditNotes.js';
import { FixedAssets }                 from '../pages/FixedAssets.js';
import { Budgets }                     from '../pages/Budgets.js';
import { BankReconciliation }          from '../pages/BankReconciliation.js';
import { GlPeriods }                   from '../pages/GlPeriods.js';

export function FinOpsShell() {
  const { t } = useLocale();
  const NAV = buildNav(t);
  return (
    <WorkspaceApp appId="finops">
      <div className="app-shell" data-finops="true">
        <AppSidebar appId="finops" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
      <Routes>
        <Route path="overview" element={<Navigate to="/finance" replace />} />

        <Route element={<PageLayout />}>
          <Route index element={<RequireRoles roles={FIN_ROLES}><FinanceDashboard /></RequireRoles>} />
          {/* Receivables */}
          <Route path="invoices"       element={<RequireRoles roles={FIN_ROLES}><Billing /></RequireRoles>} />
          <Route path="invoices/recurring" element={<RequireRoles roles={FIN_ROLES}><RecurringInvoices /></RequireRoles>} />
          <Route path="credit-notes"     element={<RequireRoles roles={FIN_ROLES}><CreditNotes /></RequireRoles>} />
          <Route path="credit-notes/new" element={<RequireRoles roles={FIN_ROLES}><CreditNotes /></RequireRoles>} />
          <Route path="quotations"     element={<RequireRoles roles={FIN_ROLES}><Quotations /></RequireRoles>} />
          <Route path="delivery-documents" element={<RequireRoles roles={FIN_ROLES}><DeliveryDocumentsPage /></RequireRoles>} />
          <Route path="delivery-notes" element={<Navigate to="/finance/delivery-documents" replace />} />

          {/* Payables */}
          <Route path="purchase-orders" element={<RequireRoles roles={FIN_ROLES}><PurchaseOrders /></RequireRoles>} />
          <Route path="bills"           element={<RequireRoles roles={FIN_ROLES}><Bills /></RequireRoles>} />
          <Route path="vendors"         element={<RequireRoles roles={FIN_ROLES}><FinanceVendors /></RequireRoles>} />
          <Route path="expenses"        element={<RequireRoles roles={FIN_ROLES}><Expenses /></RequireRoles>} />
          <Route path="expenses/new"    element={<RequireRoles roles={FIN_ROLES}><FinanceExpenseNew /></RequireRoles>} />
          <Route path="expenses/categories" element={<RequireRoles roles={FIN_ROLES}><FinanceExpenseCategories /></RequireRoles>} />

          {/* Accounts */}
          <Route path="payments"  element={<RequireRoles roles={FIN_ROLES}><FinancePayments /></RequireRoles>} />
          <Route path="products"  element={<RequireRoles roles={FIN_ROLES}><ProductsServices /></RequireRoles>} />
          <Route path="tax-codes" element={<RequireRoles roles={FIN_ROLES}><FinanceTaxCodes /></RequireRoles>} />
          <Route path="tax-codes/classify" element={<RequireRoles roles={FIN_ROLES}><FinanceTaxClassify /></RequireRoles>} />
          <Route path="vat-periods" element={<RequireRoles roles={FIN_ROLES}><FinanceVatPeriods /></RequireRoles>} />
          <Route path="accounts">
            <Route index                  element={<RequireRoles roles={FIN_ROLES}><AccountsQuery /></RequireRoles>} />
            <Route path="chart-of-accounts" element={<RequireRoles roles={FIN_ROLES}><ChartOfAccounts /></RequireRoles>} />
            <Route path="journal-entries" element={<RequireRoles roles={FIN_ROLES}><JournalEntries /></RequireRoles>} />
            <Route path="ledger"          element={<RequireRoles roles={FIN_ROLES}><FinanceLedger /></RequireRoles>} />
            <Route path="trial-balance"   element={<RequireRoles roles={FIN_ROLES}><FinanceTrialBalance /></RequireRoles>} />
            <Route path="balance-sheet"   element={<RequireRoles roles={FIN_ROLES}><FinanceBalanceSheet /></RequireRoles>} />
            <Route path="profit-loss"     element={<RequireRoles roles={FIN_ROLES}><FinanceProfitLoss /></RequireRoles>} />
            <Route path="equity-statement" element={<RequireRoles roles={FIN_ROLES}><FinanceEquityStatement /></RequireRoles>} />
            <Route path="aged-receivables"element={<RequireRoles roles={FIN_ROLES}><FinanceAgedReceivables /></RequireRoles>} />
            <Route path="aged-payables"   element={<RequireRoles roles={FIN_ROLES}><FinanceAgedPayables /></RequireRoles>} />
            <Route path="multi-entity"    element={<RequireRoles roles={FIN_ROLES}><MultiEntityAccounting /></RequireRoles>} />
            <Route path="fixed-assets"    element={<RequireRoles roles={FIN_ROLES}><FixedAssets /></RequireRoles>} />
            <Route path="budgets"         element={<RequireRoles roles={FIN_ROLES}><Budgets /></RequireRoles>} />
            <Route path="bank-reconciliation" element={<RequireRoles roles={FIN_ROLES}><BankReconciliation /></RequireRoles>} />
            <Route path="gl-periods"      element={<RequireRoles roles={FIN_ROLES}><GlPeriods /></RequireRoles>} />
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
