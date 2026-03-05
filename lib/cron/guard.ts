// Re-exports the cron guard from lib/middleware/cron-auth for Sprint 00 compatibility.
// Vercel sends the secret as Bearer token in Authorization header.
export { validateCronSecret as validateCronRequest } from '@/lib/middleware/cron-auth'
