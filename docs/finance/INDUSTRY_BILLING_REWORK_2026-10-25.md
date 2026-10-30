# Industry-aware FinOps billing rework — 25 October 2026

Implemented against the 24 existing company industry profiles. Companies can enable multiple industries; each catalogue item selects one industry or remains a shared item. Existing catalogue records and custom categories remain available. Agency and influencer billing is covered by Professional services.

## Delivered

- Shared, typed industry vocabulary for catalogue categories, units, billing specifications and expense categories.
- Industry-aware catalogue creation/editing/filtering; company currency defaults; merchandising controls restricted to retail, wholesale and ecommerce. ClearOS retains its existing tariff access without requiring FinOps configuration access.
- API validation rejects unknown industries, unconfigured new industry assignments and unsupported specification fields. Explicit tenant filters protect catalogue and expense work links.
- Previously accepted merchandising fields now persist through create/update rather than being discarded.
- Invoice lines preserve descriptions and industry specifications independently of subsequent catalogue edits, and include them in invoice view and PDF.
- Quotation catalogue selection carries specifications. Purchase order selection and edits preserve saved descriptions and tax rates. Bills and delivery documents can select catalogue items. Credit note lines support descriptions in editing, viewing and PDF.
- Expense entry offers industry categories and tenant-scoped industry work attribution; claims, recurring bills and list filters use the same vocabulary. Generic company overhead remains available.
- Logistics-only document controls are hidden for other industries while existing linked shipment data remains accessible.
- Additive migrations 624 and 625 were applied locally. Default GL account labels were made industry-neutral without changing account codes or custom names.

## Industry catalogue matrix

| Industry | Billing specification fields | Units | Expense vocabulary |
|---|---|---|---|
| retail | Brand, Model / variant, Pack size, Barcode | unit, pack, box, kg, litre, set | Stock purchases, Packaging, Shop rent, Merchant fees, Delivery costs |
| wholesale | Brand, Pack size, Minimum order, Trade specification | unit, carton, case, pallet, kg, ton | Stock purchases, Inbound freight, Warehouse costs, Distribution costs |
| ecommerce | Brand, Variant, Channel SKU, Fulfilment class | unit, pack, download, month, order | Marketplace fees, Payment processing, Fulfilment, Returns handling, Advertising |
| manufacturing | Material / grade, Specification, Pack size, Quality standard | unit, kg, ton, litre, batch, hour | Raw materials, Factory labour, Factory overhead, Quality testing, Waste disposal |
| food_beverage | Ingredients / allergens, Pack size, Shelf life, Storage conditions | unit, pack, kg, litre, case, batch | Ingredients, Food packaging, Cold storage, Quality testing, Waste disposal |
| printing | Paper / substrate, Finished size, Colours, Finishing, Artwork requirements | copy, sheet, m2, job, hour, set | Paper and ink, Finishing supplies, Outsourced printing, Design fees, Machine maintenance |
| warehousing | Storage class, Charging basis, Handling requirements, Minimum charge | pallet-day, m3-day, unit, order, hour, month | Warehouse rent, Handling labour, Packing supplies, Equipment hire, Utilities |
| professional_services | Deliverables, Platform / channel, Usage rights, Revision allowance, Billing basis | hour, day, project, deliverable, post, video, campaign, month | Talent fees, Media spend, Content production, Software subscriptions, Client travel, Subcontractors |
| consulting | Scope / deliverables, Billing basis, Acceptance criteria, Revision allowance | hour, day, project, milestone, month | Subcontractors, Research costs, Client travel, Professional subscriptions, Training materials |
| construction | BOQ item / trade, Material specification, Measurement basis, Acceptance criteria | m, m2, m3, ton, unit, hour, day, milestone | Site materials, Site labour, Plant hire, Subcontractors, Site overhead, Safety equipment |
| property | Property class, Billing period, Service scope, Deposit terms | month, day, unit, m2, job | Property maintenance, Property utilities, Agent commission, Building insurance, Cleaning |
| automotive | Part number, Vehicle compatibility, Warranty terms, Service scope | hour, job, unit, litre, set | Parts purchases, Workshop consumables, Outsourced repairs, Tools, Waste disposal |
| hospitality | Room / service class, Occupancy basis, Meal plan, Rate conditions | night, room-night, person, event, day, unit | Housekeeping, Laundry, Food supplies, Guest amenities, Booking commission |
| restaurant | Portion size, Allergens, Menu options, Preparation notes | portion, unit, person, tray, event, order | Food ingredients, Kitchen supplies, Delivery costs, Kitchen utilities, Waste disposal |
| agriculture | Variety / breed, Grade, Pack size, Growing / handling specification | kg, ton, head, bag, hectare, hour | Seeds and seedlings, Fertiliser, Animal feed, Veterinary costs, Farm labour, Irrigation |
| education | Programme / course, Fee period, Service scope, Eligibility notes | term, semester, course, session, unit, month | Teaching materials, Teaching fees, Campus utilities, Accreditation costs, Student activities |
| healthcare | Service / procedure code, Service scope, Package inclusions, Billing basis | consultation, procedure, test, day, unit, package | Medical supplies, Laboratory costs, Clinical subcontractors, Equipment servicing, Waste disposal |
| pharmaceutical | Generic name, Strength, Dosage form, Pack size, Manufacturer, Storage conditions, Registration reference | unit, tablet, capsule, vial, pack, box, kg, batch | Active ingredients, Excipients, Quality testing, Cold chain, Regulatory costs, Expired stock disposal |
| mining | Mineral / grade, Assay basis, Moisture basis, Delivery specification | ton, kg, m3, hour, day | Extraction costs, Assay testing, Explosives and consumables, Haulage, Site rehabilitation |
| energy | Tariff reference, Charging basis, Service class, Minimum charge | kWh, kW, litre, m3, month, job | Energy purchases, Fuel purchases, Meter servicing, Network maintenance, Utilities |
| telecom | Plan / package, Billing cycle, Included allowance, Overage basis | month, GB, minute, unit, connection | Network costs, Bandwidth, Equipment purchases, Interconnect charges, Support costs |
| insurance | Product class, Coverage basis, Policy period, Fee basis | policy, month, year, assessment | Claims costs, Reinsurance, Broker commissions, Risk assessment, Administration |
| lending | Loan product, Fee basis, Charging period, Disclosure reference | loan, month, instalment, service | Funding costs, Credit assessment, Collection costs, Legal fees, Administration |
| logistics | Service scope, Route / zone, Charging basis, Trade terms | shipment, container, kg, CBM, trip, day, hour, set, certificate, declaration, pallet, unit, ton, BL, AWB | PORT_CHARGES, CUSTOMS_DUTY, FREIGHT, HANDLING, TRANSPORT, INSPECTION_FEE, AGENT_FEE |

