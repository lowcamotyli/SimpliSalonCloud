import type { ModuleManifest } from './types'

export const MODULE_REGISTRY: ModuleManifest[] = []

export function getEnabledModules(enabledIds: string[]): ModuleManifest[] {
  const enabledIdSet = new Set(enabledIds)

  return MODULE_REGISTRY.filter((moduleManifest) => enabledIdSet.has(moduleManifest.id))
}

export function resolveWithDependencies(moduleIds: string[]): string[] {
  const registryById = new Map(
    MODULE_REGISTRY.map((moduleManifest) => [moduleManifest.id, moduleManifest]),
  )
  const resolved = new Set<string>()

  function visit(moduleId: string): void {
    if (resolved.has(moduleId)) {
      return
    }

    const moduleManifest = registryById.get(moduleId)

    if (moduleManifest) {
      for (const requiredModuleId of moduleManifest.requires) {
        visit(requiredModuleId)
      }
    }

    resolved.add(moduleId)
  }

  for (const moduleId of moduleIds) {
    visit(moduleId)
  }

  return Array.from(resolved)
}

export function detectConflicts(moduleIds: string[]): string[] {
  const activeModuleIds = new Set(moduleIds)
  const conflicts = new Set<string>()

  for (const moduleManifest of MODULE_REGISTRY) {
    if (!activeModuleIds.has(moduleManifest.id)) {
      continue
    }

    for (const conflictingModuleId of moduleManifest.conflicts) {
      if (!activeModuleIds.has(conflictingModuleId)) {
        continue
      }

      const pair = [moduleManifest.id, conflictingModuleId].sort().join(':')
      conflicts.add(pair)
    }
  }

  return Array.from(conflicts)
}
