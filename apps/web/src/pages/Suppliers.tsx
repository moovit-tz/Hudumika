import React, { useState, useMemo } from 'react';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { Icon } from '../components/Icon.js';
import { useCurrency } from '../hooks/useCurrency.js';

// ── Types ──────────────────────────────────────────────────────────────────────

type SupCat = 'SHIPPING_LINE'|'FREIGHT_FORWARDER'|'CUSTOMS_AGENT'|'TRANSPORTER'|'PORT_AGENT'|'WAREHOUSE'|'INSURANCE'|'GOVERNMENT'|'CONSULTANT'|'OTHER';
type KycStatus = 'VERIFIED'|'PENDING'|'EXPIRED'|'REJECTED';
type SupStatus = 'ACTIVE'|'INACTIVE'|'SUSPENDED'|'PENDING_KYC';
type ConStatus = 'ACTIVE'|'EXPIRED'|'DRAFT'|'TERMINATED';
type DocStatus = 'VERIFIED'|'PENDING'|'REJECTED';
type TktStatus = 'OPEN'|'IN_PROGRESS'|'RESOLVED'|'CLOSED';
type TktPriority = 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
type ExpStatus = 'PAID'|'PENDING'|'DISPUTED';
type POStatus = 'DRAFT'|'POSTED'|'PAID'|'PARTIAL';

export interface Supplier {
  id: string; name: string; code: string; category: SupCat; status: SupStatus;
  contact_person: string; email: string; phone: string; website?: string;
  address: string; city: string; country: string;
  payment_terms: string; currency: string; tax_id?: string; reg_number?: string;
  bank_name?: string; bank_account?: string; bank_swift?: string;
  kyc_status: KycStatus; kyc_expiry?: string; compliance_notes?: string;
  rating: number; on_time_rate: number; quality_score: number; dispute_count: number;
  total_spend: number; services: string[]; created_at: string; updated_at?: string;
}
interface Contract { id: string; supplier_id: string; title: string; contract_number: string; type: string; value: number; currency: string; start_date: string; end_date: string; status: ConStatus; notes?: string; created_at: string; }
interface SupDoc { id: string; supplier_id: string; name: string; doc_type: string; reference?: string; shipment_ref?: string; status: DocStatus; received_at: string; expiry_date?: string; }
interface SupTicket { id: string; supplier_id: string; title: string; category: string; status: TktStatus; priority: TktPriority; description: string; shipment_ref?: string; created_at: string; resolved_at?: string; }
interface SupExpense { id: string; supplier_id: string; name: string; amount: number; currency: string; date: string; category: string; shipment_ref?: string; payment_mode: string; reference: string; status: ExpStatus; }
interface SupPO { id: string; supplier_id: string; po_number: string; date: string; due_date: string; items_count: number; total: number; currency: string; status: POStatus; shipment_ref?: string; }
interface SupForm { name: string; code: string; category: SupCat; status: SupStatus; contact_person: string; email: string; phone: string; website: string; address: string; city: string; country: string; payment_terms: string; currency: string; tax_id: string; reg_number: string; bank_name: string; bank_account: string; bank_swift: string; kyc_status: KycStatus; kyc_expiry: string; compliance_notes: string; services: string[]; }

// ── Config ─────────────────────────────────────────────────────────────────────

const CAT_CFG: Record<SupCat, { label: string; color: string; bg: string }> = {
  SHIPPING_LINE:    { label: 'Shipping Line',     color: 'var(--blue)',   bg: 'var(--blue-l)'   },
  FREIGHT_FORWARDER:{ label: 'Freight Forwarder', color: 'var(--teal)',   bg: 'var(--teal-l)'   },
  CUSTOMS_AGENT:    { label: 'Customs Agent',     color: 'var(--navy)',   bg: '#eef2ff'         },
  TRANSPORTER:      { label: 'Transporter',       color: 'var(--gold)',   bg: 'var(--gold-l)'   },
  PORT_AGENT:       { label: 'Port Agent',        color: 'var(--orange)', bg: '#fff7ed'         },
  WAREHOUSE:        { label: 'Warehouse',         color: 'var(--green)',  bg: 'var(--green-l)'  },
  INSURANCE:        { label: 'Insurance',         color: '#6e40c9',       bg: '#f3eeff'         },
  GOVERNMENT:       { label: 'Government',        color: 'var(--red)',    bg: 'var(--red-l)'    },
  CONSULTANT:       { label: 'Consultant',        color: 'var(--ink2)',   bg: 'var(--bg)'       },
  OTHER:            { label: 'Other',             color: 'var(--ink3)',   bg: 'var(--bg)'       },
};
const KYC_CFG: Record<KycStatus, { label: string; color: string; bg: string }> = {
  VERIFIED: { label: 'Verified',  color: 'var(--green)', bg: 'var(--green-l)' },
  PENDING:  { label: 'Pending',   color: 'var(--gold)',  bg: 'var(--gold-l)'  },
  EXPIRED:  { label: 'Expired',   color: 'var(--red)',   bg: 'var(--red-l)'   },
  REJECTED: { label: 'Rejected',  color: 'var(--red)',   bg: '#ffeef0'        },
};
const SUP_STATUS_CFG: Record<SupStatus, { label: string; color: string; bg: string }> = {
  ACTIVE:      { label: 'Active',      color: 'var(--green)', bg: 'var(--green-l)' },
  INACTIVE:    { label: 'Inactive',    color: 'var(--ink3)',  bg: 'var(--bg)'      },
  SUSPENDED:   { label: 'Suspended',   color: 'var(--red)',   bg: 'var(--red-l)'   },
  PENDING_KYC: { label: 'Pending KYC', color: 'var(--gold)',  bg: 'var(--gold-l)'  },
};
const CON_STATUS_CFG: Record<ConStatus, { color: string; bg: string }> = {
  ACTIVE:     { color: 'var(--green)', bg: 'var(--green-l)' },
  EXPIRED:    { color: 'var(--red)',   bg: 'var(--red-l)'   },
  DRAFT:      { color: 'var(--ink3)', bg: 'var(--bg)'      },
  TERMINATED: { color: 'var(--ink2)', bg: 'var(--bg)'      },
};
const PO_CFG: Record<POStatus, { color: string; bg: string }> = {
  DRAFT:   { color: 'var(--ink3)', bg: 'var(--bg)'       },
  POSTED:  { color: 'var(--blue)', bg: 'var(--blue-l)'   },
  PAID:    { color: 'var(--green)',bg: 'var(--green-l)'  },
  PARTIAL: { color: 'var(--gold)', bg: 'var(--gold-l)'   },
};
const TKT_PRIORITY_CFG: Record<TktPriority, { color: string }> = {
  LOW:      { color: 'var(--ink3)'   },
  MEDIUM:   { color: 'var(--gold)'   },
  HIGH:     { color: 'var(--orange)' },
  CRITICAL: { color: 'var(--red)'    },
};
const TKT_STATUS_CFG: Record<TktStatus, { color: string; bg: string }> = {
  OPEN:        { color: 'var(--red)',   bg: 'var(--red-l)'   },
  IN_PROGRESS: { color: 'var(--gold)',  bg: 'var(--gold-l)'  },
  RESOLVED:    { color: 'var(--green)', bg: 'var(--green-l)' },
  CLOSED:      { color: 'var(--ink3)', bg: 'var(--bg)'      },
};

const ALL_CATS = Object.keys(CAT_CFG) as SupCat[];
const PAYMENT_TERMS = ['Net 15','Net 30','Net 45','Net 60','COD','Advance','Net 90'];
const CURRENCIES = ['USD','TZS','EUR','GBP','KES'];
const SERVICE_OPTIONS = ['FREIGHT','CLEARANCE','HANDLING','TRANSPORT','DUTY','INSURANCE','OTHER'];

// ── Mock Data ──────────────────────────────────────────────────────────────────

