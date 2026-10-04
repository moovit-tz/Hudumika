// Barrel re-export — keeps `../pages/HRM.js` imports in shells unchanged.
// The actual implementations live in the hrm/ subdirectory.
export { EmployeesPage, RolesPage, DeleteRequestsPage, DepartmentsPage, TeamsPage, ActivityLogsPage } from './hrm/People.js';
export { LeavesPage, AttendancePage } from './hrm/TimeAttendance.js';
export { DevicesPage, ShiftsPage, HolidaysPage } from './hrm/DevicesShiftsHolidays.js';
export { DesignationsPage, PayrollPage, MyPayslipsPage, AnnouncementsPage } from './hrm/PayrollAdmin.js';
export { HrmDashboard } from './hrm/HrmDashboard.js';
