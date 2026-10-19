import type { CatalogueGroup } from './sign-document-catalogue.js';
export const industryCatalogue: CatalogueGroup[] = [
  {
    apps: ['sign', 'workspace'],
    category: 'Insurance & risk',
    entries: [
      'Insurance proposal form|form|Insured entity and business activities;Assets and risk exposures;Requested cover types and limits;Claims history;Premium basis and payment;Supporting documents checklist',
      'Insurance claim notification|letter|Policy reference and insured;Incident date location and circumstances;Estimated loss or damage amount;Evidence and supporting documents;Immediate actions taken;Contact details and next steps',
      'Certificate of insurance|record|Insured entity and certificate holder;Policy numbers and insurer;Cover types and effective dates;Limits of liability and deductibles;Additional insured endorsements;Certificate holder notice requirements',
      'Insurance coverage confirmation letter|letter|Policy and insured parties;Confirmed coverage scope;Effective dates and limits;Exclusions and conditions;Premium and payment status;Broker or agent contact',
      'Loss assessment report|record|Incident and policy references;Site inspection findings;Cause and extent of loss;Quantum assessment and methodology;Salvage and mitigation;Assessor conclusions and recommendations',
      'Insurance renewal notice|letter|Existing policy summary;Proposed renewal terms and changes;Updated premium;Coverage modifications;Response deadline;Renewal instructions',
    ],
  },
  {
    apps: ['sign'],
    category: 'Healthcare & medical',
    entries: [
      'Patient consent form|form|Patient identity and medical record;Proposed procedure or treatment;Material risks and alternatives;Expected outcomes and limitations;Voluntary consent declaration;Witness and clinician attestation',
      'Medical records release authorization|form|Patient identity and date of birth;Records custodian and requesting party;Specific records or date range;Purpose of disclosure;Authorization period;Revocation instructions',
      'Telemedicine consent|form|Patient identity and location;Provider identity and licence;Technology platform and access;Privacy and data security notice;Limitations of remote care;Consent and withdrawal process',
      'Healthcare provider agreement|agreement|Provider identity and credentials;Services scope and schedule;Compensation and billing;Malpractice insurance;Compliance with health regulations;Term and termination',
      'Clinical trial informed consent|form|Study title and sponsor;Purpose and procedures;Risks benefits and alternatives;Confidentiality of data;Voluntary participation and withdrawal;Compensation and contact information',
      'Medical power of attorney|agreement|Principal and appointed healthcare agent;Scope of medical decisions;Life sustaining treatment preferences;Agent succession;Effective conditions;Revocation provisions',
    ],
  },
  {
    apps: ['sign', 'nexushr'],
    category: 'Education & training',
    entries: [
      'Student enrollment agreement|agreement|Institution and student;Programme and academic calendar;Tuition fees and payment schedule;Attendance and conduct requirements;Withdrawal and refund policy;Dispute resolution',
      'Tuition payment plan|agreement|Student and institution;Outstanding fees and currency;Instalment amounts and due dates;Late payment consequences;Financial aid adjustments;Completion conditions',
      'Training services agreement|agreement|Training provider and client;Programme objectives and content;Schedule and delivery method;Fees and cancellation;Intellectual property and materials;Evaluation and certification',
      'Scholarship award letter|letter|Awarding body and recipient;Scholarship name and value;Eligibility conditions and renewal;Academic performance requirements;Duration and disbursement;Acceptance deadline',
      'Academic collaboration memorandum|agreement|Collaborating institutions;Research or programme objectives;Resource sharing and contributions;Intellectual property ownership;Publication rights;Duration and review',
      'Internship placement agreement|agreement|Host organization and educational institution;Intern role and learning objectives;Supervision and mentoring;Working hours and stipend;Insurance and liability;Evaluation and completion',
    ],
  },
  {
    apps: ['sign', 'projects'],
    category: 'Construction & engineering',
    entries: [
      'Construction contract|agreement|Employer and contractor;Scope of works and specifications;Contract sum and payment milestones;Commencement and completion dates;Variations and change orders;Defects liability and retention',
      'Subcontractor agreement|agreement|Main contractor and subcontractor;Subcontract works and programme;Payment terms and retention;Quality and safety requirements;Insurance obligations;Termination and disputes',
      'Construction change order|form|Project and contract reference;Variation description and drawings;Cost impact and revised sum;Schedule impact;Approvals required;Execution by authorized parties',
      'Practical completion certificate|record|Project and employer;Works completed and inspected;Outstanding defects list;Defects liability period;Handover of as built documents;Employer acceptance',
      'Performance bond|agreement|Contractor and surety;Employer beneficiary;Bonded obligation amount;Conditions for demand;Bond expiry;Governing law',
      'Construction site safety agreement|agreement|Site and responsible parties;Safety obligations and standards;Personal protective equipment;Incident reporting procedures;Right to stop work;Compliance certification',
    ],
  },
  {
    apps: ['sign'],
    category: 'Agriculture & farming',
    entries: [
      'Crop purchase agreement|agreement|Buyer seller and commodity;Quality specifications and grading;Quantity and delivery schedule;Price and payment terms;Inspection and rejection rights;Force majeure and crop failure',
      'Agricultural land lease|agreement|Landowner and tenant farmer;Land description and permitted use;Lease term and rent;Soil conservation obligations;Improvements and fixtures;Termination and land return',
      'Farm equipment lease|agreement|Equipment owner and lessee;Equipment identification and condition;Lease period and rental charges;Maintenance and repair responsibilities;Insurance and risk of loss;Return condition requirements',
      'Produce supply agreement|agreement|Grower and buyer;Product specifications and standards;Supply volumes and delivery;Pricing mechanism and payment;Quality assurance and traceability;Term and renewal',
      'Agricultural input supply contract|agreement|Supplier and farmer;Seeds fertilizers or chemicals;Delivery schedule and quantities;Credit terms and payment;Product warranties;Dispute resolution',
      'Organic certification declaration|form|Farm identity and location;Production methods and inputs;Land history and buffer zones;Record keeping practices;Inspection consent;Declaration of compliance',
    ],
  },
  {
    apps: ['sign', 'workspace'],
    category: 'Government & public sector',
    entries: [
      'Government procurement contract|agreement|Procuring authority and supplier;Contract scope and specifications;Contract sum and funding;Performance standards and monitoring;Compliance with public procurement rules;Termination for convenience or default',
      'Public private partnership agreement|agreement|Government entity and private partner;Project scope and assets;Risk allocation;Financial model and returns;Performance standards;Handback requirements',
      'Grant agreement|agreement|Granting authority and recipient;Grant purpose and approved activities;Grant amount and disbursement;Reporting and audit requirements;Conditions and restrictions;Clawback and termination',
      'Memorandum of understanding|agreement|Cooperating parties and objectives;Areas of cooperation;Responsibilities and contributions;Duration and review;Confidentiality;Non-binding status and termination',
      'Public consultation record|record|Consultation subject and authority;Stakeholders consulted;Submissions received summary;Key themes and responses;Decision and rationale;Communication plan',
      'Regulatory compliance certificate|record|Entity and regulatory framework;Compliance scope and period;Inspections and assessments;Findings and corrective actions;Certifying officer;Certificate validity',
    ],
  },
  {
    apps: ['sign', 'workspace'],
    category: 'Mining & natural resources',
    entries: [
      'Mining lease agreement|agreement|Landowner and mining company;Mineral rights and lease area;Lease term and royalties;Environmental obligations;Rehabilitation requirements;Default and termination',
      'Mineral exploration licence application|form|Applicant and proposed area;Exploration programme;Environmental management plan;Community consultation evidence;Financial capacity;Compliance declarations',
      'Environmental impact assessment consent|form|Project proponent and project;Assessment scope and methodology;Community and stakeholder notice;Mitigation commitments;Monitoring plan;Regulatory submissions',
      'Royalty agreement|agreement|Resource owner and operator;Royalty base and calculation;Payment schedule and audit rights;Minimum payments;Duration and adjustment;Governing law',
      'Land access agreement for exploration|agreement|Landowner and exploration company;Access area and permitted activities;Compensation and rehabilitation;Notice requirements;Insurance;Duration and restoration',
    ],
  },
];
