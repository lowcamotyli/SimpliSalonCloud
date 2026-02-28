import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
    const { data, error } = await supabase
        .from('salons')
        .update({ subscription_plan: 'enterprise', subscription_status: 'active' })
        .neq('id', '00000000-0000-0000-0000-000000000000') // just to update all
        .select()

    if (error) {
        console.error('Error updating salons:', error)
    } else {
        console.log('Updated salons to enterprise:', data?.length)
    }
}

main()
