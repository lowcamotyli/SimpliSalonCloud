// Fix CP1250 mojibake in upgrade/page.tsx
// The file was read as CP1250 by Codex and re-encoded as UTF-8, corrupting Polish chars + emojis
import { readFileSync, writeFileSync } from 'fs'

const path = 'd:/SimpliSalonCLoud/app/(dashboard)/[slug]/billing/upgrade/page.tsx'
let content = readFileSync(path, 'utf8')

// Each pair: [corrupted (2-char sequence), correct single char]
// Derived from: UTF-8 bytes read as CP1250 then re-encoded
const charFixes = [
  // Ĺ‚ → ł  (U+0139 + U+201A → U+0142)
  ['\u0139\u201a', '\u0142'],
  // Ĺ› → ś  (U+0139 + U+203A → U+015B)
  ['\u0139\u203a', '\u015b'],
  // Ĺ„ → ń  (U+0139 + U+201E → U+0144)
  ['\u0139\u201e', '\u0144'],
  // Ä™ → ę  (U+00C4 + U+2122 → U+0119)
  ['\u00c4\u2122', '\u0119'],
  // Ä… → ą  (U+00C4 + U+2026 → U+0105)
  ['\u00c4\u2026', '\u0105'],
]

// Multi-char fixes (symbols and emojis)
const symbolFixes = [
  // ⚠ (U+26A0, UTF-8: E2 9A A0 → â + š + NBSP)
  ['\u00e2\u0161\u00a0', '\u26a0'],
  // — em dash (U+2014, UTF-8: E2 80 94 → â + € + ")
  ['\u00e2\u20ac\u201d', '\u2014'],
  // ✓ checkmark (U+2713, UTF-8: E2 9C 93 → â + ś + ")
  ['\u00e2\u015b\u201c', '\u2713'],
  // 💳 credit card (U+1F4B3 → ð + ź + ' + ł)
  ['\u00f0\u017a\u2019\u0142', '\uD83D\uDCB3'],
  // 📱 phone (U+1F4F1 → ð + ź + " + ±)
  ['\u00f0\u017a\u201c\u00b1', '\uD83D\uDCF1'],
  // 🏦 bank (U+1F3E6 → ð + ź + Ź + ¦)
  ['\u00f0\u017a\u0179\u00a6', '\uD83C\uDFE6'],
]

let count = 0
for (const [corrupted, correct] of [...symbolFixes, ...charFixes]) {
  const before = content
  content = content.split(corrupted).join(correct)
  const fixed = (content !== before)
  if (fixed) {
    const n = before.split(corrupted).length - 1
    console.log(`Fixed ${n}x: ${JSON.stringify(corrupted)} → ${JSON.stringify(correct)}`)
    count += n
  }
}

writeFileSync(path, content, 'utf8')
console.log(`\nTotal: ${count} replacements made`)
