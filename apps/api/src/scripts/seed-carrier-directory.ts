/**
 * Seed the global carrier_directory reference table (ocean SCAC codes, air
 * IATA codes, and East African road/rail haulage operators) so every tenant
 * can search and one-click add real carriers into their own Freight
 * Booking / CargoTracker carrier list instead of hand-typing codes.
 *
 * Ocean SCAC codes sourced from Beacon's public SCAC registry
 * (beacon.com/resources/ocean-carrier-scac-codes-list). Air IATA/ICAO codes
 * sourced from Wysner Logistics' airline code list and cross-checked against
 * IATA's own airline directory (iata.org) for the East/Southern African
 * carriers. Road/rail operators sourced from Freightnet's Tanzania/Kenya
 * haulage directories and each operator's own public profile — these have
 * no standardized code system (unlike SCAC/IATA), so scac_or_iata is left
 * null for them.
 *
 * Usage:  npx tsx src/scripts/seed-carrier-directory.ts
 * Re-runnable: upserts by (name, mode) — safe to run again after edits below.
 */
import { db } from '../db/client.js';

const SCAC_SOURCE = 'https://beacon.com/resources/ocean-carrier-scac-codes-list';
const IATA_SOURCE = 'https://wysnerlogistics.com/airline-codes-list/';
const ROAD_SOURCE = 'https://www.freightnet.com/directory/';

interface Row {
  name: string;
  mode: 'OCEAN' | 'AIR' | 'ROAD' | 'RAIL';
  scac_or_iata: string | null;
  country: string;
  region: string;
  source_url: string;
}

const OCEAN: [string, string, string, string][] = [
  // name, SCAC, country, region
  ['Maersk', 'MAEU', 'Denmark', 'Global'],
  ['Mediterranean Shipping Company (MSC)', 'MSCU', 'Switzerland', 'Global'],
  ['CMA CGM', 'CMDU', 'France', 'Global'],
  ['COSCO Shipping', 'COSU', 'China', 'Global'],
  ['Hapag-Lloyd', 'HLCU', 'Germany', 'Global'],
  ['Ocean Network Express (ONE)', 'ONEY', 'Japan', 'Global'],
  ['Evergreen Line', 'EGLV', 'Taiwan', 'Global'],
  ['Hyundai Merchant Marine (HMM)', 'HDMU', 'South Korea', 'Global'],
  ['Yang Ming', 'YMLU', 'Taiwan', 'Global'],
  ['ZIM Integrated Shipping', 'ZIMU', 'Israel', 'Global'],
  ['Wan Hai Lines', '22AA', 'Taiwan', 'Asia'],
  ['Pacific International Lines (PIL)', 'PCIU', 'Singapore', 'Asia'],
  ['Orient Overseas Container Line (OOCL)', 'OOLU', 'Hong Kong', 'Global'],
  ['Mitsui O.S.K. Lines (MOL)', 'MOLU', 'Japan', 'Global'],
  ['Nippon Yusen Kaisha (NYK Line)', 'NYKS', 'Japan', 'Global'],
  ['Kawasaki Kisen Kaisha (K Line)', 'KKLU', 'Japan', 'Global'],
  ['Hamburg Süd', 'SUDU', 'Germany', 'Global'],
  ['American President Lines (APL)', 'APLU', 'Singapore', 'Global'],
  ['Safmarine', 'SAFM', 'South Africa', 'Africa'],
  ['Matson Navigation Company', 'MATS', 'United States', 'Pacific'],
  ['Atlantic Container Line (ACL)', 'ACLU', 'United States', 'Transatlantic'],
  ['Australia National Line (ANL)', 'ANNU', 'Australia', 'Oceania'],
  ['Sealand — A Maersk Company', 'SEJJ', 'United States', 'Americas'],
  ['Sinokor Merchant Marine', 'SKLU', 'South Korea', 'Asia'],
  ['SITC Container Lines', '12PD', 'China', 'Asia'],
  ['Sinotrans Container Lines', '12IH', 'China', 'Asia'],
  ['T.S. Lines', '13DF', 'Taiwan', 'Asia'],
  ['Regional Container Lines (RCL)', 'REGU', 'Thailand', 'Asia'],
  ['Interasia Lines', '12AT', 'Taiwan', 'Asia'],
  ['Namsung Shipping', 'NSRU', 'South Korea', 'Asia'],
  ['SM Line Corporation', 'SMLM', 'South Korea', 'Asia'],
  ['Korea Marine Transport (KMTC)', 'KMTU', 'South Korea', 'Asia'],
  ['Heung-A Shipping', '11QU', 'South Korea', 'Asia'],
  ['Samudera Shipping Line', 'SIKU', 'Indonesia', 'Asia'],
  ['Salam Pacific Indonesia Lines (SPIL)', 'SPNU', 'Indonesia', 'Asia'],
  ['Meratus Line', 'MRTU', 'Indonesia', 'Asia'],
  ['Gold Star Line', 'GSLU', 'Hong Kong', 'Asia'],
  ['Sea Hawk Lines', 'SHKU', 'India', 'Asia'],
  ['Shipping Corporation of India (SCI)', 'SCIU', 'India', 'Asia'],
  ['Sarjak Container Lines', 'SJKU', 'India', 'Asia'],
  ['Cordelia Container Shipping Line', 'CSYU', 'India', 'Asia'],
  ['Turkon Line', 'TRKU', 'Turkey', 'Mediterranean'],
  ['Arkas Line', 'ARKU', 'Turkey', 'Mediterranean'],
  ['Emirates Shipping Line', 'ESPU', 'United Arab Emirates', 'Middle East'],
  ['Oman Container Lines', 'OCLU', 'Oman', 'Middle East'],
  ['Qatar Navigation Lines (QNL)', 'QNLU', 'Qatar', 'Middle East'],
  ['Asyad Line', 'ASLU', 'Oman', 'Middle East'],
  ['Deutsche Afrika-Linien (DAL)', 'DAYU', 'Germany', 'Africa'],
  ['Nile Dutch Africa Line', 'NIDU', 'Netherlands', 'Africa'],
  ['Ethiopian Shipping & Logistics Services', 'ESLU', 'Ethiopia', 'East Africa'],
  ['Grimaldi Deep Sea', 'GRIU', 'Italy', 'Africa'],
  ['Marguisa Shipping Lines', 'MGSU', 'Spain', 'Africa'],
  ['G2 Ocean', 'GSSW', 'Norway', 'Bulk / Breakbulk'],
  ['Westwood Shipping Lines', 'WWSU', 'United States', 'Pacific'],
  ['TOTE Maritime', 'TOTE', 'United States', 'Americas'],
  ['Pasha Hawaii', 'PSHI', 'United States', 'Pacific'],
  ['Seaboard Marine', 'SMLU', 'United States', 'Latin America & Caribbean'],
  ['Wallenius Wilhelmsen', 'WLWH', 'Norway', 'RoRo / Car Carriers'],
  ['Eukor Car Carriers', 'EUKO', 'South Korea', 'RoRo / Car Carriers'],
  ['Independent Container Line (ICL)', 'IILU', 'United States', 'Americas'],
  ['Mariana Express Lines (MELL)', 'MEXU', 'Singapore', 'Pacific'],
  ['China United Lines', 'CULU', 'China', 'Asia'],
  ['China Navigation Company (Swire Shipping)', 'CHVW', 'Hong Kong', 'Asia-Pacific'],
  ['Pan Ocean', 'POBU', 'South Korea', 'Bulk'],
  ['FESCO', 'FESO', 'Russia', 'Asia-Pacific'],
];

