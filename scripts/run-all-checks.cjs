const { spawn } = require('node:child_process')

/**
 * Stabilny runner dla pełnego pipeline testowego.
 * Chroni przed "zawieszeniem" przez timeout na każdym kroku.
 */

const STEPS = [
  { name: 'unit+integration', cmd: 'npm', args: ['run', 'test'], timeoutMs: 10 * 60 * 1000 },
  { name: 'e2e', cmd: 'npm', args: ['run', 'test:e2e'], timeoutMs: 15 * 60 * 1000 },
  { name: 'lint', cmd: 'npm', args: ['run', 'lint'], timeoutMs: 5 * 60 * 1000 },
  { name: 'typecheck', cmd: 'npm', args: ['run', 'typecheck'], timeoutMs: 8 * 60 * 1000 },
  { name: 'build', cmd: 'npm', args: ['run', 'build'], timeoutMs: 20 * 60 * 1000 },
]

function resolveCommand(cmd) {
  if (process.platform === 'win32' && cmd === 'npm') {
    return process.env.comspec || 'cmd.exe'
  }
  return cmd
}

function resolveArgs(cmd, args) {
  if (process.platform === 'win32' && cmd === 'npm') {
    return ['/d', '/s', '/c', 'npm', ...args]
  }
  return args
}

function runStep(step) {
  return new Promise((resolve, reject) => {
    console.log(`\n[run-all-checks] START ${step.name}`)

    const child = spawn(resolveCommand(step.cmd), resolveArgs(step.cmd, step.args), {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    })

    const timer = setTimeout(() => {
      console.error(`\n[run-all-checks] TIMEOUT ${step.name} after ${step.timeoutMs}ms`)
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000)
      reject(new Error(`Timeout in step: ${step.name}`))
    }, step.timeoutMs)

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        console.log(`[run-all-checks] OK ${step.name}`)
        resolve()
      } else {
        reject(new Error(`Step failed: ${step.name} (exit ${code})`))
      }
    })
  })
}

async function main() {
  try {
    for (const step of STEPS) {
      await runStep(step)
    }
    console.log('\n[run-all-checks] ALL GREEN')
  } catch (error) {
    console.error(`\n[run-all-checks] FAILED: ${error.message}`)
    process.exit(1)
  }
}

main()

