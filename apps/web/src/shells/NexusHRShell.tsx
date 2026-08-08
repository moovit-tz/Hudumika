import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/OnePi.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { RequireSelfOrRoles } from '../components/RequireSelfOrRoles.js';
import { PageLayout } from '../components/PageLayout.js';
import { MGMT_ROLES } from '../lib/permissions.js';

import { StaffDetail } from '../pages/StaffDetail.js';
import { OrgChart }    from '../pages/OrgChart.js';
import { EmploymentRecords } from '../pages/EmploymentRecords.js';
import { Performance }  from '../pages/Performance.js';
import { HrDocuments }  from '../pages/HrDocuments.js';
import { OvertimePage } from '../pages/Overtime.js';
import { HrAssets }     from '../pages/HrAssets.js';
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
      { label: 'Dashboard', icon: 'home', path: '/nexushr', exact: true },
    ],
  },
  {
    title: 'PEOPLE',
    items: [
      { label: 'Manage Staff',    icon: 'users',    path: '/nexushr/employees'       },
      { label: 'Departments',     icon: 'building', path: '/nexushr/departments'     },
      { label: 'Designations',    icon: 'award',    path: '/nexushr/designations'    },
      { label: 'Teams',           icon: 'users',    path: '/nexushr/teams'           },
      { label: 'Org Chart',       icon: 'layers',   path: '/nexushr/org-chart'       },
      { label: 'Employment',      icon: 'fileText', path: '/nexushr/employment'      },
    ],
  },
  {
    title: 'TIME & LEAVE',
    items: [
      { label: 'Attendance',     icon: 'clock',    path: '/nexushr/attendance' },
      { label: 'Leave Requests', icon: 'calendar', path: '/nexushr/leaves'     },
      { label: 'Shift Roster',   icon: 'timer',    path: '/nexushr/shifts'     },
      { label: 'Overtime',       icon: 'zap',      path: '/nexushr/overtime'   },
      { label: 'Holidays',       icon: 'sun',      path: '/nexushr/holidays'   },
    ],
  },
  {
    title: 'PERFORMANCE',
    items: [
      { label: 'Goals & Reviews', icon: 'target', path: '/nexushr/performance' },
    ],
  },
  {
    title: 'RECORDS',
    items: [
      { label: 'Documents', icon: 'fileText', path: '/nexushr/documents' },
      { label: 'Assets',    icon: 'package',  path: '/nexushr/assets'    },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { label: 'Payroll', icon: 'dollarSign', path: '/nexushr/payroll' },
    ],
  },
  {
    title: 'ACCESS & SECURITY',
    items: [
      { label: 'Roles & Permissions', icon: 'shield',     path: '/nexushr/roles'             },
      { label: 'Permission Matrix',   icon: 'key',        path: '/nexushr/permissions'       },
      { label: 'Activity Logs',       icon: 'activity',   path: '/nexushr/activity-logs'     },
      { label: 'Login History',       icon: 'lock',       path: '/nexushr/login-history'     },
      { label: 'Devices',             icon: 'smartphone', path: '/nexushr/device-management' },
      { label: 'Delete Requests',     icon: 'userMinus',  path: '/nexushr/delete-requests'   },
      { label: 'Invitations',         icon: 'userPlus',   path: '/nexushr/invitations'        },
    ],
  },
  {
    title: 'COMMUNICATIONS',
    items: [
      { label: 'Announcements', icon: 'volume2', path: '/nexushr/announcements' },
    ],
  },
];

export function NexusHRShell() {
  return (
    <WorkspaceApp appId="nexushr">
      <div className="app-shell" data-onepi="true">
        <AppSidebar appId="nexushr" sections={NAV} />
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
              <Route path="staff-directory"   element={<Navigate to="/nexushr/employees" replace />} />
              <Route path="staff/:id"         element={<RequireSelfOrRoles roles={MGMT_ROLES}><StaffDetail /></RequireSelfOrRoles>} />
              <Route path="activity-logs"     element={<RequireRoles roles={MGMT_ROLES}><ActivityLogsPage /></RequireRoles>} />
              <Route path="login-history"     element={<RequireRoles roles={MGMT_ROLES}><LoginHistoryPage /></RequireRoles>} />
              <Route path="device-management" element={<RequireRoles roles={MGMT_ROLES}><DeviceManagementPage /></RequireRoles>} />
              <Route path="leaves"            element={<RequireRoles roles={MGMT_ROLES}><LeavesPage /></RequireRoles>} />
              <Route path="attendance"        element={<RequireRoles roles={MGMT_ROLES}><AttendancePage /></RequireRoles>} />
              <Route path="shifts"            element={<RequireRoles roles={MGMT_ROLES}><ShiftsPage /></RequireRoles>} />
              <Route path="overtime"          element={<RequireRoles roles={MGMT_ROLES}><OvertimePage /></RequireRoles>} />
              <Route path="holidays"          element={<RequireRoles roles={MGMT_ROLES}><HolidaysPage /></RequireRoles>} />
              <Route path="designations"      element={<RequireRoles roles={MGMT_ROLES}><DesignationsPage /></RequireRoles>} />
              <Route path="payroll"           element={<RequireRoles roles={MGMT_ROLES}><PayrollPage /></RequireRoles>} />
              <Route path="announcements"     element={<RequireRoles roles={MGMT_ROLES}><AnnouncementsPage /></RequireRoles>} />
              <Route path="org-chart"         element={<RequireRoles roles={MGMT_ROLES}><OrgChart /></RequireRoles>} />
              <Route path="employment"        element={<RequireRoles roles={MGMT_ROLES}><EmploymentRecords /></RequireRoles>} />
              <Route path="performance"       element={<RequireRoles roles={MGMT_ROLES}><Performance /></RequireRoles>} />
              <Route path="documents"         element={<RequireRoles roles={MGMT_ROLES}><HrDocuments /></RequireRoles>} />
              <Route path="assets"            element={<RequireRoles roles={MGMT_ROLES}><HrAssets /></RequireRoles>} />
              <Route path="permissions"       element={<RequireRoles roles={MGMT_ROLES}><PermissionsPage /></RequireRoles>} />
            </Route>

            <Route path="*" element={<Navigate to="/nexushr" replace />} />
          </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}
