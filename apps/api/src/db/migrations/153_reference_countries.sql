-- Migration 153: ISO 3166-1 country reference.
--
-- Backs the async country search on the landed-cost calculator (and anything
-- else that needs a canonical country list) so origin data aggregates on a
-- fixed code instead of whatever spelling someone typed.
--
-- `is_eac` marks the East African Community partner states. EAC-origin goods
-- get preferential treatment under the Customs Union Protocol, and
-- customs.service.ts already branches on origin for PVoC — having the flag on
-- the reference row means that logic can key off data rather than a hardcoded
-- list drifting out of step when membership changes (it last changed in 2023
-- when Somalia acceded).
--
-- Officially-assigned alpha-2 entries only. Names are the ISO short names, so
-- they match what customs paperwork uses.

CREATE TABLE IF NOT EXISTS reference_countries (
  code    CHAR(2) PRIMARY KEY,
  code3   CHAR(3) NOT NULL,
  name    TEXT NOT NULL,
  is_eac  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ref_countries_name ON reference_countries (lower(name));

INSERT INTO reference_countries (code, code3, name, is_eac) VALUES
('AF','AFG','Afghanistan',false),('AX','ALA','Åland Islands',false),('AL','ALB','Albania',false),('DZ','DZA','Algeria',false),
('AS','ASM','American Samoa',false),('AD','AND','Andorra',false),('AO','AGO','Angola',false),('AI','AIA','Anguilla',false),
('AQ','ATA','Antarctica',false),('AG','ATG','Antigua and Barbuda',false),('AR','ARG','Argentina',false),('AM','ARM','Armenia',false),
('AW','ABW','Aruba',false),('AU','AUS','Australia',false),('AT','AUT','Austria',false),('AZ','AZE','Azerbaijan',false),
('BS','BHS','Bahamas',false),('BH','BHR','Bahrain',false),('BD','BGD','Bangladesh',false),('BB','BRB','Barbados',false),
('BY','BLR','Belarus',false),('BE','BEL','Belgium',false),('BZ','BLZ','Belize',false),('BJ','BEN','Benin',false),
('BM','BMU','Bermuda',false),('BT','BTN','Bhutan',false),('BO','BOL','Bolivia',false),('BQ','BES','Bonaire, Sint Eustatius and Saba',false),
('BA','BIH','Bosnia and Herzegovina',false),('BW','BWA','Botswana',false),('BV','BVT','Bouvet Island',false),('BR','BRA','Brazil',false),
('IO','IOT','British Indian Ocean Territory',false),('BN','BRN','Brunei Darussalam',false),('BG','BGR','Bulgaria',false),('BF','BFA','Burkina Faso',false),
('BI','BDI','Burundi',true),('CV','CPV','Cabo Verde',false),('KH','KHM','Cambodia',false),('CM','CMR','Cameroon',false),
('CA','CAN','Canada',false),('KY','CYM','Cayman Islands',false),('CF','CAF','Central African Republic',false),('TD','TCD','Chad',false),
('CL','CHL','Chile',false),('CN','CHN','China',false),('CX','CXR','Christmas Island',false),('CC','CCK','Cocos (Keeling) Islands',false),
('CO','COL','Colombia',false),('KM','COM','Comoros',false),('CG','COG','Congo',false),('CD','COD','Congo, Democratic Republic of the',true),
('CK','COK','Cook Islands',false),('CR','CRI','Costa Rica',false),('CI','CIV','Côte d''Ivoire',false),('HR','HRV','Croatia',false),
('CU','CUB','Cuba',false),('CW','CUW','Curaçao',false),('CY','CYP','Cyprus',false),('CZ','CZE','Czechia',false),
('DK','DNK','Denmark',false),('DJ','DJI','Djibouti',false),('DM','DMA','Dominica',false),('DO','DOM','Dominican Republic',false),
('EC','ECU','Ecuador',false),('EG','EGY','Egypt',false),('SV','SLV','El Salvador',false),('GQ','GNQ','Equatorial Guinea',false),
('ER','ERI','Eritrea',false),('EE','EST','Estonia',false),('SZ','SWZ','Eswatini',false),('ET','ETH','Ethiopia',false),
('FK','FLK','Falkland Islands',false),('FO','FRO','Faroe Islands',false),('FJ','FJI','Fiji',false),('FI','FIN','Finland',false),
('FR','FRA','France',false),('GF','GUF','French Guiana',false),('PF','PYF','French Polynesia',false),('TF','ATF','French Southern Territories',false),
('GA','GAB','Gabon',false),('GM','GMB','Gambia',false),('GE','GEO','Georgia',false),('DE','DEU','Germany',false),
('GH','GHA','Ghana',false),('GI','GIB','Gibraltar',false),('GR','GRC','Greece',false),('GL','GRL','Greenland',false),
('GD','GRD','Grenada',false),('GP','GLP','Guadeloupe',false),('GU','GUM','Guam',false),('GT','GTM','Guatemala',false),
('GG','GGY','Guernsey',false),('GN','GIN','Guinea',false),('GW','GNB','Guinea-Bissau',false),('GY','GUY','Guyana',false),
('HT','HTI','Haiti',false),('HM','HMD','Heard Island and McDonald Islands',false),('VA','VAT','Holy See',false),('HN','HND','Honduras',false),
('HK','HKG','Hong Kong',false),('HU','HUN','Hungary',false),('IS','ISL','Iceland',false),('IN','IND','India',false),
('ID','IDN','Indonesia',false),('IR','IRN','Iran',false),('IQ','IRQ','Iraq',false),('IE','IRL','Ireland',false),
('IM','IMN','Isle of Man',false),('IL','ISR','Israel',false),('IT','ITA','Italy',false),('JM','JAM','Jamaica',false),
('JP','JPN','Japan',false),('JE','JEY','Jersey',false),('JO','JOR','Jordan',false),('KZ','KAZ','Kazakhstan',false),
('KE','KEN','Kenya',true),('KI','KIR','Kiribati',false),('KP','PRK','Korea, Democratic People''s Republic of',false),('KR','KOR','Korea, Republic of',false),
('KW','KWT','Kuwait',false),('KG','KGZ','Kyrgyzstan',false),('LA','LAO','Lao People''s Democratic Republic',false),('LV','LVA','Latvia',false),
('LB','LBN','Lebanon',false),('LS','LSO','Lesotho',false),('LR','LBR','Liberia',false),('LY','LBY','Libya',false),
('LI','LIE','Liechtenstein',false),('LT','LTU','Lithuania',false),('LU','LUX','Luxembourg',false),('MO','MAC','Macao',false),
('MG','MDG','Madagascar',false),('MW','MWI','Malawi',false),('MY','MYS','Malaysia',false),('MV','MDV','Maldives',false),
('ML','MLI','Mali',false),('MT','MLT','Malta',false),('MH','MHL','Marshall Islands',false),('MQ','MTQ','Martinique',false),
('MR','MRT','Mauritania',false),('MU','MUS','Mauritius',false),('YT','MYT','Mayotte',false),('MX','MEX','Mexico',false),
('FM','FSM','Micronesia',false),('MD','MDA','Moldova',false),('MC','MCO','Monaco',false),('MN','MNG','Mongolia',false),
('ME','MNE','Montenegro',false),('MS','MSR','Montserrat',false),('MA','MAR','Morocco',false),('MZ','MOZ','Mozambique',false),
('MM','MMR','Myanmar',false),('NA','NAM','Namibia',false),('NR','NRU','Nauru',false),('NP','NPL','Nepal',false),
('NL','NLD','Netherlands',false),('NC','NCL','New Caledonia',false),('NZ','NZL','New Zealand',false),('NI','NIC','Nicaragua',false),
('NE','NER','Niger',false),('NG','NGA','Nigeria',false),('NU','NIU','Niue',false),('NF','NFK','Norfolk Island',false),
('MK','MKD','North Macedonia',false),('MP','MNP','Northern Mariana Islands',false),('NO','NOR','Norway',false),('OM','OMN','Oman',false),
('PK','PAK','Pakistan',false),('PW','PLW','Palau',false),('PS','PSE','Palestine, State of',false),('PA','PAN','Panama',false),
('PG','PNG','Papua New Guinea',false),('PY','PRY','Paraguay',false),('PE','PER','Peru',false),('PH','PHL','Philippines',false),
('PN','PCN','Pitcairn',false),('PL','POL','Poland',false),('PT','PRT','Portugal',false),('PR','PRI','Puerto Rico',false),
('QA','QAT','Qatar',false),('RE','REU','Réunion',false),('RO','ROU','Romania',false),('RU','RUS','Russian Federation',false),
('RW','RWA','Rwanda',true),('BL','BLM','Saint Barthélemy',false),('SH','SHN','Saint Helena',false),('KN','KNA','Saint Kitts and Nevis',false),
('LC','LCA','Saint Lucia',false),('MF','MAF','Saint Martin (French part)',false),('PM','SPM','Saint Pierre and Miquelon',false),('VC','VCT','Saint Vincent and the Grenadines',false),
('WS','WSM','Samoa',false),('SM','SMR','San Marino',false),('ST','STP','Sao Tome and Principe',false),('SA','SAU','Saudi Arabia',false),
('SN','SEN','Senegal',false),('RS','SRB','Serbia',false),('SC','SYC','Seychelles',false),('SL','SLE','Sierra Leone',false),
('SG','SGP','Singapore',false),('SX','SXM','Sint Maarten (Dutch part)',false),('SK','SVK','Slovakia',false),('SI','SVN','Slovenia',false),
('SB','SLB','Solomon Islands',false),('SO','SOM','Somalia',true),('ZA','ZAF','South Africa',false),('GS','SGS','South Georgia and the South Sandwich Islands',false),
('SS','SSD','South Sudan',true),('ES','ESP','Spain',false),('LK','LKA','Sri Lanka',false),('SD','SDN','Sudan',false),
('SR','SUR','Suriname',false),('SJ','SJM','Svalbard and Jan Mayen',false),('SE','SWE','Sweden',false),('CH','CHE','Switzerland',false),
('SY','SYR','Syrian Arab Republic',false),('TW','TWN','Taiwan',false),('TJ','TJK','Tajikistan',false),('TZ','TZA','Tanzania',true),
('TH','THA','Thailand',false),('TL','TLS','Timor-Leste',false),('TG','TGO','Togo',false),('TK','TKL','Tokelau',false),
('TO','TON','Tonga',false),('TT','TTO','Trinidad and Tobago',false),('TN','TUN','Tunisia',false),('TR','TUR','Türkiye',false),
('TM','TKM','Turkmenistan',false),('TC','TCA','Turks and Caicos Islands',false),('TV','TUV','Tuvalu',false),('UG','UGA','Uganda',true),
('UA','UKR','Ukraine',false),('AE','ARE','United Arab Emirates',false),('GB','GBR','United Kingdom',false),('US','USA','United States of America',false),
('UM','UMI','United States Minor Outlying Islands',false),('UY','URY','Uruguay',false),('UZ','UZB','Uzbekistan',false),('VU','VUT','Vanuatu',false),
('VE','VEN','Venezuela',false),('VN','VNM','Viet Nam',false),('VG','VGB','Virgin Islands (British)',false),('VI','VIR','Virgin Islands (U.S.)',false),
('WF','WLF','Wallis and Futuna',false),('EH','ESH','Western Sahara',false),('YE','YEM','Yemen',false),('ZM','ZMB','Zambia',false),
('ZW','ZWE','Zimbabwe',false)
ON CONFLICT (code) DO NOTHING;
