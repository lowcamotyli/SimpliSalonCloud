import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { withErrorHandling } from "@/lib/error-handler";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";

// PUT /api/equipment/[id] - update equipment (owner/manager)
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

  const { data: existing } = await supabase
    .from("equipment")
    .select("id, salon_id")
    .eq("id", id)
    .single();
  if (!existing) throw new NotFoundError("Equipment", id);

  const body = await request.json();
  const { name, type, description, is_active } = body;

  const validTypes = ["laser", "fotel", "stol_manicure", "fotopolimeryzator", "inne", "other"];
  if (name !== undefined && (typeof name !== "string" || name.trim().length < 2)) {
    throw new ValidationError("Nazwa sprzetu musi miec co najmniej 2 znaki");
  }
  if (type !== undefined && !validTypes.includes(type)) {
    throw new ValidationError("Nieprawidlowy typ sprzetu");
  }

  const updatePayload: Record<string, unknown> = {};
  if (name !== undefined) updatePayload.name = name.trim();
  if (type !== undefined) updatePayload.type = type;
  if (description !== undefined) updatePayload.description = description?.trim() ?? null;
  if (is_active !== undefined) updatePayload.is_active = is_active;

  const { data: equipment, error } = await supabase
    .from("equipment")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json({ equipment });
});

// DELETE /api/equipment/[id] - soft-delete (set is_active = false)
export const DELETE = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new UnauthorizedError();

  const role = user.app_metadata?.role;
  if (!["owner", "manager"].includes(role)) throw new UnauthorizedError();

  const { data: existing } = await supabase
    .from("equipment")
    .select("id")
    .eq("id", id)
    .single();
  if (!existing) throw new NotFoundError("Equipment", id);

  const { error } = await supabase
    .from("equipment")
    .update({ is_active: false })
    .eq("id", id);

  if (error) throw error;
  return NextResponse.json({ success: true });
});
