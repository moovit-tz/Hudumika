# Tabs, strips, buttons and shape audit

Scope: all 562 page TSX files and 182 component TSX files. The machine-readable
inventory records each file rather than extrapolating from a few screens.
Source coverage does not imply manual verification of every route or backend
action. Existing changes from the earlier production audit were preserved.

## Findings and implementation

| Finding | Repair |
|---|---|
| Pill/segmented/boxed/outline tabs subtracted 6–8px from the configured height | All variants resolve height through a shared 44px minimum |
| Boxed/outline tabs forced 999px corners and fixed border widths | Selected global tab radius and border weight now apply |
| Per-instance variant CSS and local presentation bypassed the global format | Removed override selectors and 107 local declarations across 10 page stylesheets |
| A legacy class-name bridge also matched Radix root containers | Explicitly exclude roots and the customer navigation exception |
| 26 reviewed tab-only rows used anonymous inline layouts | Added explicit strip markers and selected-state markers, preserving handlers |
| Thousands of native buttons bypassed shared geometry | Connected 2,742 native buttons across 436 files to shared geometry |
| Menus, filters, cards and popovers mixed corner scales | Apply the global shape scale at their shared semantic boundaries |
| Mobile icon-label tabs hid readable labels | Keep labels and scroll long rows |
| Native strip keyboard navigation was inconsistent | Add focus-only arrow/Home/End handling; Radix continues to own shared tab focus |
| SMS inbox fixed its conversation pane at 360px on phones | Use the global responsive breakpoint to stack panes and bound the thread list |

The CRM customer navigation format remains intentionally unchanged. Avatars,
switches, checkboxes and radios retain the geometry of their own primitives.
Button typography, submit types and action handlers were not rewritten.

The supplied [Dreams Core tab examples](https://dreamscore.dreamstechnologies.com/tailwind/ui-nav-tabs.html)
informed separation of active/inactive/disabled states and navigation surfaces.
Hudumika's selected tokens remain authoritative; no external component library
or stylesheet was added.

## Verification

The six variants were exercised through the live design-system page, then the
original `outline` selection was restored. All preview triggers measured 44px;
boxed/outline corners measured the configured 8px. Radix ArrowRight switched
Overview to Declarations. Responsive and cross-app observations are recorded
in the companion browser evidence JSON. Build/type checks and design-contract
checks are recorded with their actual outcomes; they do not certify every
business action or the platform's wider production readiness.

Final API and web TypeScript checks passed. The repository trigger checker
passed with 92 registered/emitted events; 18 design-contract checks, encoding
validation and `git diff --check` passed. The root command initially hit the
known sandbox Windows account lookup error in `tsx`; running the same command
outside that sandbox passed. Production frontend builds passed, with existing
large-chunk and mixed static/dynamic API-import warnings remaining.

Browser checks covered the six variants, Radix keyboard activation, eSign
navigation/filter menus at desktop and 390px, settled dark-mode token
inheritance, CRM's preserved customer strip, and native SMS strip
Left/Right/Enter operation. The SMS search field now fits within the phone
viewport instead of being clipped by the fixed pane.
