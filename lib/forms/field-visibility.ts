import type { FormField } from '@/types/forms'

export type FormAnswers = Record<string, unknown>

export function isValuePresent(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  return true
}

export function isFieldVisible(
  field: Pick<FormField, 'conditionalShowIf'>,
  answers: FormAnswers
): boolean {
  if (!field.conditionalShowIf) {
    return true
  }

  const { fieldId, value } = field.conditionalShowIf
  const answer = answers[fieldId]

  if (Array.isArray(answer)) {
    return answer.includes(value)
  }

  if (typeof answer === 'boolean') {
    return answer === true && (value === 'true' || value === 'Tak')
  }

  return answer === value
}
