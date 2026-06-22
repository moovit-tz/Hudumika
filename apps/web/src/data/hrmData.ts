import { useSyncExternalStore } from 'react';

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

export const SHIFT_TYPES: ShiftType[] = [
  { id: 'MORN', name: 'Morning Shift', startTime: '06:00', endTime: '14:00', color: '#3b82f6' }, // Blue
  { id: 'DAY',  name: 'Day Shift',     startTime: '08:00', endTime: '17:00', color: '#22c55e' }, // Green
  { id: 'EVE',  name: 'Afternoon Shift', startTime: '14:00', endTime: '22:00', color: '#f59e0b' }, // Orange
  { id: 'NIGHT',name: 'Night Shift',   startTime: '22:00', endTime: '06:00', color: '#6366f1' }, // Indigo
];

export const EMPLOYEES: Employee[] = [
  { id: 'E1', name: 'Peter Mwanga', department: 'Logistics', role: 'Driver', avatar: 'PM' },
  { id: 'E2', name: 'Amina Hassan', department: 'Customs', role: 'Declaration Officer', avatar: 'AH' },
  { id: 'E3', name: 'John Makundi', department: 'Warehouse', role: 'Supervisor', avatar: 'JM' },
  { id: 'E4', name: 'Fatuma Ally', department: 'Finance', role: 'Accountant', avatar: 'FA' },
  { id: 'E5', name: 'Grace Osei', department: 'Operations', role: 'Coordinator', avatar: 'GO' },
  { id: 'E6', name: 'David Msonde', department: 'Logistics', role: 'Driver', avatar: 'DM' },
  { id: 'E7', name: 'Ali Hassan', department: 'Warehouse', role: 'Operator', avatar: 'AH' },
  { id: 'E8', name: 'Sara Kamau', department: 'Customs', role: 'Clerk', avatar: 'SK' },
];

// Seed some initial assignments for the current week
const generateInitialAssignments = () => {
  const assignments: ShiftAssignment[] = [];
  const today = new Date();
  
  for (const emp of EMPLOYEES) {
    for (let i = -7; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      
      // Randomly assign shifts or leave blank (off)
      const rand = Math.random();
      let shiftId: string | null = null;
      
      if (d.getDay() !== 0 && d.getDay() !== 6) { // Weekdays
        if (emp.department === 'Logistics') {
          shiftId = rand > 0.5 ? 'DAY' : (rand > 0.2 ? 'MORN' : 'NIGHT');
        } else if (emp.department === 'Warehouse') {
          shiftId = rand > 0.5 ? 'MORN' : 'EVE';
        } else {
          shiftId = 'DAY';
        }
      } else { // Weekends
        if (emp.department === 'Logistics' && rand > 0.7) {
          shiftId = 'DAY';
        }
      }
      
      if (shiftId) {
        assignments.push({
          id: `A_${emp.id}_${dateStr}`,
          employeeId: emp.id,
          date: dateStr,
          shiftId,
        });
      }
    }
  }
  return assignments;
};

let assignments: ShiftAssignment[] = generateInitialAssignments();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeShifts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAssignments() {
  return assignments;
}

export function useShiftAssignments() {
  return useSyncExternalStore(subscribeShifts, getAssignments);
}

export function assignShift(employeeId: string, date: string, shiftId: string | null) {
  // Remove existing assignment for this day
  assignments = assignments.filter(a => !(a.employeeId === employeeId && a.date === date));
  
  if (shiftId) {
    assignments = [...assignments, {
      id: `A_${Date.now()}_${Math.random()}`,
      employeeId,
      date,
      shiftId
    }];
  }
  
  emit();
}

export function assignBulkShifts(employeeIds: string[], startDate: string, endDate: string, shiftId: string | null) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let current = new Date(start);
  while (current <= end) {
    const dStr = current.toISOString().split('T')[0];
    
    employeeIds.forEach(empId => {
      // Remove existing
      assignments = assignments.filter(a => !(a.employeeId === empId && a.date === dStr));
      if (shiftId) {
        assignments.push({
          id: `A_${Date.now()}_${Math.random()}`,
          employeeId: empId,
          date: dStr,
          shiftId
        });
      }
    });
    
    current.setDate(current.getDate() + 1);
  }
  
  // recreate array to trigger re-render
  assignments = [...assignments];
  emit();
}

/* ── Attendances ── */

export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Half-Day' | 'On Leave';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  clockIn?: string; // HH:mm
  clockOut?: string; // HH:mm
  status: AttendanceStatus;
}

const generateInitialAttendance = () => {
  const records: AttendanceRecord[] = [];
  const today = new Date();
  
  for (const emp of EMPLOYEES) {
    for (let i = -30; i <= 0; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      
      // Skip weekends
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      
      const rand = Math.random();
      let status: AttendanceStatus = 'Present';
      let clockIn = '08:00';
      let clockOut = '17:00';
      
      if (rand > 0.9) {
        status = 'Absent';
        clockIn = '';
        clockOut = '';
      } else if (rand > 0.8) {
        status = 'Late';
        clockIn = '09:15';
      } else if (rand > 0.75) {
        status = 'Half-Day';
        clockOut = '13:00';
      } else if (rand > 0.7) {
        status = 'On Leave';
        clockIn = '';
        clockOut = '';
      } else {
        // slightly randomize times for present
        clockIn = `07:${50 + Math.floor(Math.random() * 9)}`;
        clockOut = `17:${Math.floor(Math.random() * 15).toString().padStart(2, '0')}`;
      }
      
      records.push({
        id: `ATT_${emp.id}_${dateStr}`,
        employeeId: emp.id,
        date: dateStr,
        clockIn,
        clockOut,
        status,
      });
    }
  }
  return records;
};

let attendanceRecords: AttendanceRecord[] = generateInitialAttendance();
const attListeners = new Set<() => void>();

function emitAtt() {
  for (const l of attListeners) l();
}

export function subscribeAttendance(listener: () => void) {
  attListeners.add(listener);
  return () => attListeners.delete(listener);
}

export function getAttendance() {
  return attendanceRecords;
}

export function useAttendance() {
  return useSyncExternalStore(subscribeAttendance, getAttendance);
}

export function markAttendance(record: AttendanceRecord) {
  attendanceRecords = attendanceRecords.filter(a => !(a.employeeId === record.employeeId && a.date === record.date));
  attendanceRecords.push({ ...record, id: record.id || `ATT_${Date.now()}` });
  emitAtt();
}

export function bulkMarkAttendance(employeeIds: string[], startDate: string, endDate: string, status: AttendanceStatus, clockIn?: string, clockOut?: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let current = new Date(start);
  while (current <= end) {
    const dStr = current.toISOString().split('T')[0];
    
    // Skip weekends for bulk unless specifically requested? Usually we skip weekends.
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      employeeIds.forEach(empId => {
        attendanceRecords = attendanceRecords.filter(a => !(a.employeeId === empId && a.date === dStr));
        attendanceRecords.push({
          id: `ATT_${Date.now()}_${Math.random()}`,
          employeeId: empId,
          date: dStr,
          status,
          clockIn: clockIn || '',
          clockOut: clockOut || ''
        });
      });
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  attendanceRecords = [...attendanceRecords];
  emitAtt();
}
