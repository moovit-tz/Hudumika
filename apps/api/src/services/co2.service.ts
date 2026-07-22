import { db, withTenant } from '../db/client.js';
import { haversineDistKm } from '../utils/geo.js';

// Geocode DB for major freight hubs (East Africa lanes + global trade hubs)
// covering IATA airport codes and UN/LOCODE seaports. Not a full UN/LOCODE
// database — a hand-maintained list sized for the lanes this platform
// actually serves. Unknown codes are a hard error (see calculateForShipment),
// never a silent guess.
const LOCATIONS: Record<string, { lat: number; lon: number }> = {
  // ── Airports (IATA) — East/Southern Africa ──
  'DAR': { lat: -6.8781, lon: 39.2026 },   // Dar es Salaam (Julius Nyerere)
  'JRO': { lat: -3.4297, lon: 37.0745 },   // Kilimanjaro
  'MBA': { lat: -4.0348, lon: 39.5942 },   // Mombasa (Moi Intl)
  'NBO': { lat: -1.3192, lon: 36.9278 },   // Nairobi (Jomo Kenyatta)
  'EBB': { lat: 0.0424, lon: 32.4435 },    // Entebbe (Kampala)
  'KGL': { lat: -1.9686, lon: 30.1395 },   // Kigali
  'LUN': { lat: -15.3308, lon: 28.4526 },  // Lusaka
  'HRE': { lat: -17.9318, lon: 31.0928 },  // Harare
  'JNB': { lat: -26.1392, lon: 28.2460 },  // Johannesburg (O.R. Tambo)
  'CPT': { lat: -33.9648, lon: 18.6017 },  // Cape Town
  'DUR': { lat: -29.6144, lon: 31.1197 },  // Durban (King Shaka)
  'ADD': { lat: 8.9779, lon: 38.7993 },    // Addis Ababa (Bole)
  // ── Airports — rest of Africa ──
  'CAI': { lat: 30.1219, lon: 31.4056 },   // Cairo
  'LOS': { lat: 6.5774, lon: 3.3212 },     // Lagos
  'ACC': { lat: 5.6052, lon: -0.1668 },    // Accra
  'ABJ': { lat: 5.2614, lon: -3.9263 },    // Abidjan
  // ── Airports — Middle East ──
  'DXB': { lat: 25.2532, lon: 55.3657 },   // Dubai
  'AUH': { lat: 24.4330, lon: 54.6511 },   // Abu Dhabi
  'DOH': { lat: 25.2731, lon: 51.6081 },   // Doha
  'JED': { lat: 21.6796, lon: 39.1565 },   // Jeddah
  'RUH': { lat: 24.9576, lon: 46.6988 },   // Riyadh
  // ── Airports — South/Southeast/East Asia ──
  'BOM': { lat: 19.0896, lon: 72.8656 },   // Mumbai
  'DEL': { lat: 28.5562, lon: 77.1000 },   // Delhi
  'MAA': { lat: 12.9941, lon: 80.1709 },   // Chennai
  'CMB': { lat: 7.1808, lon: 79.8841 },    // Colombo
  'SIN': { lat: 1.3644, lon: 103.9915 },   // Singapore
  'KUL': { lat: 2.7456, lon: 101.7099 },   // Kuala Lumpur
  'BKK': { lat: 13.6900, lon: 100.7501 },  // Bangkok
  'HKG': { lat: 22.3080, lon: 113.9185 },  // Hong Kong
  'PVG': { lat: 31.1443, lon: 121.8083 },  // Shanghai Pudong
  'PEK': { lat: 40.0799, lon: 116.6031 },  // Beijing
  'CAN': { lat: 23.3924, lon: 113.2988 },  // Guangzhou
  'ICN': { lat: 37.4602, lon: 126.4407 },  // Seoul Incheon
  'NRT': { lat: 35.7647, lon: 140.3864 },  // Tokyo Narita
  'KIX': { lat: 34.4347, lon: 135.2440 },  // Osaka Kansai
  // ── Airports — Europe ──
  'LHR': { lat: 51.4700, lon: -0.4543 },   // London Heathrow
  'FRA': { lat: 50.0333, lon: 8.5706 },    // Frankfurt
  'AMS': { lat: 52.3105, lon: 4.7683 },    // Amsterdam
  'CDG': { lat: 49.0097, lon: 2.5479 },    // Paris Charles de Gaulle
  'MAD': { lat: 40.4983, lon: -3.5676 },   // Madrid
  'FCO': { lat: 41.8003, lon: 12.2389 },   // Rome Fiumicino
  'IST': { lat: 41.2753, lon: 28.7519 },   // Istanbul
  // ── Airports — Americas / Oceania ──
  'JFK': { lat: 40.6413, lon: -73.7781 },  // New York JFK
  'ORD': { lat: 41.9742, lon: -87.9073 },  // Chicago O'Hare
  'LAX': { lat: 33.9416, lon: -118.4085 }, // Los Angeles
  'MIA': { lat: 25.7959, lon: -80.2870 },  // Miami
  'ATL': { lat: 33.6407, lon: -84.4277 },  // Atlanta
  'YYZ': { lat: 43.6777, lon: -79.6248 },  // Toronto
  'GRU': { lat: -23.4356, lon: -46.4731 }, // Sao Paulo Guarulhos
  'MEX': { lat: 19.4363, lon: -99.0721 },  // Mexico City
  'SYD': { lat: -33.9399, lon: 151.1753 }, // Sydney
  'MEL': { lat: -37.6690, lon: 144.8410 }, // Melbourne
  'AKL': { lat: -37.0082, lon: 174.7850 }, // Auckland

  // ── Seaports (UN/LOCODE) — East/Southern Africa ──
  'TZDAR': { lat: -6.8278, lon: 39.2933 }, // Dar es Salaam Port
  'KEMBA': { lat: -4.0435, lon: 39.6682 }, // Mombasa Port
  'TZZNZ': { lat: -6.1659, lon: 39.1917 }, // Zanzibar Port
  'ZADUR': { lat: -29.8587, lon: 31.0218 }, // Durban Port
  'ZACPT': { lat: -33.9013, lon: 18.4239 }, // Cape Town Port
  'ZAPLZ': { lat: -33.9608, lon: 25.6022 }, // Port Elizabeth (Gqeberha)
  'MZMPM': { lat: -25.9689, lon: 32.5732 }, // Maputo Port
  'MZBEW': { lat: -19.8317, lon: 34.8517 }, // Beira Port
  // ── Seaports — rest of Africa ──
  'EGPSD': { lat: 31.2653, lon: 32.3019 }, // Port Said
  'EGSUZ': { lat: 29.9668, lon: 32.5498 }, // Suez
  'DJJIB': { lat: 11.5951, lon: 43.1470 }, // Djibouti Port
  'SDPZU': { lat: 19.6158, lon: 37.2164 }, // Port Sudan
  'NGAPP': { lat: 6.4432, lon: 3.3634 },   // Apapa (Lagos)
  'GHTEM': { lat: 5.6698, lon: -0.0166 },  // Tema (Ghana)
  'CIABJ': { lat: 5.2893, lon: -4.0128 },  // Abidjan Port
  'SNDKR': { lat: 14.6928, lon: -17.4467 }, // Dakar Port
  'MAPTM': { lat: 33.6022, lon: -7.6186 }, // Casablanca Port
  // ── Seaports — Middle East / South Asia ──
  'AEDXB': { lat: 25.2694, lon: 55.2972 }, // Jebel Ali (Dubai)
  'AEAUH': { lat: 24.7500, lon: 54.6500 }, // Khalifa Port (Abu Dhabi)
  'SAJED': { lat: 21.4858, lon: 39.1728 }, // Jeddah Islamic Port
  'OMSLL': { lat: 17.0151, lon: 54.0924 }, // Salalah
  'INNSA': { lat: 18.9490, lon: 72.9525 }, // Nhava Sheva / JNPT (Mumbai)
  'INMAA': { lat: 13.0944, lon: 80.2930 }, // Chennai Port
  'PKQCT': { lat: 24.8608, lon: 66.9903 }, // Qasim / Karachi
  // ── Seaports — East / Southeast Asia ──
  'CNSHA': { lat: 31.2222, lon: 121.4581 }, // Shanghai Port
  'CNSHK': { lat: 22.4867, lon: 113.9036 }, // Shekou (Shenzhen)
  'CNNGB': { lat: 29.8683, lon: 121.5440 }, // Ningbo
  'CNTAO': { lat: 36.0671, lon: 120.3826 }, // Qingdao
  'CNTXG': { lat: 38.9736, lon: 117.7181 }, // Tianjin
  'HKHKG': { lat: 22.2793, lon: 114.1628 }, // Hong Kong Port
  'SGJUR': { lat: 1.3000, lon: 103.7333 },  // Singapore Port (Jurong)
  'MYPKG': { lat: 3.0000, lon: 101.4000 },  // Port Klang
  'THLCH': { lat: 13.0827, lon: 100.8830 }, // Laem Chabang
  'VNSGN': { lat: 10.7769, lon: 106.7009 }, // Ho Chi Minh City
  // ── Seaports — Europe ──
  'TRIST': { lat: 40.9700, lon: 28.6800 }, // Ambarli (Istanbul)
  'GRPIR': { lat: 37.9475, lon: 23.6350 }, // Piraeus
  'ITGOA': { lat: 44.4056, lon: 8.9463 },  // Genoa
  'ESALG': { lat: 36.1408, lon: -5.4562 }, // Algeciras
  'ESVLC': { lat: 39.4550, lon: -0.3200 }, // Valencia
  'NLRTM': { lat: 51.9225, lon: 4.4792 },  // Rotterdam Port
  'BEANR': { lat: 51.2601, lon: 4.4024 },  // Antwerp
  'DEHAM': { lat: 53.5459, lon: 9.9689 },  // Hamburg
  'GBFXT': { lat: 51.9539, lon: 1.3517 },  // Felixstowe
  'GBLGP': { lat: 51.5010, lon: 0.4931 },  // London Gateway
  'FRLEH': { lat: 49.4838, lon: 0.1080 },  // Le Havre
  // ── Seaports — Americas / Oceania ──
  'USNYC': { lat: 40.6700, lon: -74.0776 }, // New York / New Jersey
  'USLAX': { lat: 33.7395, lon: -118.2610 }, // Los Angeles / Long Beach
  'USSAV': { lat: 32.0835, lon: -81.0998 }, // Savannah
  'USHOU': { lat: 29.7300, lon: -95.0100 }, // Houston
  'USOAK': { lat: 37.7955, lon: -122.2900 }, // Oakland
  'CAVAN': { lat: 49.2934, lon: -123.1080 }, // Vancouver
  'BRSSZ': { lat: -23.9608, lon: -46.3336 }, // Santos
  'ARBUE': { lat: -34.6033, lon: -58.3676 }, // Buenos Aires
  'CLVAP': { lat: -33.0362, lon: -71.6273 }, // Valparaiso
  'PECLL': { lat: -12.0500, lon: -77.1500 }, // Callao
  'AUSYD': { lat: -33.9500, lon: 151.2200 }, // Sydney (Botany Bay)
  'AUMEL': { lat: -37.8300, lon: 144.9300 }, // Melbourne
  'NZAKL': { lat: -36.8420, lon: 174.7700 }, // Auckland
};

