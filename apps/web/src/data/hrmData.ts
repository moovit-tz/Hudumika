// Shared HRM type declarations. This file used to also carry a full
// client-side mock "backend" for shifts/attendance — a fixed roster of
// fictional employees (Peter Mwanga, Amina Hassan, ...), randomly-generated
// attendance/shift records, and useSyncExternalStore-based read/write hooks
// (useShiftAssignments, useAttendance, assignShift, markAttendance, ...).
// None of it was ever imported anywhere: HRM.tsx (the only consumer) only
// ever pulled these type names, ordinary real data always came from
// /v1/hr/attendance and /v1/hr/teams via apiFetch. Removed rather than left
// as dead weight a future edit could accidentally start relying on again.

export interface ShiftType {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  color: string;
}

export interface Employee {
  id: string;
  name: string;
  department: string;
  role: string;
  avatar?: string;
}

export interface ShiftAssignment {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  shiftId: string | null; // null = off/leave
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Half-Day' | 'On Leave';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  clockIn?: string; // HH:mm
  clockOut?: string; // HH:mm
  status: AttendanceStatus;
}
