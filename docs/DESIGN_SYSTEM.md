# Hudumika design system

The live design system is `apps/web/src/components/ui/`, backed by the
runtime tokens written by `useDesignSystem()` and scoped per app by
`WorkspaceApp`.

## Rules for new UI

- Use a primitive from `components/ui` before building markup by hand.
- Use `PageHeader` on ordinary pages. Full-screen workspace surfaces are the
  documented exception.
- Use `Button`, `Input`, `Select`, `Combobox`, `DatePicker`, `Badge`,
  `FeaturedIcon`, `Dialog`, and filter components for their named jobs.
- Do not hardcode a brand colour, radius, control height, shadow, or soft tint.
  Use the tokens below so tenant, app, density, shape, and theme settings work.
- Multi-step work belongs on a dedicated route. A genuinely small multi-step
  dialog must use `DialogContent size` or `steady`, `DialogHeader`,
  `DialogBody`, and `DialogFooter`.

## Token contract

| Purpose | Tokens |
| --- | --- |
| App accent | `--teal`, `--teal-l`, `--teal-m`, `--teal-fill` |
| Accessible filled action | `hsl(var(--primary))`, `hsl(var(--primary-foreground))` |
| Shape | `--radius`, `--r-sm`, `--r`, `--r-lg`, `--badge-radius` |
| Control density | `--ctl-h-xs`, `--ctl-h-sm`, `--ctl-h`, `--ctl-h-lg`; `--ds-btn-py-*`; `--ds-input-py` |
| Data density | `--ds-cell-py`, `--badge-*` |
| Elevation | `--elev-sm`, `--elev`, `--elev-lg` |
| Spacing | `--space-xs` through `--space-xl`, `--content-gap`, `--page-pad-x` |

`--teal` is an accent for text, borders, and tints. It is not a guaranteed
contrast-safe filled surface. Use the `--primary` pair for a labelled filled
action.

## Accessibility baseline

- Use real buttons for actions; never nest an interactive control inside a
  button or fake one with `role="button"`.
- Prefer Radix-backed primitives for menus, selects, dialogs, popovers, and
  keyboard dismissal/focus management.
- Associate labels, descriptions, and validation messages with controls using
  `FormField` / `FormControl` where React Hook Form is used.
- Do not use native `<select>` or date controls for new work; use `Select`,
  `Combobox`, `DatePicker`, or `DateRangePicker` as appropriate.

## Migration rule

Legacy `.btn`, `.input-field`, and page-local CSS remain in the product. Do
not add new usages. When touching an existing surface, migrate the control to
the live primitive or at minimum replace fixed shape/density/elevation values
with the token contract above. This keeps the migration incremental without
introducing a competing component system.
