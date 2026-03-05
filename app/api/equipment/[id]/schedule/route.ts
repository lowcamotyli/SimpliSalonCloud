import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandling } from "@/lib/error-handler";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";

// GET /api/equipment/[id]/schedule?date=YYYY-MM-DD
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new UnauthorizedError();

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const dayStart = new Date(`${date}T00:00:00Z`).toISOString();
  const dayEnd = new Date(`${date}T23:59:59Z`).toISOString();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, name, salon_id")
    .eq("id", id)
    .single();
  if (!equipment) throw new NotFoundError("Equipment", id);

  const { data: bookings, error } = await supabase
    .from("equipment_bookings")
    .select("id, booking_id, starts_at, ends_at")
    .eq("equipment_id", id)
    .gte("starts_at", dayStart)
    .lte("ends_at", dayEnd)
    .order("starts_at");

  if (error) throw error;
  return NextResponse.json({ equipment, bookings: bookings ?? [] });
});