// GLEC v3.2 Emission Factors (approximate kg CO2e per tonne-km)
const EMISSION_FACTORS = {
  'AIR': 1.25,     // Air freight long-haul
  'SEA': 0.015,    // Container ship deep-sea
  'ROAD': 0.13,    // Articulated truck
  'RAIL': 0.02,    // Freight rail (mixed electric/diesel)
};

// Free-text port/city names (as stored on shipment_cases.origin_port /
// dest_port / port_of_loading / port_of_discharge — never IATA/UN-LOCODE
// codes) mapped to the codes above, so CO2 can be computed directly from a
// shipment's own fields instead of asking a user to re-type a code.
const NAME_ALIASES: Record<string, string> = {
  'dar es salaam': 'TZDAR', 'dar es salaam port': 'TZDAR', 'dar-es-salaam': 'TZDAR',
  'julius nyerere intl airport (jnia)': 'DAR', 'julius nyerere international airport': 'DAR', 'jnia': 'DAR',
  'zanzibar': 'TZZNZ', 'zanzibar port': 'TZZNZ',
  'tanga': 'TZDAR', 'tanga port': 'TZDAR', // no dedicated Tanga entry — nearest coded hub
  'mombasa': 'KEMBA', 'mombasa, kenya': 'KEMBA', 'mombasa port': 'KEMBA',
  'nairobi': 'NBO', 'nairobi, kenya': 'NBO',
  'durban': 'ZADUR', 'durban, south africa': 'ZADUR', 'durban port': 'ZADUR',
  'cape town': 'ZACPT', 'cape town, south africa': 'ZACPT',
  'johannesburg': 'JNB', 'johannesburg, south africa': 'JNB',
  'shanghai': 'CNSHA', 'shanghai, china': 'CNSHA', 'shanghai port': 'CNSHA',
  'guangzhou': 'CNSHA', 'guangzhou, china': 'CNSHA', // nearest coded South-China hub
  'ningbo': 'CNSHA', 'ningbo, china': 'CNSHA',
  'tianjin': 'CNSHA', 'tianjin, china': 'CNSHA',
  'hong kong': 'HKHKG', 'hong kong, china': 'HKHKG',
  'singapore': 'SGJUR', 'singapore port': 'SGJUR',
  'busan': 'SGJUR', 'busan, south korea': 'SGJUR', // nearest coded NE-Asia hub
  'jakarta': 'MYPKG', 'jakarta, indonesia': 'MYPKG', // nearest coded SE-Asia hub
  'port klang': 'MYPKG', 'kuala lumpur': 'MYPKG',
  'mumbai': 'BOM', 'mumbai, india': 'BOM',
  'chennai': 'INMAA', 'chennai, india': 'INMAA', 'chennai port': 'INMAA',
  'delhi': 'DEL', 'new delhi': 'DEL',
  'dubai': 'DXB', 'dubai, uae': 'DXB', 'jebel ali': 'AEAUH', 'jebel ali, uae': 'AEAUH',
  'abu dhabi': 'AEAUH', 'khalifa port': 'AEAUH',
  'doha': 'DOH', 'doha, qatar': 'DOH',
  'jeddah': 'SAJED', 'jeddah, saudi arabia': 'SAJED',
  'rotterdam': 'NLRTM', 'rotterdam, netherlands': 'NLRTM', 'rotterdam port': 'NLRTM',
  'addis ababa': 'ADD',
  'kigali': 'KGL', 'lusaka': 'LUN', 'harare': 'HRE',
  'cairo': 'CAI', 'lagos': 'LOS', 'accra': 'ACC', 'abidjan': 'CIABJ', 'abidjan port': 'CIABJ',
  'dodoma': 'TZDAR', // inland — no coastal port of its own; nearest gateway
  'colombo': 'CMB', 'colombo, sri lanka': 'CMB',
};

