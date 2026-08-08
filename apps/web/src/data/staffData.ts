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

// Re-exported from the shared identity helpers rather than defined again here.
// This file had six colours and a sum-of-char-codes hash; ClearOS and CRM had
// seven colours and a shift-hash. Four out of five real names resolved to
// different colours depending on which app you were looking at.
export { nameColor as empAvatarColor, nameInitials as empInitials } from '../lib/identity.js';

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
