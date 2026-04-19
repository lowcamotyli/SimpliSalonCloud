export type BooksyWorkerScope = {
  salonIds: string[] | null
  accountIds: string[] | null
}

type JsonRequest = {
  json: () => Promise<unknown>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function uniqueStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const strings = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  return strings.length > 0 ? Array.from(new Set(strings)) : null
}

export function parseBooksyWorkerScope(body: unknown): BooksyWorkerScope {
  const record = asRecord(body)

  return {
    salonIds: uniqueStrings(record.salonIds),
    accountIds: uniqueStrings(record.accountIds),
  }
}

export async function readBooksyWorkerScope(request: JsonRequest): Promise<BooksyWorkerScope> {
  const body = await request.json().catch(() => ({}))
  return parseBooksyWorkerScope(body)
}

export function hasBooksyWorkerScope(scope: BooksyWorkerScope): boolean {
  return Boolean(scope.salonIds?.length || scope.accountIds?.length)
}
