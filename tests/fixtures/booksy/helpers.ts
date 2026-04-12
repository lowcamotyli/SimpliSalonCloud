import { readFileSync } from 'node:fs'
import path from 'node:path'

export function loadBooksyFixture(name: string): string {
  return readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'booksy', name), 'utf8')
}

export function loadBooksyFixtureBase64Url(name: string): string {
  return Buffer.from(loadBooksyFixture(name), 'utf8').toString('base64url')
}
