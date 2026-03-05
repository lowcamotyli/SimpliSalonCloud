import { POST as postCrmCampaign } from '@/app/api/crm/campaigns/route'

export async function POST(request: Request) {
  return postCrmCampaign(request as any)
}
