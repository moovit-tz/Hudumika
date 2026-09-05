import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Icon, type IconName } from "../Icon.js"

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
        // Soft-tint semantic banners — same six variants and same
        // background-tint/matching-text-hue convention as Badge
        // (ui/badge.tsx), reusing the app's --green/--gold/--red/--blue/
        // --teal tokens rather than a second, competing colour scheme.
        // This is the variant set 139+ pages hand-roll independently
        // instead of reaching for (see Banner below).
        brand:   "border-transparent bg-[var(--teal-l)] text-[var(--teal)] [&>svg]:text-[var(--teal)]",
        success: "border-transparent bg-[var(--green-l)] text-[var(--green)] [&>svg]:text-[var(--green)]",
        warning: "border-transparent bg-[var(--gold-l)] text-[var(--gold)] [&>svg]:text-[var(--gold)]",
        error:   "border-transparent bg-[var(--red-l)] text-[var(--red)] [&>svg]:text-[var(--red)]",
        info:    "border-transparent bg-[var(--blue-l)] text-[var(--blue)] [&>svg]:text-[var(--blue)]",
        gray:    "border-transparent bg-muted text-muted-foreground [&>svg]:text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

// ── Banner ──────────────────────────────────────────────────────────────────
// The composite most callers actually want: icon + message + optional
// dismiss/action, one call, matching-hue everything. Built on Alert rather
// than beside it — 139+ pages each hand-roll this exact shape (a tinted
// <div> with background/border/color picked by hand per call site) instead
// of a single shared component, which is exactly how "Success" ends up a
// different colour on different pages with no semantic reason for it.
const BANNER_ICONS: Record<'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray', IconName> = {
  brand: 'info',
  success: 'checkCircle',
  warning: 'alertTriangle',
  error: 'xCircle',
  info: 'info',
  gray: 'info',
};

export interface BannerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray';
  /** Pass false to omit the leading icon entirely; a specific IconName to override the per-variant default. */
  icon?: IconName | false;
  title?: React.ReactNode;
  /** The banner's own text — prefer this over passing raw children when there's no title, so spacing stays consistent. */
  children: React.ReactNode;
  /** Renders a trailing action (a Button, a link) inline with the message. */
  action?: React.ReactNode;
  /** Renders a dismiss (×) control; called when the viewer closes the banner. */
  onDismiss?: () => void;
}

function Banner({ variant = 'info', icon, title, children, action, onDismiss, className, style, ...props }: BannerProps) {
  const iconName = icon === false ? null : (icon ?? BANNER_ICONS[variant]);
  return (
    <Alert
      variant={variant}
      className={cn('flex items-start gap-3 [&>svg]:static [&>svg]:top-auto [&>svg]:left-auto [&>svg~*]:pl-0', className)}
      style={{ borderRadius: 'var(--r)', ...style }}
      {...props}
    >
      {iconName && <Icon name={iconName} size={17} strokeWidth={2} className="mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        {title && <AlertTitle className="mb-0.5">{title}</AlertTitle>}
        <AlertDescription className="text-current opacity-90">{children}</AlertDescription>
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 -m-1 p-1 rounded opacity-60 hover:opacity-100 transition-opacity"
        >
          <Icon name="x" size={15} strokeWidth={2} />
        </button>
      )}
    </Alert>
  );
}

export { Alert, AlertTitle, AlertDescription, Banner }
