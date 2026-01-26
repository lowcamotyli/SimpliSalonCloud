import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigrations() {
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')
    const files = fs.readdirSync(migrationsDir).sort()

    console.log('🚀 Starting migrations...')
    console.log(`Found ${files.length} migration files`)

    for (const file of files) {
        if (!file.endsWith('.sql')) continue

        console.log(`\n📝 Running migration: ${file}`)
        const filePath = path.join(migrationsDir, file)
        const sql = fs.readFileSync(filePath, 'utf-8')

        try {
            // Split by semicolon and execute each statement
            const statements = sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--'))

            for (const statement of statements) {
                if (statement.trim()) {
                    const { error } = await supabase.rpc('exec_sql', { sql_query: statement })
                    if (error) {
                        console.error(`❌ Error in ${file}:`, error.message)
                        // Continue with next statement
                    }
                }
            }

            console.log(`✅ Completed: ${file}`)
        } catch (error: any) {
            console.error(`❌ Failed to run ${file}:`, error.message)
            process.exit(1)
        }
    }

    console.log('\n✨ All migrations completed!')
}

runMigrations().catch(console.error)
