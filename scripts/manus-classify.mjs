import { readFileSync, readdirSync } from 'fs';
import https from 'https';

const files = readdirSync('karty_zabiegowe/do_wysylki_klientom').join('\n');

const prompt = `You are a GDPR compliance reviewer for a Polish salon SaaS platform called SimpliSalonCloud.
Your task: classify each treatment card template by GDPR data sensitivity.

Data categories:
- "general" — no health data: hair styling (FRYZJERSTWO), basic nail care (PIELEGNACJA_DLONI), eye styling/lashes (OPRAWA_OKA), spray tan (OPALANIE_NATRYSKOWE)
- "health" — collects health info (medications, allergies, pregnancy, skin conditions): KOSMETOLOGIA, MASAZE, PODOLOGIA, TRYCHOLOGIA, ZDROWIE, MAKIJAZ_PMU
- "sensitive_health" — GDPR Art.9 special category (chronic illness, cancer, pacemaker, neurological, infectious disease): MEDYCYNA_ESTETYCZNA, HI-TECH, TATUAZ_PIERCING, dr_n_med

Multi-language body/face treatment cards (Angielski/Francuski/Hispanski/Niemiecki/Rosyjski/Ukrainski + Cialo/Twarz) = "health" (general treatment forms with health questions).

Rules:
- requiresHealthConsent: true when dataCategory is "health" or "sensitive_health"
- reviewRequired: true when: category prefix is ambiguous, or treatment name suggests medical/invasive procedures despite non-medical prefix
- reviewNotes: list specific concerns if reviewRequired is true, else empty array

Output ONLY a valid JSON array. No markdown. No explanations. No code blocks. Start with [ and end with ].
Each element: {"sourceFile":"...","templateName":"...","dataCategory":"general|health|sensitive_health","requiresHealthConsent":false,"reviewRequired":false,"reviewNotes":[]}

Files to classify:
${files}`;

const body = JSON.stringify({
  prompt,
  agentProfile: 'manus-1.6',
  taskMode: 'chat'
});

console.log('Sending to Manus API...');

const req = https.request({
  hostname: 'api.manus.ai',
  path: '/v1/tasks',
  method: 'POST',
  headers: {
    'API_KEY': 'sk-nMQgGpJP02XX_6pacyELgodtqSE2FOdgxSQjr42vguSImpgQe7cy09r4OspHrM8bX15bUzBysisphWzolw_CIPYXDU7U',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  },
  rejectUnauthorized: false
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    const parsed = JSON.parse(data);
    console.log('Task ID:', parsed.taskId || parsed.id || 'unknown');
    console.log('Full response:', JSON.stringify(parsed, null, 2).substring(0, 1000));
  });
});

req.on('error', e => console.error('Request error:', e.message));
req.write(body);
req.end();
