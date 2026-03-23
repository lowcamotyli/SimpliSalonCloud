'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'

type AccordionType = 'single' | 'multiple'

interface AccordionContextValue {
  type: AccordionType
  openValues: string[]
  toggleValue: (value: string) => void
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null)
const AccordionItemContext = React.createContext<{ value: string } | null>(null)

type AccordionValue = string | string[] | undefined

const normalizeValue = (value: AccordionValue, type: AccordionType): string[] => {
  if (value === undefined) return []
  if (Array.isArray(value)) return value
  return type === 'multiple' ? [value] : [value]
}

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: AccordionType
  defaultValue?: AccordionValue
}

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  ({ className, type = 'single', defaultValue, ...props }, ref) => {
    const [openValues, setOpenValues] = React.useState<string[]>(() =>
      normalizeValue(defaultValue, type)
    )

    const toggleValue = React.useCallback(
      (value: string) => {
        setOpenValues((prev) => {
          const isOpen = prev.includes(value)
          if (type === 'single') {
            return isOpen ? [] : [value]
          }
          if (isOpen) {
            return prev.filter((v) => v !== value)
          }
          return [...prev, value]
        })
      },
      [type]
    )

    return (
      <AccordionContext.Provider value={{ type, openValues, toggleValue }}>
        <div ref={ref} className={cn('w-full', className)} {...props} />
      </AccordionContext.Provider>
    )
  }
)
Accordion.displayName = 'Accordion'

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ className, value, ...props }, ref) => {
    return (
      <AccordionItemContext.Provider value={{ value }}>
        <div ref={ref} className={className} {...props} />
      </AccordionItemContext.Provider>
    )
  }
)
AccordionItem.displayName = 'AccordionItem'

const useAccordionState = () => {
  const accordion = React.useContext(AccordionContext)
  const item = React.useContext(AccordionItemContext)

  if (!accordion || !item) {
    throw new Error('Accordion components must be used within Accordion and AccordionItem')
  }

  const isOpen = accordion.openValues.includes(item.value)
  return { ...accordion, ...item, isOpen }
}

const AccordionTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => {
    const { value, isOpen, toggleValue } = useAccordionState()

    return (
      <button
        ref={ref}
        type="button"
        aria-expanded={isOpen}
        onClick={() => toggleValue(value)}
        className={cn(
          'flex w-full items-center justify-between py-4 text-left transition-all',
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
AccordionTrigger.displayName = 'AccordionTrigger'

const AccordionContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { isOpen } = useAccordionState()

    if (!isOpen) {
      return null
    }

    return (
      <div ref={ref} className={cn('overflow-hidden', className)} {...props}>
        {children}
      </div>
    )
  }
)
AccordionContent.displayName = 'AccordionContent'

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
