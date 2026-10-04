// Barrel re-export — keeps `../pages/SuperAdmin.js` imports in shells unchanged.
export { DashboardView, CompaniesView } from './superadmin/DashboardCompanies.js';
export { SubscriptionsView, PackagesView } from './superadmin/SubsPackages.js';
export { DomainsView, TransactionsView, FinanceView, ActivityView } from './superadmin/Operations.js';
export { SettingsView, AppStatusView } from './superadmin/SettingsAppStatus.js';
