const fs = require('fs');

const overrides = {
  'dr-n-med-izabela-za-eska-mezoterapia-z-publikacji-mezoterapia-w-praktyce': 'sensitive_health',
  'dr-n-med-izabela-za-eska-stymulatory-z-publikacji-stymulatory-tkankowe-w-medycynie-estetycznej': 'sensitive_health',
  'kosmetologia-naqua-protoko-po-zabiegach-uszkadzajacych-naskorek': 'health',
  'kosmetologia-pca-skin-zabieg-na-twarz': 'health',
  'kosmetologia-pro-xn-autorski-zabieg-na-twarz-acne-rescue': 'health',
  'kosmetologia-pro-xn-autorski-zabieg-na-twarz-i-stopnia': 'health',
  'kosmetologia-pro-xn-autorski-zabieg-na-twarz-ii-stopnia': 'health',
  'kosmetologia-pro-xn-autorski-zabieg-na-twarz-iii-stopnia': 'health',
  'kosmetologia-scarink-mikropunktura': 'health',
};

const files = fs.readdirSync('.').filter(f => f.endsWith('.json') && f !== 'report.json' && f !== 'compliance-review-summary.json');

let processed = 0;
let approved = 0;
let rejected = 0;
const dataCategoryChanges = [];

files.forEach(filename => {
  const slug = filename.replace('.json', '');
  const d = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const originalCategory = d.compliance && d.compliance.dataCategory;
  let finalCategory = overrides[slug] || originalCategory;
  d.dataCategory = finalCategory;
  d.approved = true;
  if (d.compliance) d.compliance.dataCategory = finalCategory;
  if (originalCategory !== finalCategory) dataCategoryChanges.push({ slug, from: originalCategory, to: finalCategory });
  fs.writeFileSync(filename, JSON.stringify(d, null, 2), 'utf8');
  processed++;
  approved++;
});

const summary = { processed, approved, rejected, dataCategory_changes: dataCategoryChanges };
fs.writeFileSync('compliance-review-summary.json', JSON.stringify(summary, null, 2), 'utf8');
console.log('Done. Processed:', processed, 'Approved:', approved, 'Changes:', dataCategoryChanges.length);
console.log(JSON.stringify(dataCategoryChanges, null, 2));
