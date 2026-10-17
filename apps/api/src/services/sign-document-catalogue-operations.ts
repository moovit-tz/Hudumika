import type { CatalogueGroup } from './sign-document-catalogue.js';
export const operationsCatalogue: CatalogueGroup[] = [
  {
    "apps": [
      "clearos"
    ],
    "category": "Customs & clearance",
    "entries": [
      "Customs clearing agency agreement|agreement|Agent appointment and authority;Shipment and customs scope;Client documentation duties;Fees and disbursements;Duty and tax funding;Liability and termination",
      "Customs representation authorisation|letter|Importer or exporter;Appointed agent;Permitted customs actions;Shipment references;Authority period;Signature authority",
      "Import clearance instructions|form|Importer and consignee;Goods and transport references;Valuation and classification information;Supporting documents;Permits and release instructions",
      "Export clearance instructions|form|Exporter and consignee;Goods and destination;Transport and customs references;Supporting certificates;Dispatch instructions",
      "Customs valuation supporting statement|record|Goods and transaction;Invoice consideration;Freight insurance and adjustments;Related party information;Supporting evidence",
      "Tariff classification review memorandum|record|Goods specifications;Candidate classifications;Classification rationale;Supporting references;Reviewer conclusions",
      "Duty and tax funding undertaking|agreement|Shipment and assessment references;Funding amount and currency;Payment timing;Reconciliation and surplus;Responsibility for shortfalls",
      "Customs assessment query letter|letter|Assessment reference;Disputed items;Factual grounds;Evidence enclosed;Requested review action;Contact details",
      "Cargo release authorisation|letter|Cargo and bill references;Authorised collecting party;Collection location;Release conditions;Authority verification",
      "Clearance disbursement reconciliation|record|Shipment reference;Client funds received;Duties and third party charges;Receipts and evidence;Balance payable or refundable",
      "Customs document handover register|record|Shipment and client;Documents handed over;Originals and copies;Outstanding documents;Receiving person",
      "Clearance service completion certificate|record|Assignment reference;Services completed;Release evidence;Exceptions and outstanding items;Client acceptance"
    ]
  },
  {
    "apps": [
      "tracking"
    ],
    "category": "Fleet & transport",
    "entries": [
      "Road freight transport agreement|agreement|Cargo and route;Vehicle and driver requirements;Collection and delivery;Freight charges;Cargo care and insurance;Delay and claims",
      "Vehicle lease agreement|agreement|Vehicle identification;Lease term and charges;Maintenance;Driver and use restrictions;Insurance and loss;Return condition",
      "Driver assignment and trip instructions|form|Driver and vehicle;Route and cargo;Schedule and checkpoints;Safety instructions;Reporting and contacts",
      "GPS monitoring consent and notice|form|Vehicle and monitored persons;Monitoring purposes;Data collected;Access and retention;Acknowledgement",
      "Fleet maintenance service agreement|agreement|Covered vehicles;Maintenance schedule;Parts and labour;Downtime and service standards;Charges;Warranty and records",
      "Transport incident report|record|Trip vehicle and driver;Incident facts;Cargo and property impact;Evidence and witnesses;Immediate actions;Follow up",
      "Proof of delivery acknowledgement|record|Consignment reference;Delivered items and quantities;Delivery time and place;Condition and exceptions;Recipient acknowledgement"
    ]
  },
  {
    "apps": [
      "cargotracker"
    ],
    "category": "Shipment & forwarding",
    "entries": [
      "Freight forwarding agreement|agreement|Forwarding appointment;Transport scope and routing;Booking instructions;Charges and disbursements;Insurance instructions;Claims and termination",
      "Shipping instructions|form|Shipper consignee and notify party;Cargo and packaging;Origin destination and routing;Transport document instructions;Special handling",
      "Consignment handover record|record|Consignment references;Package counts and condition;Custody transfer;Documents supplied;Exceptions and signatures",
      "Cargo loss or damage claim|letter|Shipment and carrier;Loss or damage facts;Claimed amount and basis;Evidence enclosed;Requested settlement",
      "Delivery exception notice|letter|Shipment and delivery reference;Exception details;Impact;Required customer instructions;Next update",
      "Cargo insurance instruction|form|Insured parties;Cargo value and route;Requested cover;Declared risks;Documents and confirmation"
    ]
  },
  {
    "apps": [
      "demurrage"
    ],
    "category": "Demurrage & detention",
    "entries": [
      "Demurrage cost allocation agreement|agreement|Containers and shipment;Free time assumptions;Responsibility for charges;Rate references;Approval and reconciliation;Disputes",
      "Free time extension request|letter|Shipment and container references;Current free time;Reason for extension;Requested dates;Supporting evidence",
      "Demurrage waiver request|letter|Charges and invoice references;Delay circumstances;Waiver grounds;Evidence;Requested adjustment",
      "Container return undertaking|agreement|Container and responsible party;Return depot and deadline;Condition requirements;Charges and security;Return evidence",
      "Demurrage charge dispute|letter|Invoices and container dates;Disputed calculation;Supporting movement evidence;Proposed correction;Response requested"
    ]
  },
  {
    "apps": [
      "seal"
    ],
    "category": "Warehouse & inventory",
    "entries": [
      "Warehousing and storage agreement|agreement|Goods and storage location;Storage term and rates;Handling and access;Stock records;Insurance and loss;Release and termination",
      "Bonded warehouse service agreement|agreement|Controlled goods and parties;Custody and movement controls;Customs documentation;Charges;Discrepancy reporting;Release authority",
      "Goods receipt and discrepancy record|record|Supplier and delivery references;Items received;Condition and shortages;Inspection evidence;Acceptance or quarantine",
      "Warehouse goods release instruction|form|Owner and goods;Approved quantities;Collecting party;Release conditions;Authorisation evidence",
      "Inventory count certification|record|Location and count date;Count methodology;Count results;Variances;Adjustment approvals",
      "Stock adjustment authorisation|form|Items and quantities;Adjustment reasons;Supporting evidence;Value impact;Approvals",
      "Consignment stock agreement|agreement|Consigned goods and ownership;Custody and stock checks;Sale reporting;Settlement;Loss and return;Termination"
    ]
  },
  {
    "apps": [
      "store"
    ],
    "category": "Procurement & supply",
    "entries": [
      "Supplier framework agreement|agreement|Supply scope;Order process;Pricing and payment;Delivery and inspection;Warranty;Liability and termination",
      "Request for quotation|form|Procurement requirements;Specifications and quantities;Delivery needs;Supplier response format;Evaluation criteria;Response deadline",
      "Tender invitation|letter|Procurement scope;Eligibility and submission;Technical requirements;Evaluation process;Clarifications;Timetable",
      "Bid evaluation report|record|Procurement reference;Bidders and criteria;Technical assessment;Commercial comparison;Conflicts;Award recommendation",
      "Supplier onboarding declaration|form|Supplier identity;Ownership and contacts;Tax and banking information;Capabilities;Compliance declarations",
      "Goods purchase agreement|agreement|Goods specifications;Price and taxes;Delivery;Inspection and acceptance;Warranty and returns;Payment",
      "Supplier performance review|record|Supplier and period;Delivery and quality metrics;Incidents;Corrective actions;Review conclusions"
    ]
  },
  {
    "apps": [
      "projects"
    ],
    "category": "Projects & delivery",
    "entries": [
      "Project charter|record|Business objectives;Scope and exclusions;Stakeholders and governance;Budget and resources;Milestones;Risks and success measures",
      "Project delivery contract|agreement|Project scope;Deliverables and milestones;Commercial terms;Acceptance;Change control;Liability and termination",
      "Subcontract agreement|agreement|Subcontract scope;Programme and dependencies;Payment and retention;Quality and safety;Insurance;Termination and handover",
      "Project change order|agreement|Original scope reference;Requested variation;Cost impact;Schedule impact;Acceptance and authority",
      "Milestone acceptance certificate|record|Milestone and deliverables;Acceptance criteria;Verification results;Defects and conditions;Acceptance authority",
      "Project handover certificate|record|Completed scope;Assets and documents;Outstanding items;Support obligations;Receiving party acceptance",
      "Project risk register|record|Risk descriptions;Likelihood and impact;Owners;Mitigation actions;Review schedule",
      "Project closure report|record|Objectives achieved;Scope cost and schedule outcomes;Outstanding obligations;Lessons learned;Closure approvals"
    ]
  },
  {
    "apps": [
      "bliss"
    ],
    "category": "Customer support",
    "entries": [
      "Customer support service level agreement|agreement|Support channels and coverage;Priority definitions;Response and resolution targets;Escalation;Service reporting;Exclusions and review",
      "Support outsourcing agreement|agreement|Services and staffing;Access and confidentiality;Service levels;Charges;Quality monitoring;Exit assistance",
      "Complaint acknowledgement letter|letter|Complaint reference;Summary of concern;Assigned contact;Investigation steps;Expected response arrangements",
      "Complaint resolution agreement|agreement|Complaint background;Agreed remedy;Implementation timetable;Customer obligations;Closure confirmation",
      "Support case closure report|record|Case and customer;Investigation findings;Actions taken;Outstanding matters;Closure approval",
      "Customer call recording notice|policy|Recording purpose;Notice and consent process;Access controls;Retention;Customer contact and rights"
    ]
  },
  {
    "apps": [
      "petti"
    ],
    "category": "Petty cash & advances",
    "entries": [
      "Petty cash advance request|form|Requester and purpose;Requested amount;Spending items;Cost allocation;Retirement deadline;Approvals",
      "Cash custody undertaking|agreement|Custodian and float;Permitted expenditure;Approval limits;Safekeeping;Reconciliation;Handover and shortages",
      "Petty cash retirement statement|record|Advance reference;Expenses incurred;Receipts;Unused funds returned;Variances and approvals",
      "Cash handover certificate|record|Outgoing and incoming custodians;Cash count;Supporting vouchers;Reconciling differences;Sign off",
      "Petty cash policy|policy|Float limits;Eligible spending;Approval authorities;Receipt requirements;Replenishment and review"
    ]
  }
];

