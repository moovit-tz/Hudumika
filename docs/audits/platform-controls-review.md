# Platform button and field review

Reviewed 871 TSX sources: 669 page files and 202 component files. The inventory contains 3,005 shared Button instances and 2,489 native buttons; 2,440 native buttons are linked to the existing design-system mechanism. Remaining native buttons include specialized controls and require contextual review rather than blanket geometry replacement.

## Changes

- Connected shared fields and 1,124 legacy native fields to global configurator tokens for height, padding, radius, borders, typography and light/dark surfaces.
- Replaced over 2,000 static control style values with existing design tokens. Retained reserved icon padding, semantic colors and specialized control geometry.
- Added legacy native action markers and bare-field exemptions for embedded searches/editors.
- Removed frozen register toolbar heights and fonts; matched search, filters and actions, including mobile wrapping.
- Preserved circular switchers, avatars, steppers, calendar/editor controls, provider branding and expandable fields.

## Verification and limits

The browser runner renders the actual shared primitives and the Bills-style register toolbar. It checks 36 desktop/mobile, light/dark, density and radius combinations, plus search/filter/select/input interactions. This is shared-component coverage, not a visual inspection or functional certification of all 669 page files. Private CSS and dynamic per-page styles may still need contextual follow-up. Source inventory and browser measurements are recorded in the companion JSON files.
