'use client'

import React from 'react'

type SlotProps = Record<string, unknown>
type SlotFiller = React.ComponentType<SlotProps>

export const ModuleSlotRegistry: Map<string, SlotFiller> = new Map<string, SlotFiller>()

export interface ModuleSlotProps {
  moduleId: string
  slotId: string
  props?: SlotProps
}

export function registerSlotFiller(key: string, component: SlotFiller): void {
  ModuleSlotRegistry.set(key, component)
}

export function ModuleSlot({
  moduleId,
  slotId,
  props = {},
}: ModuleSlotProps): React.ReactElement | null {
  const Filler = ModuleSlotRegistry.get(`${moduleId}:${slotId}`)

  if (!Filler) {
    return null
  }

  return React.createElement(Filler, props)
}
