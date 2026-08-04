import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { useTenantPlan } from '../hooks/useTenantPlan.js';

import { TrackingDashboard } from '../pages/TrackingDashboard.js';
import { TrackingLiveMap } from '../pages/TrackingLiveMap.js';
import { TrackingVehicles } from '../pages/TrackingVehicles.js';
import { TrackingNewVehicle } from '../pages/TrackingNewVehicle.js';
import { TrackingAssignments } from '../pages/TrackingAssignments.js';
import { TrackingVehicleDetail } from '../pages/TrackingVehicleDetail.js';
import { TrackingVehicleAddEntry } from '../pages/TrackingVehicleAddEntry.js';
import { TrackingDrivers } from '../pages/TrackingDrivers.js';
import { TrackingDriverNew } from '../pages/TrackingDriverNew.js';
import { TrackingDriverDetail } from '../pages/TrackingDriverDetail.js';
import { TrackingShipments } from '../pages/TrackingShipments.js';
import { TrackingRoutePlanner } from '../pages/TrackingRoutePlanner.js';
import { TrackingHistory } from '../pages/TrackingHistory.js';
import { TrackingMaintenance } from '../pages/TrackingMaintenance.js';
import { TrackingMaintenanceNew } from '../pages/TrackingMaintenanceNew.js';
import { TrackingFuel } from '../pages/TrackingFuel.js';
import { TrackingFuelNew } from '../pages/TrackingFuelNew.js';
import { TrackingPartsStock } from '../pages/TrackingPartsStock.js';
import { TrackingVendors } from '../pages/TrackingVendors.js';
import { TrackingDocuments } from '../pages/TrackingDocuments.js';
import { TrackingReminders } from '../pages/TrackingReminders.js';
import { TrackingGeofences } from '../pages/TrackingGeofences.js';
import { TrackingAlerts } from '../pages/TrackingAlerts.js';
import { TrackingDriverChat } from '../pages/TrackingDriverChat.js';
import { TrackingReports } from '../pages/TrackingReports.js';
import { TrackingAnalytics } from '../pages/TrackingAnalytics.js';
import { TrackingWarehouse } from '../pages/TrackingWarehouse.js';
import { TrackingCargoLoading } from '../pages/TrackingCargoLoading.js';
import { TrackingShipmentNew } from '../pages/TrackingShipmentNew.js';
import { TrackingIssues } from '../pages/TrackingIssues.js';
import { TrackingIssueNew } from '../pages/TrackingIssueNew.js';
import { TrackingIssueDetail } from '../pages/TrackingIssueDetail.js';
import { TrackingNewExpense } from '../pages/TrackingNewExpense.js';
import { TrackingDevices } from '../pages/TrackingDevices.js';

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
        { label: 'Vehicles',       icon: 'truck',   path: '/tracking/vehicles' },
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
      ],
    },
    {
      title: 'Warehouse',
      items: [
        { label: 'Locations & Dock Schedule', icon: 'folder', path: '/tracking/warehouse', ...enterpriseBadge },
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
    {
      title: 'Linked Apps',
      items: [
        { label: 'Employees',            icon: 'user',       path: '/nexushr/employees' },
        { label: 'Attendance & Payroll', icon: 'calendar',   path: '/nexushr/attendance' },
        { label: 'Accounts',             icon: 'dollarSign', path: '/finops' },
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
                <Route path="drivers" element={<TrackingDrivers />} />
                <Route path="drivers/new" element={<TrackingDriverNew />} />
                <Route path="drivers/:id" element={<TrackingDriverDetail />} />
                <Route path="shipments" element={<TrackingShipments />} />
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
              </Route>
              <Route path="*" element={<Navigate to="/tracking" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}
