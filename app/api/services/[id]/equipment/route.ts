import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandling } from "@/lib/error-handler";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";

// GET /api/services/[id]/equipment - list equipment assigned to a service
export const GET = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new UnauthorizedError();

  const { data: rows, error } = await supabase
    .from("service_equipment")
    .select("equipment_id, equipment:equipment(id, name, type, is_active)")
    .eq("service_id", id);

  if (error) throw error;
  const equipment = (rows ?? []).map((r: any) => r.equipment).filter(Boolean);
  return NextResponse.json({ equipment });
});

// PUT /api/services/[id]/equipment - replace equipment assignment for a service
export const PUT = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new UnauthorizedError();

  const role = user.app_metadata?.role;
  if (!["owner", "manager"].includes(role)) throw new UnauthorizedError();

  const { data: service } = await supabase
    .from("services")
    .select("id")
    .eq("id", id)
    .single();
  if (!service) throw new NotFoundError("Service", id);

  const body = await request.json();
  const equipmentIds: string[] = Array.isArray(body.equipment_ids) ? body.equipment_ids : [];

  // Replace all assignments
  await supabase.from("service_equipment").delete().eq("service_id", id);

  if (equipmentIds.length > 0) {
    const rows = equipmentIds.map((equipment_id) => ({ service_id: id, equipment_id }));
    const { error } = await supabase.from("service_equipment").insert(rows);
    if (error) throw error;
  }

  return NextResponse.json({ success: true, equipment_ids: equipmentIds });
});