export const MOCK_SUPPLIERS: Supplier[] = [
  { id:'sup-001', name:'Maersk Line Tanzania', code:'SUP-001', category:'SHIPPING_LINE', status:'ACTIVE', contact_person:'Thomas Andersen', email:'thomas.andersen@maersk.co.tz', phone:'+255 22 219 0010', website:'www.maersk.com', address:'Msasani Road, Kinondoni', city:'Dar es Salaam', country:'Tanzania', payment_terms:'Net 30', currency:'USD', tax_id:'150-098-001', reg_number:'REG-2005-0018', bank_name:'CRDB Bank', bank_account:'0150194123001', bank_swift:'CORUTZTZ', kyc_status:'VERIFIED', kyc_expiry:'2027-03-01', compliance_notes:'Global shipping line, fully vetted 2024.', rating:4.5, on_time_rate:94, quality_score:92, dispute_count:2, total_spend:2400000, services:['FREIGHT'], created_at:'2024-01-15T08:00:00Z' },
  { id:'sup-002', name:'Tanzania Ports Authority (TPA)', code:'SUP-002', category:'GOVERNMENT', status:'ACTIVE', contact_person:'Port Operations Dept', email:'operations@tpa.go.tz', phone:'+255 22 211 0501', website:'www.tpa.go.tz', address:'Bandari Street, Ilala', city:'Dar es Salaam', country:'Tanzania', payment_terms:'Advance', currency:'TZS', tax_id:'GOV-TPA-001', reg_number:'TPA-CORP-1977', bank_name:'Bank of Tanzania', bank_account:'BOT-GOVT-0001', kyc_status:'VERIFIED', kyc_expiry:'2028-01-01', compliance_notes:'Statutory government authority.', rating:3.8, on_time_rate:78, quality_score:80, dispute_count:8, total_spend:3600000, services:['HANDLING','CLEARANCE'], created_at:'2023-06-01T08:00:00Z' },
  { id:'sup-003', name:'M&G Customs Clearance Ltd', code:'SUP-003', category:'CUSTOMS_AGENT', status:'ACTIVE', contact_person:'Mohammed Gulamali', email:'m.gulamali@mgcustoms.co.tz', phone:'+255 754 112 345', address:'Pamba Road, Upanga West', city:'Dar es Salaam', country:'Tanzania', payment_terms:'Net 15', currency:'TZS', tax_id:'152-043-090', reg_number:'REG-2011-0234', bank_name:'NMB Bank', bank_account:'40720199801', bank_swift:'NMIBTZTZ', kyc_status:'VERIFIED', kyc_expiry:'2026-12-31', compliance_notes:'Licensed TRA clearing agent, excellent track record.', rating:4.7, on_time_rate:97, quality_score:96, dispute_count:0, total_spend:840000, services:['CLEARANCE'], created_at:'2023-03-20T08:00:00Z' },
  { id:'sup-004', name:'Dar Transport Solutions Ltd', code:'SUP-004', category:'TRANSPORTER', status:'ACTIVE', contact_person:'Baraka Msomi', email:'b.msomi@dartransport.co.tz', phone:'+255 713 990 211', address:'Ubungo Terminus, Plot 4', city:'Dar es Salaam', country:'Tanzania', payment_terms:'COD', currency:'TZS', tax_id:'152-077-210', reg_number:'REG-2018-0879', bank_name:'Equity Bank', bank_account:'1770200198401', kyc_status:'PENDING', compliance_notes:'KYC renewal submitted 2026-05-01, under review.', rating:3.9, on_time_rate:85, quality_score:82, dispute_count:3, total_spend:480000, services:['TRANSPORT'], created_at:'2024-05-10T08:00:00Z' },
  { id:'sup-005', name:'Port Bonded Warehouses Ltd', code:'SUP-005', category:'WAREHOUSE', status:'ACTIVE', contact_person:'Yasmin Rashidi', email:'y.rashidi@pbwl.co.tz', phone:'+255 22 214 9901', address:'Industrial Area, Plot 23', city:'Dar es Salaam', country:'Tanzania', payment_terms:'Net 30', currency:'USD', tax_id:'152-055-340', reg_number:'REG-2009-0512', bank_name:'Standard Chartered', bank_account:'0102987654321', bank_swift:'SCBLTZTX', kyc_status:'VERIFIED', kyc_expiry:'2027-06-15', compliance_notes:'TANCIS-registered bonded facility.', rating:4.2, on_time_rate:90, quality_score:88, dispute_count:1, total_spend:360000, services:['OTHER'], created_at:'2023-08-01T08:00:00Z' },
  { id:'sup-006', name:'DHL Global Forwarding Tanzania', code:'SUP-006', category:'FREIGHT_FORWARDER', status:'ACTIVE', contact_person:'Anita Patel', email:'anita.patel@dhl.co.tz', phone:'+255 22 211 3344', website:'www.dhl.com/tz', address:'Julius Nyerere Rd, Kivukoni', city:'Dar es Salaam', country:'Tanzania', payment_terms:'Net 45', currency:'USD', tax_id:'150-031-119', reg_number:'REG-2001-0099', bank_name:'Citibank Tanzania', bank_account:'3620178100191', bank_swift:'CITITZTZ', kyc_status:'VERIFIED', kyc_expiry:'2027-09-01', compliance_notes:'IATA & FIATA member, global freight forwarder.', rating:4.6, on_time_rate:95, quality_score:93, dispute_count:1, total_spend:1800000, services:['FREIGHT','CLEARANCE','TRANSPORT'], created_at:'2023-01-10T08:00:00Z' },
  { id:'sup-007', name:'UAP Old Mutual Cargo Insurance', code:'SUP-007', category:'INSURANCE', status:'ACTIVE', contact_person:'Samuel Ochieng', email:'s.ochieng@uapoldmutual.co.tz', phone:'+255 22 211 7744', website:'www.uapoldmutual.com', address:'Amani Place, Garden Avenue', city:'Dar es Salaam', country:'Tanzania', payment_terms:'Net 30', currency:'USD', tax_id:'150-066-228', reg_number:'REG-2007-0301', bank_name:'NMB Bank', bank_account:'40320500118', bank_swift:'NMIBTZTZ', kyc_status:'VERIFIED', kyc_expiry:'2028-02-28', compliance_notes:'Licensed by TIRA, A-rated insurer.', rating:4.4, on_time_rate:99, quality_score:97, dispute_count:0, total_spend:240000, services:['INSURANCE'], created_at:'2023-02-28T08:00:00Z' },
  { id:'sup-008', name:'Freight Link Consolidators', code:'SUP-008', category:'FREIGHT_FORWARDER', status:'SUSPENDED', contact_person:'Juma Hassan', email:'j.hassan@freightlink.co.tz', phone:'+255 786 449 012', address:'Kariakoo Area, Shop 14', city:'Dar es Salaam', country:'Tanzania', payment_terms:'Advance', currency:'USD', tax_id:'152-099-401', reg_number:'REG-2015-1102', bank_name:'Azania Bank', bank_account:'0188203341', kyc_status:'EXPIRED', kyc_expiry:'2025-12-31', compliance_notes:'SUSPENDED: KYC expired 2025-12-31. Multiple delivery disputes pending.', rating:2.8, on_time_rate:61, quality_score:55, dispute_count:7, total_spend:320000, services:['FREIGHT'], created_at:'2024-02-14T08:00:00Z', updated_at:'2026-01-15T08:00:00Z' },
];

const MOCK_CONTRACTS: Contract[] = [
  { id:'con-001', supplier_id:'sup-001', title:'Annual Shipping Agreement 2026', contract_number:'MSK-2026-AGR-001', type:'Framework Agreement', value:2400000, currency:'USD', start_date:'2026-01-01', end_date:'2026-12-31', status:'ACTIVE', notes:'Covers all FCL shipments via Dar es Salaam port.', created_at:'2025-12-15T00:00:00Z' },
  { id:'con-002', supplier_id:'sup-003', title:'Customs Clearance Retainer Agreement', contract_number:'MGC-2026-RET-002', type:'Retainer', value:960000000, currency:'TZS', start_date:'2026-03-01', end_date:'2027-02-28', status:'ACTIVE', notes:'Monthly retainer for all customs declarations.', created_at:'2026-02-20T00:00:00Z' },
  { id:'con-003', supplier_id:'sup-006', title:'Air & Sea Freight Forwarding MOU', contract_number:'DHL-2026-MOU-003', type:'MOU', value:1800000, currency:'USD', start_date:'2026-06-01', end_date:'2027-05-31', status:'ACTIVE', notes:'Preferred forwarder for all air cargo and LCL.', created_at:'2026-05-25T00:00:00Z' },
  { id:'con-004', supplier_id:'sup-004', title:'Inland Transport Framework 2026', contract_number:'DTS-2026-FWK-004', type:'Framework Agreement', value:1200000000, currency:'TZS', start_date:'2026-01-01', end_date:'2026-12-31', status:'ACTIVE', notes:'Covers all local and upcountry deliveries.', created_at:'2025-12-20T00:00:00Z' },
  { id:'con-005', supplier_id:'sup-008', title:'LCL Consolidation Service Level Agreement', contract_number:'FLC-2026-SLA-005', type:'SLA', value:240000, currency:'USD', start_date:'2026-01-01', end_date:'2026-05-31', status:'TERMINATED', notes:'TERMINATED due to repeated SLA breaches and KYC failure.', created_at:'2025-12-30T00:00:00Z' },
];

