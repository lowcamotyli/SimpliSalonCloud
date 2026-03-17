import { readFileSync, writeFileSync, readdirSync } from 'fs';

const partial = JSON.parse(readFileSync('generated/compliance-classification-partial.json', 'utf8'));
const classified = new Set(partial.map(p => p.sourceFile));
const allFiles = readdirSync('karty_zabiegowe/do_wysylki_klientom');
const missing = allFiles.filter(f => !classified.has(f));

function classify(filename) {
  const f = filename.toLowerCase();
  // sensitive_health
  if (f.startsWith('medycyna_estetyczna') || f.startsWith('hi-tech') || f.startsWith('tatuaz') ||
      f.startsWith('tatuaż') || f.startsWith('dr_n._med')) {
    return { dataCategory: 'sensitive_health', requiresHealthConsent: true, reviewRequired: false, reviewNotes: [] };
  }
  // general
  if (f.startsWith('oprawa_oka') || f.startsWith('pielegnacja') || f.startsWith('pielęgnacja') ||
      f.startsWith('opalanie_natryskowe')) {
    return { dataCategory: 'general', requiresHealthConsent: false, reviewRequired: false, reviewNotes: [] };
  }
  // health (all others: masaze, trychologia, podologia, zdrowie, multi-language body/face cards)
  return { dataCategory: 'health', requiresHealthConsent: true, reviewRequired: false, reviewNotes: [] };
}

const additions = missing.map(sourceFile => {
  const c = classify(sourceFile);
  const name = sourceFile
    .replace('.md', '')
    .replace(/_/g, ' ')
    .replace(/,/g, ',');
  return { sourceFile, templateName: name, ...c };
});

const full = [...partial, ...additions];
writeFileSync('generated/compliance-classification.json', JSON.stringify(full, null, 2));

const stats = { general: 0, health: 0, sensitive_health: 0, reviewRequired: 0 };
for (const item of full) {
  stats[item.dataCategory]++;
  if (item.reviewRequired) stats.reviewRequired++;
}

console.log(`Total: ${full.length} entries`);
console.log('Stats:', stats);
console.log(`\nReview required (${full.filter(i=>i.reviewRequired).length}):`);
full.filter(i => i.reviewRequired).forEach(i => console.log(` - ${i.sourceFile}: ${i.reviewNotes.join('; ')}`));
