# SimpliSalonCloud

## Project description
System SaaS do zarzadzania salonem: kalendarz wizyt, CRM, platnosci, powiadomienia email/SMS i panel ustawien integracji.

## Stack
Node.js / Next.js TypeScript (detected via package.json).

## Known constraints
Multi-tenant app with Supabase RLS; changes to messaging integrations must preserve tenant isolation, secret safety, and existing settings flows.