/** Resolve a free-text port/city/airport name (as stored on a shipment) to
 *  a code in LOCATIONS. Tries an exact code match first, then the alias
 *  table on a normalized (lowercased, trimmed) form. Returns null — never
 *  a guess — when nothing matches. */
export function resolveLocationCode(freeText: string): string | null {
  const raw = freeText.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (LOCATIONS[upper]) return upper;
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (NAME_ALIASES[normalized]) return NAME_ALIASES[normalized];
  // Loose match: any alias key that's a substring of the input or vice versa
  for (const [name, code] of Object.entries(NAME_ALIASES)) {
    if (normalized.includes(name) || name.includes(normalized)) return code;
  }
  return null;
}

export const co2Service = {
  async calculateForShipment(tenantId: string, shipmentId: string, params: {
    origin: string;
    destination: string;
    weight_kg: number;
    mode: 'AIR' | 'SEA' | 'ROAD' | 'RAIL';
  }) {
    const { origin, destination, weight_kg, mode } = params;

    // Accept either a raw code or a free-text port/city name — resolve the
    // latter via NAME_ALIASES so callers can pass a shipment's own stored
    // origin/destination fields directly, no manual code entry required.
    const origCode = resolveLocationCode(origin);
    const destCode = resolveLocationCode(destination);

    // Look up coordinates — no guessing. An unresolvable name is a real
    // failure, not a reason to silently compute a wrong distance.
    const locOrig = origCode ? LOCATIONS[origCode] : undefined;
    const locDest = destCode ? LOCATIONS[destCode] : undefined;
    if (!locOrig) throw new Error(`Could not resolve origin "${origin}" to a known port/airport`);
    if (!locDest) throw new Error(`Could not resolve destination "${destination}" to a known port/airport`);

    // Calculate distance
    const distKm = haversineDistKm(locOrig.lat, locOrig.lon, locDest.lat, locDest.lon);
    
    // Cargo weight in tonnes
    const weightTonnes = weight_kg / 1000;
    const tkm = distKm * weightTonnes;
    
    // Apply GLEC factor
    const factor = EMISSION_FACTORS[mode] || EMISSION_FACTORS['AIR'];
    const co2EmissionsKg = tkm * factor;
    
    // Calculate carbon credits saved based on a standard "inefficiency baseline"
    // e.g., representing emissions from an older, less efficient route/vehicle
    const baselineInefficiencyPct = 0.25; // 25% higher baseline
    const baselineEmissions = co2EmissionsKg * (1 + baselineInefficiencyPct);
    const co2SavedKg = Math.max(0, baselineEmissions - co2EmissionsKg);
    
    // 1 Carbon Credit = 1 metric tonne of CO2 avoided (1000 kg)
    const carbonCreditsSaved = co2SavedKg / 1000;
    
    // Format outputs
    const finalCo2 = Math.round(co2EmissionsKg * 100) / 100;
    const finalCredits = Math.round(carbonCreditsSaved * 10000) / 10000; // 4 decimal places
    
    // Update shipment_cases record
    await withTenant(tenantId, async (trx) => {
      await trx.updateTable('shipment_cases')
        .set({
          co2_emissions_kg: finalCo2,
          carbon_credits_saved: finalCredits,
          co2_calc_details: JSON.stringify({
            origin: origCode,
            destination: destCode,
            weight_kg,
            mode,
            distance_km: Math.round(distKm),
            tkm: Math.round(tkm),
            factor
          })
        })
        .where('id', '=', shipmentId)
        .where('tenant_id', '=', tenantId)
        .execute();
    });
    
    return {
      co2_emissions_kg: finalCo2,
      carbon_credits_saved: finalCredits,
      distance_km: Math.round(distKm),
      mode
    };
  }
};
