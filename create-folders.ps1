# Auth pages
mkdir "app/(auth)"
mkdir "app/(auth)/login"
mkdir "app/(auth)/signup"

# Dashboard pages
mkdir "app/(dashboard)"
mkdir "app/(dashboard)/[slug]"
mkdir "app/(dashboard)/[slug]/dashboard"
mkdir "app/(dashboard)/[slug]/calendar"
mkdir "app/(dashboard)/[slug]/employees"
mkdir "app/(dashboard)/[slug]/clients"
mkdir "app/(dashboard)/[slug]/payroll"
mkdir "app/(dashboard)/[slug]/settings"
mkdir "app/(dashboard)/[slug]/settings/booksy"

# API routes
mkdir "app/api/employees"
mkdir "app/api/employees/[id]"
mkdir "app/api/clients"
mkdir "app/api/clients/[id]"
mkdir "app/api/services"
mkdir "app/api/bookings"
mkdir "app/api/bookings/[id]"
mkdir "app/api/bookings/check-availability"
mkdir "app/api/payroll"
mkdir "app/api/webhooks"
mkdir "app/api/webhooks/booksy"
mkdir "app/api/webhooks/booksy/test"
mkdir "app/api/cron"
mkdir "app/api/cron/booksy"

# Components
mkdir "components/layout"
mkdir "components/calendar"

# Lib
mkdir "lib/supabase"
mkdir "lib/utils"
mkdir "lib/providers"
mkdir "lib/booksy"

# Other
mkdir hooks
mkdir types
mkdir supabase
mkdir "supabase/migrations"
mkdir docs