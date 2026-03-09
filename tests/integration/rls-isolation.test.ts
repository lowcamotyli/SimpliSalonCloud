import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

describe('RLS / multi-tenant isolation', () => {
  it('passes cross-tenant isolation script', { timeout: 150_000 }, async () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('Skipping RLS isolation test: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
      return
    }

    const { stdout, stderr } = await execFileAsync('node', ['./scripts/verify-rls-isolation.mjs'], {
      cwd: process.cwd(),
      env: process.env,
      timeout: 120_000,
    })

    const output = `${stdout}\n${stderr}`
    expect(output.includes('leakDetected": true')).toBe(false)
  })
})