const MOCK_DOCS: SupDoc[] = [
  { id:'doc-001', supplier_id:'sup-001', name:'Certificate of Incorporation', doc_type:'Registration', reference:'CI-MAERSK-TZ-2005', status:'VERIFIED', received_at:'2024-01-15T00:00:00Z' },
  { id:'doc-002', supplier_id:'sup-001', name:'Tax Clearance Certificate 2025', doc_type:'Tax', reference:'TRA-TCC-2025-001', status:'VERIFIED', received_at:'2025-12-01T00:00:00Z', expiry_date:'2026-12-01' },
  { id:'doc-003', supplier_id:'sup-001', name:'Bill of Lading — CLR-2026-0001', doc_type:'Shipping Document', reference:'BL-MSK-20260110', shipment_ref:'CLR-2026-0001', status:'VERIFIED', received_at:'2026-01-10T00:00:00Z' },
  { id:'doc-004', supplier_id:'sup-002', name:'TPA Invoice #TPA-2026-010', doc_type:'Invoice', reference:'TPA-2026-010', shipment_ref:'CLR-2026-0001', status:'VERIFIED', received_at:'2026-01-12T00:00:00Z' },
  { id:'doc-005', supplier_id:'sup-002', name:'Port Congestion Advisory Notice', doc_type:'Notice', reference:'TPA-PCN-2026-003', status:'PENDING', received_at:'2026-02-14T00:00:00Z' },
  { id:'doc-006', supplier_id:'sup-002', name:'Weighbridge Certificate — CLR-2026-0003', doc_type:'Certificate', reference:'WBC-2026-0198', shipment_ref:'CLR-2026-0003', status:'VERIFIED', received_at:'2026-03-05T00:00:00Z' },
  { id:'doc-007', supplier_id:'sup-003', name:'Customs Entry Form CE-2026-001', doc_type:'Declaration', reference:'CE-2026-001', shipment_ref:'CLR-2026-0001', status:'VERIFIED', received_at:'2026-01-14T00:00:00Z' },
  { id:'doc-008', supplier_id:'sup-003', name:'TANSAD Declaration TD-2026-047', doc_type:'Declaration', reference:'TD-2026-047', shipment_ref:'CLR-2026-0002', status:'VERIFIED', received_at:'2026-02-05T00:00:00Z' },
  { id:'doc-009', supplier_id:'sup-003', name:'TISCAN Clearing License 2026', doc_type:'License', reference:'TISCAN-LIC-2026-MGC', status:'VERIFIED', received_at:'2026-01-03T00:00:00Z', expiry_date:'2026-12-31' },
  { id:'doc-010', supplier_id:'sup-004', name:'Fleet Vehicle Registration Certificates', doc_type:'Registration', reference:'MVRA-FLEET-DTS-2026', status:'PENDING', received_at:'2026-05-01T00:00:00Z' },
  { id:'doc-011', supplier_id:'sup-004', name:'Transport Invoice RT-2026-012', doc_type:'Invoice', reference:'RT-2026-012', shipment_ref:'CLR-2026-0003', status:'PENDING', received_at:'2026-03-08T00:00:00Z' },
  { id:'doc-012', supplier_id:'sup-005', name:'Bonded Warehouse License — TPA', doc_type:'License', reference:'TPA-BWL-2026-PBWL', status:'VERIFIED', received_at:'2026-01-05T00:00:00Z', expiry_date:'2027-06-15' },
  { id:'doc-013', supplier_id:'sup-005', name:'Storage Invoice WH-2026-008', doc_type:'Invoice', reference:'WH-2026-008', shipment_ref:'CLR-2026-0001', status:'VERIFIED', received_at:'2026-01-20T00:00:00Z' },
  { id:'doc-014', supplier_id:'sup-006', name:'FIATA Membership Certificate 2026', doc_type:'Certificate', reference:'FIATA-TZ-DHL-2026', status:'VERIFIED', received_at:'2026-01-08T00:00:00Z', expiry_date:'2027-09-01' },
  { id:'doc-015', supplier_id:'sup-006', name:'AWB #DHL-2026-190441', doc_type:'Air Waybill', reference:'DHL-2026-190441', shipment_ref:'CLR-2026-0004', status:'VERIFIED', received_at:'2026-05-12T00:00:00Z' },
  { id:'doc-016', supplier_id:'sup-006', name:'Air Freight Invoice DHL-INV-2026-0044', doc_type:'Invoice', reference:'DHL-INV-2026-0044', shipment_ref:'CLR-2026-0004', status:'VERIFIED', received_at:'2026-05-15T00:00:00Z' },
  { id:'doc-017', supplier_id:'sup-007', name:'Marine Insurance Policy MAP-2026-0019', doc_type:'Insurance Policy', reference:'MAP-2026-0019', shipment_ref:'CLR-2026-0002', status:'VERIFIED', received_at:'2026-02-01T00:00:00Z' },
  { id:'doc-018', supplier_id:'sup-007', name:'Insurance Certificate IC-2026-0019', doc_type:'Certificate', reference:'IC-2026-0019', status:'VERIFIED', received_at:'2026-02-03T00:00:00Z' },
  { id:'doc-019', supplier_id:'sup-008', name:'KYC Identity Documents (Expired)', doc_type:'KYC', reference:'KYC-FLC-2025', status:'REJECTED', received_at:'2025-11-01T00:00:00Z', expiry_date:'2025-12-31' },
  { id:'doc-020', supplier_id:'sup-008', name:'LCL Invoice FL-2026-001', doc_type:'Invoice', reference:'FL-2026-001', shipment_ref:'CLR-2026-0005', status:'VERIFIED', received_at:'2026-01-08T00:00:00Z' },
];

