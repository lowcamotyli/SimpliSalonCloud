import { redirect } from 'next/navigation'

export default async function FormsRedirectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/${slug}/forms/templates`)
}
