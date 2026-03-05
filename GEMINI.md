# SimpliSalonCloud — Gemini Project Instructions

## Output Format (code generation tasks)
- Output ONLY valid code. No markdown fences (no ```), no explanations, no introductory text.
- Do NOT write "I will now create...", "Here is the file...", or any prose before/after code.
- Start output DIRECTLY with first line of code (`'use client'`, `import`, or SQL keyword).

## Stack
- Next.js 14 App Router, TypeScript strict
- Supabase (PostgreSQL + Auth + RLS)
- Tailwind CSS + shadcn/ui
- Package manager: pnpm

## shadcn/ui — NEVER use barrel import

```
// WRONG — path does not exist:
import { Button } from "@/components/ui"
```

Always individual imports:
```typescript
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
```

Available: `alert-dialog` `badge` `button` `card` `checkbox` `dialog` `empty-state` `image-upload` `input` `label` `select` `skeleton` `switch` `table` `tabs` `textarea` `tooltip`

NOT available (do not use): `ScrollArea`, `Separator`, `Sheet`, `Popover`, `DropdownMenu`, `RadioGroup`, `Accordion`, `Command`

## Supabase (project-specific)

```typescript
// Server-side client
import { createServerSupabaseClient } from "@/lib/supabase/server"
const supabase = createServerSupabaseClient()

// Auth check in API routes
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
```

RLS helper functions (use in policies — do NOT query employees table for role):
- `public.get_user_salon_id()` — current user's salon_id
- `public.has_salon_role(TEXT)` — checks exact role
- `public.has_any_salon_role(TEXT[])` — checks if user has any of given roles
- `public.get_user_employee_id()` — current user's employee_id
- `employees` table has NO `role` column — use helpers above

## Next.js patterns

```typescript
// API Route
import { NextRequest, NextResponse } from "next/server"
export async function GET(req: NextRequest) { ... }

// Client Component
'use client'

// Server Component — no directive needed
```

Return proper HTTP status codes: 400 (bad request), 401 (unauthorized), 403 (forbidden), 404, 500.
