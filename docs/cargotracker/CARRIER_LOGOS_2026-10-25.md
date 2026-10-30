# Shipping-line and container-owner logo integration — 25 October 2026

34 locally stored brand assets replace hand-drawn approximations. Files live in `apps/web/public/carriers`; `sources.json` records original URLs, hashes and native raster dimensions. Vector artwork is used where obtained; raster originals are preserved without artificial upscaling. Logos remain the property of their respective owners and are used for identification.

## Delivered surfaces

- CargoTracker search: typing a recognized container prefix shows its owner/brand and logo immediately.
- ClearOS new-shipment container field: same shared detection and logo display alongside existing ISO check-digit feedback.
- CargoTracker carrier directory: expandable local logo library and recognized company logos in the tenant carrier table.
- Container fleet rows, detail strip, tracker cards, carrier selection, tracking-result headers and saved ocean snapshots share the registry.
- Isometric containers embed actual local artwork instead of approximate drawings.
- Carrier picker and container typing no longer silently write an inferred owner into the operating-carrier field. An explicitly selected carrier can differ from equipment owner.
- Unknown prefixes have no guessed MSC/ONE default; ordinary words containing ONE do not trigger false matches.
- Corrected Textainer, Triton and Seaco mappings previously assigned to MSC/Maersk/ONE. Legacy NYK, MOL, K Line, APL, Hanjin, China Shipping, UASC, Nedlloyd and Hamburg Süd artwork remains identifiable.
- Container recording no longer reports successful saving after swallowing an API error.
- Added optional `className` support to shared SectionCard to resolve existing catalogue call-site type errors found during repository verification.

## Identification boundary

BIC prefixes identify the owner/principal operator of equipment, not necessarily the operating carrier of a voyage. Reference: https://www.bic-code.org/identification-number/ . This is a curated local identification registry, not a live BIC registration, container-location or voyage verification service. Prefixes/ownership can change. Manual carrier selection and transport documents remain authoritative for the current movement.

Some references show military, humanitarian, rail, manufacturer and ambiguous third-party markings. Those are not all ocean shipping lines; unidentified marks are not assigned invented carrier prefixes. CTI/Think Global/Easoon/China Railway/US Army/Red Cross markings from the collages are not given automatic carrier mappings. Existing registry entries without sourced artwork retain the shared company-avatar fallback.

## Verification

- 14 targeted tests passed: common and lessor prefixes, legacy brands, formatting normalization, unknown inputs, exact name aliases, unique prefix assignment, consistent paint selection, asset hashes and SVG active-content checks.
- Full root typecheck passed, including API/web types, trigger coverage, 19 design-system checks and encoding.
- Browser: real CMA CGM artwork appears on CargoTracker input; valid MSC number shows logo and check-digit confirmation in ClearOS; expanded 34-brand library renders. Mobile tracking and desktop ClearOS/library checked without saving business records.
- Screenshots: `carrier-detection-tracking.png` and `carrier-detection-clearos.png`.
- Browser later auto-locked while final checks completed. No credentials or security settings changed.
- Production web build passed (1m 38s), with the existing large-bundle warning.
- Diff whitespace check passed. No production deployment performed.

## Assets

