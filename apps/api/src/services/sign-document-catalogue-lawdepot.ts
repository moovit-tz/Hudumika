import type { CatalogueGroup } from './sign-document-catalogue.js';

export const lawdepotCatalogue: CatalogueGroup[] = [
  {
    apps: ['sign', 'workspace'],
    category: 'Rent or Lease',
    entries: [
      'Residential Lease Agreement|agreement|Premises and permitted use;Lease term and occupancy;Rent deposit and charges;Repairs and maintenance;Rules and quiet enjoyment;Assignment and subletting;Termination and handover',
      'Commercial Lease Agreement|agreement|Commercial premises and permitted trade;Lease term and options to renew;Base rent and operating expenses;Fit out and alterations;Repairs insurance and indemnities;Default remedies and re-entry',
      'Rental Application|form|Applicant personal details;Employment and income verification;Rental history and previous landlords;Credit and background consent;Emergency contacts;Application deposit acknowledgement',
      'Short-Term Rental Agreement|agreement|Rental accommodation and guest capacity;Stay dates and check-in check-out;Nightly rates cleaning fees and security deposit;House rules noise and guest limits;Cancellation and refund policy;Property damage and liability',
      'Residential Sublease Agreement|agreement|Master lease reference and head landlord consent;Subleased premises and room;Sublease term;Subrent and utility contributions;Security deposit;Condition of premises and surrender',
    ],
  },
  {
    apps: ['sign'],
    category: 'Manage Tenants',
    entries: [
      'Landlord Lease Notices|letter|Tenancy reference and premises;Landlord demand or formal notice;Required tenant action and statutory cure period;Consequences of non-compliance;Landlord contact details',
      'Tenant Lease Notices|letter|Tenancy reference and rental unit;Notice purpose: repair request, inspection or notice to vacate;Factual grounds;Statutory notice period;Tenant forwarding address',
      'Rent Increase Notice|letter|Tenancy reference and premises;Current rent and proposed increased rent;Effective date conforming with statutory notice;Payment instructions;Tenant rights and response channel',
      'Notice To Enter|letter|Tenancy reference and unit;Date and time window of scheduled entry;Permitted entry reason: repairs, inspection or showing;Statutory advance notice confirmation;Contact for rescheduling',
      'Commercial Lease Notices|letter|Commercial lease reference;Premises and tenant identification;Formal notice or default notice;Cure period and demanded remedy;Legal reservation of rights',
    ],
  },
  {
    apps: ['sign'],
    category: 'Buy, Sell, or Transfer',
    entries: [
      'Real Estate Purchase Agreement|agreement|Property description and legal title;Purchase price and earnest money deposit;Financing and inspection contingencies;Closing date and title transfer;Prorations and closing costs;Disclosures and property condition',
      'Quitclaim Deed|agreement|Grantor and grantee identification;Real property legal description;Transfer of grantor right title and interest;No warranties of title;Consideration;Statutory execution and recording requirements',
      'Warranty or Special Warranty Deed|agreement|Grantor and grantee particulars;Legal description and parcel ID;Covenants of title and against encumbrances;Exceptions to warranty;Consideration paid;Notarization and recording requirements',
      'Contract for Deed or Land Contract|agreement|Vendor and purchaser;Real property description;Purchase price and installment payment schedule;Interest and amortization;Taxes insurance and property maintenance;Default acceleration and deed delivery upon completion',
      'Mortgage Agreement|agreement|Mortgagor and mortgagee;Secured principal amount and promissory note reference;Property charged as security;Mortgagor covenants: insurance, taxes and repairs;Events of default and foreclosure rights;Discharge upon payment in full',
    ],
  },
  {
    apps: ['sign', 'crm'],
    category: 'Sell or Provide Services',
    entries: [
      'Bill of Sale|agreement|Seller buyer and ownership warranty;Goods description, serial numbers and condition;Purchase price and payment method;As-is or warranty disclosures;Transfer of ownership and delivery;Execution and receipt acknowledgement',
      'Service Agreement|agreement|Scope of services and milestones;Fees rates and expense reimbursement;Client responsibilities and materials;Performance standards and acceptance;Confidentiality and work product ownership;Term and termination',
      'Purchase of Business Agreement|agreement|Target business, assets and goodwill;Purchase consideration and earn-out;Due diligence conditions;Closing obligations;Warranties, indemnities and non-compete;Employee and lease transitions',
      'Sales Agreement|agreement|Buyer and seller;Product specifications and quantities;Price, payment terms and taxes;Shipping, delivery and risk of loss;Inspection and rejection rights;Warranty and limitation of liability',
      'Independent Contractor Agreement|agreement|Independent contractor scope and deliverables;Contractor compensation and invoicing;Independent status: no employment benefits or tax withholding;Intellectual property assignment;Confidentiality;Term and termination',
    ],
  },
  {
    apps: ['sign', 'finops'],
    category: 'Lend or Borrow',
    entries: [
      'Loan Agreement|agreement|Lender borrower and principal sum;Disbursement conditions;Interest rate and calculation;Repayment schedule and amortization;Prepayment rights;Events of default, acceleration and recovery costs',
      'Promissory Note|agreement|Maker and payee;Principal sum and currency;Unconditional promise to pay;Maturity date or installment schedule;Interest and late payment charges;Governing jurisdiction and collection costs',
      'Financial Statement (Personal)|record|Individual identity and statement date;Schedule of assets: bank balances, real estate, vehicles, investments;Schedule of liabilities: mortgages, loans, credit cards;Net worth calculation;Certification of completeness and accuracy',
      'Demand Letter|letter|Debtor and creditor references;Basis of claim and unpaid balance;Itemized principal, interest and lawful fees;Deadline for payment;Payment instructions;Notice of intention to commence legal proceedings',
      'Shareholder Loan Agreement|agreement|Lending shareholder and company;Loan principal and disbursement;Interest terms or zero-interest terms;Subordination to institutional lenders;Repayment terms and conditions;Board approval and tax considerations',
    ],
  },
  {
    apps: ['sign'],
    category: 'Protect Finances',
    entries: [
      'Hold-Harmless (Indemnity)|agreement|Indemnifying party and protected parties;Activity or transaction scope;Indemnification and defense obligations;Exclusions: willful misconduct and gross negligence;Notice and control of claims;Severability and survival',
      'Lien Release|record|Claimant and property owner;Property legal description and work or materials supplied;Original lien reference and recording details;Payment received in full;Unconditional release and discharge of lien;Notarization and filing requirements',
      'Activity Waiver Form|form|Participant identity and activity description;Assumption of inherent activity risks;Voluntary participation acknowledgement;Release of claims and liability waiver;Emergency medical authorization;Signature of participant or guardian',
      'Personal / Corporate Guarantee|agreement|Guarantor and creditor;Primary debtor and underlying contract;Guaranteed payment obligations;Continuing and unconditional guarantee;Waiver of suretyship defenses;Demand and enforcement',
      'Release or Waiver Agreement|agreement|Releasor and releasee;Underlying dispute or transaction;Consideration for release;Comprehensive release of claims, known and unknown;No admission of liability;Confidentiality and governing law',
    ],
  },
  {
    apps: ['sign', 'workspace'],
    category: 'Start & Manage a Business',
    entries: [
      'LLC Operating Agreement|agreement|Company name, state of formation and principal office;Member-managed vs manager-managed governance;Initial capital contributions and ownership percentages;Allocation of profits losses and distributions;Voting rights, meetings and quorum;Transfer restrictions, buy-sell provisions and dissolution',
      'Corporate Bylaws|record|Corporation name, registered office and fiscal year;Shareholders meetings, notice, voting and proxies;Board of directors: number, powers, elections and committees;Officers duties: CEO, Secretary, Treasurer;Share certificates and transfers;Amendments to bylaws',
      'Directors\' Resolution|record|Corporation and board meeting or unanimous written consent;Directors present and quorum;Specific transaction, authorization or appointment;Resolution text and approving votes;Secretary certification',
      'Business Plan|record|Executive summary and company overview;Market analysis and target audience;Products and services offered;Marketing and sales strategy;Operational plan and management team;Financial projections and milestones',
      'Business Formation|record|Entity type: LLC, Corporation, Partnership;Proposed business name and registered agent;Initial members, shareholders or directors;Business purpose and duration;Authorized capital and share structure;Filing requirements and licensing checklist',
    ],
  },
  {
    apps: ['sign', 'nexushr'],
    category: 'Manage Employees',
    entries: [
      'Employment Contract|agreement|Job title, reporting line and responsibilities;Commencement date and probation period;Base salary, bonuses and pay schedule;Working hours, location and remote work;Leave entitlements: annual, sick, statutory;Confidentiality and IP;Notice period and termination grounds',
      'Employment Offer Letter|letter|Candidate name and offered position;Start date and reporting manager;Salary, incentive compensation and benefits summary;Contingencies: background check and right to work;Acceptance deadline;At-will or contract terms',
      'Employee Warning Letter|letter|Employee name and job role;Specific performance issue or conduct violation;Previous discussions or prior warnings;Required corrective action and improvement timeline;Consequences of continued failure;Employee acknowledgement',
      'Employment Termination Letter|letter|Employee name and position;Termination date and notice period or payment in lieu;Grounds for termination;Severance, final paycheck and accrued leave;Company property return;Post-employment obligations',
      'Employee Handbook|policy|Company values and equal employment policy;Workplace conduct, anti-harassment and safety;Working hours, attendance and remote work guidelines;Compensation, benefits and leave policies;Information security, device and social media policy;Disciplinary and grievance procedure',
    ],
  },
  {
    apps: ['sign'],
    category: 'Protect Contracts & IP',
    entries: [
      'Non-Disclosure Agreement|agreement|Disclosing party and receiving party;Definition of confidential information;Permitted use and non-disclosure obligations;Exclusions from confidentiality;Required legal disclosure protocol;Term of confidentiality and return of materials',
      'Affidavit|record|Deponent identity, capacity and address;Formal oath or affirmation;Numbered statements of fact within personal knowledge;Exhibits attached and identified;Deponent signature;Notary public jurat and stamp',
      'Consulting Agreement|agreement|Consultant and client;Consulting services scope and deliverables;Consulting fees, retainers and invoicing;Independent contractor status;Intellectual property and proprietary rights;Non-disclosure and conflict of interest;Term and termination',
    ],
  },
  {
    apps: ['sign'],
    category: 'Get Married / Live Together',
    entries: [
      'Prenuptial Agreement|agreement|Prospective spouses;Intended marriage date and full financial disclosure;Separate property schedules and retention;Community or marital property rules;Spousal support and maintenance agreements;Rights upon death or dissolution;Independent legal advice confirmation',
      'Postnuptial Agreement|agreement|Married spouses;Purpose and voluntary execution;Full disclosure of assets and liabilities;Allocation of separate and joint assets;Debts and financial responsibilities;Spousal support agreements;Review and acknowledgment of fairness',
      'Cohabitation Agreement|agreement|Cohabiting partners and shared residence;Individual assets and separate property;Sharing of household expenses and mortgage/rent;Joint property acquired during cohabitation;Dispute resolution and separation procedures;No common-law marriage presumption',
      'Marriage Affidavit|record|Affiant identity and relationship;Parties to marriage and marriage details;Solemnization ceremony, date and place;Absence of official certificate explanation;Witness verification of marriage;Notary jurat and execution',
    ],
  },
  {
    apps: ['sign'],
    category: 'Separate / Divorce',
    entries: [
      'Separation Agreement|agreement|Spouses separating;Date of separation;Division of marital property, real estate and debts;Spousal support and maintenance;Child custody, parenting schedule and support arrangements;Pensions and insurance;Filing for uncontested divorce',
      'Pet Agreement|agreement|Parties and pet identification: name, breed, microchip;Sole or shared ownership and custody schedule;Allocation of veterinary bills, food and grooming costs;Emergency care decision making;Relocation and travel rules;Dispute resolution',
    ],
  },
  {
    apps: ['sign'],
    category: 'Plan Child Travel & Care',
    entries: [
      'Child Travel Consent|letter|Parents or legal guardians;Minor child full name, date of birth and passport;Accompanying adult details;Travel destination, dates and flight/itinerary;Medical emergency authorization during trip;Parent signature and notarization',
      'Child Medical Consent|letter|Parent or legal guardian;Minor child details and allergies/conditions;Authorized temporary caregiver or guardian;Scope of authorized medical treatment and surgery;Health insurance policy details;Emergency contacts;Notarization',
      'Power of Attorney for Child|agreement|Parent or legal guardian;Appointed temporary attorney-in-fact / caregiver;Child details and delegation scope: schooling, medical, care;Effective dates and duration limits;Parent retention of ultimate authority;Revocation terms;Execution and witnessing',
      'Child Visitation Letter|letter|Custodial parent and non-custodial parent;Child details;Proposed or agreed visitation schedule: weekends, holidays, vacations;Pick-up, drop-off times and locations;Notification rules for changes;Contact details',
      'Child Care Contract|agreement|Parents and child care provider;Children enrolled and medical/dietary notes;Care hours, schedule and location;Fees, overtime charges and payment schedule;Illness policy and emergency procedures;Termination and notice period',
    ],
  },
];
