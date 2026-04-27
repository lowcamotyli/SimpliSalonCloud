'use client'

import * as React from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SelectProps } from '@/lib/themes/types'

function toSelectValue(value: SelectProps['value'] | SelectProps['defaultValue']) {
  if (value === undefined || value === null || Array.isArray(value)) {
    return undefined
  }

  return String(value)
}

export default function DefaultSelect({
  value,
  defaultValue,
  onChange,
  placeholder,
  options = [],
  className,
  disabled,
  name,
  required,
  id,
}: SelectProps) {
  return (
    <Select
      value={toSelectValue(value)}
      defaultValue={toSelectValue(defaultValue)}
      onValueChange={(nextValue) => {
        onChange?.({
          target: { value: nextValue, name },
          currentTarget: { value: nextValue, name },
        } as React.ChangeEvent<HTMLSelectElement>)
      }}
      disabled={disabled}
      name={name}
      required={required}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
