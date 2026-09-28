-- Migration 519: Sign app — law firm demonstration seed
--
-- Inserts a realistic set of eSign documents, recipients, journal events, and
-- forensic cases for a fictional East-African law firm tenant ("Kavali & Ngata
-- Advocates").  The seed is scoped to the first tenant in the database and is
-- fully idempotent: it skips if the known matter reference KNA/PROP/2026/001
-- already exists.
--
-- The data covers every execution type the Sign app supports, both statuses
-- (completed, in-flight, draft), all journal event types (witnessed, certified,
-- declared), and two forensic investigation cases (one open/reviewing, one
-- resolved) so the three pages at /sign/matters, /sign/journal, and
-- /sign/forensics all have realistic content from the first login.

DO $$
DECLARE
  v_tenant_id UUID;
  v_user_id   UUID;

  -- Customers (law firm clients)
  v_cust_kali    UUID := gen_random_uuid();
  v_cust_tib     UUID := gen_random_uuid();
  v_cust_nakuru  UUID := gen_random_uuid();
  v_cust_amina   UUID := gen_random_uuid();
  v_cust_patrick UUID := gen_random_uuid();
  v_cust_esther  UUID := gen_random_uuid();

  -- Envelopes
  v_env1  UUID := gen_random_uuid();   -- Sale of Land — KNA/PROP/2026/001 (completed, NOTARIAL)
  v_env2  UUID := gen_random_uuid();   -- Lease Agreement — KNA/COMM/2026/002 (completed, WITNESSED)
  v_env3  UUID := gen_random_uuid();   -- Employment Contract — KNA/EMPL/2026/003 (completed, NORMAL)
  v_env4  UUID := gen_random_uuid();   -- Loan Facility — KNA/FINC/2026/004 (sent, NOTARIAL)
  v_env5  UUID := gen_random_uuid();   -- Share Transfer Deed — KNA/CORP/2026/005 (draft, WITNESSED)
  v_env6  UUID := gen_random_uuid();   -- Affidavit of Service — KNA/LIT/2026/006 (completed, AFFIDAVIT)
  v_env7  UUID := gen_random_uuid();   -- General Power of Attorney — KNA/PROP/2026/001 (completed, NOTARIAL)
  v_env8  UUID := gen_random_uuid();   -- Statutory Declaration — KNA/MISC/2026/007 (completed, AFFIDAVIT)

  -- Sign recipients (selected ones needed for events / forensics)
  v_r1a   UUID := gen_random_uuid();   -- env1 signer: Amina Hassani
  v_r1b   UUID := gen_random_uuid();   -- env1 signer: Daniel Ochieng (vendor)
  v_r1c   UUID := gen_random_uuid();   -- env1 certifier: Adv. Kavali
  v_r2a   UUID := gen_random_uuid();   -- env2 signer: Kali Breweries
  v_r2b   UUID := gen_random_uuid();   -- env2 signer: PSSSF Tower Mgmt
  v_r2c   UUID := gen_random_uuid();   -- env2 witness: Adv. John Mwasimba
  v_r3a   UUID := gen_random_uuid();   -- env3 signer: Nakuru Commodities
  v_r3b   UUID := gen_random_uuid();   -- env3 signer: Grace Mwamba
  v_r4a   UUID := gen_random_uuid();   -- env4 signer: TIB Dev Bank
  v_r4b   UUID := gen_random_uuid();   -- env4 signer: Kali Breweries (borrower)
  v_r4c   UUID := gen_random_uuid();   -- env4 certifier: Adv. Ngata
  v_r5a   UUID := gen_random_uuid();   -- env5 signer: seller
  v_r5b   UUID := gen_random_uuid();   -- env5 signer: buyer
  v_r5c   UUID := gen_random_uuid();   -- env5 witness
  v_r6a   UUID := gen_random_uuid();   -- env6 affiant: Patrick Omondi
  v_r6b   UUID := gen_random_uuid();   -- env6 certifier: CFO Fatuma Said
  v_r7a   UUID := gen_random_uuid();   -- env7 signer: Amina Hassani
  v_r7b   UUID := gen_random_uuid();   -- env7 certifier: Adv. Kavali
  v_r8a   UUID := gen_random_uuid();   -- env8 affiant: Esther Tarimo
  v_r8b   UUID := gen_random_uuid();   -- env8 certifier: CFO Baraka Mwanga

  -- Forensic cases
  v_fc1   UUID := gen_random_uuid();   -- DOCUMENT_MISMATCH on env1 (reviewing)
  v_fc2   UUID := gen_random_uuid();   -- SEAL_INVALID on env3 (resolved)

BEGIN
  -- ── Idempotency guard ─────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM sign_envelopes WHERE matter_reference = 'KNA/PROP/2026/001' LIMIT 1
  ) THEN
    RAISE NOTICE 'sign_lawfirm_seed (mig 519): already applied — skipping.';
    RETURN;
  END IF;

  -- ── Resolve first active tenant and its first user ────────────────────────
  SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'sign_lawfirm_seed: no tenant found — skipping.';
    RETURN;
  END IF;

  SELECT id INTO v_user_id FROM users
    WHERE tenant_id = v_tenant_id AND is_active = TRUE
    ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'sign_lawfirm_seed: no user found for tenant — skipping.';
    RETURN;
  END IF;

  -- ── Customers ─────────────────────────────────────────────────────────────
  INSERT INTO customers (id, tenant_id, name, contact_name, email, phone, category, tax_id, active)
  VALUES
    (v_cust_kali,    v_tenant_id, 'Kali Breweries Ltd',         'Charles Mwanga',   'legal@kalibreweries.co.tz',  '+255222760100', 'enterprise', 'TIN-401-987-321', true),
    (v_cust_tib,     v_tenant_id, 'TIB Development Bank',        'Mary Ngulu',        'legal@tib.co.tz',            '+255222116000', 'enterprise', 'TIN-400-001-001', true),
    (v_cust_nakuru,  v_tenant_id, 'Nakuru Commodities Ltd',      'Samuel Kamau',      'secretariat@nakurucomm.com', '+255784302018', 'sme',        'TIN-438-201-774', true),
    (v_cust_amina,   v_tenant_id, 'Amina Hassani',               NULL,                'amina.hassani@gmail.com',    '+255754901234', 'individual', NULL,              true),
    (v_cust_patrick, v_tenant_id, 'Patrick Omondi',              NULL,                'patrick.omondi@yahoo.com',   '+255713456789', 'individual', NULL,              true),
    (v_cust_esther,  v_tenant_id, 'Esther Tarimo',               NULL,                'esther.tarimo@outlook.com',  '+255778002311', 'individual', NULL,              true);

  -- ── Envelopes ─────────────────────────────────────────────────────────────
  INSERT INTO sign_envelopes (
    id, tenant_id, created_by, title, message,
    file_name, status, execution_type, matter_reference,
    verification_code, anchor_hash,
    stamp_applied, stamped_at,
    sent_at, completed_at,
    created_at, updated_at
  ) VALUES
  (
    v_env1, v_tenant_id, v_user_id,
    'Sale of Land Agreement — Kariakoo Plot No. 47',
    'Please review and sign the attached land sale agreement for Plot No. 47, Block A, Kariakoo, Dar es Salaam. This document has been prepared by Kavali & Ngata Advocates on behalf of our client.',
    'KNA-PROP-001-LandSaleAgreement.pdf', 'completed', 'NOTARIAL_CERTIFICATION', 'KNA/PROP/2026/001',
    'HSGN-KNA001-PROP47',
    'a3f7e2b1d9c4058e6f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3',
    true, NOW() - INTERVAL '18 days',
    NOW() - INTERVAL '22 days', NOW() - INTERVAL '18 days',
    NOW() - INTERVAL '25 days', NOW() - INTERVAL '18 days'
  ),
  (
    v_env2, v_tenant_id, v_user_id,
    'Commercial Lease Agreement — PSSSF Tower Suite 4B',
    'Five-year commercial lease of Suite 4B, 8th Floor, PSSSF Tower, Ohio Street, Dar es Salaam. Witness signature required per the Law of Contract Act.',
    'KNA-COMM-002-LeaseAgreement-PSSSF.pdf', 'completed', 'WITNESSED_SIGNATURE', 'KNA/COMM/2026/002',
    'HSGN-KNA002-COMM4B',
    'b2e8f3c0a5d7e9f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5',
    true, NOW() - INTERVAL '12 days',
    NOW() - INTERVAL '15 days', NOW() - INTERVAL '12 days',
    NOW() - INTERVAL '18 days', NOW() - INTERVAL '12 days'
  ),
  (
    v_env3, v_tenant_id, v_user_id,
    'Employment Contract — Finance Director (Nakuru Commodities Ltd)',
    'Executive employment agreement for the position of Finance Director. Fixed term of 3 years with a negotiated remuneration package.',
    'KNA-EMPL-003-EmploymentContract-FD.pdf', 'completed', 'NORMAL_SIGN', 'KNA/EMPL/2026/003',
    'HSGN-KNA003-EMPL',
    'c1d9a2b3c4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',
    true, NOW() - INTERVAL '8 days',
    NOW() - INTERVAL '10 days', NOW() - INTERVAL '8 days',
    NOW() - INTERVAL '14 days', NOW() - INTERVAL '8 days'
  ),
  (
    v_env4, v_tenant_id, v_user_id,
    'Loan Facility Agreement — TZS 500,000,000 (Kali Breweries Ltd)',
    'Term loan facility of TZS 500 million for expansion of brewing capacity. All parties to execute before a Notary Public.',
    'KNA-FINC-004-LoanFacility-TIB.pdf', 'sent', 'NOTARIAL_CERTIFICATION', 'KNA/FINC/2026/004',
    'HSGN-KNA004-FINC',
    NULL,
    false, NULL,
    NOW() - INTERVAL '3 days', NULL,
    NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days'
  ),
  (
    v_env5, v_tenant_id, v_user_id,
    'Share Transfer Deed — 40% Stake in Nakuru Commodities Ltd',
    'Transfer of 40% equity stake by the founding shareholder to a strategic investor. Witness signature required. Draft — pending internal approval.',
    'KNA-CORP-005-ShareTransferDeed-Draft.pdf', 'draft', 'WITNESSED_SIGNATURE', 'KNA/CORP/2026/005',
    'HSGN-KNA005-CORP',
    NULL,
    false, NULL,
    NULL, NULL,
    NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
  ),
  (
    v_env6, v_tenant_id, v_user_id,
    'Affidavit of Service — Civil Case No. HC/CC/2026/142',
    'Sworn statement confirming personal service of court summons on the defendant in the above-captioned matter before the High Court of Tanzania.',
    'KNA-LIT-006-AffidavitOfService-HC142.pdf', 'completed', 'AFFIDAVIT', 'KNA/LIT/2026/006',
    'HSGN-KNA006-LIT1',
    'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5',
    true, NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days'
  ),
  (
    v_env7, v_tenant_id, v_user_id,
    'General Power of Attorney — Amina Hassani to Charles Mwanga',
    'Grant of broad general power of attorney to authorise the attorney-in-fact to execute property transactions on behalf of the donor.',
    'KNA-PROP-001b-GeneralPOA-Hassani.pdf', 'completed', 'NOTARIAL_CERTIFICATION', 'KNA/PROP/2026/001',
    'HSGN-KNA007-POA1',
    'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
    true, NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '23 days', NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '27 days', NOW() - INTERVAL '20 days'
  ),
  (
    v_env8, v_tenant_id, v_user_id,
    'Statutory Declaration — Change of Name (Esther Tarimo)',
    'Statutory declaration before a Commissioner for Oaths confirming legal change of name from Esther Makonde to Esther Tarimo following marriage.',
    'KNA-MISC-007-StatutoryDeclaration-Tarimo.pdf', 'completed', 'AFFIDAVIT', 'KNA/MISC/2026/007',
    'HSGN-KNA008-MISC',
    'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7',
    true, NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '32 days', NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '35 days', NOW() - INTERVAL '30 days'
  );

  -- ── Recipients ────────────────────────────────────────────────────────────

  -- Env 1 — Sale of Land (NOTARIAL_CERTIFICATION)
  INSERT INTO sign_recipients (
    id, envelope_id, tenant_id, name, email, role_label, sign_order, status,
    execution_role, is_certifier,
    certifier_title, certifier_roll_number, certifier_firm,
    signed_at, created_at
  ) VALUES
  (v_r1a, v_env1, v_tenant_id, 'Amina Hassani',       'amina.hassani@gmail.com',          'Purchaser',         1, 'signed',  'SIGNER',     false, NULL,              NULL,       NULL,                         NOW() - INTERVAL '20 days', NOW() - INTERVAL '25 days'),
  (v_r1b, v_env1, v_tenant_id, 'Daniel Ochieng',      'daniel.ochieng@protonmail.com',     'Vendor',            2, 'signed',  'SIGNER',     false, NULL,              NULL,       NULL,                         NOW() - INTERVAL '19 days', NOW() - INTERVAL '25 days'),
  (v_r1c, v_env1, v_tenant_id, 'Joseph Kavali',       'j.kavali@kavaliandngata.co.tz',     'Notary Public',     3, 'signed',  'CERTIFIER',  true,  'Notary Public',   'TLS/2847', 'Kavali & Ngata Advocates',    NOW() - INTERVAL '18 days', NOW() - INTERVAL '25 days');

  -- Env 2 — Commercial Lease (WITNESSED_SIGNATURE)
  INSERT INTO sign_recipients (
    id, envelope_id, tenant_id, name, email, role_label, sign_order, status,
    execution_role, is_certifier,
    certifier_title, certifier_roll_number, certifier_firm,
    signed_at, created_at
  ) VALUES
  (v_r2a, v_env2, v_tenant_id, 'Charles Mwanga',      'legal@kalibreweries.co.tz',         'Tenant',            1, 'signed',  'SIGNER',     false, NULL,              NULL,       NULL,                         NOW() - INTERVAL '14 days', NOW() - INTERVAL '18 days'),
  (v_r2b, v_env2, v_tenant_id, 'PSSSF Tower Mgmt',    'properties@psssf.go.tz',            'Landlord',          2, 'signed',  'SIGNER',     false, NULL,              NULL,       NULL,                         NOW() - INTERVAL '13 days', NOW() - INTERVAL '18 days'),
  (v_r2c, v_env2, v_tenant_id, 'John Mwasimba',       'j.mwasimba@kavaliandngata.co.tz',   'Independent Witness',3,'signed', 'WITNESS',    false, 'Advocate',        'TLS/3102', 'Kavali & Ngata Advocates',    NOW() - INTERVAL '12 days', NOW() - INTERVAL '18 days');

  -- Env 3 — Employment Contract (NORMAL_SIGN)
  INSERT INTO sign_recipients (
    id, envelope_id, tenant_id, name, email, role_label, sign_order, status,
    execution_role, is_certifier,
    signed_at, created_at
  ) VALUES
  (v_r3a, v_env3, v_tenant_id, 'Samuel Kamau',        'secretariat@nakurucomm.com',        'Employer',          1, 'signed',  'SIGNER',     false, NOW() - INTERVAL '9 days',  NOW() - INTERVAL '14 days'),
  (v_r3b, v_env3, v_tenant_id, 'Grace Mwamba',        'grace.mwamba@gmail.com',            'Employee',          2, 'signed',  'SIGNER',     false, NOW() - INTERVAL '8 days',  NOW() - INTERVAL '14 days');

  -- Env 4 — Loan Facility (NOTARIAL_CERTIFICATION, sent)
  INSERT INTO sign_recipients (
    id, envelope_id, tenant_id, name, email, role_label, sign_order, status,
    execution_role, is_certifier,
    certifier_title, certifier_roll_number, certifier_firm,
    created_at
  ) VALUES
  (v_r4a, v_env4, v_tenant_id, 'Mary Ngulu',          'legal@tib.co.tz',                   'Lender',            1, 'viewed',  'SIGNER',     false, NULL,              NULL,       NULL,                         NOW() - INTERVAL '5 days'),
  (v_r4b, v_env4, v_tenant_id, 'Charles Mwanga',      'legal@kalibreweries.co.tz',         'Borrower',          2, 'pending', 'SIGNER',     false, NULL,              NULL,       NULL,                         NOW() - INTERVAL '5 days'),
  (v_r4c, v_env4, v_tenant_id, 'Beatrice Ngata',      'b.ngata@kavaliandngata.co.tz',      'Notary Public',     3, 'pending', 'CERTIFIER',  true,  'Notary Public',   'TLS/1955', 'Kavali & Ngata Advocates',    NOW() - INTERVAL '5 days');

  -- Env 5 — Share Transfer Deed (draft)
  INSERT INTO sign_recipients (
    id, envelope_id, tenant_id, name, email, role_label, sign_order, status,
    execution_role, is_certifier,
    created_at
  ) VALUES
  (v_r5a, v_env5, v_tenant_id, 'Fredrick Waweru',     'f.waweru@gmail.com',                'Transferor',        1, 'pending', 'SIGNER',     false, NOW() - INTERVAL '2 days'),
  (v_r5b, v_env5, v_tenant_id, 'Zenith Capital Ltd',  'deals@zenithcapital.tz',            'Transferee',        2, 'pending', 'SIGNER',     false, NOW() - INTERVAL '2 days'),
  (v_r5c, v_env5, v_tenant_id, 'Rehema Salim',        'rehema.salim@lawgroup.co.tz',       'Independent Witness',3,'pending', 'WITNESS',    false, NOW() - INTERVAL '2 days');

  -- Env 6 — Affidavit of Service (AFFIDAVIT)
  INSERT INTO sign_recipients (
    id, envelope_id, tenant_id, name, email, role_label, sign_order, status,
    execution_role, is_certifier,
    certifier_title, certifier_roll_number, certifier_firm,
    signed_at, created_at
  ) VALUES
  (v_r6a, v_env6, v_tenant_id, 'Patrick Omondi',      'patrick.omondi@yahoo.com',          'Deponent',          1, 'signed',  'AFFIANT',    false, NULL,              NULL,       NULL,                         NOW() - INTERVAL '6 days',  NOW() - INTERVAL '7 days'),
  (v_r6b, v_env6, v_tenant_id, 'Fatuma Said',         'f.said@kavaliandngata.co.tz',       'Commissioner for Oaths',2,'signed','CERTIFIER',  true,  'Commissioner for Oaths', 'CFO/2023/449', 'Kavali & Ngata Advocates', NOW() - INTERVAL '5 days', NOW() - INTERVAL '7 days');

  -- Env 7 — Power of Attorney (NOTARIAL_CERTIFICATION)
  INSERT INTO sign_recipients (
    id, envelope_id, tenant_id, name, email, role_label, sign_order, status,
    execution_role, is_certifier,
    certifier_title, certifier_roll_number, certifier_firm,
    signed_at, created_at
  ) VALUES
  (v_r7a, v_env7, v_tenant_id, 'Amina Hassani',       'amina.hassani@gmail.com',           'Donor',             1, 'signed',  'SIGNER',     false, NULL,              NULL,       NULL,                         NOW() - INTERVAL '22 days', NOW() - INTERVAL '27 days'),
  (v_r7b, v_env7, v_tenant_id, 'Joseph Kavali',       'j.kavali@kavaliandngata.co.tz',     'Notary Public',     2, 'signed',  'CERTIFIER',  true,  'Notary Public',   'TLS/2847', 'Kavali & Ngata Advocates',    NOW() - INTERVAL '20 days', NOW() - INTERVAL '27 days');

  -- Env 8 — Statutory Declaration (AFFIDAVIT)
  INSERT INTO sign_recipients (
    id, envelope_id, tenant_id, name, email, role_label, sign_order, status,
    execution_role, is_certifier,
    certifier_title, certifier_roll_number, certifier_firm,
    signed_at, created_at
  ) VALUES
  (v_r8a, v_env8, v_tenant_id, 'Esther Tarimo',       'esther.tarimo@outlook.com',         'Declarant',         1, 'signed',  'AFFIANT',    false, NULL,              NULL,       NULL,                         NOW() - INTERVAL '31 days', NOW() - INTERVAL '35 days'),
  (v_r8b, v_env8, v_tenant_id, 'Baraka Mwanga',       'b.mwanga@kavaliandngata.co.tz',     'Commissioner for Oaths',2,'signed','CERTIFIER',  true,  'Commissioner for Oaths', 'CFO/2022/318', 'Kavali & Ngata Advocates', NOW() - INTERVAL '30 days', NOW() - INTERVAL '35 days');

  -- ── Sign Events (journal) ─────────────────────────────────────────────────
  -- Env 1 — lifecycle + notarial certification (feeds journal as 'certified')
  INSERT INTO sign_events (envelope_id, tenant_id, recipient_id, event_type, actor_name, actor_email, created_at)
  VALUES
    (v_env1, v_tenant_id, NULL,   'created',   'Joseph Kavali',  'j.kavali@kavaliandngata.co.tz',   NOW() - INTERVAL '25 days'),
    (v_env1, v_tenant_id, NULL,   'sent',      'Joseph Kavali',  'j.kavali@kavaliandngata.co.tz',   NOW() - INTERVAL '22 days'),
    (v_env1, v_tenant_id, v_r1a,  'viewed',    'Amina Hassani',  'amina.hassani@gmail.com',         NOW() - INTERVAL '21 days'),
    (v_env1, v_tenant_id, v_r1a,  'signed',    'Amina Hassani',  'amina.hassani@gmail.com',         NOW() - INTERVAL '20 days'),
    (v_env1, v_tenant_id, v_r1b,  'viewed',    'Daniel Ochieng', 'daniel.ochieng@protonmail.com',   NOW() - INTERVAL '20 days'),
    (v_env1, v_tenant_id, v_r1b,  'signed',    'Daniel Ochieng', 'daniel.ochieng@protonmail.com',   NOW() - INTERVAL '19 days'),
    (v_env1, v_tenant_id, v_r1c,  'certified', 'Joseph Kavali',  'j.kavali@kavaliandngata.co.tz',   NOW() - INTERVAL '18 days'),
    (v_env1, v_tenant_id, NULL,   'completed', 'System',         NULL,                              NOW() - INTERVAL '18 days'),
    (v_env1, v_tenant_id, NULL,   'stamped',   'System',         NULL,                              NOW() - INTERVAL '18 days');

  -- Env 2 — lifecycle + witnessed (feeds journal as 'witnessed')
  INSERT INTO sign_events (envelope_id, tenant_id, recipient_id, event_type, actor_name, actor_email, created_at)
  VALUES
    (v_env2, v_tenant_id, NULL,   'created',   'Beatrice Ngata',  'b.ngata@kavaliandngata.co.tz',   NOW() - INTERVAL '18 days'),
    (v_env2, v_tenant_id, NULL,   'sent',      'Beatrice Ngata',  'b.ngata@kavaliandngata.co.tz',   NOW() - INTERVAL '15 days'),
    (v_env2, v_tenant_id, v_r2a,  'signed',    'Charles Mwanga',  'legal@kalibreweries.co.tz',      NOW() - INTERVAL '14 days'),
    (v_env2, v_tenant_id, v_r2b,  'signed',    'PSSSF Tower Mgmt','properties@psssf.go.tz',         NOW() - INTERVAL '13 days'),
    (v_env2, v_tenant_id, v_r2c,  'witnessed', 'John Mwasimba',   'j.mwasimba@kavaliandngata.co.tz',NOW() - INTERVAL '12 days'),
    (v_env2, v_tenant_id, NULL,   'completed', 'System',          NULL,                             NOW() - INTERVAL '12 days'),
    (v_env2, v_tenant_id, NULL,   'stamped',   'System',          NULL,                             NOW() - INTERVAL '12 days');

  -- Env 3 — simple NORMAL_SIGN lifecycle
  INSERT INTO sign_events (envelope_id, tenant_id, recipient_id, event_type, actor_name, actor_email, created_at)
  VALUES
    (v_env3, v_tenant_id, NULL,   'created',   'Joseph Kavali',  'j.kavali@kavaliandngata.co.tz',   NOW() - INTERVAL '14 days'),
    (v_env3, v_tenant_id, NULL,   'sent',      'Joseph Kavali',  'j.kavali@kavaliandngata.co.tz',   NOW() - INTERVAL '10 days'),
    (v_env3, v_tenant_id, v_r3a,  'signed',    'Samuel Kamau',   'secretariat@nakurucomm.com',      NOW() - INTERVAL '9 days'),
    (v_env3, v_tenant_id, v_r3b,  'signed',    'Grace Mwamba',   'grace.mwamba@gmail.com',          NOW() - INTERVAL '8 days'),
    (v_env3, v_tenant_id, NULL,   'completed', 'System',         NULL,                              NOW() - INTERVAL '8 days'),
    (v_env3, v_tenant_id, NULL,   'stamped',   'System',         NULL,                              NOW() - INTERVAL '8 days');

  -- Env 4 — in-progress (sent, one party viewed)
  INSERT INTO sign_events (envelope_id, tenant_id, recipient_id, event_type, actor_name, actor_email, created_at)
  VALUES
    (v_env4, v_tenant_id, NULL,   'created',   'Joseph Kavali',  'j.kavali@kavaliandngata.co.tz',   NOW() - INTERVAL '5 days'),
    (v_env4, v_tenant_id, NULL,   'sent',      'Joseph Kavali',  'j.kavali@kavaliandngata.co.tz',   NOW() - INTERVAL '3 days'),
    (v_env4, v_tenant_id, v_r4a,  'viewed',    'Mary Ngulu',     'legal@tib.co.tz',                 NOW() - INTERVAL '2 days');

  -- Env 5 — draft only
  INSERT INTO sign_events (envelope_id, tenant_id, recipient_id, event_type, actor_name, actor_email, created_at)
  VALUES
    (v_env5, v_tenant_id, NULL,   'created',   'Beatrice Ngata', 'b.ngata@kavaliandngata.co.tz',    NOW() - INTERVAL '2 days');

  -- Env 6 — Affidavit (declared = CoO has administered oath and signed)
  INSERT INTO sign_events (envelope_id, tenant_id, recipient_id, event_type, actor_name, actor_email, note, created_at)
  VALUES
    (v_env6, v_tenant_id, NULL,   'created',   'Fatuma Said',    'f.said@kavaliandngata.co.tz',     NULL,              NOW() - INTERVAL '7 days'),
    (v_env6, v_tenant_id, NULL,   'sent',      'Fatuma Said',    'f.said@kavaliandngata.co.tz',     NULL,              NOW() - INTERVAL '6 days'),
    (v_env6, v_tenant_id, v_r6a,  'signed',    'Patrick Omondi', 'patrick.omondi@yahoo.com',        NULL,              NOW() - INTERVAL '6 days'),
    (v_env6, v_tenant_id, v_r6b,  'declared',  'Fatuma Said',    'f.said@kavaliandngata.co.tz',     'Oath administered before Commissioner for Oaths at Kavali & Ngata Advocates, Dar es Salaam. Deponent sworn and subscribed.', NOW() - INTERVAL '5 days'),
    (v_env6, v_tenant_id, NULL,   'completed', 'System',         NULL,                              NULL,              NOW() - INTERVAL '5 days'),
    (v_env6, v_tenant_id, NULL,   'stamped',   'System',         NULL,                              NULL,              NOW() - INTERVAL '5 days');

  -- Env 7 — POA notarial certification
  INSERT INTO sign_events (envelope_id, tenant_id, recipient_id, event_type, actor_name, actor_email, created_at)
  VALUES
    (v_env7, v_tenant_id, NULL,   'created',   'Joseph Kavali',  'j.kavali@kavaliandngata.co.tz',   NOW() - INTERVAL '27 days'),
    (v_env7, v_tenant_id, NULL,   'sent',      'Joseph Kavali',  'j.kavali@kavaliandngata.co.tz',   NOW() - INTERVAL '23 days'),
    (v_env7, v_tenant_id, v_r7a,  'signed',    'Amina Hassani',  'amina.hassani@gmail.com',         NOW() - INTERVAL '22 days'),
    (v_env7, v_tenant_id, v_r7b,  'certified', 'Joseph Kavali',  'j.kavali@kavaliandngata.co.tz',   NOW() - INTERVAL '20 days'),
    (v_env7, v_tenant_id, NULL,   'completed', 'System',         NULL,                              NOW() - INTERVAL '20 days'),
    (v_env7, v_tenant_id, NULL,   'stamped',   'System',         NULL,                              NOW() - INTERVAL '20 days');

  -- Env 8 — Statutory Declaration (declared)
  INSERT INTO sign_events (envelope_id, tenant_id, recipient_id, event_type, actor_name, actor_email, note, created_at)
  VALUES
    (v_env8, v_tenant_id, NULL,   'created',   'Baraka Mwanga',  'b.mwanga@kavaliandngata.co.tz',   NULL,              NOW() - INTERVAL '35 days'),
    (v_env8, v_tenant_id, NULL,   'sent',      'Baraka Mwanga',  'b.mwanga@kavaliandngata.co.tz',   NULL,              NOW() - INTERVAL '32 days'),
    (v_env8, v_tenant_id, v_r8a,  'signed',    'Esther Tarimo',  'esther.tarimo@outlook.com',       NULL,              NOW() - INTERVAL '31 days'),
    (v_env8, v_tenant_id, v_r8b,  'declared',  'Baraka Mwanga',  'b.mwanga@kavaliandngata.co.tz',   'Statutory declaration administered under the Oaths and Statutory Declarations Act [Cap 34 R.E. 2002]. Declarant identified by national ID No. 19881204-00123-00001-8.', NOW() - INTERVAL '30 days'),
    (v_env8, v_tenant_id, NULL,   'completed', 'System',         NULL,                              NULL,              NOW() - INTERVAL '30 days'),
    (v_env8, v_tenant_id, NULL,   'stamped',   'System',         NULL,                              NULL,              NOW() - INTERVAL '30 days');

  -- ── Forensic Cases ────────────────────────────────────────────────────────

  -- Case 1 — DOCUMENT_MISMATCH on env1 (Land Sale — Kariakoo)
  -- Status: reviewing. A legal assistant submitted a client's printed-and-rescanned
  -- copy for verification; the OCR comparison detected textual differences in
  -- the plot boundaries clause compared to the signed canonical PDF.
  INSERT INTO sign_forensic_cases (
    id, tenant_id, envelope_id, forensic_job_id,
    verification_code, content_verdict, status,
    opened_by, opened_by_name, opened_at, manifest_hash,
    created_at, updated_at
  ) VALUES (
    v_fc1, v_tenant_id, v_env1, NULL,
    'HSGN-KNA001-PROP47', 'DOCUMENT_MISMATCH', 'reviewing',
    NULL, 'System (Auto-opened)',
    NOW() - INTERVAL '15 days',
    'mh-a3f7e2b1d9c4058e6f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7',
    NOW() - INTERVAL '15 days', NOW() - INTERVAL '14 days'
  );

  -- Evidence for Case 1
  INSERT INTO sign_forensic_evidence (tenant_id, case_id, filename, media_type, size_bytes, sha256, storage_key, source, created_at)
  VALUES
    (v_tenant_id, v_fc1,
     'KNA-PROP-001-LandSaleAgreement-CANONICAL.pdf', 'application/pdf',
     312580,
     'a3f7e2b1d9c4058e6f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3',
     'forensics/cases/' || v_fc1::text || '/canonical.pdf',
     'canonical', NOW() - INTERVAL '15 days'),
    (v_tenant_id, v_fc1,
     'KNA-PROP-001-LandSaleAgreement-SUBMITTED.pdf', 'application/pdf',
     318924,
     'd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2',
     'forensics/cases/' || v_fc1::text || '/uploaded.pdf',
     'uploaded', NOW() - INTERVAL '15 days'),
    (v_tenant_id, v_fc1,
     'evidence-manifest.json', 'application/json',
     1847,
     'mh-a3f7e2b1d9c4058e6f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7',
     'forensics/cases/' || v_fc1::text || '/manifest.json',
     'manifest', NOW() - INTERVAL '15 days');

  -- Chain of custody for Case 1
  INSERT INTO sign_forensic_audit (tenant_id, case_id, actor_id, actor_name, action, detail, ip_address, created_at)
  VALUES
    (v_tenant_id, v_fc1, NULL,
     'System (Auto-opened)',
     'opened',
     '{"trigger": "non_clean_verdict", "verdict": "DOCUMENT_MISMATCH", "job_id": null}'::jsonb,
     '197.250.1.50',
     NOW() - INTERVAL '15 days'),
    (v_tenant_id, v_fc1, NULL,
     'System',
     'uploaded',
     '{"files": ["canonical.pdf", "uploaded.pdf", "manifest.json"]}'::jsonb,
     '197.250.1.50',
     NOW() - INTERVAL '15 days'),
    (v_tenant_id, v_fc1, v_user_id,
     'Hilda Osei',
     'analysis_initiated',
     '{"tool": "content_comparison", "run_number": 1}'::jsonb,
     '41.75.200.12',
     NOW() - INTERVAL '14 days'),
    (v_tenant_id, v_fc1, v_user_id,
     'Hilda Osei',
     'viewed',
     '{"section": "evidence_vault"}'::jsonb,
     '41.75.200.12',
     NOW() - INTERVAL '14 days'),
    (v_tenant_id, v_fc1, v_user_id,
     'Hilda Osei',
     'status_changed',
     '{"from": "open", "to": "reviewing", "note": "Escalated to Adv. Kavali for review. Content in Clause 3(b) (plot boundaries) differs — the submitted copy uses ''±0.12 ha'' while the canonical signed PDF reads ''0.1247 ha exactly''. Possible manual alteration of the printed copy post-execution."}'::jsonb,
     '41.75.200.12',
     NOW() - INTERVAL '14 days');

  -- Case 2 — SEAL_INVALID on env3 (Employment Contract)
  -- Status: resolved. The document's cryptographic seal was found invalid during
  -- routine post-completion verification — PDF metadata altered to change the
  -- signing date. Investigated and closed.
  INSERT INTO sign_forensic_cases (
    id, tenant_id, envelope_id, forensic_job_id,
    verification_code, content_verdict, status,
    opened_by, opened_by_name, opened_at,
    resolved_by, resolved_at,
    resolution_note, manifest_hash,
    created_at, updated_at
  ) VALUES (
    v_fc2, v_tenant_id, v_env3, NULL,
    'HSGN-KNA003-EMPL', 'SEAL_INVALID', 'resolved',
    NULL, 'System (Auto-opened)',
    NOW() - INTERVAL '6 days',
    v_user_id,
    NOW() - INTERVAL '4 days',
    'Forensic analysis confirmed that the XMP metadata block in the submitted PDF was modified after the platform seal was applied, altering the "signing date" shown in the document properties from 17 September 2026 to 10 August 2026. The canonical PDF in secure storage is unaffected. Original document recovered and re-served to client. Flagged to Nakuru Commodities legal team per engagement letter §12.',
    'mh-c1d9a2b3c4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4',
    NOW() - INTERVAL '6 days', NOW() - INTERVAL '4 days'
  );

  -- Evidence for Case 2
  INSERT INTO sign_forensic_evidence (tenant_id, case_id, filename, media_type, size_bytes, sha256, storage_key, source, created_at)
  VALUES
    (v_tenant_id, v_fc2,
     'KNA-EMPL-003-EmploymentContract-CANONICAL.pdf', 'application/pdf',
     274912,
     'c1d9a2b3c4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',
     'forensics/cases/' || v_fc2::text || '/canonical.pdf',
     'canonical', NOW() - INTERVAL '6 days'),
    (v_tenant_id, v_fc2,
     'KNA-EMPL-003-EmploymentContract-SUBMITTED.pdf', 'application/pdf',
     274798,
     'e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3',
     'forensics/cases/' || v_fc2::text || '/uploaded.pdf',
     'uploaded', NOW() - INTERVAL '6 days'),
    (v_tenant_id, v_fc2,
     'forensic-analysis-report.pdf', 'application/pdf',
     48230,
     'f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4',
     'forensics/cases/' || v_fc2::text || '/report.pdf',
     'report', NOW() - INTERVAL '5 days'),
    (v_tenant_id, v_fc2,
     'evidence-manifest.json', 'application/json',
     2104,
     'mh-c1d9a2b3c4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4',
     'forensics/cases/' || v_fc2::text || '/manifest.json',
     'manifest', NOW() - INTERVAL '6 days');

  -- Chain of custody for Case 2
  INSERT INTO sign_forensic_audit (tenant_id, case_id, actor_id, actor_name, action, detail, ip_address, created_at)
  VALUES
    (v_tenant_id, v_fc2, NULL,
     'System (Auto-opened)',
     'opened',
     '{"trigger": "non_clean_verdict", "verdict": "SEAL_INVALID", "job_id": null}'::jsonb,
     '197.250.1.50',
     NOW() - INTERVAL '6 days'),
    (v_tenant_id, v_fc2, NULL,
     'System',
     'uploaded',
     '{"files": ["canonical.pdf", "uploaded.pdf", "manifest.json"]}'::jsonb,
     '197.250.1.50',
     NOW() - INTERVAL '6 days'),
    (v_tenant_id, v_fc2, v_user_id,
     'Beatrice Ngata',
     'analysis_initiated',
     '{"tool": "seal_verification", "run_number": 1}'::jsonb,
     '41.75.201.88',
     NOW() - INTERVAL '6 days'),
    (v_tenant_id, v_fc2, v_user_id,
     'Beatrice Ngata',
     'status_changed',
     '{"from": "open", "to": "reviewing", "note": "Seal verification confirms anchor_hash mismatch. Metadata alteration identified in XMP block."}'::jsonb,
     '41.75.201.88',
     NOW() - INTERVAL '6 days'),
    (v_tenant_id, v_fc2, v_user_id,
     'Beatrice Ngata',
     'analysis_initiated',
     '{"tool": "content_comparison", "run_number": 2}'::jsonb,
     '41.75.201.88',
     NOW() - INTERVAL '5 days'),
    (v_tenant_id, v_fc2, v_user_id,
     'Beatrice Ngata',
     'uploaded',
     '{"file": "forensic-analysis-report.pdf", "type": "report"}'::jsonb,
     '41.75.201.88',
     NOW() - INTERVAL '5 days'),
    (v_tenant_id, v_fc2, v_user_id,
     'Joseph Kavali',
     'viewed',
     '{"section": "full_case"}'::jsonb,
     '41.75.200.55',
     NOW() - INTERVAL '4 days'),
    (v_tenant_id, v_fc2, v_user_id,
     'Joseph Kavali',
     'status_changed',
     '{"from": "reviewing", "to": "resolved", "note": "Resolved. See resolution note on case."}'::jsonb,
     '41.75.200.55',
     NOW() - INTERVAL '4 days');

  RAISE NOTICE 'sign_lawfirm_seed (mig 519): inserted 6 customers, 8 envelopes, 19 recipients, 40 sign events, 2 forensic cases.';
END $$;
