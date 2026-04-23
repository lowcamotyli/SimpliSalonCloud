import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandling } from "@/lib/error-handler";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";

// GET /api/equipment - list active equipment for the salon
export const GET = withErrorHandling(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new UnauthorizedError();

  const { data: profile } = await supabase
    .from("profiles")
    .select("salon_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) throw new NotFoundError("Profile");

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";
  const salonProfile = profile as any;

  let query = supabase
    .from("equipment")
    .select("*, service_equipment(equipment_id)")
    .eq("salon_id", salonProfile.salon_id)
    .order("name");

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data: equipment, error } = await query;
  if (error) throw error;

  const normalizedEquipment = (equipment ?? []).map((item: any) => ({
    ...item,
    assigned_services_count: Array.isArray(item.service_equipment)
      ? item.service_equipment.length
      : 0,
  }));

  return NextResponse.json({ equipment: normalizedEquipment });
});

// POST /api/equipment - add new equipment (owner/manager only)
export const POST = withErrorHandling(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new UnauthorizedError();

  const { data: profile } = await supabase
    .from("profiles")
    .select("salon_id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) throw new NotFoundError("Profile");

  const salonProfile = profile as any;
  const role = user.app_metadata?.role ?? salonProfile.role;
  if (!["owner", "manager"].includes(role)) {
    throw new UnauthorizedError();
  }

  const body = await request.json();
  const { name, type, description } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    throw new ValidationError("Nazwa sprzetu musi miec co najmniej 2 znaki");
  }

  const validTypes = ["laser", "fotel", "stol_manicure", "fotopolimeryzator", "inne", "other"];
  if (!type || !validTypes.includes(type)) {
    throw new ValidationError("Nieprawidlowy typ sprzetu");
  }

  const { data: equipment, error } = await supabase
    .from("equipment")
    .insert({
      salon_id: salonProfile.salon_id,
      name: name.trim(),
      type,
      description: description?.trim() ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;

  return NextResponse.json({ equipment }, { status: 201 });
});
