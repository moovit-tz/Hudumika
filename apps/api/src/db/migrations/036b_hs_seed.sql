-- Seed: Tanzania EAC Common External Tariff HS Codes
-- Covers top chapters used in Tanzania freight clearance.
-- Rates based on EAC CET 2022 and Tanzania Customs & Excise Act CAP 403.
-- Import duty: 0% (raw materials), 10% (intermediate), 25% (finished goods)
-- VAT: 18% standard; 0% on select basic goods
-- RDL: 1.5% on all imports; CPF: 0.6%

INSERT INTO hs_codes (code, level, description, parent_code, import_duty_rate, vat_rate, excise_rate, pvoc_required, di_required, permits, notes) VALUES

-- ── SECTION I: LIVE ANIMALS & ANIMAL PRODUCTS ─────────────────────────────────
('01', 2, 'Live animals', NULL, 0, 0, 0, FALSE, FALSE, NULL, 'Live animals — zero VAT'),
('01.01', 4, 'Live horses, asses, mules and hinnies', '01', 0, 0, 0, FALSE, FALSE, 'LIVESTOCK', NULL),
('01.02', 4, 'Live bovine animals', '01', 0, 0, 0, FALSE, FALSE, 'LIVESTOCK', NULL),
('01.03', 4, 'Live swine', '01', 0, 0, 0, FALSE, FALSE, 'LIVESTOCK', NULL),
('01.04', 4, 'Live sheep and goats', '01', 0, 0, 0, FALSE, FALSE, 'LIVESTOCK', NULL),
('01.05', 4, 'Live poultry', '01', 0, 0, 0, FALSE, FALSE, 'LIVESTOCK', NULL),

('02', 2, 'Meat and edible meat offal', NULL, 25, 0, 0, FALSE, TRUE, 'GCLA,TBS', 'Food product'),
('03', 2, 'Fish and crustaceans, molluscs and other aquatic invertebrates', NULL, 25, 0, 0, FALSE, TRUE, 'GCLA', NULL),
('04', 2, 'Dairy produce; birds'' eggs; natural honey', NULL, 25, 0, 0, FALSE, TRUE, 'GCLA,TBS', NULL),
('05', 2, 'Products of animal origin, not elsewhere specified', NULL, 0, 18, 0, FALSE, FALSE, NULL, NULL),

-- ── SECTION II: VEGETABLE PRODUCTS ────────────────────────────────────────────
('06', 2, 'Live trees and other plants; bulbs, roots; cut flowers', NULL, 25, 0, 0, FALSE, FALSE, 'PLANT_HEALTH', NULL),
('07', 2, 'Edible vegetables and certain roots and tubers', NULL, 25, 0, 0, FALSE, TRUE, 'GCLA', 'Basic foodstuff, zero VAT'),
('08', 2, 'Edible fruit and nuts; peel of citrus fruit or melons', NULL, 25, 0, 0, FALSE, TRUE, 'GCLA', NULL),
('09', 2, 'Coffee, tea, maté and spices', NULL, 25, 0, 0, FALSE, FALSE, NULL, NULL),
('10', 2, 'Cereals', NULL, 25, 0, 0, FALSE, FALSE, NULL, 'Basic food, zero VAT'),
('11', 2, 'Products of the milling industry; malt; starches', NULL, 25, 0, 0, FALSE, FALSE, NULL, NULL),
('12', 2, 'Oil seeds and oleaginous fruits; miscellaneous grains, seeds and fruit', NULL, 0, 0, 0, FALSE, FALSE, NULL, NULL),
('15', 2, 'Animal or vegetable fats and oils', NULL, 25, 18, 0, FALSE, TRUE, 'GCLA', NULL),

-- ── SECTION IV: FOOD PREPARATIONS ─────────────────────────────────────────────
('16', 2, 'Preparations of meat, of fish or of crustaceans', NULL, 25, 18, 0, FALSE, TRUE, 'GCLA,TBS', NULL),
('17', 2, 'Sugars and sugar confectionery', NULL, 25, 18, 0, FALSE, FALSE, NULL, NULL),
('18', 2, 'Cocoa and cocoa preparations', NULL, 25, 18, 0, FALSE, FALSE, NULL, NULL),
('19', 2, 'Preparations of cereals, flour, starch or milk', NULL, 25, 18, 0, FALSE, FALSE, NULL, NULL),
('20', 2, 'Preparations of vegetables, fruit, nuts or other parts of plants', NULL, 25, 18, 0, FALSE, FALSE, NULL, NULL),
('21', 2, 'Miscellaneous edible preparations', NULL, 25, 18, 0, FALSE, FALSE, 'GCLA', NULL),
('22', 2, 'Beverages, spirits and vinegar', NULL, 25, 18, 35, FALSE, TRUE, 'GCLA,TBS', 'Excise: 35% on beer; 50%+ on spirits'),
('23', 2, 'Residues and waste from the food industries; prepared animal fodder', NULL, 0, 0, 0, FALSE, FALSE, NULL, NULL),
('24', 2, 'Tobacco and manufactured tobacco substitutes', NULL, 25, 18, 110, FALSE, TRUE, 'TBS', 'High excise duty'),

