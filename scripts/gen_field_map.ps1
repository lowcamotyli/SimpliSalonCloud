$prompt = @"
Generate a TypeScript file. Output ONLY valid TypeScript. No markdown, no explanations, no code fences.
Rewrite this content exactly as valid TypeScript (fix any syntax issues but keep all data):

import type { FieldType } from '@/types/forms'

export interface FieldMapEntry {
  id: string
  type: FieldType
  labelPatterns: string[]
  options?: string[]
  required: boolean
  isHealthField: boolean
  isSensitiveField: boolean
}

export const FIELD_MAP: FieldMapEntry[] = [
  { id: 'full_name', type: 'text', labelPatterns: ['imie i nazwisko', 'imie', 'imie', 'nazwisko'], required: true, isHealthField: false, isSensitiveField: false },
  { id: 'birthday', type: 'date', labelPatterns: ['data urodzenia', 'urodzenia', 'birth', 'urodzin'], required: false, isHealthField: false, isSensitiveField: false },
  { id: 'phone', type: 'text', labelPatterns: ['telefon', 'numer telefonu', 'phone', 'tel'], required: true, isHealthField: false, isSensitiveField: false },
  { id: 'allergies', type: 'radio', labelPatterns: ['uczulony', 'alergia', 'alerg'], options: ['Tak', 'Nie'], required: false, isHealthField: true, isSensitiveField: false },
  { id: 'medications', type: 'radio', labelPatterns: ['leki na stale', 'przyjmuje leki'], options: ['Tak', 'Nie'], required: false, isHealthField: true, isSensitiveField: false },
  { id: 'pregnancy', type: 'radio', labelPatterns: ['ciaza', 'w ciazy'], options: ['Tak', 'Nie', 'Nie dotyczy'], required: false, isHealthField: true, isSensitiveField: false },
  { id: 'signature', type: 'signature', labelPatterns: ['podpis', 'signature'], required: true, isHealthField: false, isSensitiveField: false },
]
"@

$outputPath = 'D:/SimpliSalonCLoud/lib/forms/import-field-map.ts'
$geminiOutput = $prompt | gemini.cmd -p $prompt --output-format text |
  Where-Object { $_ -notmatch '^Loaded( cached)?' }

$geminiOutput | Set-Content $outputPath -Encoding UTF8
Write-Host ('Lines written: ' + (Get-Content $outputPath).Count)
