import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandling } from "@/lib/error-handler";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";

// GET /api/equipment/[id]/services - list service IDs assigned to equipment
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new UnauthorizedError();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id")
    .eq("id", id)
    .single();
  if (!equipment) throw new NotFoundError("Equipment", id);

  const { data: rows, error } = await supabase
    .from("service_equipment")
    .select("service_id")
    .eq("equipment_id", id);

  if (error) throw error;

  const serviceIds = (rows ?? []).map((row: { service_id: string }) => row.service_id);
  return NextResponse.json({ serviceIds });
});

// PUT /api/equipment/[id]/services - replace service assignments for equipment
export const PUT = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new UnauthorizedError();

  const role = user.app_metadata?.role;
  if (!["owner", "manager"].includes(role)) throw new UnauthorizedError();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id")
    .eq("id", id)
    .single();
  if (!equipment) throw new NotFoundError("Equipment", id);

  const body = await request.json();
  const serviceIds: string[] = Array.isArray(body.serviceIds) ? body.serviceIds : [];

  await supabase.from("service_equipment").delete().eq("equipment_id", id);

  if (serviceIds.length > 0) {
    const rows = serviceIds.map((service_id) => ({ service_id, equipment_id: id }));
    const { error } = await supabase.from("service_equipment").insert(rows);
    if (error) throw error;
  }

  return NextResponse.json({ success: true, serviceIds });
});
