export type TemplateRenderMode = 'email-safe' | 'sms-safe'

export type TemplateRenderData = Record<string, string | number | boolean | null | undefined>

const PLACEHOLDER_REGEX = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toSafeValue(value: unknown, mode: TemplateRenderMode): string {
  const raw = value == null ? '' : String(value)

  if (mode === 'email-safe') {
    return escapeHtml(raw)
  }

  // SMS-safe: flatten whitespace and strip control characters.
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function renderTemplate(
  template: string,
  data: TemplateRenderData,
  mode: TemplateRenderMode = 'email-safe'
): string {
  if (typeof template !== 'string') {
    throw new Error('Template must be a string')
  }

  if (!template) {
    return ''
  }

  return template.replace(PLACEHOLDER_REGEX, (_, key: string) => {
    const value = data[key]
    return toSafeValue(value, mode)
  })
}

