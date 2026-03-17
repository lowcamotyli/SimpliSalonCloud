import fs from 'fs';
import path from 'path';

const dir = 'generated/form-templates';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'report.json' && f !== 'compliance-review-summary.json');

let updated = 0;

for (const f of files) {
  const filePath = path.join(dir, f);
  const art = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const dc = art.dataCategory;
  const needsConsent = dc === 'health' || dc === 'sensitive_health';
  if (needsConsent && art.requiresHealthConsent !== true) {
    art.requiresHealthConsent = true;
    fs.writeFileSync(filePath, JSON.stringify(art, null, 2), 'utf8');
    updated++;
  }
}

console.log(`Updated ${updated} artifacts with requiresHealthConsent: true`);
