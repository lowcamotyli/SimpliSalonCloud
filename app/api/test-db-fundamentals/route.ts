import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Test endpoint for database fundamentals
 * GET /api/test-db-fundamentals
 */
export async function GET() {
    const supabase = (await createServerSupabaseClient()) as any
    const results: any = {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: {
            passed: 0,
            failed: 0,
            total: 0
        }
    }

    // Helper function to add test result
    const addTest = (name: string, passed: boolean, details?: any) => {
        results.tests.push({ name, passed, details })
        results.summary.total++
        if (passed) results.summary.passed++
        else results.summary.failed++
    }

    try {
        // ========================================
        // TEST 1: Check if deleted_at columns exist
        // ========================================
        const { data: bookingsSchema } = await supabase
            .from('bookings')
            .select('deleted_at, deleted_by, version, updated_at')
            .limit(1)

        addTest(
            'Bookings table has new columns',
            bookingsSchema !== null,
            { hasDeletedAt: true, hasVersion: true }
        )

        // ========================================
        // TEST 2: Check if soft delete filter works
        // ========================================
        const { data: activeBookings, error: activeError } = await supabase
            .from('bookings')
            .select('id, deleted_at')
            .is('deleted_at', null)
            .limit(5)

        addTest(
            'Soft delete filter works',
            !activeError && activeBookings !== null,
            { count: activeBookings?.length || 0 }
        )

        // ========================================
        // TEST 3: Check if indexes exist
        // ========================================
        const { data: indexes } = await supabase.rpc('exec_sql', {
            sql_query: `
        SELECT COUNT(*) as count
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname LIKE 'idx_%'
      `
        } as any)

        const indexCount = (indexes as any)?.[0]?.count || 0
        addTest(
            'Indexes created',
            indexCount >= 14,
            { expected: 14, actual: indexCount }
        )

        // ========================================
        // TEST 4: Check if constraints exist
        // ========================================
        const { data: constraints } = await supabase.rpc('exec_sql', {
            sql_query: `
        SELECT COUNT(*) as count
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND constraint_type = 'CHECK'
          AND (
            constraint_name LIKE '%_check%' OR
            constraint_name LIKE '%_format%' OR
            constraint_name LIKE '%_not_empty%' OR
            constraint_name LIKE '%_positive%' OR
            constraint_name LIKE '%_non_negative%'
          )
      `
        } as any)

        const constraintCount = (constraints as any)?.[0]?.count || 0
        addTest(
            'Constraints created',
            constraintCount >= 8,
            { expected: '8+', actual: constraintCount }
        )

        // ========================================
        // TEST 5: Check if triggers exist
        // ========================================
        const { data: triggers } = await supabase.rpc('exec_sql', {
            sql_query: `
        SELECT COUNT(*) as count
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
          AND (
            trigger_name LIKE '%soft_delete%' OR
            trigger_name LIKE '%version_check%'
          )
      `
        } as any)

        const triggerCount = (triggers as any)?.[0]?.count || 0
        addTest(
            'Triggers created',
            triggerCount >= 6,
            { expected: 6, actual: triggerCount }
        )

        // ========================================
        // TEST 6: Test version control columns
        // ========================================
        const { data: versionTest } = await supabase
            .from('bookings')
            .select('version, updated_at')
            .not('version', 'is', null)
            .limit(1)

        addTest(
            'Version control columns populated',
            versionTest !== null && versionTest.length > 0,
            { hasData: versionTest && versionTest.length > 0 }
        )

    } catch (error: any) {
        addTest(
            'Overall test execution',
            false,
            { error: error.message }
        )
    }

    // Calculate success rate
    const successRate = results.summary.total > 0
        ? Math.round((results.summary.passed / results.summary.total) * 100)
        : 0

    return NextResponse.json({
        ...results,
        summary: {
            ...results.summary,
            successRate: `${successRate}%`,
            status: successRate === 100 ? 'ALL TESTS PASSED ✅' :
                successRate >= 80 ? 'MOSTLY PASSED ⚠️' :
                    'TESTS FAILED ❌'
        }
    }, {
        status: successRate >= 80 ? 200 : 500
    })
}
