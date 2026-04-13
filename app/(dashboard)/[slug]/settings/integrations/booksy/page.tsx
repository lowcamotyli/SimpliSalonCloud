import { redirect } from 'next/navigation'

type Params = {
  slug: string
}

export default async function LegacyBooksySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams?: Promise<{ error?: string }>
}): Promise<never> {
  const { slug } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const query = resolvedSearchParams?.error ? `?error=${encodeURIComponent(resolvedSearchParams.error)}` : ''

  redirect(`/${slug}/booksy${query}`)
}