const MOCK_TICKETS: SupTicket[] = [
  { id:'tkt-001', supplier_id:'sup-001', title:'Demurrage dispute — extra days charged', category:'Billing', status:'RESOLVED', priority:'HIGH', description:'Maersk charged 4 extra demurrage days on CLR-2026-0001 containers that had already been released. Credit note requested.', shipment_ref:'CLR-2026-0001', created_at:'2026-01-22T00:00:00Z', resolved_at:'2026-02-05T00:00:00Z' },
  { id:'tkt-002', supplier_id:'sup-001', title:'Vessel ETA changed without notification', category:'Operations', status:'CLOSED', priority:'MEDIUM', description:'MV Mathilde Maersk ETA shifted by 3 days without advance notice. Caused warehouse and transport rescheduling costs.', created_at:'2026-02-18T00:00:00Z', resolved_at:'2026-02-20T00:00:00Z' },
  { id:'tkt-003', supplier_id:'sup-002', title:'TANCIS system downtime causing clearance delay', category:'System', status:'IN_PROGRESS', priority:'HIGH', description:'Repeated TANCIS portal outages (3+ hours) delaying customs entry submissions and increasing port storage costs.', created_at:'2026-03-10T00:00:00Z' },
  { id:'tkt-004', supplier_id:'sup-002', title:'THC overcharge on 3 containers — CLR-2026-0002', category:'Billing', status:'OPEN', priority:'CRITICAL', description:'TPA charged THC at $350/container instead of the contracted $250. Three containers affected. Formal dispute raised.', shipment_ref:'CLR-2026-0002', created_at:'2026-02-28T00:00:00Z' },
  { id:'tkt-005', supplier_id:'sup-003', title:'Late document submission — customs entry', category:'Compliance', status:'RESOLVED', priority:'LOW', description:'CE form submitted 6 hours after agreed deadline on CLR-2026-0001. No penalty incurred. Process reviewed.', created_at:'2026-01-16T00:00:00Z', resolved_at:'2026-01-17T00:00:00Z' },
  { id:'tkt-006', supplier_id:'sup-003', title:'TANSAD amendment — HS code correction', category:'Documentation', status:'CLOSED', priority:'MEDIUM', description:'HS code error on initial TANSAD for CLR-2026-0002. Amendment filed and approved. No duty impact.', shipment_ref:'CLR-2026-0002', created_at:'2026-02-10T00:00:00Z', resolved_at:'2026-02-12T00:00:00Z' },
  { id:'tkt-007', supplier_id:'sup-004', title:'Driver delay — CLR-2026-0003 delivery missed SLA', category:'Operations', status:'IN_PROGRESS', priority:'HIGH', description:'Truck arrived 4 hours late for container pickup, causing consignee to miss unloading window. Penalty clause invoked.', shipment_ref:'CLR-2026-0003', created_at:'2026-03-14T00:00:00Z' },
  { id:'tkt-008', supplier_id:'sup-004', title:'Vehicle breakdown on Morogoro highway', category:'Operations', status:'RESOLVED', priority:'MEDIUM', description:'Primary truck broke down en route. Cargo secured and transferred to backup vehicle within 3 hours.', created_at:'2026-02-22T00:00:00Z', resolved_at:'2026-02-23T00:00:00Z' },
  { id:'tkt-009', supplier_id:'sup-005', title:'Storage overcharge — 2 extra days billed', category:'Billing', status:'RESOLVED', priority:'MEDIUM', description:'Bonded warehouse billed for 7 days; cargo collected on day 5. Credit issued after confirmation.', created_at:'2026-01-28T00:00:00Z', resolved_at:'2026-02-02T00:00:00Z' },
  { id:'tkt-010', supplier_id:'sup-005', title:'Access request delay — goods inspection', category:'Operations', status:'CLOSED', priority:'LOW', description:'Requested access for insurance surveyor; approval took 2 days vs SLA of 4 hours.', created_at:'2026-03-01T00:00:00Z', resolved_at:'2026-03-04T00:00:00Z' },
  { id:'tkt-011', supplier_id:'sup-006', title:'Air freight tracking not updating', category:'System', status:'CLOSED', priority:'LOW', description:'DHL tracking portal showed no updates for 18 hours on CLR-2026-0004 AWB. Issue was system-side, resolved.', shipment_ref:'CLR-2026-0004', created_at:'2026-05-13T00:00:00Z', resolved_at:'2026-05-14T00:00:00Z' },
  { id:'tkt-012', supplier_id:'sup-006', title:'Customs hold — missing phytosanitary cert', category:'Compliance', status:'RESOLVED', priority:'HIGH', description:'Air cargo CLR-2026-0004 held at JNIA due to missing phytosanitary certificate. DHL obtained expedited cert within 24hr.', shipment_ref:'CLR-2026-0004', created_at:'2026-05-16T00:00:00Z', resolved_at:'2026-05-17T00:00:00Z' },
  { id:'tkt-013', supplier_id:'sup-007', title:'Insurance claim — water damage to cargo', category:'Claims', status:'IN_PROGRESS', priority:'HIGH', description:'Partial water damage discovered at destination for CLR-2026-0002. Claim filed under policy MAP-2026-0019. Surveyor appointed.', shipment_ref:'CLR-2026-0002', created_at:'2026-03-20T00:00:00Z' },
  { id:'tkt-014', supplier_id:'sup-007', title:'Annual policy renewal — confirmation needed', category:'Administrative', status:'RESOLVED', priority:'LOW', description:'Confirmed renewal of marine cargo open cover policy. New policy effective 2026-03-01.', created_at:'2026-02-25T00:00:00Z', resolved_at:'2026-02-28T00:00:00Z' },
  { id:'tkt-015', supplier_id:'sup-008', title:'KYC non-compliance — account suspended', category:'Compliance', status:'OPEN', priority:'CRITICAL', description:'Freight Link Consolidators failed to renew KYC by 2025-12-31 deadline. Account suspended pending valid documentation.', created_at:'2026-01-02T00:00:00Z' },
  { id:'tkt-016', supplier_id:'sup-008', title:'Delivery dispute — CLR-2026-0005 goods shortfall', category:'Billing', status:'OPEN', priority:'HIGH', description:'3 cartons missing at delivery for CLR-2026-0005. Supplier claims full delivery; consignee disputes. Under investigation.', shipment_ref:'CLR-2026-0005', created_at:'2026-01-10T00:00:00Z' },
];

export const MOCK_SUP_EXPENSES: SupExpense[] = [
  { id:'esup-001', supplier_id:'sup-002', name:'TPA Port Entry Fee', amount:580000, currency:'TZS', date:'2026-01-12', category:'PORT_CHARGES', shipment_ref:'CLR-2026-0001', payment_mode:'Bank Transfer', reference:'TPA-99182', status:'PAID' },
  { id:'esup-002', supplier_id:'sup-003', name:'Customs Processing Fee', amount:420000, currency:'TZS', date:'2026-01-14', category:'CUSTOMS_DUTY', shipment_ref:'CLR-2026-0001', payment_mode:'Bank Transfer', reference:'MGC-INV-0041', status:'PAID' },
  { id:'esup-003', supplier_id:'sup-002', name:'Container THC — 3×20ft FCL', amount:1050000, currency:'TZS', date:'2026-02-06', category:'HANDLING', shipment_ref:'CLR-2026-0002', payment_mode:'Bank Transfer', reference:'TPA-THC-2026-008', status:'PAID' },
  { id:'esup-004', supplier_id:'sup-004', name:'Transport Delivery — Ubungo to Mikocheni', amount:280000, currency:'TZS', date:'2026-03-14', category:'TRANSPORT', shipment_ref:'CLR-2026-0003', payment_mode:'Mobile Money', reference:'DTS-RT-2026-012', status:'PAID' },
  { id:'esup-005', supplier_id:'sup-007', name:'Marine Insurance Premium', amount:480, currency:'USD', date:'2026-02-03', category:'AGENT_FEE', shipment_ref:'CLR-2026-0002', payment_mode:'Bank Transfer', reference:'UAP-IC-2026-0019', status:'PAID' },
  { id:'esup-006', supplier_id:'sup-005', name:'Bonded Storage Charges — 5 days', amount:125, currency:'USD', date:'2026-01-20', category:'MISCELLANEOUS', shipment_ref:'CLR-2026-0001', payment_mode:'Bank Transfer', reference:'PBWL-WH-2026-008', status:'PAID' },
  { id:'esup-007', supplier_id:'sup-006', name:'DHL Air Freight Bill', amount:4900, currency:'USD', date:'2026-05-15', category:'FREIGHT', shipment_ref:'CLR-2026-0004', payment_mode:'Bank Transfer', reference:'DHL-INV-2026-0044', status:'PAID' },
  { id:'esup-008', supplier_id:'sup-002', name:'Port X-Ray Scanning Fee', amount:115000, currency:'TZS', date:'2026-03-05', category:'INSPECTION_FEE', shipment_ref:'CLR-2026-0003', payment_mode:'Bank Transfer', reference:'TPA-SCAN-2026-014', status:'PAID' },
  { id:'esup-009', supplier_id:'sup-003', name:'Customs Duty — TANSAD TD-2026-047', amount:890000, currency:'TZS', date:'2026-02-10', category:'CUSTOMS_DUTY', shipment_ref:'CLR-2026-0002', payment_mode:'Bank Transfer', reference:'TD-2026-047-DUTY', status:'PAID' },
  { id:'esup-010', supplier_id:'sup-001', name:'Maersk THC — FCL Discharge', amount:750, currency:'USD', date:'2026-01-11', category:'HANDLING', shipment_ref:'CLR-2026-0001', payment_mode:'Bank Transfer', reference:'MSK-THC-2026-001', status:'PAID' },
];

const MOCK_POS: SupPO[] = [
  { id:'posup-001', supplier_id:'sup-001', po_number:'PO-2026-001', date:'2026-01-10', due_date:'2026-02-10', items_count:2, total:1800, currency:'USD', status:'PAID', shipment_ref:'CLR-2026-0001' },
  { id:'posup-002', supplier_id:'sup-003', po_number:'PO-2026-002', date:'2026-01-13', due_date:'2026-01-28', items_count:3, total:420000, currency:'TZS', status:'PAID', shipment_ref:'CLR-2026-0001' },
  { id:'posup-003', supplier_id:'sup-004', po_number:'PO-2026-003', date:'2026-03-10', due_date:'2026-03-10', items_count:1, total:280000, currency:'TZS', status:'PAID', shipment_ref:'CLR-2026-0003' },
  { id:'posup-004', supplier_id:'sup-006', po_number:'PO-2026-004', date:'2026-05-10', due_date:'2026-06-24', items_count:4, total:4900, currency:'USD', status:'POSTED', shipment_ref:'CLR-2026-0004' },
  { id:'posup-005', supplier_id:'sup-002', po_number:'PO-2026-005', date:'2026-02-05', due_date:'2026-02-05', items_count:3, total:1745000, currency:'TZS', status:'PAID', shipment_ref:'CLR-2026-0002' },
  { id:'posup-006', supplier_id:'sup-005', po_number:'PO-2026-006', date:'2026-01-12', due_date:'2026-02-12', items_count:1, total:125, currency:'USD', status:'PAID', shipment_ref:'CLR-2026-0001' },
  { id:'posup-007', supplier_id:'sup-007', po_number:'PO-2026-007', date:'2026-02-01', due_date:'2026-03-03', items_count:1, total:480, currency:'USD', status:'PAID', shipment_ref:'CLR-2026-0002' },
  { id:'posup-008', supplier_id:'sup-003', po_number:'PO-2026-008', date:'2026-02-08', due_date:'2026-02-23', items_count:2, total:890000, currency:'TZS', status:'PAID', shipment_ref:'CLR-2026-0002' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number, cur = 'USD') { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: cur === 'TZS' ? 0 : 2, minimumFractionDigits: 0 }).format(n); } catch { return `${cur} ${n}`; } }
