import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"
import "./ds-tabs.css"

/**
 * Tabs, styled from design-system tokens rather than fixed Tailwind classes.
 *
 * `--tab-radius`, `--tab-height` and `--tab-size` come from the token writer in
 * useDesignSystem.ts, and `data-tabs` on <html> selects the variant. The variant
 * changes layout, not just values — an underline has no track, a pill does —
 * which a CSS variable alone cannot express, hence the attribute. All six
 * variants live in ds-tabs.css instead of being spread through class strings:
 *   underline  a rule under the row, active tab sits on it
 *   pill       tinted track, active tab filled with the tenant accent
 *   segmented  sunken track, active tab raised white — an iOS-style control
 *   boxed      discrete bordered chips, active chip gets a tinted fill
 *   outline    discrete chips, active chip reads through its border alone
 *   lifted     browser-tab style — active tab rises to meet the panel below
 *
 * The `variant` prop overrides the platform default for one instance where a
 * page genuinely needs it; leaving it unset is the norm.
 *
 * Icon + label + a count badge (a plain child `<span>`, not a prop) is a
 * composition pattern any variant supports — see ShipmentDetail.tsx or
 * DesignSystemView's own "filter row" example — not a separate variant of
 * its own, since it changes what's inside a trigger, not the trigger's own
 * track/fill/border treatment. Wrap the label text itself in a
 * `.ds-tabs-trigger-label` span and it collapses to icon-only under 560px
 * (ds-tabs.css) — flyonui's "pills with icon" mobile behavior, opt-in and
 * variant-agnostic rather than a seventh CSS identity.
 */
export type TabsVariant = "underline" | "pill" | "segmented" | "boxed" | "outline" | "lifted"

const VariantContext = React.createContext<TabsVariant | undefined>(undefined)

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & { variant?: TabsVariant }
>(({ variant, ...props }, ref) => (
  <VariantContext.Provider value={variant}>
    <TabsPrimitive.Root ref={ref} {...props} />
  </VariantContext.Provider>
))
Tabs.displayName = TabsPrimitive.Root.displayName

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(VariantContext)
  return (
    <TabsPrimitive.List
      ref={ref}
      data-variant={variant}
      className={cn("ds-tabs-list", className)}
      {...props}
    />
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(VariantContext)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-variant={variant}
      className={cn("ds-tabs-trigger", className)}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("ds-tabs-content", className)} {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
