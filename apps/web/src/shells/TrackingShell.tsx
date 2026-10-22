import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { useTenantPlan } from '../hooks/useTenantPlan.js';
import { SectionLoading } from '../components/ui/spinner.js';

const L = (load: () => Promise<{ [k: string]: React.ComponentType }>, name: string) =>
  React.lazy(() => load().then(m => ({ default: (m as any)[name] })));

const TrackingDashboard = L(() => import('../pages/TrackingDashboard.js'), 'TrackingDashboard');
const TrackingLiveMap = L(() => import('../pages/TrackingLiveMap.js'), 'TrackingLiveMap');
const TrackingVehicles = L(() => import('../pages/TrackingVehicles.js'), 'TrackingVehicles');
const TrackingNewVehicle = L(() => import('../pages/TrackingNewVehicle.js'), 'TrackingNewVehicle');
const TrackingAssignments = L(() => import('../pages/TrackingAssignments.js'), 'TrackingAssignments');
const TrackingVehicleDetail = L(() => import('../pages/TrackingVehicleDetail.js'), 'TrackingVehicleDetail');
const TrackingVehicleAddEntry = L(() => import('../pages/TrackingVehicleAddEntry.js'), 'TrackingVehicleAddEntry');
const TrackingDrivers = L(() => import('../pages/TrackingDrivers.js'), 'TrackingDrivers');
const TrackingDriverNew = L(() => import('../pages/TrackingDriverNew.js'), 'TrackingDriverNew');
const TrackingDriverDetail = L(() => import('../pages/TrackingDriverDetail.js'), 'TrackingDriverDetail');
const TrackingShipments = L(() => import('../pages/TrackingShipments.js'), 'TrackingShipments');
const TrackingRoutePlanner = L(() => import('../pages/TrackingRoutePlanner.js'), 'TrackingRoutePlanner');
const TrackingHistory = L(() => import('../pages/TrackingHistory.js'), 'TrackingHistory');
const TrackingMaintenance = L(() => import('../pages/TrackingMaintenance.js'), 'TrackingMaintenance');
const TrackingMaintenanceNew = L(() => import('../pages/TrackingMaintenanceNew.js'), 'TrackingMaintenanceNew');
const TrackingFuel = L(() => import('../pages/TrackingFuel.js'), 'TrackingFuel');
const TrackingFuelNew = L(() => import('../pages/TrackingFuelNew.js'), 'TrackingFuelNew');
const TrackingPartsStock = L(() => import('../pages/TrackingPartsStock.js'), 'TrackingPartsStock');
const TrackingVendors = L(() => import('../pages/TrackingVendors.js'), 'TrackingVendors');
const TrackingVendorDetail = L(() => import('../pages/TrackingVendorDetail.js'), 'TrackingVendorDetail');
const TrackingDocuments = L(() => import('../pages/TrackingDocuments.js'), 'TrackingDocuments');
const TrackingReminders = L(() => import('../pages/TrackingReminders.js'), 'TrackingReminders');
const TrackingGeofences = L(() => import('../pages/TrackingGeofences.js'), 'TrackingGeofences');
const TrackingAlerts = L(() => import('../pages/TrackingAlerts.js'), 'TrackingAlerts');
const TrackingDriverChat = L(() => import('../pages/TrackingDriverChat.js'), 'TrackingDriverChat');
const TrackingReports = L(() => import('../pages/TrackingReports.js'), 'TrackingReports');
const TrackingAnalytics = L(() => import('../pages/TrackingAnalytics.js'), 'TrackingAnalytics');
const TrackingWarehouse = L(() => import('../pages/TrackingWarehouse.js'), 'TrackingWarehouse');
const TrackingCargoLoading = L(() => import('../pages/TrackingCargoLoading.js'), 'TrackingCargoLoading');
const TrackingShipmentNew = L(() => import('../pages/TrackingShipmentNew.js'), 'TrackingShipmentNew');
const TrackingIssues = L(() => import('../pages/TrackingIssues.js'), 'TrackingIssues');
const TrackingIssueNew = L(() => import('../pages/TrackingIssueNew.js'), 'TrackingIssueNew');
const TrackingIssueDetail = L(() => import('../pages/TrackingIssueDetail.js'), 'TrackingIssueDetail');
const TrackingNewExpense = L(() => import('../pages/TrackingNewExpense.js'), 'TrackingNewExpense');
const TrackingDevices = L(() => import('../pages/TrackingDevices.js'), 'TrackingDevices');
const DepotPage = L(() => import('../pages/DepotPage.js'), 'DepotPage');
const TrackingTrailerNew = L(() => import('../pages/TrackingTrailerNew.js'), 'TrackingTrailerNew');
const TrackingTrailerDetail = L(() => import('../pages/TrackingTrailerDetail.js'), 'TrackingTrailerDetail');
const TrackingTransporters = L(() => import('../pages/TrackingTransporters.js'), 'TrackingTransporters');
const TrackingTripDetail = L(() => import('../pages/TrackingTripDetail.js'), 'TrackingTripDetail');

