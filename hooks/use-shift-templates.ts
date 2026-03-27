'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface ShiftTemplate {
  id: string
  name: string
  start_time: string
  end_time: string
  color: string
  is_active: boolean
}

type CreateShiftTemplateInput = {
  name: string
  start_time: string
  end_time: string
  color: string
}

type UpdateShiftTemplateInput = Partial<{
  name: string
  start_time: string
  end_time: string
  color: string
  is_active: boolean
}>

type UseShiftTemplatesResult = {
  templates: ShiftTemplate[]
  isLoading: boolean
  error: Error | null
  createTemplate: (data: CreateShiftTemplateInput) => Promise<ShiftTemplate>
  updateTemplate: (id: string, data: UpdateShiftTemplateInput) => Promise<ShiftTemplate>
  deleteTemplate: (id: string) => Promise<void>
}

export function useShiftTemplates(): UseShiftTemplatesResult {
  const queryClient = useQueryClient()
  const queryKey = ['shift-templates'] as const

  const {
    data: templates,
    isLoading,
    error: queryError,
  } = useQuery<ShiftTemplate[], Error>({
    queryKey,
    queryFn: async (): Promise<ShiftTemplate[]> => {
      const response = await fetch('/api/shift-templates', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Nie udalo sie pobrac szablonow zmian')
      }

      const json = (await response.json()) as { templates?: ShiftTemplate[] }
      return json.templates ?? []
    },
  })

  const createMutation = useMutation<ShiftTemplate, Error, CreateShiftTemplateInput>({
    mutationFn: async (data): Promise<ShiftTemplate> => {
      const response = await fetch('/api/shift-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(errorPayload?.message ?? 'Nie udalo sie utworzyc szablonu zmiany')
      }

      const json = (await response.json()) as { template: ShiftTemplate }
      return json.template
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const updateMutation = useMutation<
    ShiftTemplate,
    Error,
    { id: string; data: UpdateShiftTemplateInput }
  >({
    mutationFn: async ({ id, data }): Promise<ShiftTemplate> => {
      const response = await fetch(`/api/shift-templates/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(errorPayload?.message ?? 'Nie udalo sie zaktualizowac szablonu zmiany')
      }

      const json = (await response.json()) as { template: ShiftTemplate }
      return json.template
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id): Promise<void> => {
      const response = await fetch(`/api/shift-templates/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(errorPayload?.message ?? 'Nie udalo sie usunac szablonu zmiany')
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const createTemplate = async (data: CreateShiftTemplateInput): Promise<ShiftTemplate> => {
    return createMutation.mutateAsync(data)
  }

  const updateTemplate = async (
    id: string,
    data: UpdateShiftTemplateInput
  ): Promise<ShiftTemplate> => {
    return updateMutation.mutateAsync({ id, data })
  }

  const deleteTemplate = async (id: string): Promise<void> => {
    await deleteMutation.mutateAsync(id)
  }

  return {
    templates: templates ?? [],
    isLoading,
    error: queryError ?? createMutation.error ?? updateMutation.error ?? deleteMutation.error ?? null,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  }
}
