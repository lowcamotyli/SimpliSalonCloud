'use client'

import * as React from 'react'

import type { ComponentRegistry } from './types'

const registryKeys = [
  'PageHeader',
  'Card',
  'CardHeader',
  'Section',
  'Input',
  'Select',
  'Textarea',
  'Checkbox',
  'Switch',
  'DatePicker',
  'DateRangePicker',
  'TimePicker',
  'FormField',
  'FormLabel',
  'FormMessage',
  'Button',
  'IconButton',
  'DropdownMenu',
  'Badge',
  'Alert',
  'Toast',
  'Tooltip',
  'DataTable',
  'Avatar',
  'EmptyState',
  'StatCard',
  'FileUpload',
  'Tabs',
  'TabsList',
  'TabsTrigger',
  'TabsContent',
  'Breadcrumb',
  'Sidebar',
  'Modal',
  'Sheet',
  'ConfirmDialog',
  'Skeleton',
  'Spinner',
] satisfies Array<keyof ComponentRegistry>

export const ComponentRegistryContext = React.createContext<Partial<ComponentRegistry>>({})

function assertComponentRegistry(registry: Partial<ComponentRegistry>): asserts registry is ComponentRegistry {
  const missingKeys = registryKeys.filter((key) => registry[key] === undefined)

  if (missingKeys.length > 0) {
    throw new Error(`Theme component registry is missing: ${missingKeys.join(', ')}`)
  }
}

export function useComponents(): ComponentRegistry {
  const registry = React.useContext(ComponentRegistryContext)
  assertComponentRegistry(registry)
  return registry
}

interface ComponentRegistryProviderProps {
  registry: ComponentRegistry
  children: React.ReactNode
}

export function ComponentRegistryProvider({ registry, children }: ComponentRegistryProviderProps) {
  return <ComponentRegistryContext.Provider value={registry}>{children}</ComponentRegistryContext.Provider>
}
