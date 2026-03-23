import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createSubscriptionManager, PlanType } from "@/lib/payments/subscription-manager"

const VALID_PLANS: PlanType[] = ["solo", "studio", "clinic", "enterprise"]

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production" && process.env.DEV_BILLING_BYPASS !== "true") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { planType } = await request.json() as { planType: PlanType }
  if (!VALID_PLANS.includes(planType)) {
    return NextResponse.json({ error: "Invalid planType" }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("salon_id, role")
    .eq("user_id", user.id)
    .single()

  const p = profile as any
  if (!p?.salon_id) return NextResponse.json({ error: "User not associated with salon" }, { status: 400 })
  if (p.role !== "owner") return NextResponse.json({ error: "Only owner can change plan" }, { status: 403 })

  const subManager = createSubscriptionManager()
  await subManager.forceSetPlan(p.salon_id, planType)

  console.log("[DEV] Plan switched to " + planType + " for salon " + p.salon_id)

  return NextResponse.json({ success: true })
}
