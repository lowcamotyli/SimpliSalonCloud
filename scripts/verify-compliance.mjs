import fs from 'fs';
import path from 'path';

const dir = 'generated/form-templates';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'report.json' && f !== 'compliance-review-summary.json');

let approved = 0, rejected = 0, noFlag = 0;
const noFlagList = [];

for (const f of files) {
  const art = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (art.approved === true) approved++;
  else if (art.rejected === true) rejected++;
  else { noFlag++; noFlagList.push(f); }
}

console.log(`approved: ${approved} | rejected: ${rejected} | no_flag: ${noFlag} | total: ${files.length}`);
if (noFlagList.length > 0) {
  console.log('\nFiles missing approved/rejected flag:');
  noFlagList.forEach(f => console.log(' -', f));
}

// Show dataCategory distribution
const cats = {};
for (const f of files) {
  const art = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const c = art.dataCategory || 'MISSING';
  cats[c] = (cats[c] || 0) + 1;
}
console.log('\ndataCategory distribution:', JSON.stringify(cats));