## Verification

- 30 API/database and PDF tests passed across four suites: all 24 industry profiles round-trip; pagination, tenant isolation, rejected invalid inputs, invoice snapshot immutability, generated PDF content and expense work attribution.
- 28 frontend/shared-profile/document contract tests passed in the earlier run.
- Browser: unlocked workspace; construction switches to BOQ specifications and measurement units; pharmaceutical switches to medicine specifications; existing 112 catalogue records retained.
- Final root typecheck passed: API and web TypeScript, trigger coverage, all 19 design-system checks and encoding.
- Production web build passed, with an existing bundle-size warning.
- Corrected fixture rerun: all 27 industry integration tests passed again.
- Responsive browser checks at 1440px desktop and 390px mobile: pharmaceutical, construction and agency/influencer profiles, construction expense categories and work picker. Unsaved browser drafts discarded; catalogue left open for review.
- Diff whitespace check passed. No full repository test-suite or all-industry operational certification is claimed.

## Scope and remaining operational work

This change implements industry-aware catalogue and billing data. It does not certify complete advanced operations for every industry. Catalogue attributes are descriptive, not proof of regulatory approval or operational controls.

Construction progress certification, retention and variations need dedicated contract workflows. Pharma requires validated lot/expiry/release, recall, controlled-stock and cold-chain controls. Manufacturing needs production execution, consumption, yield, scrap and costing. Energy/telecom need verified usage and tariff/proration engines. Insurance/lending require dedicated regulated contract/loan workflows. Ecommerce channel labels do not constitute a storefront, checkout or marketplace integration. Healthcare records stay outside the catalogue.

Existing catalogue stock counters and tracking flags are not a replacement for the shared Inventory ledger. Expense category vocabulary does not implement tenant-configurable account mapping; existing fallback account rules remain. Existing expense GL best-effort posting behavior was not redesigned. Prior POS audit failures remain outside this change. No production deployment or external certification was performed.