const AIR: [string, string, string, string][] = [
  // name, IATA, country, region
  ['Emirates SkyCargo', 'EK', 'United Arab Emirates', 'Middle East'],
  ['Qatar Airways Cargo', 'QR', 'Qatar', 'Middle East'],
  ['Etihad Cargo', 'EY', 'United Arab Emirates', 'Middle East'],
  ['Turkish Cargo', 'TK', 'Turkey', 'Middle East / Europe'],
  ['Saudia Cargo', 'SV', 'Saudi Arabia', 'Middle East'],
  ['Cathay Cargo', 'CX', 'Hong Kong', 'Asia'],
  ['Singapore Airlines Cargo', 'SQ', 'Singapore', 'Asia'],
  ['Korean Air Cargo', 'KE', 'South Korea', 'Asia'],
  ['Asiana Cargo', 'OZ', 'South Korea', 'Asia'],
  ['Japan Airlines Cargo', 'JL', 'Japan', 'Asia'],
  ['ANA Cargo', 'NH', 'Japan', 'Asia'],
  ['Nippon Cargo Airlines', 'KZ', 'Japan', 'Asia'],
  ['China Cargo Airlines', 'CK', 'China', 'Asia'],
  ['China Southern Cargo', 'CZ', 'China', 'Asia'],
  ['Air China Cargo', 'CA', 'China', 'Asia'],
  ['SF Airlines', 'O3', 'China', 'Asia'],
  ['Yangtze River Express', 'Y8', 'China', 'Asia'],
  ['MASkargo', 'MH', 'Malaysia', 'Asia'],
  ['Lufthansa Cargo', 'LH', 'Germany', 'Europe'],
  ['Air France Cargo', 'AF', 'France', 'Europe'],
  ['KLM Cargo', 'KL', 'Netherlands', 'Europe'],
  ['Cargolux', 'CV', 'Luxembourg', 'Europe'],
  ['AeroLogic', '3S', 'Germany', 'Europe'],
  ['Silk Way Airlines', 'ZP', 'Azerbaijan', 'Central Asia'],
  ['Silk Way West Airlines', '7L', 'Azerbaijan', 'Central Asia'],
  ['AirBridgeCargo Airlines', 'RU', 'Russia', 'Global'],
  ['FedEx Express', 'FX', 'United States', 'Global'],
  ['UPS Airlines', '5X', 'United States', 'Global'],
  ['Atlas Air', '5Y', 'United States', 'Global'],
  ['Kalitta Air', 'K4', 'United States', 'Global'],
  ['Polar Air Cargo', 'PO', 'United States', 'Global'],
  ['DHL Aviation', 'QY', 'Germany', 'Global'],
  ['Air Canada Cargo', 'AC', 'Canada', 'Americas'],
  ['Egyptair Cargo', 'MS', 'Egypt', 'Africa'],
  ['Ethiopian Cargo & Logistics', 'ET', 'Ethiopia', 'East Africa'],
  ['Kenya Airways Cargo', 'KQ', 'Kenya', 'East Africa'],
  ['RwandAir', 'WB', 'Rwanda', 'East Africa'],
  ['Precision Air', 'PW', 'Tanzania', 'East Africa'],
  ['Air Tanzania', 'TC', 'Tanzania', 'East Africa'],
  ['Uganda Airlines', 'UR', 'Uganda', 'East Africa'],
  ['South African Airways', 'SA', 'South Africa', 'Southern Africa'],
  ['Blue Dart Aviation', 'BZ', 'India', 'Asia'],
  ['SpiceXpress', 'SG', 'India', 'Asia'],
  ['Air Hong Kong', 'LD', 'Hong Kong', 'Asia'],
];

