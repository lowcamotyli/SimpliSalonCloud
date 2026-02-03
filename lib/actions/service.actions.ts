'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSchema } from '@/lib/validators/service.validators'
import { revalidatePath } from 'next/cache'

export async function importServices(salonId: string, services: any[]) {
    const supabase = await createServerSupabaseClient()

    // Validate all services first
    const validatedServices = services.map(service => {
        const validated = createServiceSchema.parse({
            ...service,
            salon_id: salonId,
            price: typeof service.price === 'string' ? parseFloat(service.price) : service.price,
            duration: typeof service.duration === 'string' ? parseInt(service.duration) : service.duration,
            active: true,
            surcharge_allowed: true,
        })
        return validated
    })

    const { data, error } = await (supabase
        .from('services') as any)
        .insert(validatedServices)
        .select()

    if (error) {
        console.error('Error importing services:', error)
        throw new Error(error.message)
    }

    revalidatePath('/[slug]/services', 'page')
    return data
}
