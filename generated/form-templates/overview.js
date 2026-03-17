const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.json') && f !== 'report.json');
const results = {};
files.forEach(f => {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  results[f.replace('.json', '')] = {
    sourceCategory: d.source && d.source.category,
    complianceDataCategory: d.compliance && d.compliance.dataCategory,
    topDataCategory: d.dataCategory,
    healthFields: d.compliance && d.compliance.healthFieldCount,
    sensitiveFields: d.compliance && d.compliance.sensitiveFieldCount
  };
});
console.log(JSON.stringify(results, null, 2));
