import fs from 'fs';
import path from 'path';

const dir = 'generated/form-templates';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'report.json' && f !== 'compliance-review-summary.json');

let missingConsent = [];

for (const f of files) {
  const art = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const dc = art.dataCategory;
  const needsConsent = dc === 'health' || dc === 'sensitive_health';
  const hasConsent = art.requiresHealthConsent === true;
  if (needsConsent && !hasConsent) {
    missingConsent.push({ slug: f.replace('.json', ''), dataCategory: dc });
  }
}

if (missingConsent.length === 0) {
  console.log('✓ All health/sensitive_health artifacts have requiresHealthConsent: true');
} else {
  console.log(`⚠ ${missingConsent.length} artifacts missing requiresHealthConsent: true`);
  missingConsent.slice(0, 10).forEach(a => console.log(' -', a.slug, `(${a.dataCategory})`));
  if (missingConsent.length > 10) console.log(`  ... and ${missingConsent.length - 10} more`);
}
