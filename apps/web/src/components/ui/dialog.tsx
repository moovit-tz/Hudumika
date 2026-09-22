"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // z-3000, not a bespoke higher value — every Radix floating-content
      // primitive (Select, Popover/EntityPicker, Combobox, DropdownMenu,
      // DatePicker, Tooltip, Menubar, ContextMenu, HoverCard, Sheet, Drawer)
      // shares that one tier. A Select opened from inside an open Dialog
      // portals its content to document.body *after* the Dialog's own portal,
      // so equal z-index + later DOM order correctly paints it on top; this
      // used to be a bespoke z-[9999], which instead put every one of those
      // controls' dropdowns underneath the dialog's own opaque content the
      // moment they were opened from inside a dialog — invisible, and a click
      // on the (actually-on-top) DialogOverlay closed the whole dialog instead
      // of picking anything. Live-reproduced via elementFromPoint() before
      // this fix; every Select/EntityPicker inside every Dialog was affected.
      "ds-dialog-overlay fixed inset-0 z-3000",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * Fixed footprints for a dialog. `size` pins BOTH width and height so a
 * multi-step / tabbed dialog never resizes as the user moves between its
 * steps — the {@link DialogBody} scrolls instead. Values are clamped to the
 * viewport (`calc(100vw - 2rem)` / `90vh`). Omit `size` for the legacy
 * grow-to-fit behaviour (unchanged for every existing call site).
 */
export const DIALOG_SIZES = {
  sm: { width: 420, height: 420 },
  md: { width: 560, height: 600 },
  lg: { width: 720, height: 680 },
  xl: { width: 940, height: 780 },
} as const

export type DialogSize = keyof typeof DIALOG_SIZES | "full"

// Lets DialogHeader / DialogBody / DialogFooter know they're inside a
// steady-size dialog (so they pin / scroll) without every call site having
// to pass a prop down.
const DialogSizedContext = React.createContext(false)

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Suppress the built-in top-right ✕ so a dialog can place its own. */
    hideClose?: boolean
    /**
     * Pin the dialog to a fixed width + height that stays constant across
     * every step/tab. Pair with DialogHeader / DialogBody / DialogFooter —
     * the body is the only part that scrolls. See DIALOG_SIZES.
     */
    size?: DialogSize
    /**
     * Like `size` but without imposing a preset footprint: switch to the
     * pinned header / scrolling body / pinned footer layout and let the
     * caller set width and a *fixed* height via `className` / `style`. Use
     * when a dialog needs a bespoke width — the outcome (constant size
     * across steps) is the same.
     */
    steady?: boolean
  }
>(({ className, children, hideClose, size, steady, style, ...props }, ref) => {
  const preset = size != null && size !== "full" ? DIALOG_SIZES[size as keyof typeof DIALOG_SIZES] : null
  const sized = size != null || steady === true

  const sizeStyle: React.CSSProperties =
    size === "full"
      ? { width: "calc(100vw - 2rem)", height: "calc(100vh - 2rem)" }
      : preset
        ? {
            width: `min(${preset.width}px, calc(100vw - 2rem))`,
            height: `min(${preset.height}px, 90vh)`,
          }
        : {}

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // shared frame
          "ds-dialog-content fixed left-[50%] top-[50%] z-3000 border bg-card text-foreground shadow-[var(--elev-lg)] sm:rounded-(--r-lg) opacity-100",
          sized
            // steady-size: fixed box (via inline style below), only the body scrolls
            ? "flex flex-col overflow-hidden p-0"
            // legacy: grows to fit its content
            : "grid w-full max-w-lg gap-4 p-6",
          className
        )}
        style={{ opacity: 1, ...sizeStyle, ...style }}
        {...props}
      >
        <DialogSizedContext.Provider value={sized}>
          {children}
        </DialogSizedContext.Provider>
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-5 top-5 z-10 rounded-full p-1 opacity-70 ring-offset-background transition-colors hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const sized = React.useContext(DialogSizedContext)
  return (
    <div
      className={cn(
        sized
          ? "flex shrink-0 flex-col gap-3 border-b border-border px-6 pb-4 pt-6"
          : "flex flex-col space-y-1.5 text-center sm:text-left",
        className
      )}
      {...props}
    />
  )
}
DialogHeader.displayName = "DialogHeader"

/**
 * The scrolling region of a steady-size dialog. Everything that varies
 * between steps/tabs goes here; the dialog itself never changes size.
 */
const DialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", className)} {...props} />
)
DialogBody.displayName = "DialogBody"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const sized = React.useContext(DialogSizedContext)
  return (
    <div
      className={cn(
        sized
          ? "flex shrink-0 flex-row items-center justify-end gap-2 border-t border-border px-6 py-4"
          : "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className
      )}
      {...props}
    />
  )
}
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
