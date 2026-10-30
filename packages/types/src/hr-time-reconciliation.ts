/** Attendance measures presence. Allocation ledgers may overlap and must not be added together. */
export interface HrTimeReconciliation {
  from: string;
  to: string;
  attendance_minutes: number;
  unknown_attendance_sessions: number;
  header_minutes: number;
  unknown_header_entries: number;
  task_minutes: number;
  unknown_task_entries: number;
  shipment_minutes: number;
  unlinked_shipment_entries: number;
  allocation_exceeds_attendance: boolean;
}
