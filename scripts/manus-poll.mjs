import https from 'https';
import { writeFileSync } from 'fs';

const TASK_ID = process.argv[2] || 'NCsG3dbcxEAxANmktfzwP3';
const API_KEY = 'sk-nMQgGpJP02XX_6pacyELgodtqSE2FOdgxSQjr42vguSImpgQe7cy09r4OspHrM8bX15bUzBysisphWzolw_CIPYXDU7U';

function get(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.manus.ai',
      path,
      method: 'GET',
      headers: { 'API_KEY': API_KEY },
      rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function poll() {
  console.log(`Polling task ${TASK_ID}...`);

  for (let i = 0; i < 60; i++) {
    const { status, body } = await get(`/v1/tasks/${TASK_ID}`);
    const parsed = JSON.parse(body);
    const taskStatus = parsed.status || parsed.task_status;

    console.log(`[${i+1}/60] Status: ${taskStatus}`);

    if (taskStatus === 'completed' || taskStatus === 'done' || taskStatus === 'success') {
      console.log('\n=== RESULT ===');
      const result = parsed.result || parsed.output || parsed.response || body;
      console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));

      // Try to extract JSON array from result
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        writeFileSync('generated/compliance-classification.json', match[0]);
        console.log('\nSaved to generated/compliance-classification.json');
      }
      return;
    }

    if (taskStatus === 'failed' || taskStatus === 'error') {
      console.error('Task failed:', JSON.stringify(parsed, null, 2));
      return;
    }

    // Wait 10 seconds between polls
    await new Promise(r => setTimeout(r, 10000));
  }

  console.log('Timeout after 10 minutes');
}

poll().catch(console.error);
