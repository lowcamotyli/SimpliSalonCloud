import fs from 'fs';
import path from 'path';

const dir = 'generated/form-templates';
const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));

const cats = {};
for (const f of report.files) {
  const art = JSON.parse(fs.readFileSync(path.join(dir, f.slug + '.json'), 'utf8'));
  const c = art.source?.category || 'UNKNOWN';
  if (!cats[c]) cats[c] = {};
  cats[c][f.dataCategory] = (cats[c][f.dataCategory] || 0) + 1;
}

console.log('=== Source Category → dataCategory breakdown ===');
Object.entries(cats).sort().forEach(([k, v]) => console.log(k.padEnd(35), JSON.stringify(v)));

// Check health fields per category
console.log('\n=== Fields with isHealthField/isSensitiveField per source category ===');
const fieldStats = {};
for (const f of report.files) {
  const art = JSON.parse(fs.readFileSync(path.join(dir, f.slug + '.json'), 'utf8'));
  const c = art.source?.category || 'UNKNOWN';
  if (!fieldStats[c]) fieldStats[c] = { healthFields: 0, sensitiveFields: 0, total: 0 };
  const fields = art.structure?.sections?.flatMap(s => s.fields || []) || [];
  fieldStats[c].total += fields.length;
  fieldStats[c].healthFields += fields.filter(f => f.isHealthField).length;
  fieldStats[c].sensitiveFields += fields.filter(f => f.isSensitiveField).length;
}
Object.entries(fieldStats).sort().forEach(([k, v]) => {
  console.log(k.padEnd(35), `health:${v.healthFields}/${v.total} sensitive:${v.sensitiveFields}/${v.total}`);
});
