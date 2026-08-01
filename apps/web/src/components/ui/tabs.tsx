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
 * which a CSS variable alone cannot express, hence the attribute. All three
 * variants live in ds-tabs.css instead of being spread through class strings.
 *
 * The `variant` prop overrides the platform default for one instance where a
 * page genuinely needs it; leaving it unset is the norm.
 */
export type TabsVariant = "underline" | "pill" | "segmented"

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
