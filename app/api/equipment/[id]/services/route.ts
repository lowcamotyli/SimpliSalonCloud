import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandling } from "@/lib/error-handler";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("salon_id")
    .eq("user_id", user.id)
    .single();
  if (!profile?.salon_id) throw new NotFoundError("Profile");

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id")
    .eq("id", id)
    .eq("salon_id", profile.salon_id)
    .single();
  if (!equipment) throw new NotFoundError("Equipment", id);

  const { data: rows, error } = await supabase
    .from("service_equipment")
    .select("service_id, services!inner(id)")
    .eq("equipment_id", id)
    .eq("services.salon_id", profile.salon_id);

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("salon_id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile?.salon_id) throw new NotFoundError("Profile");

  const role = user.app_metadata?.role ?? profile.role;
  if (!["owner", "manager"].includes(role)) throw new UnauthorizedError();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id")
    .eq("id", id)
    .eq("salon_id", profile.salon_id)
    .single();
  if (!equipment) throw new NotFoundError("Equipment", id);

  const body = await request.json();
  const inputServiceIds = Array.isArray(body.serviceIds) ? body.serviceIds : [];
  if (inputServiceIds.some((serviceId: unknown) => typeof serviceId !== "string" || serviceId.trim().length === 0)) {
    throw new ValidationError("serviceIds must contain non-empty strings");
  }
  const serviceIds = Array.from(new Set(inputServiceIds as string[]));

  if (serviceIds.length > 0) {
    const { data: services, error: servicesError } = await supabase
      .from("services")
      .select("id")
      .eq("salon_id", profile.salon_id)
      .in("id", serviceIds);

    if (servicesError) throw servicesError;
    if ((services ?? []).length !== serviceIds.length) {
      throw new ValidationError("One or more serviceIds do not belong to this salon");
    }
  }

  const { error: rpcError } = await supabase.rpc("replace_equipment_services", {
    p_equipment_id: id,
    p_service_ids: serviceIds,
  });

  if (rpcError && rpcError.code !== "42883") {
    // Keep cross-tenant and domain mismatch explicit as 4xx.
    if (rpcError.code === "P0001" || rpcError.code === "42501") {
      throw new ValidationError(rpcError.message);
    }
    throw rpcError;
  }

  // Fallback for environments without the SQL function.
  if (rpcError?.code === "42883") {
    await supabase.from("service_equipment").delete().eq("equipment_id", id);

    if (serviceIds.length > 0) {
      const rows = serviceIds.map((service_id) => ({ service_id, equipment_id: id }));
      const { error } = await supabase.from("service_equipment").insert(rows);
      if (error) throw error;
    }
  }

  return NextResponse.json({ success: true, serviceIds, assignedServicesCount: serviceIds.length });
});
