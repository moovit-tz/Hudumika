import { useSyncExternalStore } from 'react';

export interface FSItem {
  id: string;
  name: string;
  type: string;
  size?: number;
  fileCount?: number;
  modified: string;
  created: string;
  parentId: string | null;
  shared?: string[];
  starred?: boolean;
  color?: string;
  description?: string;
}

const SAMPLE: FSItem[] = [
  // Root folders
  { id:'F1', name:'Shipment Documents',   type:'folder', fileCount:47,  size:2_300_000_000, modified:'2025-02-14', created:'2024-01-01', parentId:null, color:'#f59e0b', description:'Bills of lading, manifests and cargo documents' },
  { id:'F2', name:'Invoices & Billing',   type:'folder', fileCount:234, size:4_800_000_000, modified:'2025-02-13', created:'2024-01-01', parentId:null, color:'#22c55e', description:'Customer invoices, payment receipts and billing records' },
  { id:'F3', name:'Customs Declarations', type:'folder', fileCount:89,  size:1_200_000_000, modified:'2025-02-12', created:'2024-01-01', parentId:null, color:'#3b82f6', description:'TANCIS declarations, customs entries and permits' },
  { id:'F4', name:'Purchase Orders',      type:'folder', fileCount:56,  size:  890_000_000, modified:'2025-02-11', created:'2024-01-01', parentId:null, color:'#a855f7', description:'Supplier purchase orders and goods receipts' },
  { id:'F5', name:'Contracts',            type:'folder', fileCount:23,  size:  450_000_000, modified:'2025-02-10', created:'2024-01-01', parentId:null, color:'#0891b2', description:'Client contracts and service agreements' },
  { id:'F6', name:'Clearance Reports',    type:'folder', fileCount:112, size:3_100_000_000, modified:'2025-02-09', created:'2024-01-01', parentId:null, color:'#ef4444', description:'Monthly and annual clearance summary reports' },
  { id:'F7', name:'Templates',            type:'folder', fileCount:18,  size:  220_000_000, modified:'2025-01-30', created:'2024-01-01', parentId:null, color:'#6b7280', description:'Document templates for common operations' },
  { id:'F8', name:'Client Documents',     type:'folder', fileCount:67,  size:1_700_000_000, modified:'2025-02-14', created:'2024-01-01', parentId:null, color:'#6366f1', description:'Client-specific document collections' },
  // Root files
  { id:'R1', name:'Q1_2025_Summary_Report.pdf',        type:'pdf',  size:2_300_000, modified:'2025-02-14', created:'2025-02-14', parentId:null, starred:true,  shared:['Amina Hassan','John Mwangi'] },
  { id:'R2', name:'Annual_Clearance_Stats_2024.xlsx',  type:'xlsx', size:1_800_000, modified:'2025-02-12', created:'2025-01-15', parentId:null, starred:false, shared:['Peter Kimani'] },
  { id:'R3', name:'Company_Profile.docx',              type:'docx', size:  850_000, modified:'2025-01-28', created:'2024-12-01', parentId:null, starred:false, shared:[] },
  { id:'R4', name:'Port_Procedures_Handbook.pdf',      type:'pdf',  size:4_200_000, modified:'2025-01-20', created:'2024-11-15', parentId:null, starred:true,  shared:['Fatuma Ally','Grace Osei','Amina Hassan'] },
  { id:'R5', name:'KPI_Dashboard_Feb2025.xlsx',        type:'xlsx', size:2_100_000, modified:'2025-02-10', created:'2025-02-10', parentId:null, starred:false, shared:['John Mwangi'] },
  // Shipment Documents (F1)
  { id:'S1', name:'BL_Summit_Traders_2025-001.pdf',    type:'pdf',  size: 450_000, modified:'2025-02-14', created:'2025-02-14', parentId:'F1', shared:['Amina Hassan'] },
  { id:'S2', name:'BL_Serengeti_Foods_2025-002.pdf',   type:'pdf',  size: 380_000, modified:'2025-02-13', created:'2025-02-13', parentId:'F1', starred:true },
  { id:'S3', name:'Cargo_Manifest_Jan2025.xlsx',       type:'xlsx', size: 920_000, modified:'2025-02-01', created:'2025-02-01', parentId:'F1' },
  { id:'S4', name:'Packing_List_EAC_001.docx',         type:'docx', size: 240_000, modified:'2025-01-28', created:'2025-01-28', parentId:'F1' },
  { id:'S5', name:'Insurance_Certificate_Jan.pdf',     type:'pdf',  size: 610_000, modified:'2025-01-25', created:'2025-01-25', parentId:'F1', shared:['Peter Kimani'] },
  { id:'S6', name:'Freight_Rate_Matrix_Q1.xlsx',       type:'xlsx', size:1_200_000, modified:'2025-01-20', created:'2025-01-20', parentId:'F1' },
  { id:'S7', name:'Vessel_Schedule_Feb2025.pdf',       type:'pdf',  size: 890_000, modified:'2025-02-08', created:'2025-02-08', parentId:'F1' },
  { id:'S8', name:'Arrival_Notice_KE_Cement.pdf',      type:'pdf',  size: 320_000, modified:'2025-02-12', created:'2025-02-12', parentId:'F1', starred:true },
  { id:'SF1',name:'Sea Freight',  type:'folder', fileCount:12, size:1_100_000_000, modified:'2025-02-01', created:'2024-06-01', parentId:'F1', color:'#f59e0b' },
  { id:'SF2',name:'Air Freight',  type:'folder', fileCount:8,  size:  540_000_000, modified:'2025-01-15', created:'2024-06-01', parentId:'F1', color:'#f59e0b' },
  // Invoices (F2)
  { id:'I1', name:'INV-2025-001_Summit_Traders.pdf',   type:'pdf',  size: 280_000, modified:'2025-02-14', created:'2025-02-14', parentId:'F2', shared:['Amina Hassan'] },
  { id:'I2', name:'INV-2025-002_Serengeti_Foods.pdf',  type:'pdf',  size: 295_000, modified:'2025-02-12', created:'2025-02-12', parentId:'F2' },
  { id:'I3', name:'Invoice_Register_Feb2025.xlsx',     type:'xlsx', size:1_400_000, modified:'2025-02-14', created:'2025-02-01', parentId:'F2', starred:true },
  { id:'I4', name:'Payment_Receipts_Jan2025.pdf',      type:'pdf',  size: 760_000, modified:'2025-02-05', created:'2025-02-05', parentId:'F2' },
  { id:'I5', name:'Duty_Payments_Q1_2025.xlsx',        type:'xlsx', size:2_200_000, modified:'2025-02-10', created:'2025-02-10', parentId:'F2', shared:['John Mwangi','Peter Kimani'] },
  { id:'I6', name:'Credit_Notes_Summary.docx',         type:'docx', size: 430_000, modified:'2025-01-31', created:'2025-01-31', parentId:'F2' },
  // Customs (F3)
  { id:'C1', name:'Declaration_TZ-2025-0341.pdf',      type:'pdf',  size: 520_000, modified:'2025-02-13', created:'2025-02-13', parentId:'F3' },
  { id:'C2', name:'Declaration_TZ-2025-0342.pdf',      type:'pdf',  size: 490_000, modified:'2025-02-12', created:'2025-02-12', parentId:'F3', starred:true },
  { id:'C3', name:'Customs_Entries_Jan2025.xlsx',      type:'xlsx', size:1_800_000, modified:'2025-02-05', created:'2025-02-05', parentId:'F3', shared:['Grace Osei'] },
  { id:'C4', name:'Import_Permits_Q1.pdf',             type:'pdf',  size: 670_000, modified:'2025-01-30', created:'2025-01-30', parentId:'F3' },
  { id:'C5', name:'Tariff_Classification_Guide.pdf',   type:'pdf',  size:3_400_000, modified:'2025-01-15', created:'2025-01-15', parentId:'F3', shared:['Amina Hassan','John Mwangi'] },
];