-- ── SECTION V: MINERAL PRODUCTS ───────────────────────────────────────────────
('25', 2, 'Salt; sulphur; earths and stone; plastering materials; lime and cement', NULL, 0, 18, 0, FALSE, FALSE, NULL, 'Low duty raw materials'),
('26', 2, 'Ores, slag and ash', NULL, 0, 0, 0, FALSE, FALSE, NULL, 'Raw materials'),
('27', 2, 'Mineral fuels, mineral oils and products of their distillation', NULL, 0, 18, 0, FALSE, FALSE, NULL, 'Petroleum products have specific duties'),
('27.10', 4, 'Petroleum oils and oils obtained from bituminous minerals', '27', 0, 18, 0, FALSE, FALSE, NULL, 'Subject to petroleum levy'),
('27.01', 4, 'Coal; briquettes, ovoids and similar solid fuels manufactured from coal', '27', 0, 0, 0, FALSE, FALSE, NULL, NULL),

-- ── SECTION VI: CHEMICALS ─────────────────────────────────────────────────────
('28', 2, 'Inorganic chemicals; inorganic compounds of precious metals', NULL, 0, 18, 0, TRUE, TRUE, 'GCLA', NULL),
('29', 2, 'Organic chemicals', NULL, 0, 18, 0, TRUE, TRUE, 'GCLA', NULL),
('30', 2, 'Pharmaceutical products', NULL, 0, 0, 0, TRUE, TRUE, 'PHARMACY_BOARD,GCLA', 'Zero VAT and zero duty on medicine'),
('31', 2, 'Fertilisers', NULL, 0, 0, 0, FALSE, FALSE, NULL, 'Zero duty for agricultural inputs'),
('32', 2, 'Tanning or dyeing extracts; dyes, pigments, paints, varnishes', NULL, 0, 18, 0, TRUE, TRUE, NULL, NULL),
('33', 2, 'Essential oils; perfumery, cosmetics or toilet preparations', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('34', 2, 'Soap, organic surface-active agents, washing preparations', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('35', 2, 'Albuminoidal substances; modified starches; glues; enzymes', NULL, 10, 18, 0, TRUE, FALSE, NULL, NULL),
('38', 2, 'Miscellaneous chemical products', NULL, 10, 18, 0, TRUE, TRUE, 'GCLA', NULL),

-- ── SECTION VII: PLASTICS & RUBBER ────────────────────────────────────────────
('39', 2, 'Plastics and articles thereof', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL),
('39.01', 4, 'Polymers of ethylene, in primary forms', '39', 10, 18, 0, FALSE, FALSE, NULL, 'Raw material'),
('39.02', 4, 'Polymers of propylene, in primary forms', '39', 10, 18, 0, FALSE, FALSE, NULL, 'Raw material'),
('39.23', 4, 'Articles for the conveyance or packing of goods, of plastics', '39', 25, 18, 0, TRUE, TRUE, NULL, NULL),
('40', 2, 'Rubber and articles thereof', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL),
('40.11', 4, 'New pneumatic tyres, of rubber', '40', 25, 18, 0, TRUE, TRUE, 'TBS', NULL),

-- ── SECTION VIII: HIDES, SKINS & LEATHER ──────────────────────────────────────
('41', 2, 'Raw hides and skins (other than furskins) and leather', NULL, 10, 18, 0, FALSE, FALSE, NULL, NULL),
('42', 2, 'Articles of leather; saddlery and harness; travel goods, handbags', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL),
('43', 2, 'Furskins and artificial fur; manufactures thereof', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL),

-- ── SECTION X: PULP, PAPER ────────────────────────────────────────────────────
('47', 2, 'Pulp of wood or of other fibrous cellulosic material; waste', NULL, 0, 18, 0, FALSE, FALSE, NULL, NULL),
('48', 2, 'Paper and paperboard; articles of paper pulp', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('49', 2, 'Printed books, newspapers, pictures and other products of the printing industry', NULL, 0, 0, 0, FALSE, FALSE, NULL, 'Zero duty and zero VAT'),

-- ── SECTION XI: TEXTILES ──────────────────────────────────────────────────────
('50', 2, 'Silk', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL),
('51', 2, 'Wool, fine or coarse animal hair; horsehair yarn and woven fabric', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL),
('52', 2, 'Cotton', NULL, 0, 0, 0, FALSE, FALSE, NULL, 'Raw cotton zero duty/VAT'),
('52.08', 4, 'Woven fabrics of cotton, containing 85%+ cotton by weight ≤200g/m²', '52', 25, 18, 0, TRUE, TRUE, NULL, NULL),
('54', 2, 'Man-made filaments; strips and the like of man-made textile materials', NULL, 10, 18, 0, FALSE, FALSE, NULL, NULL),
('55', 2, 'Man-made staple fibres', NULL, 10, 18, 0, FALSE, FALSE, NULL, NULL),
('61', 2, 'Articles of apparel and clothing accessories, knitted or crocheted', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('62', 2, 'Articles of apparel and clothing accessories, not knitted or crocheted', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('63', 2, 'Other made up textile articles; sets; worn clothing', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL),
('64', 2, 'Footwear, gaiters and the like; parts of such articles', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('65', 2, 'Headgear and parts thereof', NULL, 25, 18, 0, TRUE, FALSE, NULL, NULL),

-- ── SECTION XIII: STONE, CERAMICS, GLASS ──────────────────────────────────────
('68', 2, 'Articles of stone, plaster, cement, asbestos, mica', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('69', 2, 'Ceramic products', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('70', 2, 'Glass and glassware', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL),

-- ── SECTION XIV: PRECIOUS METALS ──────────────────────────────────────────────
('71', 2, 'Natural or cultured pearls, precious or semi-precious stones, precious metals', NULL, 0, 0, 0, FALSE, FALSE, NULL, 'Zero duty and VAT'),
('71.13', 4, 'Articles of jewellery and parts thereof of precious metal', '71', 0, 0, 0, FALSE, FALSE, NULL, NULL),

-- ── SECTION XV: BASE METALS ───────────────────────────────────────────────────
('72', 2, 'Iron and steel', NULL, 0, 18, 0, TRUE, TRUE, 'TBS', NULL),
('72.08', 4, 'Flat-rolled products of iron or non-alloy steel, ≥600mm wide, hot-rolled, not clad', '72', 0, 18, 0, FALSE, FALSE, NULL, 'Raw material 0%'),
('72.10', 4, 'Flat-rolled products of iron or non-alloy steel, coated', '72', 10, 18, 0, TRUE, FALSE, NULL, NULL),
('72.14', 4, 'Other bars and rods of iron or non-alloy steel, not further worked', '72', 0, 18, 0, FALSE, FALSE, NULL, 'Construction steel rods'),
('73', 2, 'Articles of iron or steel', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('73.08', 4, 'Structures (excl. prefabricated buildings of heading 94.06) and parts of structures of iron or steel', '73', 25, 18, 0, TRUE, TRUE, NULL, NULL),
('73.04', 4, 'Tubes, pipes and hollow profiles, seamless, of iron (other than cast iron) or steel', '73', 10, 18, 0, FALSE, FALSE, NULL, NULL),
('74', 2, 'Copper and articles thereof', NULL, 0, 18, 0, FALSE, FALSE, NULL, NULL),
('76', 2, 'Aluminium and articles thereof', NULL, 10, 18, 0, TRUE, FALSE, NULL, NULL),
('79', 2, 'Zinc and articles thereof', NULL, 0, 18, 0, FALSE, FALSE, NULL, NULL),
('82', 2, 'Tools, implements, cutlery, spoons and forks of base metal', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('83', 2, 'Miscellaneous articles of base metal', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL),

-- ── SECTION XVI: MACHINERY ────────────────────────────────────────────────────
('84', 2, 'Nuclear reactors, boilers, machinery and mechanical appliances', NULL, 0, 18, 0, TRUE, TRUE, 'TBS,CAMARTEC', 'CAMARTEC for agri machinery'),
('84.15', 4, 'Air conditioning machines', '84', 10, 18, 0, TRUE, TRUE, 'TBS', NULL),
('84.17', 4, 'Industrial or laboratory furnaces and ovens, including incinerators', '84', 0, 18, 0, FALSE, FALSE, NULL, NULL),
('84.33', 4, 'Harvesting or threshing machinery, including straw or fodder balers', '84', 0, 0, 0, FALSE, FALSE, 'CAMARTEC', 'Zero duty agri equipment'),
('84.34', 4, 'Milking machines and dairy machinery', '84', 0, 0, 0, FALSE, FALSE, 'CAMARTEC', 'Zero duty agri equipment'),
('84.71', 4, 'Automatic data processing machines and units thereof', '84', 0, 0, 0, FALSE, FALSE, NULL, 'Computers zero duty and VAT'),
('84.73', 4, 'Parts and accessories for machines of headings 84.69 to 84.72', '84', 0, 0, 0, FALSE, FALSE, NULL, NULL),
('84.80', 4, 'Moulding boxes for metal foundry; mould bases; moulding patterns; moulds', '84', 10, 18, 0, FALSE, FALSE, NULL, NULL),
('85', 2, 'Electrical machinery and equipment; sound recorders; TV sets', NULL, 10, 18, 0, TRUE, TRUE, 'TBS,EWURA', NULL),
('85.01', 4, 'Electric motors and generators', '85', 0, 18, 0, TRUE, FALSE, 'TBS', NULL),
('85.04', 4, 'Electrical transformers, static converters and inductors', '85', 0, 18, 0, TRUE, FALSE, 'TBS', NULL),
('85.17', 4, 'Telephone sets; smartphones and other telephone apparatus', '85', 10, 18, 0, TRUE, TRUE, 'TCRA,TBS', 'TCRA type approval required'),
('85.25', 4, 'Transmission apparatus for radio-broadcasting or TV', '85', 10, 18, 0, TRUE, TRUE, 'TCRA', NULL),
('85.28', 4, 'Monitors and projectors; television reception apparatus', '85', 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('85.44', 4, 'Insulated wire, cable and other insulated electric conductors', '85', 10, 18, 0, TRUE, FALSE, 'TBS', NULL),

-- ── SECTION XVII: VEHICLES ────────────────────────────────────────────────────
('86', 2, 'Railway or tramway locomotives, rolling stock and parts', NULL, 0, 18, 0, FALSE, FALSE, NULL, NULL),
('87', 2, 'Vehicles other than railway or tramway rolling stock', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('87.01', 4, 'Tractors (other than tractors of heading 87.09)', '87', 0, 0, 0, FALSE, FALSE, 'CAMARTEC', 'Zero duty and VAT agri tractors'),
('87.02', 4, 'Motor vehicles for the transport of 10+ persons, incl. driver', '87', 25, 18, 0, TRUE, TRUE, 'TBS,SUMATRA', NULL),
('87.03', 4, 'Motor cars and other motor vehicles principally designed for the transport of persons', '87', 25, 18, 0, TRUE, TRUE, 'TBS,SUMATRA', 'Excise based on engine cc'),
('87.04', 4, 'Motor vehicles for the transport of goods', '87', 25, 18, 0, TRUE, TRUE, 'TBS,SUMATRA', NULL),
('87.05', 4, 'Special purpose motor vehicles (fire-fighting, crane lorries, etc.)', '87', 0, 18, 0, FALSE, FALSE, NULL, NULL),
('87.08', 4, 'Parts and accessories for motor vehicles', '87', 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('88', 2, 'Aircraft, spacecraft, and parts thereof', NULL, 0, 18, 0, FALSE, FALSE, 'TCAA', NULL),
('89', 2, 'Ships, boats and floating structures', NULL, 0, 18, 0, FALSE, FALSE, NULL, NULL),

-- ── SECTION XVIII: OPTICAL, MEDICAL ──────────────────────────────────────────
('90', 2, 'Optical, photographic, cinematographic, measuring, checking, precision instruments', NULL, 0, 18, 0, FALSE, FALSE, NULL, NULL),
('90.18', 4, 'Medical, surgical, dental or veterinary instruments and apparatus', '90', 0, 0, 0, FALSE, FALSE, 'PHARMACY_BOARD', 'Zero duty and VAT on medical equipment'),
('91', 2, 'Clocks and watches and parts thereof', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL),
('92', 2, 'Musical instruments; parts and accessories of such articles', NULL, 25, 18, 0, FALSE, FALSE, NULL, NULL),

-- ── SECTION XX: MISCELLANEOUS MANUFACTURED ARTICLES ──────────────────────────
('94', 2, 'Furniture; bedding, mattresses, cushions; lamps and lighting fittings', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('94.01', 4, 'Seats (other than those of heading 94.02)', '94', 25, 18, 0, TRUE, TRUE, NULL, NULL),
('94.03', 4, 'Other furniture and parts thereof', '94', 25, 18, 0, TRUE, TRUE, NULL, NULL),
('95', 2, 'Toys, games and sports requisites; parts and accessories thereof', NULL, 25, 18, 0, TRUE, TRUE, 'TBS', NULL),
('96', 2, 'Miscellaneous manufactured articles', NULL, 25, 18, 0, TRUE, TRUE, NULL, NULL)

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  import_duty_rate = EXCLUDED.import_duty_rate,
  vat_rate = EXCLUDED.vat_rate,
  excise_rate = EXCLUDED.excise_rate,
  pvoc_required = EXCLUDED.pvoc_required,
  di_required = EXCLUDED.di_required,
  permits = EXCLUDED.permits,
  notes = EXCLUDED.notes,
  updated_at = NOW();
