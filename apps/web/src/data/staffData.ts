// Shared staff / employee reference data
// Imported by: HRM, ShipmentDetail, TopBar

export type EmpStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  dept: string;
  designation: string;
  role: string;
  status: EmpStatus;
  hireDate: string;
  /** The person's picture, when they have set one. Absent means initials. */
  avatarUrl?: string | null;
}

const COLORS = ['#e8461a', '#0891b2', '#7c3aed', '#059669', '#d97706', '#9333ea'] as const;

export function empAvatarColor(n: string): string {
  return COLORS[[...(n ?? '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
}

export function empInitials(n: string): string {
  return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export const EMPLOYEES: Employee[] = [
  { id: 'e1', name: 'Amina Hassan',  email: 'amina@moovit.co.tz',  phone: '+255 712 001 001', dept: 'Operations', designation: 'Clearing Officer',  role: 'Officer',  status: 'ACTIVE',   hireDate: '2023-03-15' },
  { id: 'e2', name: 'John Baraka',   email: 'john@moovit.co.tz',   phone: '+255 712 001 002', dept: 'Finance',    designation: 'Finance Manager',   role: 'Manager',  status: 'ACTIVE',   hireDate: '2022-01-10' },
  { id: 'e3', name: 'Grace Mwamba',  email: 'grace@moovit.co.tz',  phone: '+255 712 001 003', dept: 'Operations', designation: 'Senior Officer',    role: 'Officer',  status: 'ON_LEAVE', hireDate: '2021-07-20' },
  { id: 'e4', name: 'Said Ali',      email: 'said@moovit.co.tz',   phone: '+255 712 001 004', dept: 'IT',         designation: 'IT Manager',        role: 'Manager',  status: 'ACTIVE',   hireDate: '2020-05-01' },
  { id: 'e5', name: 'Fatuma Juma',   email: 'fatuma@moovit.co.tz', phone: '+255 712 001 005', dept: 'Operations', designation: 'Clearing Officer',  role: 'Officer',  status: 'ACTIVE',   hireDate: '2023-09-01' },
  { id: 'e6', name: 'David Mlay',    email: 'david@moovit.co.tz',  phone: '+255 712 001 006', dept: 'Finance',    designation: 'Accountant',        role: 'Finance',  status: 'ACTIVE',   hireDate: '2024-02-14' },
  { id: 'e7', name: 'Rose Kimaro',   email: 'rose@moovit.co.tz',   phone: '+255 712 001 007', dept: 'HR',         designation: 'HR Manager',        role: 'Manager',  status: 'ACTIVE',   hireDate: '2019-11-30' },
  { id: 'e8', name: 'Omar Shariff',  email: 'omar@moovit.co.tz',   phone: '+255 712 001 008', dept: 'Operations', designation: 'Logistics Officer', role: 'Officer',  status: 'INACTIVE', hireDate: '2022-08-12' },
];