export function TrackingShell() {
  const { hasPlan } = useTenantPlan();
  const enterpriseBadge = hasPlan('enterprise') ? undefined : ({ badge: 'Enterprise', badgeVariant: 'soon' } as const);

  const NAV: SidebarSection[] = [
    {
      title: 'Operations',
      collapsible: false,
      items: [
        { label: 'Dashboard',      icon: 'grid',    path: '/tracking', exact: true },
        { label: 'Live Map',       icon: 'mapPin',  path: '/tracking/map' },
        { label: 'Fleet Assets',   icon: 'truck',   path: '/tracking/vehicles' },
        { label: 'Drivers',        icon: 'user',    path: '/tracking/drivers' },
        { label: 'Trips',          icon: 'package', path: '/tracking/shipments' },
        { label: 'Route Planner',  icon: 'compass', path: '/tracking/route-planner' },
        { label: 'Cargo Loading',  icon: 'layers', path: '/tracking/cargo-loading', ...enterpriseBadge },
        { label: 'Expense Entry',  icon: 'dollarSign', path: '/tracking/expenses/new' },
      ],
    },
    {
      title: 'Maintenance & Supply',
      items: [
        { label: 'Maintenance',      icon: 'clipboardList', path: '/tracking/maintenance' },
        { label: 'Issues',           icon: 'alertTriangle', path: '/tracking/issues' },
        { label: 'Fuel',             icon: 'activity',       path: '/tracking/fuel' },
        { label: 'Parts Stock',      icon: 'package',        path: '/tracking/parts' },
        { label: 'Vehicle Vendors',  icon: 'users',           path: '/tracking/vendors' },
        { label: 'Transporters',     icon: 'briefcase',       path: '/tracking/transporters' },
      ],
    },
    {
      title: 'Warehouse',
      items: [
        { label: 'Locations & Dock Schedule', icon: 'folder', path: '/tracking/warehouse', ...enterpriseBadge },
      ],
    },
    // Equipment/Interchange Receipts moved here from ClearOS — collecting
    // cargo against a release document is a fleet act (EIR already carries
    // driver + vehicle fields). Links back to the release/delivery order in
    // FinOps via release_document_id. See depot.routes.ts.
    {
      title: 'Equipment & Depot',
      items: [
        { label: 'Equipment & Interchange Receipts', icon: 'package', path: '/tracking/depot' },
      ],
    },
    {
      title: 'Compliance',
      items: [
        { label: 'Documents & Insurance', icon: 'shield',        path: '/tracking/documents' },
        { label: 'Reminders',             icon: 'bell',          path: '/tracking/reminders' },
        { label: 'Geofences',             icon: 'mapPin',        path: '/tracking/geofences' },
        { label: 'Alerts',                icon: 'alertTriangle', path: '/tracking/alerts' },
      ],
    },
    {
      title: 'Comms & Reports',
      items: [
        { label: 'Driver Chat', icon: 'message',   path: '/tracking/driver-chat' },
        { label: 'History',     icon: 'clock',      path: '/tracking/history' },
        { label: 'Reports',     icon: 'barChart2',  path: '/tracking/reports' },
        { label: 'Analytics',   icon: 'pieChart',   path: '/tracking/analytics', ...enterpriseBadge },
      ],
    },
    {
      title: 'Integrations',
      items: [
        { label: 'GPSWOX Devices', icon: 'zap', path: '/tracking/devices' },
      ],
    },
  ];

  return (
    <WorkspaceApp appId="tracking">
      <div className="app-shell" data-tracking="true">
        <AppSidebar appId="tracking" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Suspense fallback={<SectionLoading />}>
            <Routes>
              {/* Live Map and Route Planner are full-bleed map tools (forced
                  100vh height, edge-to-edge against the sidebar) — like
                  Bliss's ticket workspace, they intentionally skip the
                  padded-page/footer treatment so the map keeps the full
                  viewport instead of losing height to a footer bar. */}
              <Route path="map" element={<TrackingLiveMap />} />
              <Route path="route-planner" element={<TrackingRoutePlanner />} />
              <Route element={<PageLayout />}>
                <Route index element={<TrackingDashboard />} />
                <Route path="vehicles" element={<TrackingVehicles />} />
                <Route path="assignments" element={<TrackingAssignments />} />
                <Route path="vehicles/new" element={<TrackingNewVehicle />} />
                <Route path="vehicles/:id" element={<TrackingVehicleDetail />} />
                <Route path="vehicles/:id/add/:type" element={<TrackingVehicleAddEntry />} />
                <Route path="trailers" element={<Navigate to="/tracking/vehicles?cat=trailers" replace />} />
                <Route path="trailers/new" element={<TrackingTrailerNew />} />
                <Route path="trailers/:id" element={<TrackingTrailerDetail />} />
                <Route path="transporters" element={<TrackingTransporters />} />
                <Route path="drivers" element={<TrackingDrivers />} />
                <Route path="drivers/new" element={<TrackingDriverNew />} />
                <Route path="drivers/:id" element={<TrackingDriverDetail />} />
                <Route path="shipments" element={<TrackingShipments />} />
                <Route path="shipments/:id" element={<TrackingTripDetail />} />
                <Route path="ledger" element={<Navigate to="/tracking/shipments" replace />} />
                <Route path="trips" element={<Navigate to="/tracking/shipments" replace />} />
                <Route path="consignments" element={<Navigate to="/tracking/shipments" replace />} />
                <Route path="cargo-loading" element={<TrackingCargoLoading />} />
                <Route path="shipments/new" element={<TrackingShipmentNew />} />
                <Route path="history" element={<TrackingHistory />} />
                <Route path="maintenance" element={<TrackingMaintenance />} />
                <Route path="maintenance/new" element={<TrackingMaintenanceNew />} />
                <Route path="issues" element={<TrackingIssues />} />
                <Route path="issues/new" element={<TrackingIssueNew />} />
                <Route path="issues/:id" element={<TrackingIssueDetail />} />
                <Route path="fuel" element={<TrackingFuel />} />
                <Route path="fuel/new" element={<TrackingFuelNew />} />
                <Route path="parts" element={<TrackingPartsStock />} />
                <Route path="vendors" element={<TrackingVendors />} />
                <Route path="vendors/:id" element={<TrackingVendorDetail />} />
                <Route path="warehouse" element={<TrackingWarehouse />} />
                <Route path="documents" element={<TrackingDocuments />} />
                <Route path="reminders" element={<TrackingReminders />} />
                <Route path="geofences" element={<TrackingGeofences />} />
                <Route path="alerts" element={<TrackingAlerts />} />
                <Route path="driver-chat" element={<TrackingDriverChat />} />
                <Route path="reports" element={<TrackingReports />} />
                <Route path="analytics" element={<TrackingAnalytics />} />
                <Route path="expenses/new" element={<TrackingNewExpense />} />
                <Route path="devices" element={<TrackingDevices />} />
                <Route path="depot" element={<DepotPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/tracking" replace />} />
            </Routes>
            </Suspense>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}
