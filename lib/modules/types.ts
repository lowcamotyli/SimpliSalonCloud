import type React from 'react'
import type { ZodSchema } from 'zod'

export type ModuleCategory =
  | 'scheduling'
  | 'hr'
  | 'sales'
  | 'operations'
  | 'integrations'

export type BusinessProfile =
  | 'beauty_salon'
  | 'gym'
  | 'medical'
  | 'workshop'
  | 'agency'
  | 'custom'

type Permission = string

export interface NavItem {
  path: string
  label: string
  icon: string
  permission?: Permission
  children?: NavItem[]
}

export interface SlotDefinition {
  id: string
  description: string
  props: ZodSchema
}

export interface PermissionDefinition {
  id: string
  label: string
  description: string
}

export interface ModuleLifecycle {
  onInstall(workspaceId: string): Promise<void>
  onUninstall(workspaceId: string, strategy: 'soft' | 'hard'): Promise<void>
  onUpgrade(workspaceId: string, fromVersion: string): Promise<void>
  healthCheck(workspaceId: string): Promise<{
    status: 'healthy' | 'degraded' | 'error'
    checks: Record<string, boolean>
  }>
}

export interface ModuleManifest {
  id: string
  name: string
  description: string
  version: string
  icon: string
  category: ModuleCategory
  requires: string[]
  enhances: string[]
  conflicts: string[]
  recommendedFor: BusinessProfile[]
  configSchema: ZodSchema
  defaultConfig: unknown
  navItems: NavItem[]
  permissions: PermissionDefinition[]
  defaultRolePermissions: Record<'owner' | 'manager' | 'employee', Permission[]>
  slots: Record<string, SlotDefinition>
  fills: Record<string, React.ComponentType<Record<string, unknown>>>
  emits: string[]
  handles: string[]
  migrations: string[]
  seedScript?: string
  lifecycle: ModuleLifecycle
}
