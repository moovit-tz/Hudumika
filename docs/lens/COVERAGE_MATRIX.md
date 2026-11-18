# Hudumika Lens — All-App Defect Intake Coverage Matrix

| App ID | App Name | Authorized Roles | Reporting Entry Point | Automatically Gathered Context | Operational References | Outbox Event Producer | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `clearos` | ClearOS (Customs & Clearing) | All authenticated staff, customers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `shipment_id`, `declaration_id`, `ref_number` | `lens.report_created` | Verified |
| `finops` | FinOps (Finance & Invoicing) | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `invoice_id`, `bill_id`, `payment_id` | `lens.report_created` | Verified |
| `complyos` | ComplyOS (Trade Compliance) | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `rule_id`, `permit_id`, `compliance_check_id` | `lens.report_created` | Verified |
| `bliss` | Bliss (Support & Communications) | All authenticated staff, customers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `ticket_id`, `thread_id`, `customer_id` | `lens.report_created` | Verified |
| `nexushr` | NexusHR (HR & Payroll) | Staff, managers, admins | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `employee_id`, `payroll_run_id`, `leave_id` | `lens.report_created` | Verified |
| `onesite` | OneSite (Site & Facilities) | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `facility_id`, `asset_id`, `maintenance_id` | `lens.report_created` | Verified |
| `onsite` | OnSite (Cloud & Infrastructure) | Technical staff, admins | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `server_id`, `domain_id`, `deployment_id` | `lens.report_created` | Verified |
| `ondi` | Ondi (Identity & Access) | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `user_id`, `oauth_client_id`, `session_id` | `lens.report_created` | Verified |
| `tracking` | Tracking (Vessel & Air Cargo) | All authenticated staff, customers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `vessel_imo`, `flight_number`, `container_no` | `lens.report_created` | Verified |
| `cargotracker` | CargoTracker (GPS Fleet Tracking) | Operators, drivers, managers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `trip_id`, `vehicle_id`, `device_imei` | `lens.report_created` | Verified |
| `demurrage` | Demurrage Calculator | Clearing agents, finance | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `demurrage_calc_id`, `shipping_line_id` | `lens.report_created` | Verified |
| `seal` | Seal (Cargo Security & Seals) | Field officers, dispatchers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `seal_number`, `lot_id`, `order_id` | `lens.report_created` | Verified |
| `cloud` | Cloud Drive (Document Vault) | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `file_id`, `folder_id`, `storage_key` | `lens.report_created` | Verified |
| `workspace` | Workspace Settings | Tenant Admins, Directors | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `tenant_id`, `plan_id`, `branch_id` | `lens.report_created` | Verified |
| `admin` | SuperAdmin Console | `SUPER_ADMIN` only | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `platform_tenant_id`, `audit_log_id` | `lens.report_created` | Verified |
| `email` | Webmail Client | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `message_id`, `folder_id`, `account_id` | `lens.report_created` | Verified |
| `crm` | CRM (Leads & Pipelines) | Sales, managers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `lead_id`, `deal_id`, `customer_id` | `lens.report_created` | Verified |
| `contacts` | Address Book | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `contact_id`, `organization_id` | `lens.report_created` | Verified |
| `store` | Marketplace & Store | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `package_id`, `subscription_id` | `lens.report_created` | Verified |
| `calendar` | Calendar & Scheduling | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `event_id`, `calendar_id` | `lens.report_created` | Verified |
| `tasks` | Tasks & Todos | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `task_id`, `list_id` | `lens.report_created` | Verified |
| `notes` | Workspace Scratchpad | All authenticated staff | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `note_id`, `notebook_id` | `lens.report_created` | Verified |
| `sign` | eSign & Digital Signatures | Authorized signers, managers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `envelope_id`, `document_id` | `lens.report_created` | Verified |
| `sms` | SMS Broadcasts | Marketing, support | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `broadcast_id`, `recipient_id` | `lens.report_created` | Verified |
| `studio` | Studio (Workflow Builder) | Admins, workflow builders | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `workflow_id`, `run_id`, `node_id` | `lens.report_created` | Verified |
| `hudubi` | HuduBi (Analytics & BI) | Directors, managers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `dashboard_id`, `report_id` | `lens.report_created` | Verified |
| `petti` | Petti (Petty Cash Vault) | Cashiers, finance | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `voucher_id`, `vault_id` | `lens.report_created` | Verified |
| `pos` | Point of Sale | Store cashiers, sales | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `sale_id`, `register_id`, `receipt_no` | `lens.report_created` | Verified |
| `projects` | ProjectOS | Project managers, engineers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `project_id`, `milestone_id`, `task_id` | `lens.report_created` | Verified |
| `developer` | Developer & MCP Portal | Developers, engineers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `api_key_id`, `webhook_endpoint_id` | `lens.report_created` | Verified |
| `travel` | Corporate Travel Management | Travelers, approvers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `booking_id`, `itinerary_id` | `lens.report_created` | Verified |
| `tuma` | Tuma (Courier & Dispatch) | Dispatchers, riders | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `delivery_id`, `consignment_id` | `lens.report_created` | Verified |
| `lexcore` | LexCore (Legal Case Files) | Legal counsel, compliance | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `case_file_id`, `court_id`, `docket_no` | `lens.report_created` | Verified |
| `ngao` | Ngao (Privacy & PDPC Compliance) | Data protection officers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `dpa_assessment_id`, `incident_id` | `lens.report_created` | Verified |
| `gereji` | Gereji (Workshop & Garage) | Mechanics, workshop managers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `job_card_id`, `vehicle_id`, `part_id` | `lens.report_created` | Verified |
| `zentra` | Zentra (Trust & Risk Auditing) | Internal auditors, risk team | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `audit_id`, `finding_id`, `risk_id` | `lens.report_created` | Verified |
| `pulse` | Pulse (Marketing & Campaigns) | Growth team, marketers | `AppHeader` modal / `POST /v1/lens/reports` | Route, URL, UserAgent, Viewport, Timestamp | `campaign_id`, `journey_id`, `lead_id` | `lens.report_created` | Verified |
| `lens` | Lens (Engineering Management) | `SUPER_ADMIN` only | Direct engineering management | Route, URL, UserAgent, Viewport, Timestamp | `lens_item_id`, `project_id`, `snapshot_id` | `lens.report_created` | Verified |

## Sanitization Policy
Every intake report processed by `lens-intake.service.ts` undergoes mandatory redactive sanitization:
1. Authorization headers (`Bearer ...`), Basic auth tokens, and session JWTs are stripped.
2. Sensitive keys matching `/token|password|secret|auth|cookie|key|credential/i` are masked with `[REDACTED]`.
3. Reporter identity is server-verified from the authenticated JWT session (`sub`, `tenant_id`, `email`, `name`).
4. Cross-tenant leakage prevention: `lens_reports` rows carry `tenant_id` for source provenance with Postgres RLS active, restricting tenants to their own reported records while platform engineers triage under `SUPER_ADMIN`.