let items: FSItem[] = [...SAMPLE];

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return items;
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function useFiles() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function addFile(item: Omit<FSItem, 'id'>) {
  const id = `FILE_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  items = [...items, { ...item, id }];
  
  // If parent folder exists, increment fileCount
  if (item.parentId) {
    items = items.map(i => i.id === item.parentId && i.type === 'folder' 
      ? { ...i, fileCount: (i.fileCount || 0) + 1, size: (i.size || 0) + (item.size || 0) } 
      : i);
  }
  
  emit();
  return id;
}

export function addFolder(name: string, parentId: string | null = null, color = '#f59e0b') {
  // Check if folder already exists
  const existing = items.find(i => i.name === name && i.parentId === parentId && i.type === 'folder');
  if (existing) return existing.id;

  const id = `FOLDER_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const nf: FSItem = {
    id,
    name,
    type: 'folder',
    fileCount: 0,
    size: 0,
    modified: new Date().toISOString().split('T')[0],
    created: new Date().toISOString().split('T')[0],
    parentId,
    color,
  };
  items = [...items, nf];
  emit();
  return id;
}

export function deleteFile(id: string) {
  // If folder, technically should delete children, but keep it simple
  items = items.filter(i => i.id !== id);
  emit();
}

export function findFolderByName(name: string, parentId: string | null = null) {
  return items.find(i => i.name === name && i.parentId === parentId && i.type === 'folder');
}
