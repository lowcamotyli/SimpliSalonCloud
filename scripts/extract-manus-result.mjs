import { readFileSync, writeFileSync } from 'fs';

const raw = readFileSync('generated/compliance-classification.json', 'utf8');
const data = JSON.parse(raw);

let jsonText = null;

for (const msg of data) {
  if (msg.role === 'assistant' && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      const text = block.text || '';
      // Strip markdown code block if present
      const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/, '').trim();
      if (stripped.startsWith('[')) {
        jsonText = stripped;
        break;
      }
    }
  }
  if (jsonText) break;
}

if (!jsonText) {
  console.error('Could not find JSON array in response');
  process.exit(1);
}

const parsed = JSON.parse(jsonText);
writeFileSync('generated/compliance-classification.json', JSON.stringify(parsed, null, 2));
console.log(`Extracted ${parsed.length} entries`);

const stats = { general: 0, health: 0, sensitive_health: 0, reviewRequired: 0 };
for (const item of parsed) {
  stats[item.dataCategory] = (stats[item.dataCategory] || 0) + 1;
  if (item.reviewRequired) stats.reviewRequired++;
}
console.log('Stats:', stats);
console.log('\nReview required:');
parsed.filter(i => i.reviewRequired).forEach(i => console.log(' -', i.sourceFile, ':', i.reviewNotes.join('; ')));
