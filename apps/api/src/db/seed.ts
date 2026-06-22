import crypto from 'crypto';
import { db, withTenant } from './client.js';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86400000);
}
function daysFromNow(d: number): Date {
  return new Date(Date.now() + d * 86400000);
}
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600000);
}

async function runSeed() {
  console.log('🌱 Starting ClearOS database seeding...');

  try {
    // Idempotent: wipe existing tenants
    await db.deleteFrom('tenants').where('slug', '=', 'msomi-freight').execute();
    await db.deleteFrom('tenants').where('slug', '=', 'clearos-system').execute();

    const now = new Date();
    const passHash = hashPassword('password123');

    // ── 0. SYSTEM TENANT + SUPER ADMIN ────────────────────────────────────────
    const systemTenant = await db
      .insertInto('tenants')
      .values({
        name: 'ClearOS System',
        slug: 'clearos-system',
        plan: 'enterprise',
        primary_color: '#0b7264',
        active: true,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db.insertInto('users').values({
      tenant_id: systemTenant.id,
      email: 'superadmin@clearos.io',
      password_hash: passHash,
      role: 'SUPER_ADMIN',
      name: 'Super Admin',
      active: true,
      created_at: now,
      updated_at: now,
    }).execute();

    console.log('✅ System tenant + Super Admin created');

    // ── 1. TENANT ──────────────────────────────────────────────────────────────
    const tenant = await db
      .insertInto('tenants')
      .values({
        name: 'Msomi Freight Ltd',
        slug: 'msomi-freight',
        plan: 'professional',
        primary_color: '#0b7264',
        active: true,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    console.log(`✅ Tenant: ${tenant.name}`);

    await withTenant(tenant.id, async (trx) => {

      // ── 2. LOCATIONS ────────────────────────────────────────────────────────
      const dsmPort = await trx.insertInto('locations').values({
        tenant_id: tenant.id, name: 'Dar es Salaam Port', code: 'DSM',
        type: 'PORT', city: 'Dar es Salaam', country: 'Tanzania', created_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const jnia = await trx.insertInto('locations').values({
        tenant_id: tenant.id, name: 'Julius Nyerere International Airport', code: 'JNIA',
        type: 'AIRPORT', city: 'Dar es Salaam', country: 'Tanzania', created_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const tunduma = await trx.insertInto('locations').values({
        tenant_id: tenant.id, name: 'Tunduma Border Post', code: 'TDM',
        type: 'BORDER', city: 'Tunduma', country: 'Tanzania', created_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const namanga = await trx.insertInto('locations').values({
        tenant_id: tenant.id, name: 'Namanga Border Post', code: 'NMG',
        type: 'BORDER', city: 'Namanga', country: 'Tanzania', created_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      console.log('✅ Locations seeded (4)');

      // ── 3. USERS ────────────────────────────────────────────────────────────
      const admin = await trx.insertInto('users').values({
        tenant_id: tenant.id, email: 'admin@msomi.co', password_hash: passHash,
        role: 'TENANT_ADMIN', name: 'Msomi Admin', phone: '+255712345670',
        active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const manager = await trx.insertInto('users').values({
        tenant_id: tenant.id, email: 'manager@msomi.co', password_hash: passHash,
        role: 'MANAGER', name: 'Jane Mwangi', phone: '+255712345671',
        active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const officerJohn = await trx.insertInto('users').values({
        tenant_id: tenant.id, email: 'junior@msomi.co', password_hash: passHash,
        role: 'JUNIOR', name: 'John Mwenda', phone: '+255712345672',
        location_id: dsmPort.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const officerAmina = await trx.insertInto('users').values({
        tenant_id: tenant.id, email: 'amina@msomi.co', password_hash: passHash,
        role: 'JUNIOR', name: 'Amina Rashid', phone: '+255712345675',
        location_id: dsmPort.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const officerFredrick = await trx.insertInto('users').values({
        tenant_id: tenant.id, email: 'senior@msomi.co', password_hash: passHash,
        role: 'SENIOR', name: 'Fredrick Msemwa', phone: '+255712345676',
        location_id: jnia.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const finance = await trx.insertInto('users').values({
        tenant_id: tenant.id, email: 'finance@msomi.co', password_hash: passHash,
        role: 'FINANCE', name: 'Devota Mushi', phone: '+255712345673',
        active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('users').values({
        tenant_id: tenant.id, email: 'sales@msomi.co', password_hash: passHash,
        role: 'SALES', name: 'Baraka Njovu', phone: '+255712345677',
        active: true, created_at: now, updated_at: now,
      }).execute();

      await trx.insertInto('users').values({
        tenant_id: tenant.id, email: 'logistics@dangote.co.tz', password_hash: passHash,
        role: 'CUSTOMER', name: 'Aliko Dangote Jr', phone: '+255781234501',
        active: true, created_at: now, updated_at: now,
      }).execute();

      console.log('✅ Users seeded (8): admin, manager, junior×2, senior, finance, sales, customer');

      // ── 4. CUSTOMERS ─────────────────────────────────────────────────────────
      const dangote = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Dangote Industries Ltd', contact_name: 'Aliko Dangote Jr',
        email: 'logistics@dangote.co.tz', phone: '+255781234501', phone_wa: '+255781234501',
        category: 'enterprise', preferred_channel: 'WHATSAPP', tax_id: '100-200-300',
        avatar_initials: 'DI', avatar_color: '#bf3422',
        assigned_officer_id: officerJohn.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const tpc = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'TPC Ltd (Sugar Mill)', contact_name: 'Robert Masanja',
        email: 'shipping@tpc.co.tz', phone: '+255781234502', phone_wa: '+255781234502',
        category: 'enterprise', preferred_channel: 'WHATSAPP', tax_id: '100-200-400',
        avatar_initials: 'TP', avatar_color: '#7c3aed',
        assigned_officer_id: officerJohn.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const muhimbili = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Muhimbili National Hospital', contact_name: 'Dr. Frank Minja',
        email: 'imports@muhimbili.or.tz', phone: '+255781234503', phone_wa: '+255781234503',
        category: 'sme', preferred_channel: 'EMAIL', tax_id: '100-500-600',
        avatar_initials: 'MH', avatar_color: '#0891b2',
        assigned_officer_id: officerFredrick.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const simba = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Simba Cement Ltd', contact_name: 'Patrick Kimaro',
        email: 'logistics@simbacements.co.tz', phone: '+255781234504', phone_wa: '+255781234504',
        category: 'enterprise', preferred_channel: 'WHATSAPP', tax_id: '100-300-700',
        avatar_initials: 'SC', avatar_color: '#d97706',
        assigned_officer_id: officerAmina.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const eab = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'East African Breweries', contact_name: 'Sarah Njoroge',
        email: 'supply@eabl.com', phone: '+255781234505', phone_wa: '+255781234505',
        category: 'enterprise', preferred_channel: 'EMAIL', tax_id: '100-400-800',
        avatar_initials: 'EA', avatar_color: '#166534',
        assigned_officer_id: officerAmina.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const kariakoo = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Kariakoo General Traders', contact_name: 'Hassan Mwinyi',
        email: 'imports@kariakootraders.co.tz', phone: '+255781234506', phone_wa: '+255781234506',
        category: 'sme', preferred_channel: 'WHATSAPP', tax_id: '200-100-500',
        avatar_initials: 'KG', avatar_color: '#1e40af',
        assigned_officer_id: officerJohn.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const tazara = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'TAZARA Railway Corporation', contact_name: 'James Ng\'ombe',
        email: 'procurement@tazara.co.tz', phone: '+255781234507', phone_wa: '+255781234507',
        category: 'enterprise', preferred_channel: 'WHATSAPP', tax_id: '300-600-900',
        avatar_initials: 'TZ', avatar_color: '#be123c',
        assigned_officer_id: officerJohn.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const ngorongoro = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Ngorongoro Conservation Authority', contact_name: 'Dr. Peter Lema',
        email: 'supplies@ncaa.go.tz', phone: '+255781234508', phone_wa: '+255781234508',
        category: 'sme', preferred_channel: 'EMAIL', tax_id: '400-700-100',
        avatar_initials: 'NC', avatar_color: '#059669',
        assigned_officer_id: officerFredrick.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      console.log('✅ Customers seeded (8)');

      // ── 5. SHIPMENT CASES ────────────────────────────────────────────────────
      // Helper to insert a case + its initial stage history
      const makeCase = async (data: {
        ref: string; customer_id: string; type: string; goods: string;
        vessel: string; origin: string; dest: string; stage: string;
        officer: string; location_id: string;
        eta?: Date; free_time?: Date; sla?: Date;
        containers: object[]; createdDaysAgo: number;
        tancis?: string; tansad?: string; channel?: string;
      }) => {
        const createdAt = daysAgo(data.createdDaysAgo);
        const c = await trx.insertInto('shipment_cases').values({
          tenant_id: tenant.id,
          ref_number: data.ref,
          customer_id: data.customer_id,
          type: data.type as any,
          goods_desc: data.goods,
          vessel: data.vessel,
          origin_port: data.origin,
          dest_port: data.dest,
          stage: data.stage as any,
          assigned_to: data.officer,
          location_id: data.location_id,
          eta: data.eta || daysFromNow(7),
          free_time_end: data.free_time || daysFromNow(14),
          sla_deadline: data.sla || daysFromNow(3),
          containers: JSON.stringify(data.containers),
          tancis_ref: data.tancis || undefined,
          tansad_number: data.tansad || undefined,
          selectivity_channel: data.channel || undefined,
          created_at: createdAt,
          updated_at: now,
        }).returningAll().executeTakeFirstOrThrow();
        return c;
      };

      // ── DANGOTE (4 cases) ──────────────────────────────────────────────────
      const d1 = await makeCase({
        ref: 'CLR-2026-0001', customer_id: dangote.id, type: 'SEA_FCL',
        goods: 'Construction Equipment (Cranes & Lifters)', vessel: 'COSCO SHIPPING AQUARIUS',
        origin: 'Shanghai, China', dest: 'Dar es Salaam Port', stage: 'PERMITS',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysFromNow(4), free_time: daysFromNow(18),
        sla: hoursAgo(8), // SLA BREACHED
        containers: [
          { number: 'CSLU8901234', size: '40HC', seal_number: 'CS-78901', weight_kg: 28000 },
          { number: 'CSLU8901235', size: '40HC', seal_number: 'CS-78902', weight_kg: 27500 },
        ],
        createdDaysAgo: 4,
      });

      const d2 = await makeCase({
        ref: 'CLR-2026-0002', customer_id: dangote.id, type: 'SEA_FCL',
        goods: 'Generator Parts & Spare Components', vessel: 'MAERSK SENTOSA',
        origin: 'Guangzhou, China', dest: 'Arusha Dry Port', stage: 'TRANSPORT',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysAgo(2), free_time: daysAgo(1),
        sla: daysFromNow(1),
        containers: [{ number: 'MSKU4521890', size: '20FT', seal_number: 'MK-34512', weight_kg: 18000 }],
        createdDaysAgo: 21, tancis: '137644169-26-9900020', tansad: 'TZDA-26-1379800', channel: 'GREEN',
      });

      const d3 = await makeCase({
        ref: 'CLR-2026-0003', customer_id: dangote.id, type: 'SEA_FCL',
        goods: 'Steel Reinforcement Bars (Rebar)', vessel: 'MSC FORTUNATE',
        origin: 'Tianjin, China', dest: 'Dar es Salaam Port', stage: 'TANCIS_REG',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysFromNow(6), free_time: daysFromNow(20),
        sla: daysFromNow(2),
        containers: [
          { number: 'MSCU7710012', size: '40FT', seal_number: 'MS-99001', weight_kg: 26000 },
          { number: 'MSCU7710013', size: '40FT', seal_number: 'MS-99002', weight_kg: 26100 },
          { number: 'MSCU7710014', size: '40FT', seal_number: 'MS-99003', weight_kg: 25800 },
        ],
        createdDaysAgo: 6, tancis: '137644169-26-9900021',
      });

      const d4 = await makeCase({
        ref: 'CLR-2026-0004', customer_id: dangote.id, type: 'ROAD',
        goods: 'Cement Clinker (Bulk)', vessel: 'Road Convoy TZ-004A',
        origin: 'Mombasa, Kenya', dest: 'Dar es Salaam Port', stage: 'DOCS_RECEIVED',
        officer: officerJohn.id, location_id: tunduma.id,
        eta: daysFromNow(3), free_time: daysFromNow(10),
        sla: daysFromNow(4),
        containers: [],
        createdDaysAgo: 1,
      });

      // ── TPC SUGAR (3 cases) ────────────────────────────────────────────────
      const t1 = await makeCase({
        ref: 'CLR-2026-0005', customer_id: tpc.id, type: 'SEA_FCL',
        goods: 'Industrial Pumps & Processing Equipment', vessel: 'MSC ROTTERDAM',
        origin: 'Rotterdam, Netherlands', dest: 'Dar es Salaam Port', stage: 'DO_APPLICATION',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysAgo(1), free_time: hoursAgo(18), // DEMURRAGE ACTIVE
        sla: hoursAgo(36),
        containers: [
          { number: 'MSCU3301800', size: '40HC', seal_number: 'MS-44401', weight_kg: 22000 },
          { number: 'MSCU3301801', size: '40HC', seal_number: 'MS-44402', weight_kg: 21500 },
        ],
        createdDaysAgo: 18, tancis: '137644169-26-9900022', tansad: 'TZDA-26-1379801', channel: 'RED',
      });

      const t2 = await makeCase({
        ref: 'CLR-2026-0006', customer_id: tpc.id, type: 'SEA_FCL',
        goods: 'Sugar Cane Harvesting Machinery', vessel: 'EVERGREEN ETERNITY',
        origin: 'Qingdao, China', dest: 'Dar es Salaam Port', stage: 'ASSESSMENT',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysAgo(3), free_time: daysFromNow(11),
        sla: daysFromNow(1),
        containers: [{ number: 'EGLV1234567', size: '40HC', seal_number: 'EG-56789', weight_kg: 19800 }],
        createdDaysAgo: 9, tancis: '137644169-26-9900023',
      });

      const t3 = await makeCase({
        ref: 'CLR-2026-0007', customer_id: tpc.id, type: 'AIR',
        goods: 'Spare Parts (Urgent) – Turbine Components', vessel: 'Qatar Airways QR507',
        origin: 'Doha, Qatar', dest: 'Julius Nyerere Airport (JNIA)', stage: 'INVOICING',
        officer: officerFredrick.id, location_id: jnia.id,
        eta: daysAgo(5), free_time: null as any, sla: daysFromNow(2),
        containers: [],
        createdDaysAgo: 14, tancis: '137644169-26-9900024', tansad: 'TZDA-26-1379802', channel: 'GREEN',
      });

      // ── MUHIMBILI (3 cases) ────────────────────────────────────────────────
      const m1 = await makeCase({
        ref: 'CLR-2026-0008', customer_id: muhimbili.id, type: 'AIR',
        goods: 'Medical Diagnostic Equipment (MRI Machine)', vessel: 'Kenya Airways KQ401',
        origin: 'Dubai, UAE', dest: 'Julius Nyerere Airport (JNIA)', stage: 'VALIDATION',
        officer: officerFredrick.id, location_id: jnia.id,
        eta: daysFromNow(2), free_time: null as any,
        sla: daysFromNow(1),
        containers: [],
        createdDaysAgo: 3,
      });

      const m2 = await makeCase({
        ref: 'CLR-2026-0009', customer_id: muhimbili.id, type: 'SEA_LCL',
        goods: 'Pharmaceuticals & Medical Supplies (Temperature-controlled)', vessel: 'MSC BEATRICE',
        origin: 'Antwerp, Belgium', dest: 'Dar es Salaam Port', stage: 'INSPECTION',
        officer: officerFredrick.id, location_id: dsmPort.id,
        eta: daysAgo(4), free_time: daysFromNow(6),
        sla: daysFromNow(2),
        containers: [{ number: 'MSCU9912345', size: '20FT', seal_number: 'MS-77654', weight_kg: 8500 }],
        createdDaysAgo: 11, tancis: '137644169-26-9900025', tansad: 'TZDA-26-1379803', channel: 'YELLOW',
      });

      const m3 = await makeCase({
        ref: 'CLR-2026-0010', customer_id: muhimbili.id, type: 'AIR',
        goods: 'Surgical Supplies & PPE Kits', vessel: 'Ethiopian Airlines ET182',
        origin: 'Addis Ababa, Ethiopia', dest: 'Julius Nyerere Airport (JNIA)', stage: 'CLOSED',
        officer: officerFredrick.id, location_id: jnia.id,
        eta: daysAgo(10), free_time: null as any, sla: daysAgo(5),
        containers: [],
        createdDaysAgo: 18, tancis: '137644169-26-9900026', tansad: 'TZDA-26-1379804', channel: 'GREEN',
      });

      // ── SIMBA CEMENT (3 cases) ─────────────────────────────────────────────
      const s1 = await makeCase({
        ref: 'CLR-2026-0011', customer_id: simba.id, type: 'SEA_BULK',
        goods: 'Portland Clinker (32,000 MT bulk cargo)', vessel: 'PACIFIC BASIN NAVIGATOR',
        origin: 'Mumbai Port, India', dest: 'Dar es Salaam Port', stage: 'INSPECTION_BOOKING',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysAgo(2), free_time: daysFromNow(12),
        sla: daysFromNow(1),
        containers: [],
        createdDaysAgo: 14, tancis: '137644169-26-9900027', tansad: 'TZDA-26-1379805', channel: 'GREEN',
      });

      const s2 = await makeCase({
        ref: 'CLR-2026-0012', customer_id: simba.id, type: 'SEA_FCL',
        goods: 'Gypsum (Raw Material for Cement Production)', vessel: 'MSC VALERIA',
        origin: 'Salalah, Oman', dest: 'Dar es Salaam Port', stage: 'ENTRY_PREP',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysFromNow(3), free_time: daysFromNow(17),
        sla: daysFromNow(2),
        containers: [
          { number: 'MSCU1190023', size: '40HC', seal_number: 'MS-11122', weight_kg: 24000 },
          { number: 'MSCU1190024', size: '40HC', seal_number: 'MS-11123', weight_kg: 24100 },
        ],
        createdDaysAgo: 7,
      });

      const s3 = await makeCase({
        ref: 'CLR-2026-0013', customer_id: simba.id, type: 'SEA_FCL',
        goods: 'Packing Material & Cement Bags (50kg, polywoven)', vessel: 'COSCO PRIDE',
        origin: 'Ningbo, China', dest: 'Dar es Salaam Port', stage: 'TAX_PAYMENT',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysAgo(5), free_time: daysFromNow(9),
        sla: hoursAgo(12), // SLA BREACHED
        containers: [{ number: 'COSU8871234', size: '20FT', seal_number: 'CO-33412', weight_kg: 16000 }],
        createdDaysAgo: 12, tancis: '137644169-26-9900028', tansad: 'TZDA-26-1379806', channel: 'RED',
      });

      // ── EAST AFRICAN BREWERIES (3 cases) ──────────────────────────────────
      const e1 = await makeCase({
        ref: 'CLR-2026-0014', customer_id: eab.id, type: 'SEA_FCL',
        goods: 'Hops & Brewing Ingredients (Temperature-sensitive)', vessel: 'MAERSK DENVER',
        origin: 'Hamburg, Germany', dest: 'Mombasa Port (KE)', stage: 'RELEASE',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysAgo(6), free_time: daysFromNow(4),
        sla: daysFromNow(1),
        containers: [
          { number: 'MSKU7762341', size: '40RF', seal_number: 'MK-88901', weight_kg: 21000 },
        ],
        createdDaysAgo: 16, tancis: '137644169-26-9900029', tansad: 'TZDA-26-1379807', channel: 'YELLOW',
      });

      const e2 = await makeCase({
        ref: 'CLR-2026-0015', customer_id: eab.id, type: 'SEA_LCL',
        goods: 'Laboratory Testing Equipment & Consumables', vessel: 'EVERGREEN EVER LOYAL',
        origin: 'Singapore', dest: 'Dar es Salaam Port', stage: 'DOCS_RECEIVED',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysFromNow(10), free_time: daysFromNow(24),
        sla: daysFromNow(3),
        containers: [],
        createdDaysAgo: 2,
      });

      const e3 = await makeCase({
        ref: 'CLR-2026-0016', customer_id: eab.id, type: 'SEA_FCL',
        goods: 'Glass Bottles & Crown Caps (Bulk)', vessel: 'MSC CAPRI',
        origin: 'Jebel Ali, UAE', dest: 'Dar es Salaam Port', stage: 'GATE_PASS',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysAgo(8), free_time: daysAgo(2),
        sla: daysFromNow(1),
        containers: [
          { number: 'MSCU6610022', size: '40FT', seal_number: 'MS-66001', weight_kg: 20000 },
          { number: 'MSCU6610023', size: '40FT', seal_number: 'MS-66002', weight_kg: 19800 },
        ],
        createdDaysAgo: 19, tancis: '137644169-26-9900030', tansad: 'TZDA-26-1379808', channel: 'GREEN',
      });

      // ── KARIAKOO TRADERS (2 cases) ─────────────────────────────────────────
      const k1 = await makeCase({
        ref: 'CLR-2026-0017', customer_id: kariakoo.id, type: 'SEA_LCL',
        goods: 'General Merchandise (Electronics, Textiles, Plasticware)', vessel: 'CMA CGM COLUMBA',
        origin: 'Guangzhou, China', dest: 'Dar es Salaam Port', stage: 'ICD_PAYMENT',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysAgo(7), free_time: daysAgo(3),
        sla: hoursAgo(6),
        containers: [{ number: 'CMAU3345678', size: '20FT', seal_number: 'CM-77891', weight_kg: 17000 }],
        createdDaysAgo: 15, tancis: '137644169-26-9900031', tansad: 'TZDA-26-1379809', channel: 'GREEN',
      });

      const k2 = await makeCase({
        ref: 'CLR-2026-0018', customer_id: kariakoo.id, type: 'AIR',
        goods: 'Mobile Phones & Accessories (Fast-moving)', vessel: 'Turkish Airlines TK742',
        origin: 'Istanbul, Turkey', dest: 'Julius Nyerere Airport (JNIA)', stage: 'ENTRY_PREP',
        officer: officerFredrick.id, location_id: jnia.id,
        eta: daysAgo(1), free_time: null as any,
        sla: daysFromNow(2),
        containers: [],
        createdDaysAgo: 4, tancis: '137644169-26-9900032',
      });

      // ── TAZARA (3 cases) ───────────────────────────────────────────────────
      const tz1 = await makeCase({
        ref: 'CLR-2026-0019', customer_id: tazara.id, type: 'SEA_FCL',
        goods: 'Railway Tracks & Sleepers (Heavy Machinery)', vessel: 'MSC OSAKA',
        origin: 'Yokohama, Japan', dest: 'Dar es Salaam Port', stage: 'TAX_PAYMENT',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysAgo(4), free_time: daysFromNow(10),
        sla: daysFromNow(2),
        containers: [
          { number: 'MSCU5500901', size: '40FT', seal_number: 'MS-55101', weight_kg: 29000 },
          { number: 'MSCU5500902', size: '40FT', seal_number: 'MS-55102', weight_kg: 28500 },
          { number: 'MSCU5500903', size: '40FT', seal_number: 'MS-55103', weight_kg: 28700 },
        ],
        createdDaysAgo: 13, tancis: '137644169-26-9900033', tansad: 'TZDA-26-1379810', channel: 'RED',
      });

      const tz2 = await makeCase({
        ref: 'CLR-2026-0020', customer_id: tazara.id, type: 'SEA_FCL',
        goods: 'Locomotive Diesel Engine (Replacement)', vessel: 'YANG MING GLORY',
        origin: 'Busan, South Korea', dest: 'Dar es Salaam Port', stage: 'DELIVERY',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysAgo(12), free_time: daysAgo(5), sla: daysAgo(8),
        containers: [{ number: 'YMLU8800011', size: '40OT', seal_number: 'YM-10011', weight_kg: 32000 }],
        createdDaysAgo: 28, tancis: '137644169-26-9900034', tansad: 'TZDA-26-1379811', channel: 'GREEN',
      });

      const tz3 = await makeCase({
        ref: 'CLR-2026-0021', customer_id: tazara.id, type: 'ROAD',
        goods: 'Rail Maintenance Tools & Equipment', vessel: 'Road Convoy TZ-021B',
        origin: 'Zambia Border (Tunduma)', dest: 'Dar es Salaam Workshop', stage: 'DOCS_RECEIVED',
        officer: officerJohn.id, location_id: tunduma.id,
        eta: daysFromNow(2), free_time: daysFromNow(8),
        sla: daysFromNow(3),
        containers: [],
        createdDaysAgo: 1,
      });

      // ── NGORONGORO (2 cases) ───────────────────────────────────────────────
      const n1 = await makeCase({
        ref: 'CLR-2026-0022', customer_id: ngorongoro.id, type: 'AIR',
        goods: 'Ranger Vehicles & Conservation Equipment', vessel: 'Ethiopian Airlines ET621',
        origin: 'Nairobi, Kenya', dest: 'Julius Nyerere Airport (JNIA)', stage: 'CLOSED',
        officer: officerFredrick.id, location_id: jnia.id,
        eta: daysAgo(15), free_time: null as any, sla: daysAgo(12),
        containers: [],
        createdDaysAgo: 22, tancis: '137644169-26-9900035', tansad: 'TZDA-26-1379812', channel: 'GREEN',
      });

      const n2 = await makeCase({
        ref: 'CLR-2026-0023', customer_id: ngorongoro.id, type: 'SEA_FCL',
        goods: 'Solar Panels & Battery Systems (Off-grid)', vessel: 'MSC CONSTANZA',
        origin: 'Rotterdam, Netherlands', dest: 'Dar es Salaam Port', stage: 'ASSESSMENT',
        officer: officerFredrick.id, location_id: dsmPort.id,
        eta: daysAgo(5), free_time: daysFromNow(9),
        sla: daysFromNow(1),
        containers: [
          { number: 'MSCU4400124', size: '20FT', seal_number: 'MS-44124', weight_kg: 14000 },
        ],
        createdDaysAgo: 10, tancis: '137644169-26-9900036',
      });

      console.log(`✅ Shipment cases seeded (23)`);

      // ── 6. STAGE HISTORY ─────────────────────────────────────────────────────
      // Add stage history for the most important cases
      type StageRow = { tenant_id: string; shipment_id: string; stage: string; entered_at: Date; exited_at?: Date; duration_h?: number; actor_id: string; note?: string };
      const stageRows: StageRow[] = [
        // d1 - PERMITS (4 days old, SLA breached)
        { tenant_id: tenant.id, shipment_id: d1.id, stage: 'DOCS_RECEIVED', entered_at: daysAgo(4), exited_at: daysAgo(3), duration_h: 4, actor_id: officerJohn.id, note: 'All docs received from shipper' },
        { tenant_id: tenant.id, shipment_id: d1.id, stage: 'VALIDATION', entered_at: daysAgo(3), exited_at: daysAgo(2), duration_h: 6, actor_id: officerJohn.id, note: 'HS code verified, invoice qty matched' },
        { tenant_id: tenant.id, shipment_id: d1.id, stage: 'PERMITS', entered_at: daysAgo(2), actor_id: officerJohn.id },

        // d2 - TRANSPORT (21 days, nearing delivery)
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'DOCS_RECEIVED', entered_at: daysAgo(21), exited_at: daysAgo(20), duration_h: 3, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'VALIDATION', entered_at: daysAgo(20), exited_at: daysAgo(18), duration_h: 8, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'PERMITS', entered_at: daysAgo(18), exited_at: daysAgo(14), duration_h: 96, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'ENTRY_PREP', entered_at: daysAgo(14), exited_at: daysAgo(12), duration_h: 24, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'TANCIS_REG', entered_at: daysAgo(12), exited_at: daysAgo(11), duration_h: 4, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'ASSESSMENT', entered_at: daysAgo(11), exited_at: daysAgo(9), duration_h: 48, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'TAX_PAYMENT', entered_at: daysAgo(9), exited_at: daysAgo(8), duration_h: 12, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'DO_APPLICATION', entered_at: daysAgo(8), exited_at: daysAgo(7), duration_h: 6, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'INSPECTION_BOOKING', entered_at: daysAgo(7), exited_at: daysAgo(6), duration_h: 4, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'INSPECTION', entered_at: daysAgo(6), exited_at: daysAgo(4), duration_h: 48, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'GOV_REMARKS', entered_at: daysAgo(4), exited_at: daysAgo(3), duration_h: 8, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'RELEASE', entered_at: daysAgo(3), exited_at: daysAgo(2), duration_h: 6, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'ICD_PAYMENT', entered_at: daysAgo(2), exited_at: daysAgo(1), duration_h: 4, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'GATE_PASS', entered_at: daysAgo(1), exited_at: hoursAgo(12), duration_h: 4, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: d2.id, stage: 'TRANSPORT', entered_at: hoursAgo(12), actor_id: officerJohn.id, note: 'En route to Arusha Dry Port' },

        // t1 - DO_APPLICATION with demurrage (18 days)
        { tenant_id: tenant.id, shipment_id: t1.id, stage: 'DOCS_RECEIVED', entered_at: daysAgo(18), exited_at: daysAgo(17), duration_h: 5, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: t1.id, stage: 'VALIDATION', entered_at: daysAgo(17), exited_at: daysAgo(15), duration_h: 12, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: t1.id, stage: 'PERMITS', entered_at: daysAgo(15), exited_at: daysAgo(11), duration_h: 96, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: t1.id, stage: 'ENTRY_PREP', entered_at: daysAgo(11), exited_at: daysAgo(9), duration_h: 24, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: t1.id, stage: 'TANCIS_REG', entered_at: daysAgo(9), exited_at: daysAgo(8), duration_h: 6, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: t1.id, stage: 'ASSESSMENT', entered_at: daysAgo(8), exited_at: daysAgo(6), duration_h: 48, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: t1.id, stage: 'TAX_PAYMENT', entered_at: daysAgo(6), exited_at: daysAgo(5), duration_h: 18, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: t1.id, stage: 'DO_APPLICATION', entered_at: daysAgo(5), actor_id: officerJohn.id, note: 'Waiting for shipping line DO release – demurrage now active' },

        // m3 - CLOSED
        { tenant_id: tenant.id, shipment_id: m3.id, stage: 'DOCS_RECEIVED', entered_at: daysAgo(18), exited_at: daysAgo(17), duration_h: 3, actor_id: officerFredrick.id },
        { tenant_id: tenant.id, shipment_id: m3.id, stage: 'VALIDATION', entered_at: daysAgo(17), exited_at: daysAgo(16), duration_h: 4, actor_id: officerFredrick.id },
        { tenant_id: tenant.id, shipment_id: m3.id, stage: 'ENTRY_PREP', entered_at: daysAgo(16), exited_at: daysAgo(15), duration_h: 8, actor_id: officerFredrick.id },
        { tenant_id: tenant.id, shipment_id: m3.id, stage: 'TANCIS_REG', entered_at: daysAgo(15), exited_at: daysAgo(14), duration_h: 3, actor_id: officerFredrick.id },
        { tenant_id: tenant.id, shipment_id: m3.id, stage: 'ASSESSMENT', entered_at: daysAgo(14), exited_at: daysAgo(12), duration_h: 36, actor_id: officerFredrick.id },
        { tenant_id: tenant.id, shipment_id: m3.id, stage: 'TAX_PAYMENT', entered_at: daysAgo(12), exited_at: daysAgo(11), duration_h: 12, actor_id: officerFredrick.id },
        { tenant_id: tenant.id, shipment_id: m3.id, stage: 'RELEASE', entered_at: daysAgo(11), exited_at: daysAgo(10), duration_h: 6, actor_id: officerFredrick.id },
        { tenant_id: tenant.id, shipment_id: m3.id, stage: 'DELIVERY', entered_at: daysAgo(10), exited_at: daysAgo(8), duration_h: 24, actor_id: officerFredrick.id },
        { tenant_id: tenant.id, shipment_id: m3.id, stage: 'INVOICING', entered_at: daysAgo(8), exited_at: daysAgo(7), duration_h: 12, actor_id: finance.id },
        { tenant_id: tenant.id, shipment_id: m3.id, stage: 'CLOSED', entered_at: daysAgo(7), actor_id: admin.id, note: 'Invoice paid. Case closed.' },
      ];

      for (const row of stageRows) {
        await trx.insertInto('stage_history').values(row as any).execute();
      }
      console.log(`✅ Stage history seeded`);

      // ── 7. EXPENSES / COST LEDGER ────────────────────────────────────────────
      type ExpRow = { tenant_id: string; shipment_id: string; category: string; label: string; amount_tzs: number; is_revenue: boolean; is_passthrough: boolean; recorded_by: string; created_at: Date };
      const expenseRows: ExpRow[] = [
        // d1 costs
        { tenant_id: tenant.id, shipment_id: d1.id, category: 'REVENUE', label: 'Clearance Fee', amount_tzs: 2200000, is_revenue: true, is_passthrough: false, recorded_by: finance.id, created_at: daysAgo(3) },
        { tenant_id: tenant.id, shipment_id: d1.id, category: 'REVENUE', label: 'Agency Fee', amount_tzs: 500000, is_revenue: true, is_passthrough: false, recorded_by: finance.id, created_at: daysAgo(3) },
        { tenant_id: tenant.id, shipment_id: d1.id, category: 'DUTY', label: 'Import Duty (TRA)', amount_tzs: 72000000, is_revenue: false, is_passthrough: true, recorded_by: finance.id, created_at: daysAgo(2) },
        { tenant_id: tenant.id, shipment_id: d1.id, category: 'PORT', label: 'TPA Port Charges', amount_tzs: 1850000, is_revenue: false, is_passthrough: true, recorded_by: finance.id, created_at: daysAgo(2) },
        { tenant_id: tenant.id, shipment_id: d1.id, category: 'INSPECTION', label: 'TASAC Inspection Fee', amount_tzs: 220000, is_revenue: false, is_passthrough: false, recorded_by: finance.id, created_at: daysAgo(1) },
        { tenant_id: tenant.id, shipment_id: d1.id, category: 'STORAGE', label: 'ICD Storage (accruing)', amount_tzs: 180000, is_revenue: false, is_passthrough: false, recorded_by: finance.id, created_at: now },

        // t1 costs (demurrage case)
        { tenant_id: tenant.id, shipment_id: t1.id, category: 'REVENUE', label: 'Clearance Fee', amount_tzs: 1800000, is_revenue: true, is_passthrough: false, recorded_by: finance.id, created_at: daysAgo(17) },
        { tenant_id: tenant.id, shipment_id: t1.id, category: 'REVENUE', label: 'Transport Fee', amount_tzs: 620000, is_revenue: true, is_passthrough: false, recorded_by: finance.id, created_at: daysAgo(17) },
        { tenant_id: tenant.id, shipment_id: t1.id, category: 'DUTY', label: 'Import Duty (TRA)', amount_tzs: 58200000, is_revenue: false, is_passthrough: true, recorded_by: finance.id, created_at: daysAgo(6) },
        { tenant_id: tenant.id, shipment_id: t1.id, category: 'PORT', label: 'TPA Port Charges', amount_tzs: 1400000, is_revenue: false, is_passthrough: true, recorded_by: finance.id, created_at: daysAgo(6) },
        { tenant_id: tenant.id, shipment_id: t1.id, category: 'HAULAGE', label: 'Haulage & Handling', amount_tzs: 450000, is_revenue: false, is_passthrough: false, recorded_by: finance.id, created_at: daysAgo(5) },
        { tenant_id: tenant.id, shipment_id: t1.id, category: 'DEMURRAGE', label: 'Demurrage Charges (accruing)', amount_tzs: 420000, is_revenue: false, is_passthrough: false, recorded_by: finance.id, created_at: now },

        // m3 costs (closed case - complete P&L)
        { tenant_id: tenant.id, shipment_id: m3.id, category: 'REVENUE', label: 'Clearance Fee', amount_tzs: 1500000, is_revenue: true, is_passthrough: false, recorded_by: finance.id, created_at: daysAgo(18) },
        { tenant_id: tenant.id, shipment_id: m3.id, category: 'REVENUE', label: 'Airport Handling Fee', amount_tzs: 350000, is_revenue: true, is_passthrough: false, recorded_by: finance.id, created_at: daysAgo(18) },
        { tenant_id: tenant.id, shipment_id: m3.id, category: 'DUTY', label: 'Import Duty (TRA) – Medical Exempt', amount_tzs: 0, is_revenue: false, is_passthrough: true, recorded_by: finance.id, created_at: daysAgo(14) },
        { tenant_id: tenant.id, shipment_id: m3.id, category: 'INSPECTION', label: 'TMDA Inspection & Permit', amount_tzs: 280000, is_revenue: false, is_passthrough: false, recorded_by: finance.id, created_at: daysAgo(14) },
        { tenant_id: tenant.id, shipment_id: m3.id, category: 'TRANSPORT', label: 'Delivery to Hospital', amount_tzs: 190000, is_revenue: false, is_passthrough: false, recorded_by: finance.id, created_at: daysAgo(10) },
      ];

      for (const row of expenseRows) {
        await trx.insertInto('expenses').values(row as any).execute();
      }
      console.log('✅ Expenses seeded');

      // ── 8. RISK FLAGS ────────────────────────────────────────────────────────
      type RiskRow = { tenant_id: string; shipment_id: string; type: string; severity: string; message: string; deadline?: Date; resolved: boolean; created_at: Date };
      const riskRows: RiskRow[] = [
        // d1 - SLA breach
        { tenant_id: tenant.id, shipment_id: d1.id, type: 'SLA_BREACH', severity: 'HIGH', message: 'Permit stage SLA exceeded by 8 hours. Escalate to manager.', resolved: false, created_at: hoursAgo(8) },
        // t1 - DEMURRAGE
        { tenant_id: tenant.id, shipment_id: t1.id, type: 'DEMURRAGE', severity: 'HIGH', message: 'Demurrage free time expired 18 hours ago. Daily charges: TZS 210,000.', deadline: hoursAgo(18), resolved: false, created_at: hoursAgo(18) },
        { tenant_id: tenant.id, shipment_id: t1.id, type: 'SLA_BREACH', severity: 'HIGH', message: 'DO Application stage SLA breached (36 hours over).', resolved: false, created_at: hoursAgo(36) },
        // s3 - SLA
        { tenant_id: tenant.id, shipment_id: s3.id, type: 'SLA_BREACH', severity: 'MEDIUM', message: 'Tax Payment stage SLA exceeded by 12 hours.', resolved: false, created_at: hoursAgo(12) },
        // k1 - SLA
        { tenant_id: tenant.id, shipment_id: k1.id, type: 'SLA_BREACH', severity: 'MEDIUM', message: 'ICD Payment stage has exceeded SLA.', resolved: false, created_at: hoursAgo(6) },
        // e3 - demurrage just expired
        { tenant_id: tenant.id, shipment_id: e3.id, type: 'DEMURRAGE', severity: 'MEDIUM', message: 'Demurrage free time expired 2 days ago. Charges accruing.', deadline: daysAgo(2), resolved: false, created_at: daysAgo(2) },
      ];

      for (const row of riskRows) {
        await trx.insertInto('risk_flags').values(row as any).execute();
      }
      console.log('✅ Risk flags seeded');

      // ── 9. MESSAGES / COMMS LOG ──────────────────────────────────────────────
      type MsgRow = { tenant_id: string; shipment_id: string; author_id: string; author_name: string; author_type: string; channel: string; direction: string; content: string; created_at: Date };
      const msgRows: MsgRow[] = [
        { tenant_id: tenant.id, shipment_id: d1.id, author_id: dangote.id, author_name: 'Dangote Ops Team', author_type: 'CUSTOMER', channel: 'WHATSAPP', direction: 'INBOUND', content: 'Hi, please find attached BL, CI and PL for shipment CLR-2026-0001. Construction equipment for Dar project.', created_at: daysAgo(4) },
        { tenant_id: tenant.id, shipment_id: d1.id, author_id: officerJohn.id, author_name: 'John Mwenda', author_type: 'OFFICER', channel: 'WHATSAPP', direction: 'OUTBOUND', content: 'Documents received. Starting validation. TMDA permit will be required for machinery – we will apply today.', created_at: daysAgo(3) },
        { tenant_id: tenant.id, shipment_id: d1.id, author_id: admin.id, author_name: 'ClearOS Bot', author_type: 'BOT', channel: 'WHATSAPP', direction: 'OUTBOUND', content: '🔔 Update – CLR-2026-0001\nDangote Industries Ltd\n\n✅ Completed: Document Validation\n⏳ Now at: Permit Applications\n📅 Next update: tomorrow 08:00', created_at: daysAgo(2) },
        { tenant_id: tenant.id, shipment_id: d1.id, author_id: dangote.id, author_name: 'Dangote Ops Team', author_type: 'CUSTOMER', channel: 'WHATSAPP', direction: 'INBOUND', content: 'Thanks. How long for TMDA permit? We need the equipment on site by next week.', created_at: daysAgo(1) },

        { tenant_id: tenant.id, shipment_id: t1.id, author_id: admin.id, author_name: 'ClearOS Bot', author_type: 'BOT', channel: 'WHATSAPP', direction: 'OUTBOUND', content: '🚨 URGENT – CLR-2026-0005\nDemurrage Alert: Free time expired. Daily charges of TZS 210,000 now accruing.\nAction required: Obtain DO from MSC immediately.\nContact: +255 700 000 000', created_at: hoursAgo(18) },
        { tenant_id: tenant.id, shipment_id: t1.id, author_id: tpc.id, author_name: 'TPC Logistics', author_type: 'CUSTOMER', channel: 'WHATSAPP', direction: 'INBOUND', content: 'We are trying to process payment for the DO. MSC saying system is down. What can we do?', created_at: hoursAgo(16) },
        { tenant_id: tenant.id, shipment_id: t1.id, author_id: officerJohn.id, author_name: 'John Mwenda', author_type: 'OFFICER', channel: 'WHATSAPP', direction: 'OUTBOUND', content: 'Escalating to MSC agent directly. Please prepare original BL for DO release. I will call you shortly.', created_at: hoursAgo(15) },

        { tenant_id: tenant.id, shipment_id: m3.id, author_id: admin.id, author_name: 'ClearOS Bot', author_type: 'BOT', channel: 'EMAIL', direction: 'OUTBOUND', content: 'Case Closed – CLR-2026-0010\n\nDear Dr. Minja,\n\nYour shipment of Surgical Supplies & PPE Kits has been successfully cleared and delivered. Invoice attached.\n\nThank you for choosing Msomi Freight Ltd.', created_at: daysAgo(7) },
      ];

      for (const row of msgRows) {
        await trx.insertInto('case_messages').values(row as any).execute();
      }
      console.log('✅ Messages seeded');

      // ── 10. DOCUMENTS ────────────────────────────────────────────────────────
      type DocRow = { tenant_id: string; shipment_id: string; type: string; filename: string; storage_key: string; status: string; verified_at?: Date; created_at: Date };
      const docRows: DocRow[] = [
        // d1 docs
        { tenant_id: tenant.id, shipment_id: d1.id, type: 'BL', filename: 'BL_COSCO_CSLU8901234.pdf', storage_key: `t/${tenant.id}/d1/BL.pdf`, status: 'VERIFIED', verified_at: daysAgo(3), created_at: daysAgo(4) },
        { tenant_id: tenant.id, shipment_id: d1.id, type: 'INVOICE', filename: 'CI_Dangote_Equipment.pdf', storage_key: `t/${tenant.id}/d1/CI.pdf`, status: 'RECEIVED', created_at: daysAgo(4) },
        { tenant_id: tenant.id, shipment_id: d1.id, type: 'PACKING_LIST', filename: 'PL_Dangote_Equipment.pdf', storage_key: `t/${tenant.id}/d1/PL.pdf`, status: 'RECEIVED', created_at: daysAgo(4) },
        { tenant_id: tenant.id, shipment_id: d1.id, type: 'PERMIT', filename: 'TMDA_Permit_Pending.pdf', storage_key: `t/${tenant.id}/d1/TMDA.pdf`, status: 'REQUIRED', created_at: daysAgo(2) },

        // t1 docs (nearly all done)
        { tenant_id: tenant.id, shipment_id: t1.id, type: 'BL', filename: 'BL_MSC_MSCU3301800.pdf', storage_key: `t/${tenant.id}/t1/BL.pdf`, status: 'VERIFIED', verified_at: daysAgo(17), created_at: daysAgo(18) },
        { tenant_id: tenant.id, shipment_id: t1.id, type: 'INVOICE', filename: 'CI_TPC_Pumps.pdf', storage_key: `t/${tenant.id}/t1/CI.pdf`, status: 'VERIFIED', verified_at: daysAgo(16), created_at: daysAgo(18) },
        { tenant_id: tenant.id, shipment_id: t1.id, type: 'PACKING_LIST', filename: 'PL_TPC_Pumps.pdf', storage_key: `t/${tenant.id}/t1/PL.pdf`, status: 'VERIFIED', verified_at: daysAgo(16), created_at: daysAgo(18) },
        { tenant_id: tenant.id, shipment_id: t1.id, type: 'TANCIS_ENTRY', filename: 'TANCIS_Entry_T1.pdf', storage_key: `t/${tenant.id}/t1/TANCIS.pdf`, status: 'VERIFIED', verified_at: daysAgo(9), created_at: daysAgo(9) },
        { tenant_id: tenant.id, shipment_id: t1.id, type: 'ASSESSMENT', filename: 'TRA_Assessment_T1.pdf', storage_key: `t/${tenant.id}/t1/TRA.pdf`, status: 'VERIFIED', verified_at: daysAgo(6), created_at: daysAgo(6) },
        { tenant_id: tenant.id, shipment_id: t1.id, type: 'TAX_RECEIPT', filename: 'Tax_Receipt_T1.pdf', storage_key: `t/${tenant.id}/t1/TaxReceipt.pdf`, status: 'VERIFIED', verified_at: daysAgo(5), created_at: daysAgo(5) },

        // m3 docs (all verified - closed case)
        { tenant_id: tenant.id, shipment_id: m3.id, type: 'AWB', filename: 'AWB_ET182_2026.pdf', storage_key: `t/${tenant.id}/m3/AWB.pdf`, status: 'VERIFIED', verified_at: daysAgo(17), created_at: daysAgo(18) },
        { tenant_id: tenant.id, shipment_id: m3.id, type: 'INVOICE', filename: 'CI_Muhimbili_Supplies.pdf', storage_key: `t/${tenant.id}/m3/CI.pdf`, status: 'VERIFIED', verified_at: daysAgo(17), created_at: daysAgo(18) },
        { tenant_id: tenant.id, shipment_id: m3.id, type: 'PERMIT', filename: 'TMDA_Clearance_Certificate.pdf', storage_key: `t/${tenant.id}/m3/TMDA.pdf`, status: 'VERIFIED', verified_at: daysAgo(14), created_at: daysAgo(14) },
        { tenant_id: tenant.id, shipment_id: m3.id, type: 'TANCIS_ENTRY', filename: 'TANCIS_Entry_M3.pdf', storage_key: `t/${tenant.id}/m3/TANCIS.pdf`, status: 'VERIFIED', verified_at: daysAgo(12), created_at: daysAgo(12) },
        { tenant_id: tenant.id, shipment_id: m3.id, type: 'DELIVERY_NOTE', filename: 'Delivery_Note_MNH.pdf', storage_key: `t/${tenant.id}/m3/DN.pdf`, status: 'VERIFIED', verified_at: daysAgo(8), created_at: daysAgo(8) },
        { tenant_id: tenant.id, shipment_id: m3.id, type: 'INVOICE_CLIENT', filename: 'Msomi_Invoice_M3.pdf', storage_key: `t/${tenant.id}/m3/ClientInvoice.pdf`, status: 'VERIFIED', verified_at: daysAgo(7), created_at: daysAgo(7) },
      ];

      for (const row of docRows) {
        await trx.insertInto('case_documents').values(row as any).execute();
      }
      console.log('✅ Documents seeded');
    });

    console.log('\n🎉 ClearOS seed complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Login credentials (all use password123):');
    console.log('  superadmin@clearos.io → SUPER_ADMIN  ← platform superadmin');
    console.log('  admin@msomi.co        → TENANT_ADMIN (Admin)');
    console.log('  manager@msomi.co      → MANAGER');
    console.log('  senior@msomi.co       → SENIOR  (Fredrick Msemwa)');
    console.log('  junior@msomi.co       → JUNIOR  (John Mwenda)');
    console.log('  amina@msomi.co        → JUNIOR  (Amina Rashid)');
    console.log('  finance@msomi.co      → FINANCE');
    console.log('  sales@msomi.co        → SALES   (Baraka Njovu)');
    console.log('  logistics@dangote.co.tz → CUSTOMER (Aliko Dangote Jr)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Tenant: Msomi Freight Ltd (msomi-freight)');
    console.log('  Customers: 8 | Shipments: 23 | Stages: all covered');
    console.log('  Cases with demurrage: CLR-2026-0005, CLR-2026-0016');
    console.log('  Cases with SLA breach: CLR-2026-0001, CLR-2026-0005, CLR-2026-0013');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

runSeed();
