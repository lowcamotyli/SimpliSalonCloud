import { redirect } from 'next/navigation'

interface SettingsPageProps {
  params: Promise<{ slug: string }>
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { slug } = await params
  redirect(`/${slug}/settings/appearance`)
}
