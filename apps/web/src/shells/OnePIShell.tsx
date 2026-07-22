import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/OnePi.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { PageLayout } from '../components/PageLayout.js';
import { MGMT_ROLES } from '../lib/permissions.js';

import { StaffDetail } from '../pages/StaffDetail.js';
import { OrgChart }    from '../pages/OrgChart.js';
import {
  HrmDashboard, EmployeesPage, DepartmentsPage, DesignationsPage, TeamsPage,
  AttendancePage, LeavesPage, ShiftsPage, HolidaysPage,
  PayrollPage,
  RolesPage, PermissionsPage, ActivityLogsPage, LoginHistoryPage, DeviceManagementPage, DeleteRequestsPage, InvitationsPage,
  AnnouncementsPage,
} from '../pages/HRM.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: 'home', path: '/onepi', exact: true },
    ],
  },
  {
    title: 'PEOPLE',
    items: [
      { label: 'Manage Staff',    icon: 'users',    path: '/onepi/employees'       },
      { label: 'Departments',     icon: 'building', path: '/onepi/departments'     },
      { label: 'Designations',    icon: 'award',    path: '/onepi/designations'    },
      { label: 'Teams',           icon: 'users',    path: '/onepi/teams'           },
      { label: 'Org Chart',       icon: 'layers',   path: '/onepi/org-chart'       },
    ],
  },
  {
    title: 'TIME & LEAVE',
    items: [
      { label: 'Attendance',     icon: 'clock',    path: '/onepi/attendance' },
      { label: 'Leave Requests', icon: 'calendar', path: '/onepi/leaves'     },
      { label: 'Shift Roster',   icon: 'timer',    path: '/onepi/shifts'     },
      { label: 'Holidays',       icon: 'sun',      path: '/onepi/holidays'   },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { label: 'Payroll', icon: 'dollarSign', path: '/onepi/payroll' },
    ],
  },
  {
    title: 'ACCESS & SECURITY',
    items: [
      { label: 'Roles & Permissions', icon: 'shield',     path: '/onepi/roles'             },
      { label: 'Permission Matrix',   icon: 'key',        path: '/onepi/permissions'       },
      { label: 'Activity Logs',       icon: 'activity',   path: '/onepi/activity-logs'     },
      { label: 'Login History',       icon: 'lock',       path: '/onepi/login-history'     },
      { label: 'Devices',             icon: 'smartphone', path: '/onepi/device-management' },
      { label: 'Delete Requests',     icon: 'userMinus',  path: '/onepi/delete-requests'   },
      { label: 'Invitations',         icon: 'userPlus',   path: '/onepi/invitations'        },
    ],
  },
  {
    title: 'COMMUNICATIONS',
    items: [
      { label: 'Announcements', icon: 'volume2', path: '/onepi/announcements' },
    ],
  },
];

export function OnePIShell() {
  return (
    <WorkspaceApp appId="onepi">
      <div className="app-shell" data-onepi="true">
        <AppSidebar appId="onepi" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
          <Routes>
            <Route element={<PageLayout />}>
              <Route index element={<RequireRoles roles={MGMT_ROLES}><HrmDashboard /></RequireRoles>} />
              <Route path="employees"         element={<RequireRoles roles={MGMT_ROLES}><EmployeesPage /></RequireRoles>} />
              <Route path="roles"             element={<RequireRoles roles={MGMT_ROLES}><RolesPage /></RequireRoles>} />
              <Route path="delete-requests"   element={<RequireRoles roles={MGMT_ROLES}><DeleteRequestsPage /></RequireRoles>} />
              <Route path="departments"       element={<RequireRoles roles={MGMT_ROLES}><DepartmentsPage /></RequireRoles>} />
              <Route path="teams"             element={<RequireRoles roles={MGMT_ROLES}><TeamsPage /></RequireRoles>} />
              <Route path="invitations"       element={<RequireRoles roles={MGMT_ROLES}><InvitationsPage /></RequireRoles>} />
              <Route path="staff-directory"   element={<Navigate to="/onepi/employees" replace />} />
              <Route path="staff/:id"         element={<RequireRoles roles={MGMT_ROLES}><StaffDetail /></RequireRoles>} />
              <Route path="activity-logs"     element={<RequireRoles roles={MGMT_ROLES}><ActivityLogsPage /></RequireRoles>} />
              <Route path="login-history"     element={<RequireRoles roles={MGMT_ROLES}><LoginHistoryPage /></RequireRoles>} />
              <Route path="device-management" element={<RequireRoles roles={MGMT_ROLES}><DeviceManagementPage /></RequireRoles>} />
              <Route path="leaves"            element={<RequireRoles roles={MGMT_ROLES}><LeavesPage /></RequireRoles>} />
              <Route path="attendance"        element={<RequireRoles roles={MGMT_ROLES}><AttendancePage /></RequireRoles>} />
              <Route path="shifts"            element={<RequireRoles roles={MGMT_ROLES}><ShiftsPage /></RequireRoles>} />
              <Route path="holidays"          element={<RequireRoles roles={MGMT_ROLES}><HolidaysPage /></RequireRoles>} />
              <Route path="designations"      element={<RequireRoles roles={MGMT_ROLES}><DesignationsPage /></RequireRoles>} />
              <Route path="payroll"           element={<RequireRoles roles={MGMT_ROLES}><PayrollPage /></RequireRoles>} />
              <Route path="announcements"     element={<RequireRoles roles={MGMT_ROLES}><AnnouncementsPage /></RequireRoles>} />
              <Route path="org-chart"         element={<RequireRoles roles={MGMT_ROLES}><OrgChart /></RequireRoles>} />
              <Route path="permissions"       element={<RequireRoles roles={MGMT_ROLES}><PermissionsPage /></RequireRoles>} />
            </Route>

            <Route path="*" element={<Navigate to="/onepi" replace />} />
          </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}
