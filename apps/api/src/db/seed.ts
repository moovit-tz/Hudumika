import crypto from 'crypto';
import { db, withTenant } from './client.js';
import { MinioIntegration } from '../integrations/minio.js';

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
  console.log('🌱 Starting Hudumika database seeding...');

  try {
    // Idempotent: wipe existing tenants
    await db.deleteFrom('tenants').where('slug', '=', 'msomi-freight').execute();
    await db.deleteFrom('tenants').where('slug', '=', 'hudumika-system').execute();

    const now = new Date();
    const passHash = hashPassword('password123');

    // ── 0. SYSTEM TENANT + SUPER ADMIN ────────────────────────────────────────
    const systemTenant = await db
      .insertInto('tenants')
      .values({
        name: 'Hudumika System',
        slug: 'hudumika-system',
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
      email: 'superadmin@hudumika.tz',
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
        plan: 'scale',
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

      // ── PDF-imported Aleka Logistics client list ───────────────────────────
      const yionx = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'YIONX Trading Company Limited', contact_name: 'YIONX Logistics',
        email: 'imports@yionxtrading.co.tz', phone: '+255782100001', phone_wa: '+255782100001',
        category: 'sme', preferred_channel: 'WHATSAPP', tax_id: '500-100-001',
        avatar_initials: 'YT', avatar_color: '#dc2626',
        assigned_officer_id: officerJohn.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const newHeavy = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'New Heavy Company Limited', contact_name: 'New Heavy Ltd',
        email: 'imports@newheavy.co.tz', phone: '+255782100002', phone_wa: '+255782100002',
        category: 'sme', preferred_channel: 'WHATSAPP', tax_id: '500-100-002',
        avatar_initials: 'NH', avatar_color: '#7c3aed',
        assigned_officer_id: officerAmina.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const decatech = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Decatech Limited', contact_name: 'Decatech Imports',
        email: 'imports@decatech.co.tz', phone: '+255782100003', phone_wa: '+255782100003',
        category: 'sme', preferred_channel: 'EMAIL', tax_id: '500-100-003',
        avatar_initials: 'DT', avatar_color: '#0891b2',
        assigned_officer_id: officerFredrick.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const lnFuture = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'LN Future Building Materials Co. Limited', contact_name: 'LN Future Ltd',
        email: 'imports@lnfuture.co.tz', phone: '+255782100004', phone_wa: '+255782100004',
        category: 'enterprise', preferred_channel: 'WHATSAPP', tax_id: '500-100-004',
        avatar_initials: 'LN', avatar_color: '#d97706',
        assigned_officer_id: officerJohn.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const burnMfg = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Burn Manufacturing TZ Limited', contact_name: 'Burn Mfg TZ',
        email: 'imports@burnmfg.co.tz', phone: '+255782100005', phone_wa: '+255782100005',
        category: 'enterprise', preferred_channel: 'WHATSAPP', tax_id: '500-100-005',
        avatar_initials: 'BM', avatar_color: '#166534',
        assigned_officer_id: officerAmina.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const negelo = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Negelo Investment Tanzania Limited', contact_name: 'Negelo Investment',
        email: 'imports@negelo.co.tz', phone: '+255782100006', phone_wa: '+255782100006',
        category: 'sme', preferred_channel: 'WHATSAPP', tax_id: '500-100-006',
        avatar_initials: 'NI', avatar_color: '#be123c',
        assigned_officer_id: officerFredrick.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const aleka = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Aleka Holdings Limited', contact_name: 'Aleka Holdings',
        email: 'imports@aleka.tech', phone: '+255782100007', phone_wa: '+255782100007',
        category: 'enterprise', preferred_channel: 'EMAIL', tax_id: '500-100-007',
        avatar_initials: 'AH', avatar_color: '#0b7264',
        assigned_officer_id: officerJohn.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      console.log('✅ PDF Aleka client customers seeded (+7)');

      // ── 5. SHIPMENT CASES ────────────────────────────────────────────────────
      // Helper to insert a case + its initial stage history
      // Helper to insert a case + its initial stage history
      const makeCase = async (data: {
        ref: string; customer_id: string; type: string; goods: string;
        vessel: string; origin: string; dest: string; stage: string;
        officer: string; location_id: string;
        eta?: Date; free_time?: Date; sla?: Date;
        containers: object[]; createdDaysAgo: number;
        tancis?: string; tansad?: string; channel?: string;
        nps_score?: number;
        csat_score?: number;
        feedback_text?: string;
        first_reply_time_seconds?: number;
        resolution_time_seconds?: number;
      }) => {
        const createdAt = daysAgo(data.createdDaysAgo);
        
        let nps = data.nps_score;
        let csat = data.csat_score;
        let feedback = data.feedback_text;
        let replyAt: Date | null = null;
        let replySec = data.first_reply_time_seconds;
        let resolvedAt: Date | null = null;
        let resolvedSec = data.resolution_time_seconds;

        if (data.stage === 'CLOSED') {
          if (nps === undefined) {
            // Generate some deterministic scores: promoters (9-10), passives (7-8), detractors (0-6)
            const r = (data.ref.charCodeAt(data.ref.length - 1) + data.createdDaysAgo) % 10;
            nps = r < 5 ? 9 + (r % 2) : r < 8 ? 7 + (r % 2) : 2 + (r % 4);
          }
          if (csat === undefined) {
            csat = nps >= 9 ? 5 : nps >= 7 ? 4 : 2 + (nps % 2);
          }
          if (feedback === undefined) {
            feedback = nps >= 9 
              ? 'Excellent support! Quick clearance and very helpful agent.' 
              : nps >= 7 
              ? 'Good service, minor delays but overall satisfactory.'
              : 'Had long wait times at the border and communication was lacking.';
          }
          if (resolvedSec === undefined) {
            resolvedSec = (2 + (data.createdDaysAgo % 5)) * 86400 + (data.createdDaysAgo % 12) * 3600;
          }
          resolvedAt = new Date(createdAt.getTime() + resolvedSec * 1000);
        }

        if (data.createdDaysAgo > 1) {
          if (replySec === undefined) {
            replySec = (900 + (data.createdDaysAgo % 8) * 1800);
          }
          replyAt = new Date(createdAt.getTime() + replySec * 1000);
        }

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
          nps_score: nps ?? null,
          csat_score: csat ?? null,
          feedback_text: feedback ?? null,
          first_reply_at: replyAt,
          first_reply_time_seconds: replySec ?? null,
          resolved_at: resolvedAt,
          resolution_time_seconds: resolvedSec ?? null,
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

      // ── PDF-imported Aleka Logistics sample shipments ─────────────────────
      const y1 = await makeCase({
        ref: 'CLR-2025-0024', customer_id: yionx.id, type: 'SEA_FCL',
        goods: 'General Merchandise', vessel: 'HAPAG EXPRESS',
        origin: 'Shanghai, China', dest: 'Dar es Salaam Port', stage: 'CLOSED',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysAgo(280), free_time: daysAgo(266),
        sla: daysAgo(272),
        containers: [{ number: 'HLXU1234567', size: '20FT', seal_number: 'HL-99001', weight_kg: 18000 }],
        createdDaysAgo: 300, tansad: 'TZDL251626205',
      });

      const nh1 = await makeCase({
        ref: 'CLR-2025-0025', customer_id: newHeavy.id, type: 'SEA_FCL',
        goods: 'Heavy Machinery & Equipment', vessel: 'COSCO STAR',
        origin: 'Shanghai, China', dest: 'Dar es Salaam Port', stage: 'CLOSED',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysAgo(250), free_time: daysAgo(236),
        sla: daysAgo(245),
        containers: [{ number: 'CXDU3245678', size: '40FT', seal_number: 'CO-88002', weight_kg: 26000 }],
        createdDaysAgo: 260, tansad: 'TZDL251729311',
      });

      const dt1 = await makeCase({
        ref: 'CLR-2026-0026', customer_id: decatech.id, type: 'AIR',
        goods: 'Electronics & IT Equipment', vessel: 'KLM CARGO',
        origin: 'Nairobi, Kenya', dest: 'JNIA', stage: 'CLOSED',
        officer: officerFredrick.id, location_id: dsmPort.id,
        eta: daysAgo(168), free_time: daysAgo(154),
        sla: daysAgo(164),
        containers: [],
        createdDaysAgo: 175, tansad: 'TZDA261045896',
      });

      const lf1 = await makeCase({
        ref: 'CLR-2025-0027', customer_id: lnFuture.id, type: 'SEA_FCL',
        goods: 'Building Materials & Hardware (20 containers)', vessel: 'EMIRATES SHIPPING',
        origin: 'Guangzhou, China', dest: 'Dar es Salaam Port', stage: 'CLOSED',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysAgo(141), free_time: daysAgo(127),
        sla: daysAgo(137),
        containers: [],
        createdDaysAgo: 150, tansad: 'TZDL261157116',
      });

      const bm1 = await makeCase({
        ref: 'CLR-2026-0028', customer_id: burnMfg.id, type: 'ROAD',
        goods: 'Clean Cookstoves & Accessories', vessel: 'ROAD FREIGHT',
        origin: 'Nairobi, Kenya', dest: 'Namanga Border', stage: 'CLOSED',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysAgo(100), free_time: daysAgo(86),
        sla: daysAgo(95),
        containers: [],
        createdDaysAgo: 110, tansad: 'TZNG-26-1279118',
      });

      await makeCase({
        ref: 'CLR-2026-0029', customer_id: burnMfg.id, type: 'AIR',
        goods: 'Clean Cookstoves (Air Freight)', vessel: 'KENYA AIRWAYS',
        origin: 'Nairobi, Kenya', dest: 'JNIA', stage: 'ASSESSMENT',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysAgo(55), free_time: daysFromNow(2),
        sla: daysFromNow(4),
        containers: [],
        createdDaysAgo: 60, tansad: 'TZDA-26-1379802',
      });

      await makeCase({
        ref: 'CLR-2026-0030', customer_id: lnFuture.id, type: 'SEA_FCL',
        goods: 'Building Materials & Tiles (16 containers)', vessel: 'EMIRATES CARRIER',
        origin: 'Guangzhou, China', dest: 'Dar es Salaam Port', stage: 'DOCS_RECEIVED',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysFromNow(3), free_time: daysFromNow(17),
        sla: daysFromNow(6),
        containers: [],
        createdDaysAgo: 45,
      });

      await makeCase({
        ref: 'CLR-2026-0031', customer_id: negelo.id, type: 'SEA_FCL',
        goods: 'Mixed Cargo — General Merchandise', vessel: 'COSCO PACIFIC',
        origin: 'Shanghai, China', dest: 'Dar es Salaam Port', stage: 'DOCS_RECEIVED',
        officer: officerFredrick.id, location_id: dsmPort.id,
        eta: daysAgo(5), free_time: daysFromNow(9),
        sla: daysAgo(1),
        containers: [{ number: 'COSU4512301', size: '20FT', seal_number: 'CO-31001', weight_kg: 19500 }],
        createdDaysAgo: 36, tansad: 'TZDL-26-1419576',
      });

      await makeCase({
        ref: 'CLR-2026-0032', customer_id: burnMfg.id, type: 'AIR',
        goods: 'Spare Parts & Components (UPS Express)', vessel: 'UPS AIR',
        origin: 'Atlanta, USA', dest: 'JNIA', stage: 'ASSESSMENT',
        officer: officerAmina.id, location_id: dsmPort.id,
        eta: daysAgo(28), free_time: daysFromNow(5),
        sla: daysFromNow(3),
        containers: [],
        createdDaysAgo: 32, tansad: 'TZDA-26-1424026',
      });

      await makeCase({
        ref: 'CLR-2026-0033', customer_id: aleka.id, type: 'SEA_FCL',
        goods: 'Office Equipment & Supplies', vessel: 'MSC HARMONY',
        origin: 'Dubai, UAE', dest: 'Dar es Salaam Port', stage: 'VALIDATION',
        officer: officerJohn.id, location_id: dsmPort.id,
        eta: daysAgo(3), free_time: daysFromNow(11),
        sla: daysFromNow(2),
        containers: [{ number: 'MSCU9900033', size: '20FT', seal_number: 'MS-33001', weight_kg: 12000 }],
        createdDaysAgo: 18,
      });

      console.log(`✅ Shipment cases seeded (23 + 10 PDF samples = 33)`);

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

        // Other closed cases — minimal but real history so cycle-time/officer
        // metrics are computed from actual rows, not left at zero. Only the
        // first (short, realistic) stage gets a duration_h — the CLOSED row
        // marks the real close date without polluting stage-duration stats
        // with the case's entire multi-week lifetime.
        { tenant_id: tenant.id, shipment_id: n1.id,  stage: 'DOCS_RECEIVED', entered_at: daysAgo(22),  exited_at: daysAgo(21.7), duration_h: 6, actor_id: officerFredrick.id },
        { tenant_id: tenant.id, shipment_id: n1.id,  stage: 'CLOSED',        entered_at: daysAgo(10),  actor_id: admin.id, note: 'Case closed.' },

        { tenant_id: tenant.id, shipment_id: y1.id,  stage: 'DOCS_RECEIVED', entered_at: daysAgo(300), exited_at: daysAgo(299.8), duration_h: 5, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: y1.id,  stage: 'CLOSED',        entered_at: daysAgo(275), actor_id: admin.id, note: 'Invoice paid. Case closed.' },

        { tenant_id: tenant.id, shipment_id: nh1.id, stage: 'DOCS_RECEIVED', entered_at: daysAgo(260), exited_at: daysAgo(259.7), duration_h: 7, actor_id: officerAmina.id },
        { tenant_id: tenant.id, shipment_id: nh1.id, stage: 'CLOSED',        entered_at: daysAgo(235), actor_id: admin.id, note: 'Invoice paid. Case closed.' },

        { tenant_id: tenant.id, shipment_id: dt1.id, stage: 'DOCS_RECEIVED', entered_at: daysAgo(175), exited_at: daysAgo(174.8), duration_h: 4, actor_id: officerFredrick.id },
        { tenant_id: tenant.id, shipment_id: dt1.id, stage: 'CLOSED',        entered_at: daysAgo(155), actor_id: admin.id, note: 'Invoice paid. Case closed.' },

        { tenant_id: tenant.id, shipment_id: lf1.id, stage: 'DOCS_RECEIVED', entered_at: daysAgo(150), exited_at: daysAgo(149.75), duration_h: 6, actor_id: officerJohn.id },
        { tenant_id: tenant.id, shipment_id: lf1.id, stage: 'CLOSED',        entered_at: daysAgo(125), actor_id: admin.id, note: 'Invoice paid. Case closed.' },

        { tenant_id: tenant.id, shipment_id: bm1.id, stage: 'DOCS_RECEIVED', entered_at: daysAgo(110), exited_at: daysAgo(109.8), duration_h: 5, actor_id: officerAmina.id },
        { tenant_id: tenant.id, shipment_id: bm1.id, stage: 'CLOSED',        entered_at: daysAgo(88),  actor_id: admin.id, note: 'Invoice paid. Case closed.' },
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

      // ── 10b. PRODUCTS & SERVICES CATALOG ──────────────────────────────────────
      // Real, persisted catalog — previously a browser-only localStorage store
      // in productData.ts. Same seed data, now backing both /finance/products
      // and the invoice line-item "add from catalog" picker.
      const PRODUCT_SEED = [
        { id: 'PRD-001', code: 'SVC-CLR-STD', name: 'Standard Customs Clearance', type: 'service', description: 'End-to-end customs clearance for standard import/export shipments.', category: 'Clearance Services', unit: 'shipment', sale_price: 850000, purchase_price: 400000, tax_rate: 18 },
        { id: 'PRD-002', code: 'SVC-CLR-EXP', name: 'Express Customs Clearance', type: 'service', description: 'Priority processing for time-sensitive shipments. 24-hr turnaround.', category: 'Clearance Services', unit: 'shipment', sale_price: 1500000, purchase_price: 750000, tax_rate: 18 },
        { id: 'PRD-003', code: 'SVC-DOC-PKG', name: 'Documentation Package', type: 'service', description: 'Preparation of all import/export documentation (BOL, C23, Form M, etc.).', category: 'Documentation', unit: 'set', sale_price: 250000, purchase_price: 80000, tax_rate: 18 },
        { id: 'PRD-004', code: 'SVC-PORT-HDL', name: 'Port Handling & Supervision', type: 'service', description: 'On-site port supervision, container examination attendance, and cargo tracking.', category: 'Port & Handling', unit: 'container', sale_price: 400000, purchase_price: 180000, tax_rate: 18 },
        { id: 'PRD-005', code: 'SVC-STR-DAY', name: 'Bonded Warehouse Storage', type: 'service', description: 'Secure bonded storage per day per CBM. Climate-controlled facility.', category: 'Storage', unit: 'day', sale_price: 15000, purchase_price: 7000, tax_rate: 18 },
        { id: 'PRD-006', code: 'SVC-FRT-AIR', name: 'Air Freight Coordination', type: 'service', description: 'Coordination and arrangement of air freight shipments via JNIA.', category: 'Freight', unit: 'shipment', sale_price: 600000, purchase_price: 300000, tax_rate: 18 },
        { id: 'PRD-007', code: 'SVC-CST-ADV', name: 'Customs Classification Advisory', type: 'service', description: 'HS code classification and tariff advice for specific goods categories.', category: 'Consulting', unit: 'hour', sale_price: 120000, purchase_price: 60000, tax_rate: 18 },
        { id: 'PRD-008', code: 'PRD-SEAL-CTR', name: 'Container Seal Kit', type: 'product', description: 'Official tamper-evident seal kit for containers (set of 5).', category: 'Port & Handling', unit: 'set', sale_price: 45000, purchase_price: 22000, tax_rate: 18 },
        { id: 'PRD-009', code: 'SVC-INS-CARGO', name: 'Cargo Insurance Facilitation', type: 'service', description: 'Arrangement of marine/cargo insurance cover for shipments in transit.', category: 'Insurance', unit: 'shipment', sale_price: 0, purchase_price: 0, tax_rate: 0 },
        { id: 'PRD-010', code: 'SVC-TRK-LOCAL', name: 'Local Trucking & Delivery', type: 'service', description: 'Last-mile delivery within Dar es Salaam metropolitan area.', category: 'Freight', unit: 'shipment', sale_price: 180000, purchase_price: 95000, tax_rate: 18 },
      ];
      for (const p of PRODUCT_SEED) {
        await trx.insertInto('products').values({
          ...p, tenant_id: tenant.id, currency: 'TZS', status: 'active',
        }).execute();
      }
      console.log('✅ Products & Services catalog seeded (10)');

      // ── 11. SALES INVOICES (Finance / TRA demo data) ─────────────────────────
      // These match the invoices previously shown as client-side mock data in
      // Billing.tsx (INITIAL_INVOICES) — now real, persisted rows with real
      // customers so they can actually be edited, paid, and submitted to TRA.
      const karibu = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Karibu Traders Ltd', contact_name: 'Amani Mwangi',
        email: 'accounts@kaributraders.co.tz', phone: '+255782200001', phone_wa: '+255782200001',
        category: 'sme', preferred_channel: 'WHATSAPP', tax_id: '600-200-001',
        avatar_initials: 'KT', avatar_color: '#0d9488',
        assigned_officer_id: officerJohn.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const tangaCement = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Tanga Cement Co.', contact_name: 'Fatuma Ally',
        email: 'accounts@tangacement.co.tz', phone: '+255782200002', phone_wa: '+255782200002',
        category: 'enterprise', preferred_channel: 'EMAIL', tax_id: '600-200-002',
        avatar_initials: 'TC', avatar_color: '#7c3aed',
        assigned_officer_id: officerAmina.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const mombasaFreight = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Mombasa Freight Ltd', contact_name: 'Bakari Juma',
        email: 'accounts@mombasafreight.co.ke', phone: '+255782200003', phone_wa: '+255782200003',
        category: 'enterprise', preferred_channel: 'EMAIL', tax_id: '600-200-003',
        avatar_initials: 'MF', avatar_color: '#d97706',
        assigned_officer_id: officerFredrick.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const darEngineering = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Dar Engineering Co.', contact_name: 'Amani Mwangi',
        email: 'accounts@darengineering.co.tz', phone: '+255782200004', phone_wa: '+255782200004',
        category: 'sme', preferred_channel: 'WHATSAPP', tax_id: '600-200-004',
        avatar_initials: 'DE', avatar_color: '#0891b2',
        assigned_officer_id: officerJohn.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const arushaSupplies = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Arusha Supplies Ltd', contact_name: 'Amani Mwangi',
        email: 'accounts@arushasupplies.co.tz', phone: '+255782200005', phone_wa: '+255782200005',
        category: 'sme', preferred_channel: 'WHATSAPP', tax_id: '600-200-005',
        avatar_initials: 'AS', avatar_color: '#be123c',
        assigned_officer_id: officerAmina.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const moshiTea = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Moshi Tea Exporters', contact_name: 'Bakari Juma',
        email: 'accounts@moshitea.co.tz', phone: '+255782200006', phone_wa: '+255782200006',
        category: 'sme', preferred_channel: 'EMAIL', tax_id: '600-200-006',
        avatar_initials: 'MT', avatar_color: '#166534',
        assigned_officer_id: officerFredrick.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      const dodomaAgri = await trx.insertInto('customers').values({
        tenant_id: tenant.id, name: 'Dodoma Agri Exports', contact_name: 'Fatuma Ally',
        email: 'accounts@dodomaagri.co.tz', phone: '+255782200007', phone_wa: '+255782200007',
        category: 'sme', preferred_channel: 'WHATSAPP', tax_id: '600-200-007',
        avatar_initials: 'DA', avatar_color: '#be185d',
        assigned_officer_id: officerJohn.id, active: true, created_at: now, updated_at: now,
      }).returningAll().executeTakeFirstOrThrow();

      console.log('✅ Finance-demo customers seeded (7)');

      type InvLine = {
        name: string; unit: string; rate: number; qty: number; taxPct: number;
        group: 'clearing' | 'shipping' | 'other'; currency: 'TZS' | 'USD';
      };
      type InvSpec = {
        invoice_number: string; customer: { id: string; name: string };
        clientAddress: string[]; bl_number: string; origin: string; destination: string;
        mode: string; bill_date: Date; due_date: Date; sale_agent: string; payment_terms: string;
        exchange_rate: number; status: string; received: number; version?: number; lines: InvLine[];
        payment?: { amount: number; method: string; date: Date; note?: string };
        shipmentRef: string;
      };

      async function makeInvoice(spec: InvSpec) {
        // Real shipment for this invoice to link to (shipment_ref), rather
        // than leaving invoices unlinked to the shipments module.
        const shipmentType = spec.mode === 'AIR' ? 'AIR' : spec.mode === 'ROAD' ? 'ROAD' : 'SEA_FCL';
        const shipmentStage = spec.status === 'Paid' ? 'CLOSED' : spec.status === 'Draft' ? 'DOCS_RECEIVED' : 'INVOICING';
        await trx.insertInto('shipment_cases').values({
          tenant_id: tenant.id,
          ref_number: spec.shipmentRef,
          customer_id: spec.customer.id,
          type: shipmentType as any,
          goods_desc: 'General cargo',
          vessel: '',
          bl_number: spec.mode === 'AIR' ? null : spec.bl_number,
          awb_number: spec.mode === 'AIR' ? spec.bl_number : null,
          origin_port: spec.origin,
          dest_port: spec.destination,
          stage: shipmentStage as any,
          containers: JSON.stringify([]),
          created_at: spec.bill_date,
          updated_at: now,
        }).execute();

        const inv = await trx.insertInto('sales_invoices').values({
          tenant_id: tenant.id,
          invoice_number: spec.invoice_number,
          customer_id: spec.customer.id,
          shipment_ref: spec.shipmentRef,
          client_name: spec.customer.name,
          client_address: JSON.stringify(spec.clientAddress),
          bl_number: spec.bl_number,
          origin: spec.origin,
          destination: spec.destination,
          mode: spec.mode,
          bill_date: spec.bill_date,
          due_date: spec.due_date,
          sale_agent: spec.sale_agent,
          payment_terms: spec.payment_terms,
          exchange_rate: spec.exchange_rate,
          status: spec.status,
          received: spec.received,
          version: spec.version ?? 1,
          created_by: finance.id,
          created_at: spec.bill_date,
          updated_at: now,
        }).returningAll().executeTakeFirstOrThrow();

        for (let i = 0; i < spec.lines.length; i++) {
          const l = spec.lines[i];
          await trx.insertInto('sales_invoice_lines').values({
            invoice_id: inv.id, name: l.name, unit: l.unit, rate: l.rate, qty: l.qty,
            tax_pct: l.taxPct, line_group: l.group, currency: l.currency, sort_order: i,
          }).execute();
        }

        if (spec.payment) {
          await trx.insertInto('invoice_payments').values({
            tenant_id: tenant.id, invoice_id: inv.id, amount: spec.payment.amount,
            method: spec.payment.method, payment_date: spec.payment.date,
            note: spec.payment.note ?? null, created_by: finance.id, created_at: spec.payment.date,
          }).execute();
        }

        return inv;
      }

      await makeInvoice({
        invoice_number: 'CLR-2026-0028 INV', customer: karibu, shipmentRef: 'CLR-2026-0041',
        clientAddress: ['P.O. Box 4521', 'Kariakoo, Dar es Salaam', 'Tanzania', 'VAT: TZ 1234561-C'],
        bl_number: 'MSCU2456789', origin: 'SINGAPORE', destination: 'DAR ES SALAAM, TANZANIA', mode: 'SEA',
        bill_date: new Date(2026, 5, 13), due_date: new Date(2026, 5, 27),
        sale_agent: 'Amani Mwangi', payment_terms: 'Payment due within 14 days. All 3rd party charges are estimates and subject to actuals.',
        exchange_rate: 2650, status: 'Draft', received: 0,
        lines: [
          { name: 'DOCUMENTATION',          unit: 'PER BIL',       rate: 132000, qty: 1, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'AGENCY FEES – SEA 20"',  unit: 'PER CONT',      rate: 400000, qty: 2, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'TRANSPORTATION',         unit: 'PER CONT',      rate: 700000, qty: 2, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'DELIVERY ORDER CHARGES', unit: 'PER BIL',       rate: 15,     qty: 1, taxPct: 18, group: 'shipping', currency: 'USD' },
          { name: 'SHIPPING FEES',          unit: 'PER CONTAINER', rate: 49.84,  qty: 2, taxPct: 0,  group: 'shipping', currency: 'USD' },
          { name: 'FACILITATION',           unit: 'PER BIL',       rate: 950000, qty: 1, taxPct: 0,  group: 'other',    currency: 'TZS' },
          { name: 'TBS CHARGES',            unit: 'PER BIL',       rate: 180000, qty: 1, taxPct: 0,  group: 'other',    currency: 'TZS' },
          { name: 'WHARFAGE CHARGES',       unit: 'PER BIL',       rate: 320000, qty: 1, taxPct: 18, group: 'other',    currency: 'TZS' },
        ],
      });

      await makeInvoice({
        invoice_number: 'CLR-2026-0027 INV', customer: tangaCement, shipmentRef: 'CLR-2026-0042',
        clientAddress: ['Industrial Area, Plot 14', 'Tanga, Tanzania', 'TZ 30100', 'VAT: TZ 9876543-B'],
        bl_number: 'TRHU3456789', origin: 'CHINA (GUANGZHOU)', destination: 'DAR ES SALAAM, TANZANIA', mode: 'SEA',
        bill_date: new Date(2026, 5, 8), due_date: new Date(2026, 5, 22),
        sale_agent: 'Fatuma Ally', payment_terms: 'Payment due 14 days from invoice date.',
        exchange_rate: 2650, status: 'Draft', received: 0,
        lines: [
          { name: 'DOCUMENTATION',          unit: 'PER BIL',  rate: 132000, qty: 1, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'AGENCY FEES – BULK',     unit: 'PER CONT', rate: 350000, qty: 4, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'TRANSPORTATION',         unit: 'PER CONT', rate: 700000, qty: 4, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'DELIVERY ORDER CHARGES', unit: 'PER BIL',  rate: 15,     qty: 1, taxPct: 18, group: 'shipping', currency: 'USD' },
          { name: 'DEMURRAGE (2 DAYS)',     unit: 'PER BILL', rate: 470,    qty: 1, taxPct: 0,  group: 'shipping', currency: 'USD' },
          { name: 'TBS CHARGES',            unit: 'PER BIL',  rate: 180000, qty: 1, taxPct: 0,  group: 'other',    currency: 'TZS' },
          { name: 'WHARFAGE CHARGES',       unit: 'PER BIL',  rate: 477696, qty: 1, taxPct: 18, group: 'other',    currency: 'TZS' },
        ],
      });

      await makeInvoice({
        invoice_number: 'CLR-2026-0024 INV', customer: mombasaFreight, shipmentRef: 'CLR-2026-0043',
        clientAddress: ['Moi Avenue, Floor 3', 'Mombasa, Kenya', 'KE 80100', 'VAT: KE P051234567A'],
        bl_number: 'MAEU5678901', origin: 'DUBAI (UAE)', destination: 'MOMBASA, KENYA', mode: 'SEA',
        bill_date: new Date(2026, 5, 13), due_date: new Date(2026, 5, 26),
        sale_agent: 'Bakari Juma', payment_terms: 'Remaining balance due immediately. A surcharge applies after 7 days.',
        exchange_rate: 2650, status: 'Partial', received: 1550000,
        lines: [
          { name: 'DOCUMENTATION',          unit: 'PER BIL',       rate: 132000, qty: 1, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'AGENCY FEES – SEA 20"',  unit: 'PER CONT',      rate: 400000, qty: 2, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'TRANSPORTATION',         unit: 'PER CONT',      rate: 600000, qty: 2, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'DELIVERY ORDER CHARGES', unit: 'PER BIL',       rate: 15,     qty: 1, taxPct: 18, group: 'shipping', currency: 'USD' },
          { name: 'SHIPPING FEES',          unit: 'PER CONTAINER', rate: 49.84,  qty: 2, taxPct: 0,  group: 'shipping', currency: 'USD' },
          { name: 'FACILITATION',           unit: 'PER BIL',       rate: 200000, qty: 1, taxPct: 0,  group: 'other',    currency: 'TZS' },
          { name: 'WHARFAGE CHARGES',       unit: 'PER BIL',       rate: 180000, qty: 1, taxPct: 18, group: 'other',    currency: 'TZS' },
        ],
        payment: { amount: 1550000, method: 'Bank Transfer', date: new Date(2026, 5, 18), note: 'Partial settlement' },
      });

      await makeInvoice({
        invoice_number: 'CLR-2026-0023 INV', customer: darEngineering, shipmentRef: 'CLR-2026-0044',
        clientAddress: ['Pugu Road, Block C', 'Dar es Salaam, Tanzania', 'TZ 11101', 'VAT: TZ 1122334-A'],
        bl_number: 'HLCU6789012', origin: 'CHINA (SHANGHAI)', destination: 'DAR ES SALAAM, TANZANIA', mode: 'SEA',
        bill_date: new Date(2026, 5, 7), due_date: new Date(2026, 5, 21),
        sale_agent: 'Amani Mwangi', payment_terms: 'Payment received in full. Thank you.',
        exchange_rate: 2650, status: 'Paid', received: 1738905,
        lines: [
          { name: 'DOCUMENTATION',          unit: 'PER BIL',  rate: 132000, qty: 1, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'AGENCY FEES – FCL 20"',  unit: 'PER CONT', rate: 400000, qty: 1, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'TRANSPORTATION',         unit: 'PER CONT', rate: 700000, qty: 1, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'DELIVERY ORDER CHARGES', unit: 'PER BIL',  rate: 15,     qty: 1, taxPct: 18, group: 'shipping', currency: 'USD' },
          { name: 'FACILITATION',           unit: 'PER BIL',  rate: 280000, qty: 1, taxPct: 0,  group: 'other',    currency: 'TZS' },
          { name: 'TBS CHARGES',            unit: 'PER BIL',  rate: 180000, qty: 1, taxPct: 0,  group: 'other',    currency: 'TZS' },
        ],
        payment: { amount: 1738905, method: 'Bank Transfer', date: new Date(2026, 5, 10), note: 'Paid in full' },
      });

      await makeInvoice({
        invoice_number: 'CLR-2026-0019 INV', customer: arushaSupplies, shipmentRef: 'CLR-2026-0045',
        clientAddress: ['Sokoine Road, Shop 22', 'Arusha, Tanzania', 'TZ 23100', 'VAT: TZ 5566778-D'],
        bl_number: 'CMDU7890123', origin: 'INDIA (MUMBAI)', destination: 'DAR ES SALAAM, TANZANIA', mode: 'SEA',
        bill_date: new Date(2026, 5, 5), due_date: new Date(2026, 5, 17),
        sale_agent: 'Amani Mwangi', payment_terms: 'Payment is overdue. Please settle immediately.',
        exchange_rate: 2650, status: 'Unpaid', received: 0,
        lines: [
          { name: 'DOCUMENTATION',        unit: 'PER BIL', rate: 132000, qty: 1, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'AGENCY FEES – LCL',    unit: 'PER BIL', rate: 350000, qty: 1, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'TRANSPORTATION',       unit: 'PER BIL', rate: 450000, qty: 1, taxPct: 0,  group: 'clearing', currency: 'TZS' },
          { name: 'DELIVERY ORDER',       unit: 'PER BIL', rate: 15,     qty: 1, taxPct: 18, group: 'shipping', currency: 'USD' },
          { name: 'CFS HANDLING CHARGES', unit: 'PER BIL', rate: 85,     qty: 1, taxPct: 0,  group: 'shipping', currency: 'USD' },
          { name: 'FACILITATION',         unit: 'PER BIL', rate: 280000, qty: 1, taxPct: 0,  group: 'other',    currency: 'TZS' },
          { name: 'TBS CHARGES',          unit: 'PER BIL', rate: 180000, qty: 1, taxPct: 0,  group: 'other',    currency: 'TZS' },
        ],
      });

      await makeInvoice({
        invoice_number: 'CLR-2026-0014 INV', customer: moshiTea, shipmentRef: 'CLR-2026-0046',
        clientAddress: ['Old Moshi Road, Unit 7', 'Moshi, Tanzania', 'TZ 25100', 'VAT: TZ 7788990-E'],
        bl_number: 'JKIA20240601', origin: 'NAIROBI (JKIA)', destination: 'MOSHI, TANZANIA', mode: 'AIR',
        bill_date: new Date(2026, 5, 1), due_date: new Date(2026, 5, 15),
        sale_agent: 'Bakari Juma', payment_terms: 'This invoice is overdue. Please contact our accounts team immediately.',
        exchange_rate: 2650, status: 'Overdue', received: 0, version: 2,
        lines: [
          { name: 'AIR FREIGHT CLEARANCE', unit: 'PER AWB', rate: 420000, qty: 1, taxPct: 0, group: 'clearing', currency: 'TZS' },
          { name: 'DOCUMENTATION',         unit: 'PER AWB', rate: 80000,  qty: 1, taxPct: 0, group: 'clearing', currency: 'TZS' },
          { name: 'AIRLINE DELIVERY FEE',  unit: 'PER AWB', rate: 45,     qty: 1, taxPct: 0, group: 'shipping', currency: 'USD' },
          { name: 'FACILITATION',          unit: 'PER AWB', rate: 200000, qty: 1, taxPct: 0, group: 'other',    currency: 'TZS' },
          { name: 'PHYTOSANITARY CERT',    unit: 'PER AWB', rate: 220000, qty: 1, taxPct: 0, group: 'other',    currency: 'TZS' },
        ],
      });

      await makeInvoice({
        invoice_number: 'CLR-2026-0010 INV', customer: dodomaAgri, shipmentRef: 'CLR-2026-0047',
        clientAddress: ['Dodoma Municipal Road', 'Dodoma, Tanzania', 'TZ 41000', 'VAT: TZ 4433221-G'],
        bl_number: 'RDTUND20240522', origin: 'DODOMA, TANZANIA', destination: 'LUSAKA, ZAMBIA', mode: 'ROAD',
        bill_date: new Date(2026, 4, 22), due_date: new Date(2026, 5, 5),
        sale_agent: 'Fatuma Ally', payment_terms: 'Balance due immediately. Account on hold pending payment.',
        exchange_rate: 2650, status: 'Partial', received: 320000,
        lines: [
          { name: 'ROAD TRANSIT BOND',  unit: 'PER BIL', rate: 280000, qty: 1, taxPct: 0, group: 'clearing', currency: 'TZS' },
          { name: 'DOCUMENTATION',      unit: 'PER BIL', rate: 80000,  qty: 1, taxPct: 0, group: 'clearing', currency: 'TZS' },
          { name: 'BORDER AGENCY FEES', unit: 'PER BIL', rate: 250,    qty: 1, taxPct: 0, group: 'shipping', currency: 'USD' },
          { name: 'FACILITATION',       unit: 'PER BIL', rate: 180000, qty: 1, taxPct: 0, group: 'other',    currency: 'TZS' },
          { name: 'TBS EXPORT CERT',    unit: 'PER BIL', rate: 120000, qty: 1, taxPct: 0, group: 'other',    currency: 'TZS' },
        ],
        payment: { amount: 320000, method: 'Mobile Money', date: new Date(2026, 4, 28), note: 'Partial settlement' },
      });

      console.log('✅ Sales invoices seeded (7, matching Finance UI demo data)');

      // ── Seed Support Tickets, Messages, and Customer Assets ───────────────
      console.log('🎫 Seeding Multichannel Support tickets and assets...');
      
      const customersList = await trx.selectFrom('customers').select(['id', 'name']).execute();
      
      const dangoteCust = customersList.find(c => c.name.toLowerCase().includes('dangote'));
      const simbaCust = customersList.find(c => c.name.toLowerCase().includes('simba'));
      const eabCust = customersList.find(c => c.name.toLowerCase().includes('eab'));

      if (dangoteCust && simbaCust && eabCust) {
        // Seed Customer Assets
        const assetsToInsert = [
          {
            tenant_id: tenant.id,
            customer_id: dangoteCust.id,
            asset_type: 'BANK_ACCOUNT' as any,
            asset_ref: 'TZS-1002-9938-12',
            status: 'ACTIVE',
            metadata: JSON.stringify({ balance: 4500000000, currency: 'TZS' }),
          },
          {
            tenant_id: tenant.id,
            customer_id: dangoteCust.id,
            asset_type: 'LOAN' as any,
            asset_ref: 'LN-2026-8831',
            status: 'ACTIVE',
            metadata: JSON.stringify({ balance: 1200000000, currency: 'TZS', rate: 0.12 }),
          },
          {
            tenant_id: tenant.id,
            customer_id: simbaCust.id,
            asset_type: 'INSURANCE_POLICY' as any,
            asset_ref: 'POL-MTR-99823',
            status: 'ACTIVE',
            metadata: JSON.stringify({ expires_at: '2027-12-31' }),
          },
          {
            tenant_id: tenant.id,
            customer_id: eabCust.id,
            asset_type: 'CREDIT_CARD' as any,
            asset_ref: 'CC-4111-XXXX-XXXX-9921',
            status: 'ACTIVE',
            metadata: JSON.stringify({ balance: 15000, currency: 'USD' }),
          }
        ];

        for (const asset of assetsToInsert) {
          await trx.insertInto('customer_assets').values(asset).execute();
        }

        // Seed Support Tickets
        const tkt1 = await trx.insertInto('support_tickets').values({
          tenant_id: tenant.id,
          customer_id: dangoteCust.id,
          ref_number: 'SUP-1092',
          subject: 'Discrepancy in Bank Balance',
          description: 'The ledger balance does not match the dashboard balance for TZS account.',
          channel: 'IN_APP',
          status: 'OPEN',
          priority: 'URGENT',
          category: 'Bank Account Dispute',
          tags: JSON.stringify(['finance', 'discrepancy']),
        }).returningAll().executeTakeFirstOrThrow();

        const tkt2 = await trx.insertInto('support_tickets').values({
          tenant_id: tenant.id,
          customer_id: simbaCust.id,
          ref_number: 'SUP-1093',
          subject: 'Claim Status Enquiry',
          description: 'Looking to check the status of motor insurance claim POL-MTR-99823.',
          channel: 'WHATSAPP',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          category: 'Insurance Claim',
          tags: JSON.stringify(['insurance', 'claim']),
        }).returningAll().executeTakeFirstOrThrow();

        // Seed Support Messages
        await trx.insertInto('support_messages').values({
          tenant_id: tenant.id,
          ticket_id: tkt1.id,
          channel: 'IN_APP',
          direction: 'INBOUND',
          author_id: dangoteCust.id,
          author_name: dangoteCust.name,
          author_type: 'CUSTOMER',
          content: 'Hello, my dashboard is showing a balance of TZS 4.5B but our physical bank statement shows TZS 4.7B. Please look into this immediately.',
        }).execute();

        await trx.insertInto('support_messages').values({
          tenant_id: tenant.id,
          ticket_id: tkt1.id,
          channel: 'IN_APP',
          direction: 'OUTBOUND',
          author_id: 'system',
          author_name: 'Hudumika Support',
          author_type: 'OFFICER',
          content: 'Hi Aliko, thank you for reaching out. We have logged this query and our finance reconciliation team is reviewing the transaction logs.',
        }).execute();

        await trx.insertInto('support_messages').values({
          tenant_id: tenant.id,
          ticket_id: tkt2.id,
          channel: 'WHATSAPP',
          direction: 'INBOUND',
          author_id: simbaCust.id,
          author_name: simbaCust.name,
          author_type: 'CUSTOMER',
          content: 'Hi, did anyone check on the motor claim for POL-MTR-99823?',
        }).execute();
      }
    });

    // ── Backfill storage folders for all seeded customers & shipments ─────────
    console.log('📁 Creating storage folders...');
    const allCustomers = await db.selectFrom('customers').select(['id', 'name', 'tenant_id']).execute();
    for (const c of allCustomers) {
      MinioIntegration.ensureCustomerFolder(c.tenant_id, c.id, c.name);
    }
    const allShipments = await db.selectFrom('shipment_cases')
      .select(['id', 'customer_id', 'tenant_id', 'bl_number', 'awb_number', 'ref_number'])
      .execute();
    for (const s of allShipments) {
      const folder = (s as any).bl_number || (s as any).awb_number || s.ref_number || s.id;
      MinioIntegration.ensureFolder(s.tenant_id, s.customer_id, folder);
    }
    console.log(`✅ Storage folders created (${allCustomers.length} customers, ${allShipments.length} shipments)`);

    console.log('\n🎉 Hudumika seed complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Login credentials (all use password123):');
    console.log('  superadmin@hudumika.tz → SUPER_ADMIN  ← platform superadmin');
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
