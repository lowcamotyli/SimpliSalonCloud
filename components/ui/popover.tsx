"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type PopoverContextValue = {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null)

function usePopoverContext(component: string) {
  const context = React.useContext(PopoverContext)

  if (!context) {
    throw new Error(`${component} must be used within Popover`)
  }

  return context
}

type PopoverProps = {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function Popover({ children, open: openProp, onOpenChange }: PopoverProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : internalOpen

  const setOpen = React.useCallback(
    (next: React.SetStateAction<boolean>) => {
      const resolved = typeof next === "function" ? next(open) : next
      if (!isControlled) {
        setInternalOpen(resolved)
      }
      onOpenChange?.(resolved)
    },
    [isControlled, onOpenChange, open]
  )

  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </PopoverContext.Provider>
  )
}

type PopoverTriggerProps = React.HTMLAttributes<HTMLElement> & {
  asChild?: boolean
  children: React.ReactElement
}

const PopoverTrigger = React.forwardRef<HTMLElement, PopoverTriggerProps>(
  ({ asChild = false, children, ...props }, ref) => {
    const { open, setOpen } = usePopoverContext("PopoverTrigger")

    const child = React.Children.only(children)

    if (asChild) {
      return React.cloneElement(child, {
        ...props,
        ref,
        "aria-expanded": open,
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          child.props.onClick?.(event)
          if (!event.defaultPrevented) {
            setOpen(!open)
          }
        },
      })
    }

    return React.createElement(
      "button",
      {
        ...props,
        ref,
        type: "button",
        "aria-expanded": open,
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          props.onClick?.(event)
          if (!event.defaultPrevented) {
            setOpen(!open)
          }
        },
      },
      child
    )
  }
)

PopoverTrigger.displayName = "PopoverTrigger"

type PopoverContentProps = React.HTMLAttributes<HTMLDivElement> & {
  align?: "start" | "center" | "end"
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = "center", ...props }, ref) => {
    const { open } = usePopoverContext("PopoverContent")

    if (!open) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(
          "absolute z-50 mt-2 w-80 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none",
          align === "start" && "left-0",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "end" && "right-0",
          className
        )}
        {...props}
      />
    )
  }
)

PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverContent, PopoverTrigger }
