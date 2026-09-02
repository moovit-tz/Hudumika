import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/OnePi.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
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
import { HrVisitors }   from '../pages/HrVisitors.js';
import { OvertimePage } from '../pages/Overtime.js';
import { HrAssets }     from '../pages/HrAssets.js';
import { ClockInPage }  from '../pages/ClockInPage.js';
import { MyHubPage }    from '../pages/MyHub.js';
import { RecruitmentPage } from '../pages/Recruitment.js';
// Calls (1:1 + group meetings) moved to Bliss, matching Team Chat's own
// precedent — see BlissShell.tsx. The nav item below now just links out.
import {
  HrmDashboard, EmployeesPage, DepartmentsPage, DesignationsPage, TeamsPage,
  AttendancePage, LeavesPage, ShiftsPage, HolidaysPage, DevicesPage,
  PayrollPage, MyPayslipsPage,
  RolesPage, ActivityLogsPage, DeleteRequestsPage,
  AnnouncementsPage,
} from '../pages/HRM.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: 'home', path: '/nexushr', exact: true },
      { label: 'My HR', icon: 'user', path: '/nexushr/me' },
      { label: 'Calls', icon: 'camera', path: '/bliss/calls' },
      { label: 'Clock-in', icon: 'clock', path: '/nexushr/clock-in' },
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
      { label: 'Recruitment',     icon: 'userPlus', path: '/nexushr/recruitment'     },
    ],
  },
  {
    title: 'TIME & LEAVE',
    items: [
      { label: 'Clock-in & Timesheets', icon: 'clock', path: '/nexushr/clock-in' },
      { label: 'Attendance',     icon: 'check',    path: '/nexushr/attendance' },
      { label: 'Attendance Devices', icon: 'fingerprint', path: '/nexushr/devices' },
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
      { label: 'Visitors',  icon: 'userPlus', path: '/nexushr/visitors'  },
    ],
  },
  {
    title: 'FINANCE',
    items: [
      { label: 'Payroll', icon: 'dollarSign', path: '/nexushr/payroll' },
      { label: 'My Payslips', icon: 'fileText', path: '/nexushr/my-payslips' },
    ],
  },
  {
    title: 'ACCESS & SECURITY',
    items: [
      { label: 'Roles & Permissions', icon: 'shield',     path: '/nexushr/roles'             },
      { label: 'Activity Logs',       icon: 'activity',   path: '/nexushr/activity-logs'     },
      // These three are the same users/hr_invitations/hr_login_history/hr_devices
      // records Ondi Business already manages under Users/Login Activity/
      // Sessions & Security — kept as two live, drifting copies before. Now
      // one home (Ondi) and this nav just points there instead of rendering
      // a second copy of the same screen.
      { label: 'Login History',       icon: 'lock',       path: '/ondi/login-activity'       },
      { label: 'Devices',             icon: 'smartphone', path: '/ondi/sessions'             },
      { label: 'Delete Requests',     icon: 'userMinus',  path: '/nexushr/delete-requests'   },
      { label: 'Invitations',         icon: 'userPlus',   path: '/ondi?tab=invites'          },
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
              {/* Invitations/Login History/Devices moved to Ondi Business (same
                  underlying records) — these three routes stay only as
                  redirects so old links/bookmarks still land somewhere real. */}
              <Route path="invitations"       element={<Navigate to="/ondi?tab=invites" replace />} />
              <Route path="staff-directory"   element={<Navigate to="/nexushr/employees" replace />} />
              <Route path="staff/:id"         element={<RequireSelfOrRoles roles={MGMT_ROLES}><StaffDetail /></RequireSelfOrRoles>} />
              {/* Moved to Ondi Business (same devices/login-history data Ondi
                  already owns — see OneIdItAdmin.tsx's own header comment). */}
              <Route path="it-admin"          element={<Navigate to="/ondi/it-admin" replace />} />
              <Route path="activity-logs"     element={<RequireRoles roles={MGMT_ROLES}><ActivityLogsPage /></RequireRoles>} />
              <Route path="login-history"     element={<Navigate to="/ondi/login-activity" replace />} />
              <Route path="device-management" element={<Navigate to="/ondi/sessions" replace />} />
              <Route path="me"                element={<MyHubPage />} />
              <Route path="clock-in"          element={<ClockInPage />} />
              <Route path="leaves"            element={<RequireRoles roles={MGMT_ROLES}><LeavesPage /></RequireRoles>} />
              <Route path="attendance"        element={<RequireRoles roles={MGMT_ROLES}><AttendancePage /></RequireRoles>} />
              <Route path="devices"           element={<RequireRoles roles={MGMT_ROLES}><DevicesPage /></RequireRoles>} />
              <Route path="shifts"            element={<RequireRoles roles={MGMT_ROLES}><ShiftsPage /></RequireRoles>} />
              <Route path="overtime"          element={<RequireRoles roles={MGMT_ROLES}><OvertimePage /></RequireRoles>} />
              <Route path="holidays"          element={<RequireRoles roles={MGMT_ROLES}><HolidaysPage /></RequireRoles>} />
              <Route path="designations"      element={<RequireRoles roles={MGMT_ROLES}><DesignationsPage /></RequireRoles>} />
              <Route path="payroll"           element={<RequireRoles roles={MGMT_ROLES}><PayrollPage /></RequireRoles>} />
              <Route path="my-payslips"       element={<MyPayslipsPage />} />
              <Route path="announcements"     element={<RequireRoles roles={MGMT_ROLES}><AnnouncementsPage /></RequireRoles>} />
              <Route path="org-chart"         element={<RequireRoles roles={MGMT_ROLES} permissions={['org_chart.manage']}><OrgChart /></RequireRoles>} />
              <Route path="employment"        element={<RequireRoles roles={MGMT_ROLES}><EmploymentRecords /></RequireRoles>} />
              <Route path="recruitment"       element={<RequireRoles roles={MGMT_ROLES}><RecruitmentPage /></RequireRoles>} />
              <Route path="performance"       element={<RequireRoles roles={MGMT_ROLES}><Performance /></RequireRoles>} />
              <Route path="documents"         element={<RequireRoles roles={MGMT_ROLES}><HrDocuments /></RequireRoles>} />
              <Route path="visitors"          element={<RequireRoles roles={MGMT_ROLES}><HrVisitors /></RequireRoles>} />
              <Route path="assets"            element={<RequireRoles roles={MGMT_ROLES}><HrAssets /></RequireRoles>} />
              {/* Permission Matrix merged into the Roles & Permissions page itself (a view toggle there now). */}
              <Route path="permissions"       element={<Navigate to="/nexushr/roles" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/nexushr" replace />} />
          </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}
