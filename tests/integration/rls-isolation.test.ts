import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

test('RLS / multi-tenant isolation passes cross-tenant isolation script', { timeout: 150_000 }, async () => {
    const { stdout, stderr } = await execFileAsync('node', ['./scripts/verify-rls-isolation.mjs'], {
      cwd: process.cwd(),
      env: process.env,
      timeout: 120_000,
    })

    const output = `${stdout}\n${stderr}`

    assert.equal(output.includes('leakDetected": true'), false)
})

