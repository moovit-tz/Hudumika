import React from 'react';

/* Stroke-only SVG icon set — 24×24 viewBox, rounded caps/joins, no fill.
   All paths written to a 24-unit grid so they scale cleanly at any size. */

// `satisfies` (not a `: Record<string, ...>` annotation) is deliberate:
// an explicit Record annotation widens `keyof typeof P` to plain `string`,
// which silently defeated IconName's whole purpose — 26 misspelled icon
// names across the app (e.g. 'gitBranch' before it existed, 'dollar',
// 'checkSquare') typechecked fine and rendered nothing, completely
// invisibly, because of this exact pattern. `satisfies` still validates
// every value's shape while preserving the literal key union so a typo
// is now a real compile error.
const P = {
  /* ── Layout / Navigation ── */
  grid:         'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z',
  columns:      'M12 3h7a2 2 0 012 2v14a2 2 0 01-2 2h-7M12 3H5a2 2 0 00-2 2v14a2 2 0 002 2h7M12 3v18',
  list:         'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  menu:         'M4 6h16M4 12h16M4 18h16',
  sidebar:      'M3 3h18v18H3V3zm6 0v18',
  chevronDown:  'M6 9l6 6 6-6',
  chevronUp:    'M18 15l-6-6-6 6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronLeft:  'M15 18l-6-6 6-6',
  back:         'M19 12H5M12 19l-7-7 7-7',
  arrowLeft:    'M19 12H5M12 19l-7-7 7-7',
  arrowRight:   'M5 12h14M12 5l7 7-7 7',
  arrowUp:      'M12 19V5M5 12l7-7 7 7',
  moreHorizontal: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  moreVertical:   'M13 12a1 1 0 1 0-2 0 1 1 0 0 0 2 0zM13 5a1 1 0 1 0-2 0 1 1 0 0 0 2 0zM13 19a1 1 0 1 0-2 0 1 1 0 0 0 2 0z',
  home:         ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z', 'M9 22V12h6v10'],
  message:      ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z'],
  arrowDown:    'M12 5v14M5 12l7 7 7-7',
  arrowUpRight: 'M7 17L17 7M7 7h10v10',
  externalLink: 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3',
  close:        'M18 6L6 18M6 6l12 12',
  plus:         'M12 5v14M5 12h14',
  minus:        'M5 12h14',
  search:       'M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z',
  filter:       'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  download:     'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload:       'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  refresh:      'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',

  /* ── Documents ── */
  file:         'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm0 0v6h6',
  fileText:     'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm0 0v6h6M9 13h6M9 17h4',
  clipboard:    'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 010 2H9a1 1 0 010-2z',
  clipboardList:'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 010 2H9a1 1 0 010-2zM9 12h6M9 16h4',
  calculator:   ['M4 2h16a2 2 0 012 2v16a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z', 'M8 6h8', 'M8 10h.01M12 10h.01M16 10h.01', 'M8 14h.01M12 14h.01M16 14h.01', 'M8 18h.01M12 18h.01M16 18h.01'],
  folder:       'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  folderOpen:   'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2zM2 10h20',
  paperclip:    'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48',
  receipt:      ['M4 2h16v20l-3-2-2 2-2-2-2 2-2-2-3 2V2z', 'M8 8h8M8 12h5'],
  invoice:      'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm0 0v6h6M8 13h8M8 17h5',
  stamp:        ['M7 17h10v2H7z', 'M7 13a5 5 0 1110 0H7z', 'M12 3v3'],

  /* ── People / Users ── */
  user:         'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  users:        'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  userCheck:    'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 11a4 4 0 100-8 4 4 0 000 8zm8 4l2 2 4-4',
  contact:      'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8zM3 7h2M3 11h2M3 15h2',

  /* ── Finance ── */
  dollarSign:   'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  creditCard:   ['M1 4h22v3H1z', 'M1 9h22v11a1 1 0 01-1 1H2a1 1 0 01-1-1V9zm4 6h4'],
  coins:        ['M12 12a5 5 0 100-10 5 5 0 000 10z', 'M3.5 18A5 5 0 0112 14a5 5 0 018.5 4'],
  trendingUp:   'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  trendingDown: 'M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6',
  barChart:     'M12 20V10M18 20V4M6 20v-4',
  pieChart:     'M21.21 15.89A10 10 0 118 2.83M22 12A10 10 0 0012 2v10z',
  percent:      ['M19 5L5 19', 'M6.5 6.5h.01', 'M17.5 17.5h.01'],

  /* ── Shipping / Cargo ── */
  ship:         ['M2 20h20', 'M5 20V9.5L12 5l7 4.5V20', 'M9 20v-5h6v5'],
  anchor:       ['M12 2a3 3 0 110 6 3 3 0 010-6z', 'M12 8v14', 'M5 15A7 7 0 0019 15'],
  truck:        ['M1 3h15v13H1z', 'M16 8h4l3 3v5h-7V8z', 'M5.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z', 'M18.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z'],
  train:        ['M4 3h16v11a4 4 0 01-4 4H8a4 4 0 01-4-4V3z', 'M4 11h16', 'M8 3v4M16 3v4', 'M7.5 21l1.5-3M16.5 21L15 18'],
  plane:        ['M17 21l-5-4-5 4V14l-7-4V8l7 2V4l3-2 3 2v6l7-2v2l-7 4v7z'],
  package:      ['M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 001 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', 'M3.27 6.96L12 12.01l8.73-5.05', 'M12 22.08V12'],
  container:    ['M2 7h20v13H2z', 'M2 7l3-4h14l3 4', 'M7 7v13', 'M12 7v13', 'M17 7v13'],
  warehouse:    ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M9 22V12h6v10'],
  globe:        ['M12 2a10 10 0 100 20A10 10 0 0012 2z', 'M2 12h20', 'M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z'],

  /* ── Status / Alerts ── */
  warning:       ['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  alertTriangle: ['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  pause:         ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
  alertCircle:  ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 8v4', 'M12 16h.01'],
  checkCircle:  ['M22 11.08V12a10 10 0 11-5.93-9.14', 'M22 4L12 14.01l-3-3'],
  xCircle:      ['M22 12a10 10 0 11-20 0 10 10 0 0120 0z', 'M15 9l-6 6M9 9l6 6'],
  plusCircle:   ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 8v8M8 12h8'],
  minusCircle:  ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M8 12h8'],
  info:         ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 16v-4', 'M12 8h.01'],
  check:        'M20 6L9 17l-5-5',
  clock:        ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 6v6l4 2'],
  timer:        ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 6v6l3 3', 'M9.5 2.5l5 0'],
  calendar:     ['M8 2v4M16 2v4M3 10h18', 'M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z'],

  /* ── Actions / Tools ── */
  settings:     ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z'],
  tool:         'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  edit:         'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  trash:        ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6'],
  copy:         ['M20 9H11a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2z', 'M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1'],
  save:         ['M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8'],
  lock:         ['M5 11V7a7 7 0 0114 0v4', 'M3 11h18v11H3z', 'M12 16v3'],
  key:          ['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'],
  bell:         ['M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 01-3.46 0'],
  send:         'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  headphones:   ['M3 18v-6a9 9 0 0118 0v6', 'M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z'],
  zap:          'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  play:         'M5 3l14 9-14 9V3z',
  target:       ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 18a6 6 0 100-12 6 6 0 000 12z', 'M12 14a2 2 0 100-4 2 2 0 000 4z'],
  eye:          ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 9a3 3 0 100 6 3 3 0 000-6z'],

  /* ── Misc ── */
  star:         'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  circle:       'M12 22a10 10 0 100-20 10 10 0 000 20z',
  dot:          'M12 13a1 1 0 100-2 1 1 0 000 2z',
  map:          ['M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4', 'M8 2v16', 'M16 6v16'],
  mapPin:       ['M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z', 'M12 13a3 3 0 100-6 3 3 0 000 6z'],
  layers:       ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  tag:          'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
  flag:         ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  activity:     'M22 12h-4l-3 9L9 3l-3 9H2',
  projector:    ['M7 17h10v2H7z', 'M7 13a5 5 0 1110 0H7z', 'M12 2v4M5 5l2.5 2.5M19 5l-2.5 2.5'],
  tasks:        ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11'],
  helpCircle:   ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3', 'M12 17h.01'],
  contracts:    ['M4 4h16v4H4z', 'M4 12h16', 'M4 16h16', 'M4 20h8'],
  building:     ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 21v-5h6v5', 'M9 10h1M14 10h1M9 14h1M14 14h1'],
  office:       ['M1 3h22v3H1z', 'M3 6v15h18V6', 'M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2'],
  permit:       ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z', 'M14 2v6h6', 'M9 9l1.5 1.5L13 8', 'M9 14h6', 'M9 17h4'],
  scale:        ['M12 3v18', 'M3 8l9-5 9 5', 'M5 19a7 7 0 01-2-4.9L5 7l7 3.5M19 19a7 7 0 002-4.9L19 7l-7 3.5'],
  briefcase:    ['M20 7H4a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z', 'M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2'],
  camera:       ['M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z', 'M12 17a4 4 0 100-8 4 4 0 000 8z'],
  monitor:      ['M20 3H4a1 1 0 00-1 1v13a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1z', 'M8 21h8M12 17v4'],
  eyeOff:       ['M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24', 'M1 1l22 22'],
  mail:         ['M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z', 'M22 6l-10 7L2 6'],
  shield:       ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  refresh2:     'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  sun:          ['M12 17a5 5 0 100-10 5 5 0 000 10z','M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'],
  moon:         'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  maximize:     'M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3',
  minimize:     'M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3',
  x:            'M18 6L6 18M6 6l12 12',
  sparkle:      'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z',
  shoppingCart: ['M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z', 'M3 6h18', 'M16 10a4 4 0 01-8 0'],
  wand:         ['M15 4l5 5', 'M5 19L19 5', 'M3 21l4-4', 'M8 3l1 4-4 1', 'M16 17l1 4 4-1'],
  barChart2:    'M18 20V10M12 20V4M6 20v-6',
  logIn:        ['M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
  logOut:       ['M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4',   'M16 17l5-5-5-5', 'M21 12H9'],
  userPlus:     ['M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M8.5 11a4 4 0 100-8 4 4 0 000 8z', 'M20 8v6M17 11h6'],
  userMinus:    ['M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M8.5 11a4 4 0 100-8 4 4 0 000 8z', 'M17 11h6'],
  award:        ['M12 15a7 7 0 100-14 7 7 0 000 14z', 'M8.21 13.89L7 23l5-3 5 3-1.21-9.12'],
  smartphone:   ['M17 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2z', 'M12 18h.01'],
  volume2:      ['M11 5L6 9H2v6h4l5 4V5z', 'M15.54 8.46a5 5 0 010 7.07', 'M19.07 4.93a10 10 0 010 14.14'],
  chatBubble:   ['M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z'],
  hash:         'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
  smile:        ['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M8 14s1.5 2 4 2 4-2 4-2', 'M9 9h.01', 'M15 9h.01'],
  atSign:       ['M12 22a8 8 0 100-16 8 8 0 000 16z', 'M12 14a2 2 0 100-4 2 2 0 000 4z', 'M20 12v1a4 4 0 01-4 4'],
  link:         ['M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71'],
  image:        ['M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z', 'M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z', 'M21 15l-5-5L5 21'],
  phone:        'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.78 19.79 19.79 0 01.38 1.2 2 2 0 012.36 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.7 7.64a16 16 0 006.37 6.37l.9-.9a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z',
  printer:      ['M6 9V2h12v7', 'M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2', 'M6 14h12v8H6z'],

  /* ── Metronic-style additions ── */
  messageSquare:   ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z'],
  wallet:          ['M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5z', 'M16 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0'],
  sliders:         ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  layoutDashboard: ['M3 3h7v9H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 16h7v5H3z'],
  bankNote:        ['M2 6h20v12H2z', 'M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 12h.01M18 12h.01'],
  arrowUpDown:     ['M12 3l4 4H8l4-4z', 'M12 21l-4-4h8l-4 4z', 'M12 8v8'],
  chartArea:       ['M3 3v18h18', 'M7 12l4-4 4 4 4-7'],
  trendUp:         ['M22 7l-9.5 9.5-5-5L1 18', 'M16 7h6v6'],
  box2:            ['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.27 6.96L12 12.01l8.73-5.05', 'M12 22.08V12'],
  grid3:           'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z',
  bolt:            'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  shapes:          ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z', 'M17 17h5v5h-5z'],
  terminal:        ['M4 17l6-6-6-6', 'M12 19h8'],
  compass:         ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z'],
  scan:            ['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2'],
  fingerprint:     ['M2 12C2 6.48 6.48 2 12 2', 'M6 12a6 6 0 0 1 6-6', 'M10 12a2 2 0 0 1 4 0', 'M22 12c0 5.52-4.48 10-10 10'],
  crown:           'M2 20h20M5 20V9l7-6 7 6v11',
  spark2:          ['M12 3v3', 'M18.5 7.5l-2 2', 'M21 14h-3', 'M18.5 20.5l-2-2', 'M12 24v-3', 'M5.5 20.5l2-2', 'M3 14h3', 'M5.5 7.5l2 2'],
  badge:           ['M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76z', 'M9 12l2 2 4-4'],
  notification:    ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0', 'M2 8c0-2.2.7-4.3 2-6'],
  puzzle:          ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', 'M7 7h.01'],
  siren:           ['M11 17H7a4 4 0 0 1-4-4 8 8 0 0 1 16 0 4 4 0 0 1-4 4h-4z', 'M9 21h6', 'M12 3V1'],
  box3:            ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'],
  trash2:          ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6'],

  /* ── Branching / flows (sidebar icons previously referenced but never defined — see gitBranch etc.) ── */
  gitBranch:    ['M6 3L6 15', 'M18 9a9 9 0 0 1-9 9', 'M18 9a3 3 0 1 0 0-6a3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6a3 3 0 0 0 0 6z'],
  gitMerge:     ['M18 21a3 3 0 1 0 0-6a3 3 0 0 0 0 6z', 'M6 9a3 3 0 1 0 0-6a3 3 0 0 0 0 6z', 'M6 21V9a9 9 0 0 0 9 9'],
  bookOpen:     ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  inbox:        ['M22 12L16 12L14 15L10 15L8 12L2 12', 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'],
  leaf:         ['M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z', 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12'],
  cloudRain:    'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  unlock:       ['M7 11V7a5 5 0 0 1 9.9-1', 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z'],
  bookmark:     'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
} satisfies Record<string, string | string[]>;

export type IconName = keyof typeof P;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  color?: string;
  duotone?: boolean;
  onClick?: () => void;
}

export function Icon({ name, size = 16, strokeWidth = 1.75, className, style, color, duotone = false, onClick }: IconProps) {
  const paths = P[name];
  if (!paths) return null;
  const arr = Array.isArray(paths) ? paths : [paths];
  const interactiveProps = onClick
    ? { onClick, role: 'button' as const, style: { color, cursor: 'pointer', ...style } }
    : { 'aria-hidden': 'true' as const, style: color ? { color, ...style } : style };
  // Callers that never pass their own strokeWidth land on the 1.75 default —
  // for those (and any caller that happens to ask for 1.75 explicitly, which
  // is the same thing), drive the actual paint from the design system's
  // --icon-stroke-width token instead of a hardcoded number, so SuperAdmin's
  // Icons control affects every icon that hasn't deliberately opted into a
  // different weight (e.g. a bold 2.5 for an active nav icon).
  const pathStyle: React.CSSProperties | undefined =
    strokeWidth === 1.75 ? ({ strokeWidth: 'var(--icon-stroke-width, 1.75)' } as React.CSSProperties) : undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...interactiveProps}
    >
      {duotone
        ? arr.map((d, i) => (
            <React.Fragment key={i}>
              <path d={d} fill="currentColor" fillOpacity="0.15" stroke="none" />
              <path d={d} fill="none" stroke="currentColor" strokeWidth={strokeWidth} style={pathStyle} />
            </React.Fragment>
          ))
        : arr.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={strokeWidth} style={pathStyle} />
          ))
      }
    </svg>
  );
}
