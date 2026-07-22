/**
 * Weights and Measures Act (Cap 340) HS-code crosswalk — seeds the global
 * wma_hs_codes reference table (migration 091) from a derived mapping
 * document (WMA_HS_Crosswalk.md, supplied by the user).
 *
 * IMPORTANT provenance note, carried into every row's source_note: the Act
 * itself contains ZERO HS codes — it regulates by goods description
 * (Tenth/Eleventh/Twelfth Schedules) and instrument type (ss.13,18,19,21).
 * Every HS code here is a derived mapping, not an official crosswalk, and
 * has no legal force. It must be verified against the EAC CET 2022 tariff
 * text and with the Weights and Measures Agency / TBS before gating an
 * import — the checkCompliance() consumer surfaces this caveat directly.
 *
 * Usage: npx tsx src/scripts/seed-wma-compliance.ts
 */
import { db } from '../db/client.js';

const SOURCE_NOTE = "Derived mapping, not an official crosswalk — the Weights and Measures Act contains no HS codes. Verify against EAC CET 2022 and with the Weights and Measures Agency / TBS before relying on it to gate an import.";

interface Row {
  from: string;
  to?: string;          // defaults to `from` for a single code
  display: string;
  description: string;
  sheet: 'A' | 'B';
  cls: string;
  act?: string;
  schedule?: string;
  trigger: string;
  confidence: 'direct' | 'derived' | 'broad';
  notes?: string;
  rigid?: string;
  other?: string;
}

const digits = (s: string) => s.replace(/\D/g, '');

// ── Sheet A — Weighing & measuring instruments (26 entries) ──────────────
// Obligation: pattern approval + verification stamping (ss.13,18,19,21,35,38)
const SHEET_A: Row[] = [
  { from: '842310', display: '8423.10', description: 'Personal weighing machines, incl. baby scales; household scales', sheet: 'A', cls: 'Weighing', trigger: 'Approved pattern + verification stamp', confidence: 'derived', notes: "Household scales only in scope if used FOR TRADE (s.2 'trade')." },
  { from: '842320', display: '8423.20', description: 'Scales for continuous weighing of goods on conveyors', sheet: 'A', cls: 'Weighing', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'Bulk trade weighing — core scope.' },
  { from: '842330', display: '8423.30', description: 'Constant-weight scales; scales for discharging a predetermined weight', sheet: 'A', cls: 'Weighing', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'Bagging/filling plant — s.26 net-weight link.' },
  { from: '842381', display: '8423.81', description: 'Other weighing machinery, max capacity ≤ 30 kg', sheet: 'A', cls: 'Weighing', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'Retail counter scales — highest enforcement volume.' },
  { from: '842382', display: '8423.82', description: 'Other weighing machinery, max capacity > 30 kg ≤ 5,000 kg', sheet: 'A', cls: 'Weighing', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'Platform/floor scales.' },
  { from: '842389', display: '8423.89', description: 'Other weighing machinery (incl. weighbridges > 5,000 kg)', sheet: 'A', cls: 'Weighing', trigger: 'Approved pattern + verification stamp; re-stamp on reinstallation', confidence: 'direct', notes: 'Weighbridges: s.21(2) re-stamping on relocation; s.54(1)(n) public weighbridge registration.' },
  { from: '842390', display: '8423.90', description: 'Weighing machine weights of all kinds; parts of weighing machinery', sheet: 'A', cls: 'Weighing', trigger: 'Denomination stamping (s.13) + verification', confidence: 'direct', notes: 's.13(1)(a): denomination must be stamped on top or side.' },
  { from: '901600', display: '9016.00', description: 'Balances of a sensitivity of 5 cg or better, with or without weights', sheet: 'A', cls: 'Weighing', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'Precision/laboratory and precious-metal trade balances.' },
  { from: '902810', display: '9028.10', description: 'Gas meters', sheet: 'A', cls: 'Measuring', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'Supply meters — trade measurement of gas.' },
  { from: '902820', display: '9028.20', description: 'Liquid meters (incl. water meters, bulk fuel meters)', sheet: 'A', cls: 'Measuring', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'Water utility and fuel custody-transfer metering.' },
  { from: '902830', display: '9028.30', description: 'Electricity meters', sheet: 'A', cls: 'Measuring', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'Utility billing meters. Coordinate with EWURA requirements.' },
  { from: '902890', display: '9028.90', description: 'Parts and accessories of gas/liquid/electricity meters', sheet: 'A', cls: 'Measuring', trigger: 'Conditional', confidence: 'derived', notes: 'In scope where the part affects metrological performance.' },
  { from: '841311', display: '8413.11', description: 'Pumps fitted with a measuring device, for dispensing fuel or lubricants at filling stations', sheet: 'A', cls: 'Measuring', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'Fuel dispensers — the highest-profile WMA enforcement item.' },
  { from: '901720', display: '9017.20', description: 'Other drawing, marking-out or mathematical calculating instruments', sheet: 'A', cls: 'Measuring', trigger: 'Conditional', confidence: 'derived', notes: 'In scope only where used to determine quantity in trade.' },
  { from: '901730', display: '9017.30', description: 'Micrometers, callipers and gauges', sheet: 'A', cls: 'Measuring', trigger: 'Conditional', confidence: 'derived', notes: 'Trade use (e.g. sizing sold by dimension).' },
  { from: '901780', display: '9017.80', description: 'Other instruments — measuring rods and tapes, divided scales', sheet: 'A', cls: 'Measuring', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'Trade measuring tapes/rules — length sold by linear measure (10th Sch Part V).' },
  { from: '902610', display: '9026.10', description: 'Instruments for measuring or checking the flow or level of liquids', sheet: 'A', cls: 'Measuring', trigger: 'Approved pattern + verification stamp', confidence: 'derived', notes: 'Custody-transfer flow metering; tank level gauging.' },
  { from: '902620', display: '9026.20', description: 'Instruments for measuring or checking pressure', sheet: 'A', cls: 'Measuring', trigger: 'Conditional', confidence: 'derived', notes: 'In scope where pressure determines traded quantity (e.g. gas).' },
  { from: '902680', display: '9026.80', description: 'Other instruments for measuring/checking variables of liquids or gases', sheet: 'A', cls: 'Measuring', trigger: 'Conditional', confidence: 'derived', notes: 'Assess case by case.' },
  { from: '902910', display: '9029.10', description: 'Revolution counters, production counters, taximeters, mileometers, pedometers', sheet: 'A', cls: 'Measuring', trigger: 'Approved pattern + verification stamp', confidence: 'direct', notes: 'TAXIMETERS are squarely in trade use — fare determined by measurement.' },
  { from: '902920', display: '9029.20', description: 'Speed indicators and tachometers; stroboscopes', sheet: 'A', cls: 'Measuring', trigger: 'Conditional', confidence: 'derived', notes: 'In scope where output determines a charge.' },
  { from: '903180', display: '9031.80', description: 'Other measuring or checking instruments, appliances and machines', sheet: 'A', cls: 'Measuring', trigger: 'Conditional', confidence: 'derived', notes: "Catch-all; assess against s.2 'weighing or measuring instrument'." },
  { from: '903289', display: '9032.89', description: 'Other automatic regulating or controlling instruments', sheet: 'A', cls: 'Measuring', trigger: 'Conditional', confidence: 'derived', notes: 'In scope where integrated into a trade measuring system.' },
  { from: '901530', display: '9015.30', description: 'Levels (surveying)', sheet: 'A', cls: 'Measuring', trigger: 'Conditional', confidence: 'derived', notes: "Land measurement — note s.2 excludes land sale from 'trade'." },
  { from: '902519', display: '9025.19', description: 'Thermometers, not combined with other instruments', sheet: 'A', cls: 'Measuring', trigger: 'Conditional', confidence: 'derived', notes: 'In scope for temperature-compensated fuel volume measurement.' },
  { from: '732690', display: '7326.90', description: 'Other articles of iron or steel (standard/test weights not elsewhere specified)', sheet: 'A', cls: 'Weighing', trigger: 'Denomination stamping + verification', confidence: 'broad', notes: 'Only where the article is a trade weight; confirm national split.' },
];

