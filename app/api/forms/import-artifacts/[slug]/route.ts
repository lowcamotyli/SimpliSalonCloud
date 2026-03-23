import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

import type { ImportArtifact } from '@/lib/forms/import-types'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/error-handler'
import { UnauthorizedError } from '@/lib/errors'

interface RouteContext {
  params: Promise<{
    slug: string
  }>
}

function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(slug) && !slug.includes('/') && !slug.includes('..')
}

export const GET = withErrorHandling(
  async (_request: NextRequest, context: RouteContext) => {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new UnauthorizedError()
    }

    const { slug } = await context.params
    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }

    const artifactPath = path.join(
      process.cwd(),
      'generated',
      'form-templates',
      `${slug}.json`
    )

    try {
      const artifact = JSON.parse(
        await fs.readFile(artifactPath, 'utf-8')
      ) as ImportArtifact

      return NextResponse.json({ artifact })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json({ error: 'not found' }, { status: 404 })
      }

      throw error
    }
  }
)
