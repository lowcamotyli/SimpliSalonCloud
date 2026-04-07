'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface ShiftRule {
  id: string
  name: string
  rule_type: 'fixed' | 'alternating'
  template_a_id: string
  template_b_id: string | null
  days_of_week: number[]
  reference_week: string | null
  is_active: boolean
  template_a?: { name: string; color: string }
  template_b?: { name: string; color: string } | null
}

type CreateShiftRuleInput = {
  name: string
  rule_type: 'fixed' | 'alternating'
  template_a_id: string
  template_b_id?: string | null
  days_of_week: number[]
  reference_week?: string | null
  is_active?: boolean
}

type UpdateShiftRuleInput = Partial<{
  name: string
  rule_type: 'fixed' | 'alternating'
  template_a_id: string
  template_b_id: string | null
  days_of_week: number[]
  reference_week: string | null
  is_active: boolean
}>

type ApplyRulesResult = {
  created: number
  skipped: number
}

type UseShiftRulesResult = {
  rules: ShiftRule[]
  isLoading: boolean
  error: Error | null
  createRule: (data: CreateShiftRuleInput) => Promise<ShiftRule>
  updateRule: (ruleId: string, data: UpdateShiftRuleInput) => Promise<ShiftRule>
  deleteRule: (ruleId: string) => Promise<void>
  applyRules: (from: string, to: string) => Promise<ApplyRulesResult>
}

export function useShiftRules(employeeId: string): UseShiftRulesResult {
  const queryClient = useQueryClient()
  const queryKey = ['shift-rules', employeeId] as const

  const {
    data: rules,
    isLoading,
    error: queryError,
  } = useQuery<ShiftRule[], Error>({
    queryKey,
    enabled: employeeId.length > 0,
    queryFn: async (): Promise<ShiftRule[]> => {
      const response = await fetch(`/api/employees/${employeeId}/shift-rules`, {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Nie udalo sie pobrac regul zmian')
      }

      const json = (await response.json()) as { rules?: ShiftRule[] }
      return json.rules ?? []
    },
  })

  const createMutation = useMutation<ShiftRule, Error, CreateShiftRuleInput>({
    mutationFn: async (data): Promise<ShiftRule> => {
      const response = await fetch(`/api/employees/${employeeId}/shift-rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(errorPayload?.message ?? 'Nie udalo sie utworzyc reguly zmiany')
      }

      const json = (await response.json()) as { rule: ShiftRule }
      return json.rule
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const updateMutation = useMutation<
    ShiftRule,
    Error,
    { ruleId: string; data: UpdateShiftRuleInput }
  >({
    mutationFn: async ({ ruleId, data }): Promise<ShiftRule> => {
      const response = await fetch(`/api/employees/${employeeId}/shift-rules/${ruleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(errorPayload?.message ?? 'Nie udalo sie zaktualizowac reguly zmiany')
      }

      const json = (await response.json()) as { rule: ShiftRule }
      return json.rule
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (ruleId): Promise<void> => {
      const response = await fetch(`/api/employees/${employeeId}/shift-rules/${ruleId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(errorPayload?.message ?? 'Nie udalo sie usunac reguly zmiany')
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const applyMutation = useMutation<ApplyRulesResult, Error, { from: string; to: string }>({
    mutationFn: async ({ from, to }): Promise<ApplyRulesResult> => {
      const response = await fetch(`/api/employees/${employeeId}/shift-rules/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to }),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(errorPayload?.message ?? 'Nie udalo sie zastosowac regul zmian')
      }

      return (await response.json()) as ApplyRulesResult
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['employee-shifts', employeeId] })
    },
  })

  const createRule = async (data: CreateShiftRuleInput): Promise<ShiftRule> => {
    return createMutation.mutateAsync(data)
  }

  const updateRule = async (ruleId: string, data: UpdateShiftRuleInput): Promise<ShiftRule> => {
    return updateMutation.mutateAsync({ ruleId, data })
  }

  const deleteRule = async (ruleId: string): Promise<void> => {
    await deleteMutation.mutateAsync(ruleId)
  }

  const applyRules = async (from: string, to: string): Promise<ApplyRulesResult> => {
    return applyMutation.mutateAsync({ from, to })
  }

  return {
    rules: rules ?? [],
    isLoading,
    error: queryError ?? createMutation.error ?? updateMutation.error ?? deleteMutation.error ?? applyMutation.error ?? null,
    createRule,
    updateRule,
    deleteRule,
    applyRules,
  }
}
