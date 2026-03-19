'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths } from 'date-fns'
import { pl } from 'date-fns/locale'

interface MiniCalendarProps {
  currentDate: Date
  onDayClick: (date: Date) => void
}

const WEEK_DAYS = ['Pn', 'Wt', 'Sr', 'Cz', 'Pt', 'Sb', 'Nd']

export default function MiniCalendar({ currentDate, onDayClick }: MiniCalendarProps) {
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(currentDate))

  useEffect(() => {
    setDisplayMonth(startOfMonth(currentDate))
  }, [currentDate])

  const today = new Date()

  const days = useMemo(() => {
    const monthStart = startOfMonth(displayMonth)
    const monthEnd = endOfMonth(displayMonth)
    const currentMonthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
    const leadingDaysCount = (monthStart.getDay() + 6) % 7
    const trailingDaysCount = (7 - ((leadingDaysCount + currentMonthDays.length) % 7)) % 7

    const leadingDays = Array.from({ length: leadingDaysCount }, (_, index) => {
      const dayNumber = index - leadingDaysCount + 1
      return new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNumber)
    })

    const trailingDays = Array.from({ length: trailingDaysCount }, (_, index) => {
      return new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + index + 1)
    })

    return [...leadingDays, ...currentMonthDays, ...trailingDays]
  }, [displayMonth])

  return (
    <div className="rounded-xl border bg-background/80 p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setDisplayMonth((prev) => addMonths(prev, -1))}
          aria-label="Poprzedni miesiac"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-semibold capitalize">
          {format(displayMonth, 'LLLL yyyy', { locale: pl })}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setDisplayMonth((prev) => addMonths(prev, 1))}
          aria-label="Nastepny miesiac"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {WEEK_DAYS.map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isToday = isSameDay(day, today)
          const isSelected = isSameDay(day, currentDate)
          const isCurrentMonth = isSameMonth(day, displayMonth)

          return (
            <Button
              key={day.toISOString()}
              type="button"
              variant="ghost"
              className={cn(
                'h-9 w-full rounded-md p-0 text-sm font-medium transition-all duration-200',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground'
                  : isToday
                    ? 'text-primary font-bold hover:bg-accent hover:text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground',
                !isCurrentMonth && !isToday && !isSelected && 'text-muted-foreground opacity-40'
              )}
              onClick={() => onDayClick(day)}
              aria-label={format(day, 'PPPP', { locale: pl })}
              aria-pressed={isSelected}
            >
              {format(day, 'd')}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
