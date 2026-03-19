'use client'

import { useParams, redirect } from 'next/navigation'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsVouchersRedirect() {
  const params = useParams()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/${params.slug}/vouchers`)
  }, [params.slug, router])

  return null
}