const ROAD_RAIL: [string, 'ROAD' | 'RAIL', string | null, string, string][] = [
  // name, mode, code (usually null), country, region
  ['Tanzania Road Haulage (1980) Limited', 'ROAD', null, 'Tanzania', 'East & Central Africa'],
  ['Freight In Time (FIT)', 'ROAD', null, 'Kenya', 'East Africa'],
  ['Express Shipping & Logistics (EA) Ltd', 'ROAD', null, 'Tanzania', 'East Africa'],
  ['Sibed Transport Co. Ltd', 'ROAD', null, 'Kenya', 'East Africa'],
  ['Elipas Logistics Ltd', 'ROAD', null, 'Kenya', 'East Africa'],
  ['Kyoga Hauliers (Kenya) Ltd', 'ROAD', null, 'Kenya', 'East Africa'],
  ['Concargo', 'ROAD', null, 'Pan-African', 'Sub-Saharan Africa / COMESA'],
  ['Africa Global Logistics (AGL) Tanzania', 'ROAD', null, 'Tanzania', 'East Africa'],
  ['Kuehne+Nagel', 'ROAD', null, 'Switzerland', 'Global'],
  ['TAZARA — Tanzania-Zambia Railway Authority', 'RAIL', null, 'Tanzania / Zambia', 'East & Southern Africa'],
];

async function main() {
  const rows: Row[] = [
    ...OCEAN.map(([name, scac, country, region]) => ({ name, mode: 'OCEAN' as const, scac_or_iata: scac, country, region, source_url: SCAC_SOURCE })),
    ...AIR.map(([name, iata, country, region]) => ({ name, mode: 'AIR' as const, scac_or_iata: iata, country, region, source_url: IATA_SOURCE })),
    ...ROAD_RAIL.map(([name, mode, code, country, region]) => ({ name, mode, scac_or_iata: code, country, region, source_url: ROAD_SOURCE })),
  ];

  let inserted = 0, updated = 0;
  for (const r of rows) {
    const existing = await db.selectFrom('carrier_directory')
      .select('id')
      .where('name', '=', r.name)
      .where('mode', '=', r.mode)
      .executeTakeFirst();

    if (existing) {
      await db.updateTable('carrier_directory')
        .set({ scac_or_iata: r.scac_or_iata, country: r.country, region: r.region, source_url: r.source_url, updated_at: new Date() })
        .where('id', '=', existing.id)
        .execute();
      updated++;
    } else {
      await db.insertInto('carrier_directory')
        .values({ name: r.name, mode: r.mode, scac_or_iata: r.scac_or_iata, country: r.country, region: r.region, website: null, source_url: r.source_url })
        .execute();
      inserted++;
    }
  }

  console.log(`carrier_directory seed complete: ${inserted} inserted, ${updated} updated, ${rows.length} total (${OCEAN.length} ocean, ${AIR.length} air, ${ROAD_RAIL.length} road/rail).`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