function fmtDate(d?: string | null) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function genId() { return 'sup-' + Math.random().toString(36).slice(2, 9); }
function genCode(existing: Supplier[]) { return `SUP-${String(existing.length + 1).padStart(3, '0')}`; }
function isExpiringSoon(d?: string) { if (!d) return false; return (new Date(d).getTime() - Date.now()) < 90 * 86400000; }
function isExpired(d?: string) { if (!d) return false; return new Date(d) < new Date(); }

// ── Mini Badges ────────────────────────────────────────────────────────────────

function CatBadge({ cat }: { cat: SupCat }) {
  const c = CAT_CFG[cat];
  return <span style={{ padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>;
}
function KycBadge({ status }: { status: KycStatus }) {
  const c = KYC_CFG[status];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, display: 'inline-block' }} />{c.label}</span>;
}
function SupStatusBadge({ status }: { status: SupStatus }) {
  const c = SUP_STATUS_CFG[status];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, display: 'inline-block' }} />{c.label}</span>;
}
function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
      {[1,2,3,4,5].map(i => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill={i <= Math.round(rating) ? 'var(--gold)' : 'none'} stroke={i <= Math.round(rating) ? 'var(--gold)' : 'var(--border)'} strokeWidth="1.5">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      ))}
      <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{rating.toFixed(1)}</span>
    </span>
  );
}
function ProgressBar({ value, color = 'var(--teal)' }: { value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', minWidth: 34, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

// ── Supplier Form (slide-in) ───────────────────────────────────────────────────

function SupplierForm({ initial, allSuppliers, onSave, onClose }: {
  initial?: Supplier; allSuppliers: Supplier[];
  onSave: (f: SupForm) => void; onClose: () => void;
}) {
  const [f, setF] = useState<SupForm>({
    name: initial?.name ?? '', code: initial?.code ?? '', category: initial?.category ?? 'FREIGHT_FORWARDER',
    status: initial?.status ?? 'ACTIVE', contact_person: initial?.contact_person ?? '', email: initial?.email ?? '',
    phone: initial?.phone ?? '', website: initial?.website ?? '', address: initial?.address ?? '',
    city: initial?.city ?? '', country: initial?.country ?? 'Tanzania', payment_terms: initial?.payment_terms ?? 'Net 30',
    currency: initial?.currency ?? 'USD', tax_id: initial?.tax_id ?? '', reg_number: initial?.reg_number ?? '',
    bank_name: initial?.bank_name ?? '', bank_account: initial?.bank_account ?? '', bank_swift: initial?.bank_swift ?? '',
    kyc_status: initial?.kyc_status ?? 'PENDING', kyc_expiry: initial?.kyc_expiry ?? '', compliance_notes: initial?.compliance_notes ?? '',
    services: initial?.services ?? [],
  });

  function set<K extends keyof SupForm>(k: K, v: SupForm[K]) {
    setF(p => {
      const n = { ...p, [k]: v };
      if (k === 'name' && !initial) n.code = genCode(allSuppliers);
      return n;
    });
  }
  function toggleService(s: string) { set('services', f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s]); }
  function submit() { if (!f.name.trim()) { alert('Supplier name is required.'); return; } onSave(f); }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box' as const, color: 'var(--ink)', fontFamily: 'inherit' };
  const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 4 };
  const sec: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, marginTop: 18 };
  const g2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 12 };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(500px, 100vw)', background: 'var(--white)', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{initial ? 'Edit Supplier' : 'New Supplier'}</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{initial ? initial.code : 'Add to supplier directory'}</div>
          </div>
          <button type="button" title="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 4 }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          <div style={sec}>Basic Information</div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Company Name *</label><input type="text" title="Name" placeholder="e.g. Maersk Line Tanzania" value={f.name} onChange={e => set('name', e.target.value)} style={inp} /></div>
          <div style={g2}>
            <div><label style={lbl}>Supplier Code</label><input type="text" title="Code" placeholder="SUP-001" value={f.code} onChange={e => set('code', e.target.value)} style={{ ...inp, fontFamily: 'var(--mono)', fontSize: 12 }} /></div>
            <div><label style={lbl}>Category</label><select title="Category" value={f.category} onChange={e => set('category', e.target.value as SupCat)} style={inp}>{ALL_CATS.map(c => <option key={c} value={c}>{CAT_CFG[c].label}</option>)}</select></div>
          </div>
          <div style={g2}>
            <div><label style={lbl}>Status</label><select title="Status" value={f.status} onChange={e => set('status', e.target.value as SupStatus)} style={inp}>{(Object.keys(SUP_STATUS_CFG) as SupStatus[]).map(s => <option key={s} value={s}>{SUP_STATUS_CFG[s].label}</option>)}</select></div>
            <div><label style={lbl}>Country</label><input type="text" title="Country" placeholder="Tanzania" value={f.country} onChange={e => set('country', e.target.value)} style={inp} /></div>
          </div>
          <div style={sec}>Contact Details</div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Contact Person</label><input type="text" title="Contact person" placeholder="Full name" value={f.contact_person} onChange={e => set('contact_person', e.target.value)} style={inp} /></div>
          <div style={g2}>
            <div><label style={lbl}>Email</label><input type="email" title="Email" placeholder="email@company.com" value={f.email} onChange={e => set('email', e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Phone</label><input type="tel" title="Phone" placeholder="+255 ..." value={f.phone} onChange={e => set('phone', e.target.value)} style={inp} /></div>
          </div>
          <div style={g2}>
            <div><label style={lbl}>Website</label><input type="text" title="Website" placeholder="www.example.com" value={f.website} onChange={e => set('website', e.target.value)} style={inp} /></div>
            <div><label style={lbl}>City</label><input type="text" title="City" placeholder="Dar es Salaam" value={f.city} onChange={e => set('city', e.target.value)} style={inp} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Address</label><input type="text" title="Address" placeholder="Street address" value={f.address} onChange={e => set('address', e.target.value)} style={inp} /></div>
          <div style={sec}>Financial</div>
          <div style={g2}>
            <div><label style={lbl}>Payment Terms</label><select title="Payment terms" value={f.payment_terms} onChange={e => set('payment_terms', e.target.value)} style={inp}>{PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label style={lbl}>Currency</label><select title="Currency" value={f.currency} onChange={e => set('currency', e.target.value)} style={inp}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div style={g2}>
            <div><label style={lbl}>Tax ID / TIN</label><input type="text" title="Tax ID" placeholder="152-xxx-xxx" value={f.tax_id} onChange={e => set('tax_id', e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Registration No.</label><input type="text" title="Reg number" placeholder="REG-xxxx-xxxx" value={f.reg_number} onChange={e => set('reg_number', e.target.value)} style={inp} /></div>
          </div>
          <div style={sec}>Banking</div>
          <div style={g2}>
            <div><label style={lbl}>Bank Name</label><input type="text" title="Bank name" placeholder="CRDB Bank" value={f.bank_name} onChange={e => set('bank_name', e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Account Number</label><input type="text" title="Account number" placeholder="0150..." value={f.bank_account} onChange={e => set('bank_account', e.target.value)} style={{ ...inp, fontFamily: 'var(--mono)', fontSize: 12 }} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>SWIFT / BIC</label><input type="text" title="SWIFT code" placeholder="CORUTZTZ" value={f.bank_swift} onChange={e => set('bank_swift', e.target.value.toUpperCase())} style={{ ...inp, fontFamily: 'var(--mono)', fontSize: 12, width: '50%' }} /></div>
          <div style={sec}>KYC & Compliance</div>
          <div style={g2}>
            <div><label style={lbl}>KYC Status</label><select title="KYC status" value={f.kyc_status} onChange={e => set('kyc_status', e.target.value as KycStatus)} style={inp}>{(Object.keys(KYC_CFG) as KycStatus[]).map(k => <option key={k} value={k}>{KYC_CFG[k].label}</option>)}</select></div>
            <div><label style={lbl}>KYC Expiry Date</label><input type="date" title="KYC expiry" value={f.kyc_expiry} onChange={e => set('kyc_expiry', e.target.value)} style={inp} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Compliance Notes</label><textarea title="Notes" placeholder="Any compliance or KYC notes…" value={f.compliance_notes} onChange={e => set('compliance_notes', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} /></div>
          <div style={sec}>Services Offered</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {SERVICE_OPTIONS.map(s => (
              <button key={s} type="button" title={`Toggle ${s}`} onClick={() => toggleService(s)}
                style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s', borderColor: f.services.includes(s) ? 'var(--teal)' : 'var(--border)', background: f.services.includes(s) ? 'var(--teal-l)' : 'var(--bg)', color: f.services.includes(s) ? 'var(--teal)' : 'var(--ink3)' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" title="Cancel" onClick={onClose} style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--ink2)' }}>Cancel</button>
          <button type="button" title="Save supplier" onClick={submit} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Icon name="save" size={13} /> {initial ? 'Update' : 'Add Supplier'}</button>
        </div>
      </div>
    </>
  );
}

// ── Detail View ────────────────────────────────────────────────────────────────

type DetailTab = 'overview'|'po'|'expenses'|'contracts'|'documents'|'tickets';

function DetailView({ s, onEdit, onBack }: { s: Supplier; onEdit: () => void; onBack: () => void }) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const isMobile = useIsMobile();
  const contracts = useMemo(() => MOCK_CONTRACTS.filter(c => c.supplier_id === s.id), [s.id]);
  const docs      = useMemo(() => MOCK_DOCS.filter(d => d.supplier_id === s.id), [s.id]);
  const tickets   = useMemo(() => MOCK_TICKETS.filter(t => t.supplier_id === s.id), [s.id]);
  const expenses  = useMemo(() => MOCK_SUP_EXPENSES.filter(e => e.supplier_id === s.id), [s.id]);
  const pos       = useMemo(() => MOCK_POS.filter(p => p.supplier_id === s.id), [s.id]);

  const openTickets = tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
  const activeContracts = contracts.filter(c => c.status === 'ACTIVE').length;

  const TABS: { key: DetailTab; label: string; count?: number }[] = [
    { key: 'overview',   label: 'Overview'         },
    { key: 'po',         label: 'Purchase Orders', count: pos.length      },
    { key: 'expenses',   label: 'Expenses',        count: expenses.length },
    { key: 'contracts',  label: 'Contracts',       count: contracts.length},
    { key: 'documents',  label: 'Documents',       count: docs.length     },
    { key: 'tickets',    label: 'Tickets',         count: openTickets || undefined },
  ];

  const tabBtn = (t: typeof TABS[0]) => (
    <button key={t.key} type="button" title={t.label} onClick={() => setTab(t.key)}
      style={{ padding: '9px 16px', border: 'none', borderBottom: `2px solid ${tab === t.key ? 'var(--teal)' : 'transparent'}`, background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: tab === t.key ? 'var(--teal)' : 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', transition: 'color 0.1s' }}>
      {t.label}
      {t.count !== undefined && <span style={{ background: tab === t.key ? 'var(--teal)' : 'var(--bg)', color: tab === t.key ? '#fff' : 'var(--ink3)', borderRadius: 9, fontSize: 10, fontWeight: 700, padding: '0 6px', lineHeight: '16px', display: 'inline-block' }}>{t.count}</span>}
    </button>
  );

  const card = (content: React.ReactNode, title?: string) => (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 9, padding: '16px 18px', marginBottom: 14 }}>
      {title && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{title}</div>}
      {content}
    </div>
  );

  const kv = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 9 }}>
      <span style={{ color: 'var(--ink3)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--ink)', textAlign: 'right', maxWidth: '60%' }}>{value ?? '—'}</span>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '18px 32px', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
        <button type="button" title="Back to list" onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 13, fontWeight: 600, marginBottom: 14, padding: 0 }}>
          <Icon name="arrowLeft" size={14} /> All Suppliers
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 9, background: CAT_CFG[s.category].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: CAT_CFG[s.category].color, flexShrink: 0 }}>
              {s.name.charAt(0)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{s.name}</span>
                <SupStatusBadge status={s.status} />
                <KycBadge status={s.kyc_status} />
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: 'var(--ink3)' }}>
                <CatBadge cat={s.category} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink3)' }}>{s.code}</span>
                <Stars rating={s.rating} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" title="Edit supplier" onClick={onEdit}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              <Icon name="edit" size={13} /> Edit
            </button>
          </div>
        </div>
        {s.status === 'SUSPENDED' && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--red-l)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 9, fontSize: 12.5, color: 'var(--red)', fontWeight: 600 }}>
            ⚠ This supplier is SUSPENDED. No new POs or contracts should be raised. {s.compliance_notes}
          </div>
        )}
        {s.kyc_status === 'PENDING' && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--gold-l)', border: '1px solid rgba(202,138,4,0.2)', borderRadius: 9, fontSize: 12.5, color: 'var(--gold)', fontWeight: 600 }}>
            ⏳ KYC verification pending. Ensure all compliance documents are received before raising new POs.
          </div>
        )}
        {openTickets > 0 && (
          <div style={{ marginTop: 8, padding: '8px 14px', background: 'var(--bg)', borderRadius: 9, fontSize: 12.5, color: 'var(--ink2)' }}>
            {openTickets} open support {openTickets === 1 ? 'ticket' : 'tickets'} · {activeContracts} active {activeContracts === 1 ? 'contract' : 'contracts'}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 32px', background: 'var(--white)', overflowX: 'auto' }}>
        {TABS.map(tabBtn)}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, padding: isMobile ? '14px 16px' : '22px 32px', overflowY: 'auto' }}>

        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 20 }}>
            <div>
              {card(<>
                {kv('Contact Person', s.contact_person)}
                {kv('Email', <a href={`mailto:${s.email}`} style={{ color: 'var(--teal)' }}>{s.email}</a>)}
                {kv('Phone', s.phone)}
                {s.website && kv('Website', <a href={`https://${s.website}`} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>{s.website}</a>)}
                {kv('Address', `${s.address}, ${s.city}`)}
                {kv('Country', s.country)}
              </>, 'Contact Information')}
              {card(<>
                {kv('Payment Terms', s.payment_terms)}
                {kv('Currency', s.currency)}
                {kv('Tax ID / TIN', <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.tax_id || '—'}</span>)}
                {kv('Registration No.', <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.reg_number || '—'}</span>)}
                {kv('Bank', s.bank_name || '—')}
                {kv('Account', <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.bank_account || '—'}</span>)}
                {s.bank_swift && kv('SWIFT / BIC', <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.bank_swift}</span>)}
              </>, 'Financial & Banking')}
              {card(<>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--ink3)' }}>KYC Status</span><KycBadge status={s.kyc_status} />
                </div>
                {kv('KYC Expiry', s.kyc_expiry ? (
                  <span style={{ color: isExpired(s.kyc_expiry) ? 'var(--red)' : isExpiringSoon(s.kyc_expiry) ? 'var(--gold)' : 'inherit' }}>
                    {fmtDate(s.kyc_expiry)}{isExpired(s.kyc_expiry) ? ' — EXPIRED' : isExpiringSoon(s.kyc_expiry) ? ' — Expiring Soon' : ''}
                  </span>
                ) : '—')}
                {s.compliance_notes && <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--bg)', borderRadius: 9, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>{s.compliance_notes}</div>}
              </>, 'KYC & Compliance')}
              {s.services.length > 0 && card(<>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {s.services.map(sv => <span key={sv} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'var(--teal-l)', color: 'var(--teal)' }}>{sv}</span>)}
                </div>
              </>, 'Services Offered')}
            </div>
            {/* Right: Performance */}
            <div>
              {card(<>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <Stars rating={s.rating} />
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>Overall Rating</div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}><span>On-Time Rate</span></div>
                  <ProgressBar value={s.on_time_rate} color={s.on_time_rate >= 90 ? 'var(--green)' : s.on_time_rate >= 75 ? 'var(--gold)' : 'var(--red)'} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Quality Score</div>
                  <ProgressBar value={s.quality_score} color={s.quality_score >= 90 ? 'var(--green)' : s.quality_score >= 75 ? 'var(--teal)' : 'var(--gold)'} />
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.dispute_count > 3 ? 'var(--red)' : 'var(--ink)' }}>{s.dispute_count}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Disputes</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)' }}>{pos.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Total POs</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{tickets.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Tickets</div>
                  </div>
                </div>
              </>, 'Performance Metrics')}
              {card(<>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal)', marginBottom: 4 }}>{fmt(s.total_spend, 'USD')}</div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14 }}>Total spend YTD</div>
                {kv('Active Contracts', String(contracts.filter(c => c.status === 'ACTIVE').length))}
                {kv('Open Tickets', String(openTickets))}
                {kv('Supplier Since', fmtDate(s.created_at))}
              </>, 'Summary')}
            </div>
          </div>
        )}

        {tab === 'po' && (
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {pos.length === 0 ? <EmptyState icon="clipboard" label="No purchase orders yet" /> : (
              <div className="rtbl-wrap"><table className="rtbl">
                <thead><tr style={{ background: 'var(--bg)' }}>
                  {['PO Number','Date','Due Date','Items','Total','Shipment','Status'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr></thead>
                <tbody>{pos.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>{p.po_number}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)' }}>{fmtDate(p.date)}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)' }}>{fmtDate(p.due_date)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'center', color: 'var(--ink2)' }}>{p.items_count}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700 }}>{fmt(p.total, p.currency)}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--blue)' }}>{p.shipment_ref || '—'}</td>
                    <td style={{ padding: '11px 14px' }}><span style={{ padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: PO_CFG[p.status].bg, color: PO_CFG[p.status].color }}>{p.status}</span></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        )}

        {tab === 'expenses' && (
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {expenses.length === 0 ? <EmptyState icon="dollarSign" label="No expenses linked to this supplier" /> : (
              <div className="rtbl-wrap"><table className="rtbl">
                <thead><tr style={{ background: 'var(--bg)' }}>
                  {['Description','Date','Category','Amount','Shipment','Reference','Status'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr></thead>
                <tbody>{expenses.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--ink)' }}>{e.name}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)' }}>{fmtDate(e.date)}</td>
                    <td style={{ padding: '11px 14px', fontSize: 11.5, color: 'var(--ink3)' }}>{e.category.replace('_', ' ')}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700 }}>{fmt(e.amount, e.currency)}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--blue)' }}>{e.shipment_ref || '—'}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink3)' }}>{e.reference}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: e.status === 'PAID' ? 'var(--green-l)' : e.status === 'DISPUTED' ? 'var(--red-l)' : 'var(--gold-l)', color: e.status === 'PAID' ? 'var(--green)' : e.status === 'DISPUTED' ? 'var(--red)' : 'var(--gold)' }}>{e.status}</span>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        )}

        {tab === 'contracts' && (
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {contracts.length === 0 ? <EmptyState icon="contracts" label="No contracts with this supplier" /> : (
              <div className="rtbl-wrap"><table className="rtbl">
                <thead><tr style={{ background: 'var(--bg)' }}>
                  {['Contract No.','Title','Type','Value','Start','End','Status','Notes'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr></thead>
                <tbody>{contracts.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--teal)', fontWeight: 700 }}>{c.contract_number}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--ink)' }}>{c.title}</td>
                    <td style={{ padding: '11px 14px', fontSize: 11.5, color: 'var(--ink3)' }}>{c.type}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700 }}>{fmt(c.value, c.currency)}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)' }}>{fmtDate(c.start_date)}</td>
                    <td style={{ padding: '11px 14px', color: isExpired(c.end_date) ? 'var(--red)' : isExpiringSoon(c.end_date) ? 'var(--gold)' : 'var(--ink2)' }}>{fmtDate(c.end_date)}</td>
                    <td style={{ padding: '11px 14px' }}><span style={{ padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: CON_STATUS_CFG[c.status].bg, color: CON_STATUS_CFG[c.status].color }}>{c.status}</span></td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes || '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {docs.length === 0 ? <EmptyState icon="file" label="No documents received from this supplier" /> : (
              <div className="rtbl-wrap"><table className="rtbl">
                <thead><tr style={{ background: 'var(--bg)' }}>
                  {['Document','Type','Reference','Shipment','Received','Expiry','Status'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr></thead>
                <tbody>{docs.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="fileText" size={14} color="var(--ink3)" /><span style={{ fontWeight: 600, color: 'var(--ink)' }}>{d.name}</span></div></td>
                    <td style={{ padding: '11px 14px', fontSize: 11.5, color: 'var(--ink3)' }}>{d.doc_type}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink3)' }}>{d.reference || '—'}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--blue)' }}>{d.shipment_ref || '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)' }}>{fmtDate(d.received_at)}</td>
                    <td style={{ padding: '11px 14px', color: d.expiry_date && isExpired(d.expiry_date) ? 'var(--red)' : d.expiry_date && isExpiringSoon(d.expiry_date) ? 'var(--gold)' : 'var(--ink2)' }}>{fmtDate(d.expiry_date)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: d.status === 'VERIFIED' ? 'var(--green-l)' : d.status === 'REJECTED' ? 'var(--red-l)' : 'var(--gold-l)', color: d.status === 'VERIFIED' ? 'var(--green)' : d.status === 'REJECTED' ? 'var(--red)' : 'var(--gold)' }}>{d.status}</span>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        )}

        {tab === 'tickets' && (
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {tickets.length === 0 ? <EmptyState icon="helpCircle" label="No support tickets for this supplier" /> : (
              <div className="rtbl-wrap"><table className="rtbl">
                <thead><tr style={{ background: 'var(--bg)' }}>
                  {['Ticket','Category','Priority','Status','Shipment','Opened','Resolved'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr></thead>
                <tbody>{tickets.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px' }}><div style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.title}</div><div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, fontFamily: 'var(--mono)' }}>{t.id.toUpperCase()}</div></td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--ink2)' }}>{t.category}</td>
                    <td style={{ padding: '11px 14px' }}><span style={{ fontWeight: 700, fontSize: 11.5, color: TKT_PRIORITY_CFG[t.priority].color }}>{t.priority}</span></td>
                    <td style={{ padding: '11px 14px' }}><span style={{ padding: '2px 9px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: TKT_STATUS_CFG[t.status].bg, color: TKT_STATUS_CFG[t.status].color }}>{t.status.replace('_',' ')}</span></td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--blue)' }}>{t.shipment_ref || '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)', fontSize: 12 }}>{fmtDate(t.created_at)}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--ink2)', fontSize: 12 }}>{fmtDate(t.resolved_at)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ padding: '50px 20px', textAlign: 'center' }}>
      <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={40} color="var(--border)" />
      <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600, color: 'var(--ink3)' }}>{label}</div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export const Suppliers: React.FC = () => {
  const isMobile = useIsMobile();
  const { fmt } = useCurrency();
  const [suppliers, setSuppliers] = useState<Supplier[]>(MOCK_SUPPLIERS);
  const [view, setView] = useState<'list'|'detail'>('list');
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingS, setEditingS] = useState<Supplier | null>(null);
  const [deletingS, setDeletingS] = useState<Supplier | null>(null);
  const [catFilter, setCatFilter] = useState<'ALL'|SupCat>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL'|SupStatus>('ALL');
  const [kycFilter, setKycFilter] = useState<'ALL'|KycStatus>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name'|'spend'|'rating'|'status'>('name');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  const displayed = useMemo(() => suppliers
    .filter(s => {
      if (catFilter !== 'ALL' && s.category !== catFilter) return false;
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (kycFilter !== 'ALL' && s.kyc_status !== kycFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.contact_person.toLowerCase().includes(q) || s.city.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name')   cmp = a.name.localeCompare(b.name);
      if (sortBy === 'spend')  cmp = a.total_spend - b.total_spend;
      if (sortBy === 'rating') cmp = a.rating - b.rating;
      if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
      return sortDir === 'asc' ? cmp : -cmp;
    }), [suppliers, catFilter, statusFilter, kycFilter, search, sortBy, sortDir]);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }

  function handleSave(f: SupForm) {
    const now = new Date().toISOString();
    if (editingS) {
      const updated = { ...editingS, ...f, updated_at: now };
      setSuppliers(p => p.map(s => s.id === editingS.id ? updated : s));
      if (selected?.id === editingS.id) setSelected(updated);
    } else {
      const newS: Supplier = { id: genId(), ...f, rating: 0, on_time_rate: 0, quality_score: 0, dispute_count: 0, total_spend: 0, created_at: now };
      setSuppliers(p => [newS, ...p]);
    }
    setFormOpen(false); setEditingS(null);
  }

  function handleDelete(s: Supplier) {
    setSuppliers(p => p.filter(x => x.id !== s.id));
    if (view === 'detail') { setView('list'); setSelected(null); }
    setDeletingS(null);
  }

  function openDetail(s: Supplier) { setSelected(s); setView('detail'); }
  function openEdit(s: Supplier) { setEditingS(s); setFormOpen(true); }

  const active = suppliers.filter(s => s.status === 'ACTIVE').length;
  const suspended = suppliers.filter(s => s.status === 'SUSPENDED').length;
  const kycIssues = suppliers.filter(s => s.kyc_status !== 'VERIFIED').length;
  const totalSpend = suppliers.reduce((a, s) => a + s.total_spend, 0);

  const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', userSelect: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {formOpen && (
        <SupplierForm initial={editingS ?? undefined} allSuppliers={suppliers} onSave={handleSave} onClose={() => { setFormOpen(false); setEditingS(null); }} />
      )}
      {deletingS && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--white)', borderRadius: 9, padding: 28, width: 400, boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Remove Supplier</div>
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 20 }}>Are you sure you want to remove <strong>{deletingS.name}</strong>? All linked POs, expenses, contracts, documents and tickets will be orphaned.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" title="Cancel" onClick={() => setDeletingS(null)} style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--ink2)' }}>Cancel</button>
              <button type="button" title="Confirm delete" onClick={() => handleDelete(deletingS)} style={{ padding: '8px 18px', border: 'none', borderRadius: 9, background: 'var(--red)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {view === 'detail' && selected ? (
        <DetailView s={selected} onEdit={() => openEdit(selected)} onBack={() => { setView('list'); setSelected(null); }} />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 16px' : '24px 32px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Suppliers</h1>
              <p style={{ fontSize: 13, color: 'var(--ink3)', margin: 0 }}>Manage your supplier directory — linked to POs, expenses, contracts and shipments.</p>
            </div>
            <button type="button" title="Add new supplier" onClick={() => { setEditingS(null); setFormOpen(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              <Icon name="plus" size={14} /> New Supplier
            </button>
          </div>

          {/* Metrics */}
          <MetricsRow cards={[
            { title: 'Total Suppliers', value: String(suppliers.length), trend: 0, sub1Label: 'ACTIVE', sub1Value: String(active), sub2Label: 'SUSPENDED', sub2Value: String(suspended), bars: spark(7, 15, 'flat'), barColor: 'var(--blue-l)', barHighlight: 'var(--blue)' },
            { title: 'Total Spend (YTD)', value: `$${(totalSpend / 1000).toFixed(0)}K`, trend: 0, sub1Label: 'SUPPLIERS', sub1Value: String(suppliers.length), sub2Label: 'POs RAISED', sub2Value: String(MOCK_POS.length), bars: spark(9, 15, 'up'), barColor: 'var(--teal-l)', barHighlight: 'var(--teal)' },
            { title: 'KYC Issues', value: String(kycIssues), trend: 0, sub1Label: 'PENDING', sub1Value: String(suppliers.filter(s => s.kyc_status === 'PENDING').length), sub2Label: 'EXPIRED', sub2Value: String(suppliers.filter(s => s.kyc_status === 'EXPIRED').length), bars: spark(11, 15, 'flat'), barColor: 'var(--gold-l)', barHighlight: 'var(--gold)' },
          ]} />

          {/* Filters */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {[{ key: 'ALL', label: `All (${suppliers.length})` }, ...ALL_CATS.map(c => ({ key: c, label: `${CAT_CFG[c].label} (${suppliers.filter(s => s.category === c).length})` }))].map(t => (
                <button key={t.key} type="button" title={`Filter: ${t.label}`} onClick={() => setCatFilter(t.key as 'ALL'|SupCat)}
                  style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 9, cursor: 'pointer', background: catFilter === t.key ? 'var(--navy)' : 'var(--bg)', color: catFilter === t.key ? '#fff' : 'var(--ink2)' }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', padding: 3, borderRadius: 9 }}>
                {(['ALL','ACTIVE','INACTIVE','SUSPENDED','PENDING_KYC'] as const).map(s => (
                  <button key={s} type="button" title={`Status: ${s}`} onClick={() => setStatusFilter(s)}
                    style={{ padding: '5px 10px', fontSize: 11.5, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: statusFilter === s ? 'var(--white)' : 'transparent', color: statusFilter === s ? 'var(--ink)' : 'var(--ink3)', boxShadow: statusFilter === s ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', whiteSpace: 'nowrap' }}>
                    {s === 'ALL' ? 'All Status' : s === 'PENDING_KYC' ? 'Pending KYC' : s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', padding: 3, borderRadius: 9 }}>
                {(['ALL','VERIFIED','PENDING','EXPIRED','REJECTED'] as const).map(k => (
                  <button key={k} type="button" title={`KYC: ${k}`} onClick={() => setKycFilter(k)}
                    style={{ padding: '5px 10px', fontSize: 11.5, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', background: kycFilter === k ? 'var(--white)' : 'transparent', color: kycFilter === k ? 'var(--ink)' : 'var(--ink3)', boxShadow: kycFilter === k ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                    {k === 'ALL' ? 'All KYC' : k.charAt(0) + k.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative', marginLeft: 'auto' }}>
                <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
                <input type="text" title="Search suppliers" placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', width: 240, boxSizing: 'border-box' as const }} />
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {displayed.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <Icon name="users" size={44} color="var(--border)" />
                <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>No suppliers found</div>
                <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 6, marginBottom: 20 }}>Try adjusting your filters or add a new supplier.</div>
                <button type="button" title="Add supplier" onClick={() => setFormOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', border: 'none', borderRadius: 9, background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}><Icon name="plus" size={13} /> New Supplier</button>
              </div>
            ) : (
              <div className="rtbl-wrap">
                <table className="rtbl">
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      <th style={thStyle}>Code</th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('name')}>Name / Contact</th>
                      <th style={thStyle}>Category</th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('status')}>Status</th>
                      <th style={thStyle}>KYC</th>
                      <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('rating')}>Rating</th>
                      <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort('spend')}>Total Spend</th>
                      <th style={thStyle}>POs</th>
                      <th style={thStyle}>Tickets</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map(s => {
                      const sPos = MOCK_POS.filter(p => p.supplier_id === s.id).length;
                      const sTkts = MOCK_TICKETS.filter(t => t.supplier_id === s.id && (t.status === 'OPEN' || t.status === 'IN_PROGRESS')).length;
                      return (
                        <tr key={s.id} onClick={() => openDetail(s)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '11px 14px', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>{s.code}</td>
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>{s.name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{s.contact_person} · {s.city}</div>
                          </td>
                          <td style={{ padding: '11px 14px' }}><CatBadge cat={s.category} /></td>
                          <td style={{ padding: '11px 14px' }}><SupStatusBadge status={s.status} /></td>
                          <td style={{ padding: '11px 14px' }}>
                            <div><KycBadge status={s.kyc_status} /></div>
                            {s.kyc_expiry && isExpiringSoon(s.kyc_expiry) && !isExpired(s.kyc_expiry) && <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 600, marginTop: 3 }}>Expires {fmtDate(s.kyc_expiry)}</div>}
                          </td>
                          <td style={{ padding: '11px 14px' }}><Stars rating={s.rating} /></td>
                          <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(s.total_spend, 'USD')}</td>
                          <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: sPos > 0 ? 'var(--blue)' : 'var(--ink3)' }}>{sPos}</td>
                          <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                            {sTkts > 0 ? <span style={{ background: 'var(--red-l)', color: 'var(--red)', borderRadius: 9, padding: '1px 8px', fontWeight: 700, fontSize: 11 }}>{sTkts}</span> : <span style={{ color: 'var(--ink3)' }}>—</span>}
                          </td>
                          <td style={{ padding: '11px 10px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 2 }}>
                              <button type="button" title="View supplier" onClick={() => openDetail(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 5, borderRadius: 5, display: 'flex' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}><Icon name="eye" size={14} /></button>
                              <button type="button" title="Edit supplier" onClick={() => openEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 5, borderRadius: 5, display: 'flex' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}><Icon name="edit" size={14} /></button>
                              <button type="button" title="Remove supplier" onClick={() => setDeletingS(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 5, borderRadius: 5, display: 'flex' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-l)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}><Icon name="trash" size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink3)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Showing {displayed.length} of {suppliers.length} suppliers</span>
                  <span>{active} active · {suspended} suspended · {kycIssues} KYC issues</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