// ── Sheet B — Goods regulated as to weight/measure (Tenth/Eleventh/Twelfth
// Schedules). Obligation: s.26 — sale by net weight/measure only, prescribed
// pack quantities, conspicuous net-quantity statement. ─────────────────────
const NET = 'Net weight/measure only (s.26(1)(a),(c))';
const NETQ = 'Net weight/measure + prescribed pack quantity (s.26(1)(a),(b),(c))';
const NETM = 'Net weight/measure + marking (s.26(1)(a),(c))';

const SHEET_B: Row[] = [
  { from: '330720', display: '3307.20', description: 'Personal deodorants and antiperspirants', sheet: 'B', cls: 'Aerosol products', act: 'Aerosol products', schedule: '10th Sch Pt I(1)', trigger: NET, confidence: 'broad' },
  { from: '340590', display: '3405.90', description: 'Other polishes/creams (aerosol form)', sheet: 'B', cls: 'Aerosol products', act: 'Aerosol products', schedule: '10th Sch Pt I(1)', trigger: NET, confidence: 'broad' },
  { from: '380891', display: '3808.91', description: 'Insecticides (aerosol form)', sheet: 'B', cls: 'Aerosol products', act: 'Aerosol products', schedule: '10th Sch Pt I(1)', trigger: NET, confidence: 'broad' },
  { from: '0201', to: '0210', display: '0201-0210', description: 'Meat and edible meat offal', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NET, confidence: 'broad' },
  { from: '0401', to: '0406', display: '0401-0406', description: 'Dairy produce', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NET, confidence: 'broad' },
  { from: '0701', to: '0714', display: '0701-0714', description: 'Edible vegetables, roots and tubers', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NET, confidence: 'broad' },
  { from: '1001', to: '1008', display: '1001-1008', description: 'Cereals', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NET, confidence: 'broad' },
  { from: '1101', to: '1109', display: '1101-1109', description: 'Products of the milling industry', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NET, confidence: 'broad' },
  { from: '1601', to: '1605', display: '1601-1605', description: 'Preparations of meat and fish', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NET, confidence: 'broad' },
  { from: '1701', to: '1704', display: '1701-1704', description: 'Sugars and sugar confectionery', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NETQ, confidence: 'broad' },
  { from: '1801', to: '1806', display: '1801-1806', description: 'Cocoa and cocoa preparations', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NET, confidence: 'broad' },
  { from: '1901', to: '1905', display: '1901-1905', description: 'Preparations of cereals, flour, starch; pastry', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NETQ, confidence: 'broad' },
  { from: '2001', to: '2009', display: '2001-2009', description: 'Preparations of vegetables, fruit, nuts', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NETQ, confidence: 'broad' },
  { from: '2101', to: '2106', display: '2101-2106', description: 'Miscellaneous edible preparations', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NET, confidence: 'broad' },
  { from: '1902', display: '1902', description: 'Pasta, couscous', sheet: 'B', cls: 'All foodstuffs', act: 'All foodstuffs', schedule: '10th Sch Pt I(2)', trigger: NET, confidence: 'broad' },
  { from: '230910', display: '2309.10', description: 'Dog or cat food, put up for retail sale', sheet: 'B', cls: 'Animal and pet food', act: 'Animal and pet food', schedule: '10th Sch Pt I(3)', trigger: NET, confidence: 'direct' },
  { from: '230990', display: '2309.90', description: 'Other preparations for animal feeding', sheet: 'B', cls: 'Animal and pet food', act: 'Animal and pet food', schedule: '10th Sch Pt I(3)', trigger: NET, confidence: 'direct' },
  { from: '252310', display: '2523.10', description: 'Cement clinkers', sheet: 'B', cls: 'Cement', act: 'Cement', schedule: '10th Sch Pt I(4)', trigger: NETQ, confidence: 'direct' },
  { from: '252321', display: '2523.21', description: 'Portland cement — white', sheet: 'B', cls: 'Cement', act: 'Cement', schedule: '10th Sch Pt I(4)', trigger: NETQ, confidence: 'direct' },
  { from: '252329', display: '2523.29', description: 'Portland cement — other', sheet: 'B', cls: 'Cement', act: 'Cement', schedule: '10th Sch Pt I(4)', trigger: NETQ, confidence: 'direct', rigid: undefined, other: '50kg' },
  { from: '252390', display: '2523.90', description: 'Other hydraulic cements', sheet: 'B', cls: 'Cement', act: 'Cement', schedule: '10th Sch Pt I(4)', trigger: NETQ, confidence: 'direct' },
  { from: '340111', display: '3401.11', description: 'Soap in bars/cakes — toilet use', sheet: 'B', cls: 'Soap flakes/powder', act: 'Soap flakes/powder', schedule: '10th Sch Pt I(5)', trigger: NETQ, confidence: 'direct' },
  { from: '340119', display: '3401.19', description: 'Soap in bars/cakes — other', sheet: 'B', cls: 'Soap flakes/powder', act: 'Soap flakes/powder', schedule: '10th Sch Pt I(5)', trigger: NETQ, confidence: 'direct', other: '25g, 50g, 100g, 150g, 200g, 300g, 400g, 500g, 800g, 1kg, 1.25kg, 1.5kg, 2kg, 2.25kg, 2.5kg, 3kg, thereafter by steps of 1kg' },
  { from: '340120', display: '3401.20', description: 'Soap in other forms (flakes, powder)', sheet: 'B', cls: 'Soap flakes/powder', act: 'Soap flakes/powder', schedule: '10th Sch Pt I(5)', trigger: NETQ, confidence: 'direct', rigid: '100ml, by steps of 100ml up to 500ml, 1 litre, thereafter by steps of 1 litre; 20kg in 20-litre tin, thereafter by steps of 10kg' },
  { from: '340250', display: '3402.50', description: 'Surface-active/washing preparations put up for retail sale', sheet: 'B', cls: 'Detergents', act: 'Detergents', schedule: '10th Sch Pt I(5)', trigger: NETQ, confidence: 'direct' },
  { from: '340290', display: '3402.90', description: 'Other washing and cleaning preparations', sheet: 'B', cls: 'Cleaning/scouring powder', act: 'Cleaning/scouring powder', schedule: '10th Sch Pt I(5)', trigger: NET, confidence: 'direct' },
  { from: '330610', display: '3306.10', description: 'Dentifrices', sheet: 'B', cls: 'Dentifrices', act: 'Dentifrices', schedule: '10th Sch Pt I(6)', trigger: NET, confidence: 'direct' },
  { from: '271112', display: '2711.12', description: 'Propane, liquefied', sheet: 'B', cls: 'Liquid petroleum gas', act: 'Liquid petroleum gas', schedule: '10th Sch Pt I(7)', trigger: NET, confidence: 'direct' },
  { from: '271113', display: '2711.13', description: 'Butane, liquefied', sheet: 'B', cls: 'Liquid petroleum gas', act: 'Liquid petroleum gas', schedule: '10th Sch Pt I(7)', trigger: NET, confidence: 'direct' },
  { from: '271119', display: '2711.19', description: 'Other liquefied petroleum gases', sheet: 'B', cls: 'Liquid petroleum gas', act: 'Liquid petroleum gas', schedule: '10th Sch Pt I(7)', trigger: NET, confidence: 'direct' },
  { from: '340319', display: '3403.19', description: 'Lubricating preparations — containing petroleum oils', sheet: 'B', cls: 'Lubricant greases', act: 'Lubricant greases', schedule: '10th Sch Pt I(8)', trigger: NET, confidence: 'direct' },
  { from: '340399', display: '3403.99', description: 'Lubricating preparations — other', sheet: 'B', cls: 'Lubricant greases', act: 'Lubricant greases', schedule: '10th Sch Pt I(8)', trigger: NET, confidence: 'direct' },
  { from: '731700', display: '7317.00', description: 'Nails, tacks, staples of iron or steel', sheet: 'B', cls: 'Nails', act: 'Nails', schedule: '10th Sch Pt I(9)', trigger: NET, confidence: 'direct' },
  { from: '530500', display: '5305.00', description: 'Sisal and other textile fibres of the genus Agave, raw', sheet: 'B', cls: 'Sisal', act: 'Sisal', schedule: '10th Sch Pt I(10)', trigger: NET, confidence: 'direct' },
  { from: '3102', display: '3102', description: 'Mineral or chemical fertilisers, nitrogenous', sheet: 'B', cls: 'Solid fertilizers', act: 'Solid fertilizers', schedule: '10th Sch Pt I(11)', trigger: NET, confidence: 'direct' },
  { from: '3103', display: '3103', description: 'Mineral or chemical fertilisers, phosphatic', sheet: 'B', cls: 'Solid fertilizers', act: 'Solid fertilizers', schedule: '10th Sch Pt I(11)', trigger: NET, confidence: 'direct' },
  { from: '3104', display: '3104', description: 'Mineral or chemical fertilisers, potassic', sheet: 'B', cls: 'Solid fertilizers', act: 'Solid fertilizers', schedule: '10th Sch Pt I(11)', trigger: NET, confidence: 'direct' },
  { from: '3105', display: '3105', description: 'Fertilisers containing two or three nutrients', sheet: 'B', cls: 'Solid fertilizers', act: 'Solid fertilizers', schedule: '10th Sch Pt I(11)', trigger: NET, confidence: 'direct' },
  { from: '252100', display: '2521.00', description: 'Limestone flux; limestone for lime/cement', sheet: 'B', cls: 'Agricultural liming material', act: 'Agricultural liming material', schedule: '10th Sch Pt I(11)', trigger: NET, confidence: 'derived' },
  { from: '250100', display: '2501.00', description: 'Salt (incl. agricultural and denatured salt)', sheet: 'B', cls: 'Agricultural salt', act: 'Agricultural salt', schedule: '10th Sch Pt I(11)', trigger: NETQ, confidence: 'direct', rigid: '100g, 250g, 500g, 1kg, 2kg', other: '100g, 250g, 500g, 1kg, 2kg, 25kg, 50kg, 100kg' },
  { from: '270120', display: '2701.20', description: 'Briquettes, ovoids and similar solid fuels from coal', sheet: 'B', cls: 'Solid fuel', act: 'Solid fuel', schedule: '10th Sch Pt I(12)', trigger: NET, confidence: 'direct' },
  { from: '270400', display: '2704.00', description: 'Coke and semi-coke of coal, lignite or peat', sheet: 'B', cls: 'Solid fuel', act: 'Solid fuel', schedule: '10th Sch Pt I(12)', trigger: NET, confidence: 'direct' },
  { from: '380861', display: '3808.61', description: 'Insecticides put up for retail sale (in packings ≤300 g)', sheet: 'B', cls: 'Solid insecticides', act: 'Solid insecticides', schedule: '10th Sch Pt I(13)', trigger: NETQ, confidence: 'direct' },
  { from: '380892', display: '3808.92', description: 'Fungicides', sheet: 'B', cls: 'Solid fungicides', act: 'Solid fungicides', schedule: '10th Sch Pt I(13)', trigger: NETQ, confidence: 'direct' },
  { from: '340510', display: '3405.10', description: 'Polishes/creams for footwear or leather', sheet: 'B', cls: 'Solid polishes', act: 'Solid polishes', schedule: '10th Sch Pt I(14)', trigger: NETQ, confidence: 'direct', rigid: '15ml, 30ml, 40ml, 100ml' },
  { from: '340520', display: '3405.20', description: 'Polishes for wooden furniture, floors', sheet: 'B', cls: 'Solid polishes', act: 'Solid polishes', schedule: '10th Sch Pt I(14)', trigger: NETQ, confidence: 'direct', rigid: '15g, 20g, 40g, 100g, then by steps of 100g to 1kg, thereafter by steps of 1kg' },
  { from: '340530', display: '3405.30', description: 'Polishes for coachwork', sheet: 'B', cls: 'Solid polishes', act: 'Solid polishes', schedule: '10th Sch Pt I(14)', trigger: NETQ, confidence: 'direct' },
  { from: '340540', display: '3405.40', description: 'Scouring pastes and powders', sheet: 'B', cls: 'Solid polishes', act: 'Solid polishes', schedule: '10th Sch Pt I(14)', trigger: NETQ, confidence: 'direct' },
  { from: '2401', display: '2401', description: 'Unmanufactured tobacco; tobacco refuse', sheet: 'B', cls: 'Tobacco including snuff', act: 'Tobacco including snuff', schedule: '10th Sch Pt I(15)', trigger: NET, confidence: 'direct' },
  { from: '240311', display: '2403.11', description: 'Water-pipe tobacco', sheet: 'B', cls: 'Tobacco including snuff', act: 'Tobacco including snuff', schedule: '10th Sch Pt I(15)', trigger: NET, confidence: 'direct' },
  { from: '240319', display: '2403.19', description: 'Smoking tobacco, other', sheet: 'B', cls: 'Tobacco including snuff', act: 'Tobacco including snuff', schedule: '10th Sch Pt I(15)', trigger: NET, confidence: 'direct' },
  { from: '240399', display: '2403.99', description: 'Other manufactured tobacco (incl. snuff)', sheet: 'B', cls: 'Tobacco including snuff', act: 'Tobacco including snuff', schedule: '10th Sch Pt I(15)', trigger: NET, confidence: 'direct' },
  { from: '520100', display: '5201.00', description: 'Cotton, not carded or combed', sheet: 'B', cls: 'Cotton', act: 'Cotton', schedule: '10th Sch Pt I(16)', trigger: NET, confidence: 'direct' },
  { from: '0102', display: '0102', description: 'Live bovine animals', sheet: 'B', cls: 'Livestock', act: 'Livestock', schedule: '10th Sch Pt I(17)', trigger: NET, confidence: 'direct' },
  { from: '0103', display: '0103', description: 'Live swine', sheet: 'B', cls: 'Livestock', act: 'Livestock', schedule: '10th Sch Pt I(17)', trigger: NET, confidence: 'direct' },
  { from: '0104', display: '0104', description: 'Live sheep and goats', sheet: 'B', cls: 'Livestock', act: 'Livestock', schedule: '10th Sch Pt I(17)', trigger: NET, confidence: 'direct' },
  { from: '071410', display: '0714.10', description: 'Manioc (cassava), fresh/chilled/frozen/dried', sheet: 'B', cls: 'Cassava root', act: 'Cassava root', schedule: '10th Sch Pt II(1)', trigger: NET, confidence: 'direct' },
  { from: '240210', display: '2402.10', description: 'Cigars, cheroots and cigarillos containing tobacco', sheet: 'B', cls: 'Cigars', act: 'Cigars', schedule: '10th Sch Pt II(2)', trigger: NET, confidence: 'direct' },
  { from: '240220', display: '2402.20', description: 'Cigarettes containing tobacco', sheet: 'B', cls: 'Cigarette', act: 'Cigarette', schedule: '10th Sch Pt II(3)', trigger: NET, confidence: 'direct' },
  { from: '0407', display: '0407', description: "Birds' eggs, in shell", sheet: 'B', cls: 'Eggs in shell', act: 'Eggs in shell', schedule: '10th Sch Pt II(4)', trigger: NET, confidence: 'direct' },
  { from: '0803', to: '0810', display: '0803-0810', description: 'Fresh fruit (bananas, citrus, grapes, melons, etc.)', sheet: 'B', cls: 'Fresh fruit', act: 'Fresh fruit', schedule: '10th Sch Pt II(5)', trigger: NET, confidence: 'broad' },
  { from: '070999', display: '0709.99', description: 'Sweet corn / maize on the cob, fresh or chilled', sheet: 'B', cls: 'Maize on the cob', act: 'Maize on the cob', schedule: '10th Sch Pt II(6)', trigger: NET, confidence: 'derived' },
  { from: '481710', display: '4817.10', description: 'Envelopes of paper or paperboard', sheet: 'B', cls: 'Stationery and envelope', act: 'Stationery and envelope', schedule: '10th Sch Pt II(7)', trigger: NET, confidence: 'direct' },
  { from: '482010', display: '4820.10', description: 'Registers, notebooks, memorandum pads', sheet: 'B', cls: 'Stationery', act: 'Stationery', schedule: '10th Sch Pt II(7)', trigger: NET, confidence: 'derived' },
  { from: '292511', display: '2925.11', description: 'Saccharin and its salts', sheet: 'B', cls: 'Sweetening tablets', act: 'Sweetening tablets', schedule: '10th Sch Pt II(8)', trigger: NET, confidence: 'derived' },
  { from: '210690', display: '2106.90', description: 'Other food preparations (soft drink tablets)', sheet: 'B', cls: 'Soft drink tablets', act: 'Soft drink tablets', schedule: '10th Sch Pt II(8)', trigger: NET, confidence: 'derived' },
  { from: '080112', display: '0801.12', description: 'Coconuts, in the inner shell (endocarp)', sheet: 'B', cls: 'Coconuts', act: 'Coconuts', schedule: '10th Sch Pt II(9)', trigger: NET, confidence: 'direct' },
  { from: '080119', display: '0801.19', description: 'Coconuts, other, fresh', sheet: 'B', cls: 'Coconuts', act: 'Coconuts', schedule: '10th Sch Pt II(9)', trigger: NET, confidence: 'direct' },
  { from: '0105', display: '0105', description: 'Live poultry', sheet: 'B', cls: 'Poultry', act: 'Poultry', schedule: '10th Sch Pt II(10)', trigger: NET, confidence: 'direct' },
  { from: '0207', display: '0207', description: 'Meat and edible offal of poultry', sheet: 'B', cls: 'Poultry', act: 'Poultry', schedule: '10th Sch Pt II(10)', trigger: NET, confidence: 'direct' },
  { from: '071420', display: '0714.20', description: 'Sweet potatoes, fresh/chilled/frozen/dried', sheet: 'B', cls: 'Sweet potatoes', act: 'Sweet potatoes', schedule: '10th Sch Pt II(11)', trigger: NET, confidence: 'direct' },
  { from: '151530', display: '1515.30', description: 'Castor oil and its fractions', sheet: 'B', cls: 'Castor oil', act: 'Castor oil', schedule: '10th Sch Pt III(1)', trigger: NETQ, confidence: 'direct', rigid: '100ml, then by multiples of 100ml to 1 litre, thereafter by steps of 1 litre', other: '100ml, then by steps of 100ml to 1 litre' },
  { from: '040140', display: '0401.40', description: 'Milk and cream, fat > 6% ≤ 10%', sheet: 'B', cls: 'Cream (≤1 litre)', act: 'Cream (≤1 litre)', schedule: '10th Sch Pt III(2)', trigger: NETQ, confidence: 'direct', rigid: '100ml, 200ml, 300ml, 400ml, 500ml, 1 litre', other: '100ml, 200ml, 300ml, 400ml, 500ml, 1 litre' },
  { from: '040150', display: '0401.50', description: 'Milk and cream, fat > 10%', sheet: 'B', cls: 'Cream (≤1 litre)', act: 'Cream (≤1 litre)', schedule: '10th Sch Pt III(2)', trigger: NETQ, confidence: 'direct', rigid: '100ml, 200ml, 300ml, 400ml, 500ml, 1 litre', other: '100ml, 200ml, 300ml, 400ml, 500ml, 1 litre' },
  { from: '1507', to: '1515', display: '1507-1515', description: 'Vegetable oils and fractions', sheet: 'B', cls: 'Edible oil (≤1 litre)', act: 'Edible oil (≤1 litre)', schedule: '10th Sch Pt III(3)', trigger: NETQ, confidence: 'direct', rigid: '100ml, thereafter by steps of 100ml up to 1 litre, 2kg, 4kg, 8kg, 18kg', other: '100ml, thereafter by steps of 100ml to 1 litre' },
  { from: '151710', display: '1517.10', description: 'Margarine, excluding liquid margarine', sheet: 'B', cls: 'Edible oil / margarine', act: 'Edible oil / margarine', schedule: '10th Sch Pt III(3)', trigger: NETQ, confidence: 'direct', rigid: '100g, 250g, 500g, 1kg, thereafter by steps of 1kg to 5kg; 20kg; 180kg', other: '100g, 250g, 500g, 1kg' },
  { from: '220300', display: '2203.00', description: 'Beer made from malt', sheet: 'B', cls: 'Intoxicating drinks', act: 'Intoxicating drinks', schedule: '10th Sch Pt III(4)', trigger: NETQ, confidence: 'direct', rigid: '300ml, 500ml' },
  { from: '2204', display: '2204', description: 'Wine of fresh grapes', sheet: 'B', cls: 'Intoxicating drinks', act: 'Intoxicating drinks', schedule: '10th Sch Pt III(4)', trigger: NETQ, confidence: 'direct' },
  { from: '220600', display: '2206.00', description: 'Other fermented beverages', sheet: 'B', cls: 'Intoxicating drinks', act: 'Intoxicating drinks', schedule: '10th Sch Pt III(4)', trigger: NETQ, confidence: 'direct', other: '500ml, 1 litre, thereafter by steps of 1 litre; or 500ml, 1, 2, 5 litres then multiples of 5 litres (Kibuku/Tikisa)' },
  { from: '2208', display: '2208', description: 'Undenatured ethyl alcohol; spirits, liqueurs', sheet: 'B', cls: 'Intoxicating drinks', act: 'Intoxicating drinks', schedule: '10th Sch Pt III(4)', trigger: NETQ, confidence: 'direct', rigid: '25ml, 30ml, 50ml and 100ml (spirits/liquor/wines)' },
  { from: '271012', display: '2710.12', description: 'Light oils — motor spirit (petrol)', sheet: 'B', cls: 'Liquid fuel', act: 'Liquid fuel', schedule: '10th Sch Pt III(5)', trigger: NETQ, confidence: 'direct', rigid: '250ml, 500ml, 1 litre, then by steps of 5 litres to 100 litres, thereafter by steps of 10 litres' },
  { from: '271019', display: '2710.19', description: 'Other petroleum oils — gas oil, kerosene, lubricating oil', sheet: 'B', cls: 'Liquid fuel / lubricating oil', act: 'Liquid fuel / lubricating oil', schedule: '10th Sch Pt III(5)', trigger: NETQ, confidence: 'direct', rigid: '250ml, 500ml, 1 litre, thereafter by steps of 1 litre to 5 litres, 10, 15, 20 litres (excl. grease, ≤20 litres)' },
  { from: '380869', display: '3808.69', description: 'Insecticides, other (liquid)', sheet: 'B', cls: 'Liquid insecticides', act: 'Liquid insecticides', schedule: '10th Sch Pt III(6)', trigger: NETQ, confidence: 'direct', rigid: '250g, 500g, 1 litre, thereafter by steps of 1 litre' },
  { from: '340311', display: '3403.11', description: 'Lubricating preparations for textile/leather treatment', sheet: 'B', cls: 'Liquid polishes analogous', act: 'Liquid polishes analogous', schedule: '10th Sch Pt III(7)', trigger: NET, confidence: 'derived' },
  { from: '040110', display: '0401.10', description: 'Milk and cream, fat ≤ 1%', sheet: 'B', cls: 'Milk (≤5 litres)', act: 'Milk (≤5 litres)', schedule: '10th Sch Pt III(9)', trigger: NETQ, confidence: 'direct', rigid: '100ml, 200ml, 250ml, 500ml, 1 litre, thereafter by steps of 1 litre (tinned: 100–500ml)', other: '100ml, 200ml, 250ml, 500ml, 1 litre, thereafter by steps of 1 litre' },
  { from: '040120', display: '0401.20', description: 'Milk and cream, fat > 1% ≤ 6%', sheet: 'B', cls: 'Milk (≤5 litres)', act: 'Milk (≤5 litres)', schedule: '10th Sch Pt III(9)', trigger: NETQ, confidence: 'direct', rigid: '100ml, 200ml, 250ml, 500ml, 1 litre, thereafter by steps of 1 litre (tinned: 100–500ml)', other: '100ml, 200ml, 250ml, 500ml, 1 litre, thereafter by steps of 1 litre' },
  { from: '330300', display: '3303.00', description: 'Perfumes and toilet waters', sheet: 'B', cls: 'Perfumes and toilet waters', act: 'Perfumes and toilet waters', schedule: '10th Sch Pt III(10)', trigger: NET, confidence: 'direct' },
  { from: '2201', display: '2201', description: 'Waters, incl. natural/artificial mineral waters', sheet: 'B', cls: 'Mineral waters', act: 'Mineral waters', schedule: '10th Sch Pt III(11)', trigger: NETQ, confidence: 'direct' },
  { from: '2202', display: '2202', description: 'Waters with added sugar/flavour; other non-alcoholic beverages', sheet: 'B', cls: 'Soft drinks', act: 'Soft drinks', schedule: '10th Sch Pt III(11)', trigger: NETQ, confidence: 'direct', rigid: '100ml, thereafter by steps of 10ml to 1 litre' },
  { from: '2009', display: '2009', description: 'Fruit and vegetable juices', sheet: 'B', cls: 'Squashes and fruit juices', act: 'Squashes and fruit juices', schedule: '10th Sch Pt III(12)', trigger: NETQ, confidence: 'direct', rigid: '100ml, then by steps of 10ml up to 1 litre, thereafter by multiples of 1 litre', other: '100ml, then by steps of 10ml up to 1 litre, thereafter by multiples of 1 litre' },
  { from: '381400', display: '3814.00', description: 'Organic composite solvents and thinners', sheet: 'B', cls: 'Thinners', act: 'Thinners', schedule: '10th Sch Pt III(13)', trigger: NETM, confidence: 'direct' },
  { from: '220900', display: '2209.00', description: 'Vinegar and substitutes for vinegar', sheet: 'B', cls: 'Vinegar', act: 'Vinegar', schedule: '10th Sch Pt III(14)', trigger: NET, confidence: 'direct' },
  { from: '440290', display: '4402.90', description: 'Wood charcoal, other', sheet: 'B', cls: 'Charcoal', act: 'Charcoal', schedule: '10th Sch Pt IV(1)', trigger: NETQ, confidence: 'direct', other: '30kg' },
  { from: '321000', display: '3210.00', description: 'Other paints and varnishes; prepared water pigments (distemper)', sheet: 'B', cls: 'Distemper', act: 'Distemper', schedule: '10th Sch Pt IV(2)', trigger: NETQ, confidence: 'direct', rigid: '125ml, 250ml, 500ml, 1, 2, 4, 20 litres; 500g, 1, 3, 6, 10, 25, 50kg' },
  { from: '100590', display: '1005.90', description: 'Maize (corn), other', sheet: 'B', cls: 'Maize grain', act: 'Maize grain', schedule: '10th Sch Pt IV(4)', trigger: NETQ, confidence: 'direct', other: '1kg, thereafter by steps of 1kg to 10kg, 20kg, 90kg' },
  { from: '3208', display: '3208', description: 'Paints and varnishes in a non-aqueous medium', sheet: 'B', cls: 'Paint, varnish, lacquer', act: 'Paint, varnish, lacquer', schedule: '10th Sch Pt IV(6)', trigger: NETQ, confidence: 'direct', rigid: '125ml, 250ml, 500ml, 1, 2, 4, 20 litres; 500g, 1, 3, 6, 10, 25, 50kg' },
  { from: '3209', display: '3209', description: 'Paints and varnishes in an aqueous medium', sheet: 'B', cls: 'Paint, varnish', act: 'Paint, varnish', schedule: '10th Sch Pt IV(6)', trigger: NETQ, confidence: 'direct', rigid: '125ml, 250ml, 500ml, 1, 2, 4, 20 litres; 500g, 1, 3, 6, 10, 25, 50kg' },
  { from: '250510', display: '2505.10', description: 'Silica sands and quartz sands', sheet: 'B', cls: 'Sand and ballast', act: 'Sand and ballast', schedule: '10th Sch Pt IV(7)', trigger: NET, confidence: 'direct' },
  { from: '250590', display: '2505.90', description: 'Other natural sands', sheet: 'B', cls: 'Sand and ballast', act: 'Sand and ballast', schedule: '10th Sch Pt IV(7)', trigger: NET, confidence: 'direct' },
  { from: '251710', display: '2517.10', description: 'Pebbles, gravel, broken or crushed stone (ballast)', sheet: 'B', cls: 'Sand and ballast', act: 'Sand and ballast', schedule: '10th Sch Pt IV(7)', trigger: NET, confidence: 'direct' },
  { from: '321290', display: '3212.90', description: 'Pigments/dyes put up for retail (stainers)', sheet: 'B', cls: 'Stainers', act: 'Stainers', schedule: '10th Sch Pt IV(8)', trigger: NETM, confidence: 'direct' },
  { from: '3304', display: '3304', description: 'Beauty, make-up and skin-care preparations', sheet: 'B', cls: 'Toilet preparations', act: 'Toilet preparations', schedule: '10th Sch Pt IV(9)', trigger: NET, confidence: 'direct' },
  { from: '3307', display: '3307', description: 'Pre-shave, shaving, bath preparations', sheet: 'B', cls: 'Toilet preparations', act: 'Toilet preparations', schedule: '10th Sch Pt IV(9)', trigger: NET, confidence: 'direct' },
  { from: '071331', display: '0713.31', description: 'Beans of Vigna mungo / radiata (green gram, choroko)', sheet: 'B', cls: 'Grama (choroko)', act: 'Grama (choroko)', schedule: '10th Sch Pt IV(11)', trigger: NETQ, confidence: 'direct' },
  { from: '071332', display: '0713.32', description: 'Small red (adzuki) beans', sheet: 'B', cls: 'Beans (maharage)', act: 'Beans (maharage)', schedule: '10th Sch Pt IV(10)', trigger: NETQ, confidence: 'direct', rigid: '250g, 500g, 1kg, thereafter by steps of 1kg up to 10kg', other: '250g, 500g, 1kg, thereafter by steps of 1kg up to 10kg; 90kg' },
  { from: '071333', display: '0713.33', description: 'Kidney beans, incl. white pea beans', sheet: 'B', cls: 'Beans (maharage)', act: 'Beans (maharage)', schedule: '10th Sch Pt IV(10)', trigger: NETQ, confidence: 'direct', rigid: '250g, 500g, 1kg, thereafter by steps of 1kg up to 10kg', other: '250g, 500g, 1kg, thereafter by steps of 1kg up to 10kg; 90kg' },
  { from: '071334', display: '0713.34', description: 'Bambara beans', sheet: 'B', cls: 'Peanuts (njugu mawe)', act: 'Peanuts (njugu mawe)', schedule: '10th Sch Pt IV(18)', trigger: NETQ, confidence: 'derived' },
  { from: '071335', display: '0713.35', description: 'Cow peas (kunde)', sheet: 'B', cls: 'Beans (kunde)', act: 'Beans (kunde)', schedule: '10th Sch Pt IV(10)', trigger: NETQ, confidence: 'direct', rigid: '250g, 500g, 1kg, thereafter by steps of 1kg up to 10kg', other: '250g, 500g, 1kg, thereafter by steps of 1kg up to 10kg; 90kg' },
  { from: '071339', display: '0713.39', description: 'Other beans, dried and shelled', sheet: 'B', cls: 'Beans', act: 'Beans', schedule: '10th Sch Pt IV(10)', trigger: NETQ, confidence: 'direct', rigid: '250g, 500g, 1kg, thereafter by steps of 1kg up to 10kg', other: '250g, 500g, 1kg, thereafter by steps of 1kg up to 10kg; 90kg' },
  { from: '071310', display: '0713.10', description: 'Peas (Pisum sativum), dried', sheet: 'B', cls: 'Peas (njegere)', act: 'Peas (njegere)', schedule: '10th Sch Pt IV(12)', trigger: NETQ, confidence: 'direct' },
  { from: '071360', display: '0713.60', description: 'Pigeon peas (mbaazi)', sheet: 'B', cls: 'Peas (mbaazi)', act: 'Peas (mbaazi)', schedule: '10th Sch Pt IV(12)', trigger: NETQ, confidence: 'direct' },
  { from: '1006', display: '1006', description: 'Rice', sheet: 'B', cls: 'Rice', act: 'Rice', schedule: '10th Sch Pt IV(13)', trigger: NETQ, confidence: 'direct', other: '250g, 500g, 1kg, 2kg, 3kg, 4kg, 5kg, 10kg, 20kg, 50kg, 100kg' },
  { from: '100821', display: '1008.21', description: 'Millet — pearl/bulrush millet (uwele)', sheet: 'B', cls: 'Bull-rush millet', act: 'Bull-rush millet', schedule: '10th Sch Pt IV(15)', trigger: NETQ, confidence: 'direct', other: '90kg' },
  { from: '100829', display: '1008.29', description: 'Millet — other (incl. finger millet, wimbi)', sheet: 'B', cls: 'Millet / wimbi', act: 'Millet / wimbi', schedule: '10th Sch Pt IV(14)', trigger: NETQ, confidence: 'direct', other: '90kg' },
  { from: '100790', display: '1007.90', description: 'Grain sorghum, other', sheet: 'B', cls: 'Sorghum', act: 'Sorghum', schedule: '10th Sch Pt IV(20)', trigger: NETQ, confidence: 'direct', other: '90kg' },
  { from: '110220', display: '1102.20', description: 'Maize (corn) flour', sheet: 'B', cls: 'Maize flour', act: 'Maize flour', schedule: '10th Sch Pt IV(16)', trigger: NETQ, confidence: 'direct', other: '1kg, thereafter by steps of 1kg up to 10kg, 20kg, 50kg, 80kg' },
  { from: '110290', display: '1102.90', description: 'Other cereal flours (rice, millet)', sheet: 'B', cls: 'Rice/millet flour', act: 'Rice/millet flour', schedule: '10th Sch Pt IV(16)', trigger: NETQ, confidence: 'direct', rigid: '100g, 250g, 500g, 1kg, thereafter by steps of 1kg', other: '100g, 250g, 500g, 1kg, thereafter by steps of 1kg' },
  { from: '110620', display: '1106.20', description: 'Flour, meal and powder of sago, roots or tubers (cassava flour)', sheet: 'B', cls: 'Cassava flour', act: 'Cassava flour', schedule: '10th Sch Pt IV(16)', trigger: NETQ, confidence: 'direct', other: '500g, 1kg, 2kg, 4kg, 5kg, 60kg' },
  { from: '120241', display: '1202.41', description: 'Ground-nuts, in shell', sheet: 'B', cls: 'Groundnuts seeds', act: 'Groundnuts seeds', schedule: '10th Sch Pt IV(17)', trigger: NETQ, confidence: 'direct' },
  { from: '120242', display: '1202.42', description: 'Ground-nuts, shelled', sheet: 'B', cls: 'Groundnuts seeds', act: 'Groundnuts seeds', schedule: '10th Sch Pt IV(17)', trigger: NETQ, confidence: 'direct' },
  { from: '120740', display: '1207.40', description: 'Sesamum (simsim) seeds', sheet: 'B', cls: 'Simsim seeds', act: 'Simsim seeds', schedule: '10th Sch Pt IV(19)', trigger: NETQ, confidence: 'direct', other: '90kg' },
  { from: '120600', display: '1206.00', description: 'Sunflower seeds', sheet: 'B', cls: 'Sunflower', act: 'Sunflower', schedule: '10th Sch Pt IV(21)', trigger: NETQ, confidence: 'direct', other: '40kg' },
  { from: '580610', display: '5806.10', description: 'Woven pile fabrics and chenille fabrics (narrow)', sheet: 'B', cls: 'Bias binding', act: 'Bias binding', schedule: '10th Sch Pt V(1)', trigger: NET, confidence: 'derived' },
  { from: '580632', display: '5806.32', description: 'Other narrow woven fabrics, of man-made fibres (ribbon, tape)', sheet: 'B', cls: 'Ribbon / Tape', act: 'Ribbon / Tape', schedule: '10th Sch Pt V(5),(9)', trigger: NET, confidence: 'direct' },
  { from: '560410', display: '5604.10', description: 'Rubber thread and cord, textile covered (elastic)', sheet: 'B', cls: 'Elastic', act: 'Elastic', schedule: '10th Sch Pt V(2)', trigger: NET, confidence: 'direct' },
  { from: '731300', display: '7313.00', description: 'Barbed wire; twisted hoop or single flat wire, fencing', sheet: 'B', cls: 'Fencing wire', act: 'Fencing wire', schedule: '10th Sch Pt V(3)', trigger: NET, confidence: 'direct' },
  { from: '7217', display: '7217', description: 'Wire of iron or non-alloy steel', sheet: 'B', cls: 'Fencing wire', act: 'Fencing wire', schedule: '10th Sch Pt V(3)', trigger: NET, confidence: 'derived' },
  { from: '5204', display: '5204', description: 'Cotton sewing thread', sheet: 'B', cls: 'Knitting and sewing thread', act: 'Knitting and sewing thread', schedule: '10th Sch Pt V(4)', trigger: NET, confidence: 'direct' },
  { from: '5401', display: '5401', description: 'Sewing thread of man-made filaments', sheet: 'B', cls: 'Knitting and sewing thread', act: 'Knitting and sewing thread', schedule: '10th Sch Pt V(4)', trigger: NET, confidence: 'direct' },
  { from: '5508', display: '5508', description: 'Sewing thread of man-made staple fibres', sheet: 'B', cls: 'Knitting and sewing thread', act: 'Knitting and sewing thread', schedule: '10th Sch Pt V(4)', trigger: NET, confidence: 'direct' },
  { from: '560721', display: '5607.21', description: 'Binder or baler twine, of sisal', sheet: 'B', cls: 'Sisal twine', act: 'Sisal twine', schedule: '10th Sch Pt V(7)', trigger: NET, confidence: 'direct' },
  { from: '560729', display: '5607.29', description: 'Other twine/cordage of sisal', sheet: 'B', cls: 'Sisal twine', act: 'Sisal twine', schedule: '10th Sch Pt V(7)', trigger: NET, confidence: 'direct' },
  { from: '560749', display: '5607.49', description: 'Twine, cordage, ropes of polyethylene/polypropylene', sheet: 'B', cls: 'Rope / String', act: 'Rope / String', schedule: '10th Sch Pt V(6),(8)', trigger: NET, confidence: 'direct' },
  { from: '560750', display: '5607.50', description: 'Twine, cordage, ropes of other synthetic fibres', sheet: 'B', cls: 'Rope / String', act: 'Rope / String', schedule: '10th Sch Pt V(6),(8)', trigger: NET, confidence: 'direct' },
  { from: '5208', to: '5212', display: '5208-5212', description: 'Woven fabrics of cotton', sheet: 'B', cls: 'Fabrics', act: 'Fabrics', schedule: '10th Sch Pt V(10)', trigger: NET, confidence: 'broad' },
  { from: '5407', to: '5408', display: '5407-5408', description: 'Woven fabrics of man-made filament yarn', sheet: 'B', cls: 'Fabrics', act: 'Fabrics', schedule: '10th Sch Pt V(10)', trigger: NET, confidence: 'broad' },
  { from: '5512', to: '5516', display: '5512-5516', description: 'Woven fabrics of synthetic staple fibres', sheet: 'B', cls: 'Fabrics', act: 'Fabrics', schedule: '10th Sch Pt V(10)', trigger: NET, confidence: 'broad' },
  { from: '6001', to: '6006', display: '6001-6006', description: 'Knitted or crocheted fabrics', sheet: 'B', cls: 'Fabrics', act: 'Fabrics', schedule: '10th Sch Pt V(10)', trigger: NET, confidence: 'broad' },
  { from: '7606', display: '7606', description: 'Aluminium plates, sheets and strip, thickness > 0.2 mm', sheet: 'B', cls: 'Aluminium sheets', act: 'Aluminium sheets', schedule: '10th Sch Pt V(11)', trigger: NET, confidence: 'direct' },
  { from: '7210', display: '7210', description: 'Flat-rolled iron/steel, clad, plated or coated (roofing sheet)', sheet: 'B', cls: 'Iron sheets', act: 'Iron sheets', schedule: '10th Sch Pt V(11)', trigger: NET, confidence: 'direct' },
  { from: '7212', display: '7212', description: 'Flat-rolled iron/steel, width < 600 mm, coated', sheet: 'B', cls: 'Iron sheets', act: 'Iron sheets', schedule: '10th Sch Pt V(11)', trigger: NET, confidence: 'direct' },
  { from: '681140', display: '6811.40', description: 'Articles of asbestos-cement containing asbestos', sheet: 'B', cls: 'Asbestos sheets', act: 'Asbestos sheets', schedule: '10th Sch Pt V(11)', trigger: NET, confidence: 'direct' },
  { from: '481810', display: '4818.10', description: 'Toilet paper', sheet: 'B', cls: 'Toilet paper', act: 'Toilet paper', schedule: '11th/12th Sch', trigger: NETQ, confidence: 'direct', other: '200 or 300 leaves per roll, 140–160 sq.cm per leaf' },
  { from: '230210', display: '2302.10', description: 'Bran, sharps of maize', sheet: 'B', cls: 'Maize bran', act: 'Maize bran', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', other: '50kg, thereafter by steps of 5kg' },
  { from: '230230', display: '2302.30', description: 'Bran, sharps of wheat', sheet: 'B', cls: 'Wheat bran / pollard', act: 'Wheat bran / pollard', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', other: '45kg (bran); 50kg, thereafter by steps of 5kg (pollard)' },
  { from: '230240', display: '2302.40', description: 'Bran, sharps of other cereals (rice bran)', sheet: 'B', cls: 'Rice bran', act: 'Rice bran', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', other: '50kg, thereafter by steps of 5kg' },
  { from: '110100', display: '1101.00', description: 'Wheat or meslin flour', sheet: 'B', cls: 'Wheat flour', act: 'Wheat flour', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', other: '250g, 500g, 1kg, thereafter by steps of 1kg to 10kg, 20kg, 50kg, 90kg' },
  { from: '1001', display: '1001', description: 'Wheat and meslin', sheet: 'B', cls: 'Wheat grain', act: 'Wheat grain', schedule: '11th Sch', trigger: NETQ, confidence: 'direct' },
  { from: '1003', display: '1003', description: 'Barley', sheet: 'B', cls: 'Barley', act: 'Barley', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', other: '100g, 250g, 500g, 1kg, thereafter by steps of 1kg to 50kg; 80kg' },
  { from: '080132', display: '0801.32', description: 'Cashew nuts, shelled', sheet: 'B', cls: 'Cashew nuts (in shell)', act: 'Cashew nuts (in shell)', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', other: '80kg' },
  { from: '080131', display: '0801.31', description: 'Cashew nuts, in shell', sheet: 'B', cls: 'Cashew nuts (in shell)', act: 'Cashew nuts (in shell)', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', other: '80kg' },
  { from: '120730', display: '1207.30', description: 'Castor oil seeds', sheet: 'B', cls: 'Castor seed', act: 'Castor seed', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', other: '65kg' },
  { from: '040510', display: '0405.10', description: 'Butter', sheet: 'B', cls: 'Butter', act: 'Butter', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '100g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 1kg', other: '250g, 500g, 1kg' },
  { from: '040590', display: '0405.90', description: 'Other fats and oils derived from milk (ghee)', sheet: 'B', cls: 'Ghee', act: 'Ghee', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '500g, 1kg, 2kg, 3kg, 4kg, 18kg', other: '500g, 1kg' },
  { from: '190531', display: '1905.31', description: 'Sweet biscuits', sheet: 'B', cls: 'Biscuits', act: 'Biscuits', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '50g, 100g, 150g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 500g', other: '50g, 100g, 150g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 500g' },
  { from: '160241', display: '1602.41', description: 'Prepared or preserved ham and cuts (bacon)', sheet: 'B', cls: 'Bacon and sausages', act: 'Bacon and sausages', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '100g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 1kg', other: '100g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 1kg' },
  { from: '160100', display: '1601.00', description: 'Sausages and similar products', sheet: 'B', cls: 'Bacon and sausages', act: 'Bacon and sausages', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '100g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 1kg', other: '100g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 1kg' },
  { from: '0901', display: '0901', description: 'Coffee', sheet: 'B', cls: 'Coffee', act: 'Coffee', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '50g, 100g, 250g, 500g, 1kg, thereafter by steps of 1kg', other: '50g, 100g, 250g, 500g, thereafter by steps of 1kg' },
  { from: '0902', display: '0902', description: 'Tea', sheet: 'B', cls: 'Tea (other than in chests)', act: 'Tea (other than in chests)', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '50g, 100g, 250g, 500g, 1kg, thereafter by steps of 1kg', other: '50g, 100g, 250g, 500g, thereafter by steps of 1kg' },
  { from: '180500', display: '1805.00', description: 'Cocoa powder, not sweetened', sheet: 'B', cls: 'Cocoa powder', act: 'Cocoa powder', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '50g, 100g, 250g, 500g, 1kg, thereafter by steps of 1kg', other: '50g, 100g, 250g, 500g, thereafter by steps of 1kg' },
  { from: '121294', display: '1212.94', description: 'Chicory roots', sheet: 'B', cls: 'Chicory mixture', act: 'Chicory mixture', schedule: '11th Sch', trigger: NETQ, confidence: 'derived' },
  { from: '0402', display: '0402', description: 'Milk and cream, concentrated or sweetened (milk powder)', sheet: 'B', cls: 'Milk powder', act: 'Milk powder', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '100g, 250g, 500g, 1kg, thereafter by steps of 1kg', other: '100g, 250g, 500g, 1kg, thereafter by steps of 1kg' },
  { from: '190110', display: '1901.10', description: 'Preparations for infant use, put up for retail sale', sheet: 'B', cls: 'Milk food for infants', act: 'Milk food for infants', schedule: '11th Sch', trigger: NETQ, confidence: 'direct' },
  { from: '1703', display: '1703', description: 'Molasses', sheet: 'B', cls: 'Molasses, treacle and syrup', act: 'Molasses, treacle and syrup', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '100g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 1kg' },
  { from: '170290', display: '1702.90', description: 'Other sugars incl. caramel, treacle', sheet: 'B', cls: 'Treacle and syrup', act: 'Treacle and syrup', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '100g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 1kg' },
  { from: '1701', display: '1701', description: 'Cane or beet sugar', sheet: 'B', cls: 'Sugar', act: 'Sugar', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', other: '100g, 250g, 500g, 1kg, thereafter by steps of 1kg to 10kg, 50kg, 100kg' },
  { from: '2007', display: '2007', description: 'Jams, fruit jellies, marmalades', sheet: 'B', cls: 'Jam, marmalade, jelly', act: 'Jam, marmalade, jelly', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '100g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 1kg' },
  { from: '040900', display: '0409.00', description: 'Natural honey', sheet: 'B', cls: 'Honey', act: 'Honey', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '100g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 1kg' },
  { from: '0904', to: '0910', display: '0904-0910', description: 'Spices', sheet: 'B', cls: 'Spices', act: 'Spices', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '5g, 10g, 20g, 30g, 40g, 50g, 60g, 100g, 200g, 300g, 400g, 500g, 1kg, thereafter by steps of 1kg', other: 'same as rigid containers' },
  { from: '190590', display: '1905.90', description: 'Other bread, pastry, cakes', sheet: 'B', cls: 'Bread in any form', act: 'Bread in any form', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', rigid: '100g, 250g, 500g, 1000g' },
  { from: '100610', display: '1006.10', description: 'Rice in the husk (paddy)', sheet: 'B', cls: 'Rice paddy', act: 'Rice paddy', schedule: '11th Sch', trigger: NETQ, confidence: 'direct', other: '75kg' },
];

async function main() {
  let inserted = 0, updated = 0;

  for (const r of [...SHEET_A, ...SHEET_B]) {
    const from = digits(r.from);
    const to = digits(r.to ?? r.from);
    const existing = await db.selectFrom('wma_hs_codes')
      .select('id')
      .where('hs_code_from', '=', from)
      .where('hs_code_to', '=', to)
      .where('sheet', '=', r.sheet)
      .executeTakeFirst();

    const fields = {
      hs_code_display: r.display,
      hs_description: r.description,
      wma_class: r.cls,
      act_description: r.act ?? null,
      schedule_ref: r.schedule ?? null,
      obligation_trigger: r.trigger,
      confidence: r.confidence,
      notes: r.notes ?? null,
      rigid_container_qty: r.rigid ?? null,
      other_container_qty: r.other ?? null,
      source_note: SOURCE_NOTE,
    };

    if (existing) {
      await db.updateTable('wma_hs_codes').set({ ...fields, updated_at: new Date() }).where('id', '=', existing.id).execute();
      updated++;
    } else {
      await db.insertInto('wma_hs_codes').values({ hs_code_from: from, hs_code_to: to, sheet: r.sheet, ...fields }).execute();
      inserted++;
    }
  }

  console.log(`WMA compliance seed complete: ${inserted} inserted, ${updated} updated (${SHEET_A.length} instrument codes, ${SHEET_B.length} goods codes).`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