| Registry ID | Local file | Native format / size | Source |
|---|---|---|---|
| msc | msc.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/commons/b/b3/Mediterranean_Shipping_Company_logo.svg) |
| maersk | maersk.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/commons/e/e6/Maersk_Group_Logo.svg) |
| cma_cgm | cma_cgm.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/commons/d/d1/CMA_CGM_logo.svg) |
| cosco | cosco.webp | 750 × 750 | [source](https://iconlogovector.com/uploads/images/2024/11/lg-6732afccd1f15-COSCO-SHIPPING.webp) |
| hapag_lloyd | hapag_lloyd.webp | 750 × 750 | [source](https://iconlogovector.com/uploads/images/2024/11/lg-6732afe2c32a3-Hapag-Lloyd.webp) |
| one | one.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/commons/4/45/Ocean_Network_Express_logo.svg) |
| evergreen | evergreen.svg | Vector | [source](https://www.evergreen-marine.com/emc/common/images/logo/emc_logo.svg) |
| hmm | hmm.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/commons/5/56/HMM_Logo_Basic_Form.svg) |
| yang_ming | yang_ming.svg | Vector | [source](https://companieslogo.com/img/orig/2609.TW_BIG-133819e4.svg?t=1746286847&download=true) |
| zim | zim.webp | 750 × 750 | [source](https://iconlogovector.com/uploads/images/2024/11/lg-673306257ba36-ZIM.webp) |
| wan_hai | wan_hai.svg | Vector | [source](https://companieslogo.com/img/orig/2615.TW_BIG-d9a6ec47.svg?t=1730742803&download=true) |
| oocl | oocl.webp | 750 × 750 | [source](https://iconlogovector.com/uploads/images/2024/11/lg-6732b01955fbf-OOCL.webp) |
| matson | matson.png | 280 × 82 | [source](https://www.matson.com/wp-content/themes/matson_2021/public/images/matson_logo.png) |
| k_line | k_line.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/commons/9/9e/K_line_logo.svg) |
| mol | mol.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/commons/2/22/Mitsui_O.S.K._Lines_logo.svg) |
| nyk | nyk.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/commons/3/3c/Nippon_Yusen_company_logo.svg) |
| apl | apl.png | 397 × 250 | [source](https://upload.wikimedia.org/wikipedia/en/8/8c/American_President_Lines_%28container_shipping_company%29_logo.png) |
| hanjin | hanjin.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/commons/8/81/Hanjin_Shipping_Logo.svg) |
| china_shipping | china_shipping.svg | Vector | [source](https://static.cdnlogo.com/logos/c/58/china-shipping.svg) |
| uasc | uasc.png | 600 × 600 | [source](https://images.seeklogo.com/logo-png/17/1/united-arab-shipping-company-s-a-g-logo-png_seeklogo-176647.png) |
| nedlloyd | nedlloyd.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/commons/d/d0/Royal_P%26O_Nedlloyd_logo.svg) |
| hamburg_sud | hamburg_sud.jpg | 480 × 89 | [source](https://upload.wikimedia.org/wikipedia/commons/c/c3/Hamburg_S%C3%BCd_logo.jpg) |
| triton | triton.png | 230 × 65 | [source](https://www.tritoninternational.com/media/yjikv14m/triton-website-logo.png) |
| textainer | textainer.png | 87 × 350 | [source](https://www.textainer.com/application/files/7114/8702/9418/header-logo.png) |
| cai | cai.png | 580 × 404 | [source](https://cai.capps.com/wp-content/uploads/2026/06/CAI-with-MHC-revised-white-font.png) |
| seaco | seaco.png | 418 × 128 | [source](https://seacoglobal.com/wp-content/uploads/2025/05/Lockup-60th.png) |
| royal_arctic | royal_arctic.svg | Vector | [source](https://www.ral.gl/wp-content/uploads/2025/03/royal-artic-logo-white.svg) |
| sea_box | sea_box.png | 270 × 99 | [source](https://www.seabox.com/files/SBI-Logo_Est1983.png) |
| linfox | linfox.svg | Vector | [source](https://www.linfox.com/wp-content/themes/linfox/dist/images/logo.svg) |
| pil | pil.svg | Vector | [source](https://upload.wikimedia.org/wikipedia/en/8/8f/Pacific_International_Lines_logo.svg) |
| sitc | sitc.jpg | 1170 × 60 | [source](https://www.sitc.com/logo3.jpg) |
| messina | messina.svg | Vector | [source](https://messinaline.it/wp-content/uploads/sites/6/2025/12/messina-line.svg) |
| arkas | arkas.png | 1920 × 500 | [source](https://arkasline.com.tr/wp-content/uploads/2021/05/Logo.png) |
| ts_lines | ts_lines.svg | Vector | [source](https://www.tslines.com/images/logo.svg) |
