import { redirect } from 'next/navigation'

type Params = {
  slug: string
}

export default async function LegacyBooksySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams?: Promise<{ error?: string; tab?: string }>
}): Promise<never> {
  const { slug } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const query = new URLSearchParams()
  if (resolvedSearchParams?.error) {
    query.set('error', resolvedSearchParams.error)
  }
  if (resolvedSearchParams?.tab) {
    query.set('tab', resolvedSearchParams.tab)
  }
  const queryString = query.toString()

  redirect(`/${slug}/booksy${queryString ? `?${queryString}` : ''}`)
}
