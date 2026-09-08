import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Modeled on the Atlassian Design System checkbox (atlassian.design/
 * components/checkbox): a neutral, unaccented box at rest that only takes
 * the tenant accent once actually checked — not a box that's already
 * brand-colored while empty, which is what this rendered before (border-
 * primary at every state, checked or not). Every color/radius/shadow stays
 * a Hudumika token, never a value copied verbatim from Atlassian's own
 * palette — --border2 (neutral) and --primary/--primary-foreground (the
 * contrast-floor-derived accent pair) already exist for exactly this.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // rounded-(--r-sm), not rounded-sm — a raw Tailwind radius step is
      // exactly the "unreachable by the settings that exist to control it"
      // case CLAUDE.md calls out; the shape/density SuperAdmin setting has
      // to reach this control the same as every button and input does.
      "peer grid h-4 w-4 shrink-0 place-content-center rounded-(--r-sm) border-2 border-(--border2) bg-transparent transition-colors",
      "hover:border-primary/50",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--teal) focus-visible:ring-offset-1 focus-visible:ring-offset-(--card-bg,var(--white))",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // "Some but not all" (checked="indeterminate", e.g. a select-all
      // header checkbox with a partial selection below it) used to render
      // identically to unchecked — no background, no border colour — with
      // only a stray checkmark floating inside via the Indicator below,
      // since only data-[state=checked] had any styling. data-[state=
      // indeterminate] now gets the same filled treatment, distinguished by
      // a dash instead of a check.
      "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
      // A form's own validation state, not a Radix data-attribute — Tailwind
      // reads the standard HTML aria-invalid the same way it reads a
      // data-* selector, so a form only has to set the one real attribute.
      "aria-invalid:border-(--red) aria-invalid:data-[state=unchecked]:bg-(--red-l)",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("grid place-content-center text-current")}
    >
      {props.checked === 'indeterminate' ? <Minus className="h-3 w-3" strokeWidth={3} /> : <Check className="h-3 w-3" strokeWidth={3} />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
