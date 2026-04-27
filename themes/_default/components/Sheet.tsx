'use client'

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { SheetProps } from '@/lib/themes/types'

export default function DefaultSheet({
  open,
  onOpenChange,
  side,
  title,
  description,
  children,
  footer,
  className,
}: SheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={className}>
        {(title || description) && (
          <SheetHeader>
            {title && <SheetTitle>{title}</SheetTitle>}
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        )}
        {children}
        {footer && <SheetFooter>{footer}</SheetFooter>}
        <SheetClose />
      </SheetContent>
    </Sheet>
  )
}
