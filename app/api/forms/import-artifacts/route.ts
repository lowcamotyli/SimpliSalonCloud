import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError } from '@/lib/errors'

interface ImportArtifactsReportFile {
  slug: string
  file: string
  status: 'success' | 'review_required' | 'failed'
  confidence: 'high' | 'medium' | 'low'
  dataCategory: string
  warningCount: number
  potentialHealthSensitiveFieldCount: number
  healthFieldCount: number
  sensitiveFieldCount: number
  errors?: string[]
}

interface ImportArtifactsReport {
  source_dir: string
  total: number
  success: number
  review_required: number
  failed: number
  warning_counts: {
    total: number
    by_message: Record<string, number>
  }
  confidence_distribution: {
    high: number
    medium: number
    low: number
  }
  potential_health_sensitive_field_counts: {
    total: number
    health_fields: number
    sensitive_fields: number
    templates_with_potential_health_sensitive_fields: number
  }
  files: ImportArtifactsReportFile[]
}

export const GET = withErrorHandling(async () => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new UnauthorizedError()
  }

  const reportPath = path.join(
    process.cwd(),
    'generated',
    'form-templates',
    'report.json'
  )

  try {
    const report = JSON.parse(
      await fs.readFile(reportPath, 'utf-8')
    ) as ImportArtifactsReport

    return NextResponse.json({ report })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ report: null })
    }

    throw error
  }
})
