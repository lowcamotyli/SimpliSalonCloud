import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AvailabilityResult } from "@/types/equipment";

export async function checkEquipmentAvailability(
  equipmentIds: string[],
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string
): Promise<AvailabilityResult[]> {
  if (equipmentIds.length === 0) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("check_equipment_availability", {
    p_equipment_ids: equipmentIds,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_exclude_booking_id: excludeBookingId ?? null,
  } as any);
  if (error) throw new Error(`Equipment availability check failed: ${error.message}`);
  return (data as AvailabilityResult[]) ?? [];
}

export async function getRequiredEquipmentForService(
  serviceId: string
): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("service_equipment")
    .select("equipment_id")
    .eq("service_id", serviceId);
  return data?.map((r: any) => r.equipment_id) ?? [];
}
