-- CRM Batch 1: core CRM tables + RLS

CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  subject TEXT,
  body TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  trigger_type TEXT NOT NULL CHECK (
    trigger_type IN ('no_visit_days', 'birthday', 'after_visit', 'visit_count')
  ),
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  last_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')
  ),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  automation_id UUID REFERENCES public.crm_automations(id) ON DELETE SET NULL,
  segment_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  qstash_message_id TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id UUID NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.crm_campaigns(id) ON DELETE SET NULL,
  automation_id UUID REFERENCES public.crm_automations(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')
  ),
  provider_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_automations_salon_id_id_key'
      AND conrelid = 'public.crm_automations'::regclass
  ) THEN
    ALTER TABLE public.crm_automations
      ADD CONSTRAINT crm_automations_salon_id_id_key UNIQUE (salon_id, id);
  END IF;
END
$$;

ALTER TABLE public.crm_campaigns
  DROP CONSTRAINT IF EXISTS crm_campaigns_automation_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_campaigns_salon_automation_id_fkey'
      AND conrelid = 'public.crm_campaigns'::regclass
  ) THEN
    ALTER TABLE public.crm_campaigns
      ADD CONSTRAINT crm_campaigns_salon_automation_id_fkey
      FOREIGN KEY (salon_id, automation_id)
      REFERENCES public.crm_automations (salon_id, id)
      ON DELETE SET NULL (automation_id);
  END IF;
END
$$;

ALTER TABLE public.message_logs
  DROP CONSTRAINT IF EXISTS message_logs_automation_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'message_logs_salon_automation_id_fkey'
      AND conrelid = 'public.message_logs'::regclass
  ) THEN
    ALTER TABLE public.message_logs
      ADD CONSTRAINT message_logs_salon_automation_id_fkey
      FOREIGN KEY (salon_id, automation_id)
      REFERENCES public.crm_automations (salon_id, id)
      ON DELETE SET NULL (automation_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_message_templates_salon_id
  ON public.message_templates(salon_id);
CREATE INDEX IF NOT EXISTS idx_crm_automations_salon_active
  ON public.crm_automations(salon_id, is_active);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_salon_status
  ON public.crm_campaigns(salon_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_salon_scheduled_at
  ON public.crm_campaigns(salon_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_message_logs_salon_created_at
  ON public.message_logs(salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_logs_campaign_id
  ON public.message_logs(campaign_id)
  WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_logs_automation_id
  ON public.message_logs(automation_id)
  WHERE automation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_logs_client_id
  ON public.message_logs(client_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_message_templates_updated_at ON public.message_templates;
    CREATE TRIGGER update_message_templates_updated_at
      BEFORE UPDATE ON public.message_templates
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();

    DROP TRIGGER IF EXISTS update_crm_automations_updated_at ON public.crm_automations;
    CREATE TRIGGER update_crm_automations_updated_at
      BEFORE UPDATE ON public.crm_automations
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();

    DROP TRIGGER IF EXISTS update_crm_campaigns_updated_at ON public.crm_campaigns;
    CREATE TRIGGER update_crm_campaigns_updated_at
      BEFORE UPDATE ON public.crm_campaigns
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_templates_select_members" ON public.message_templates;
CREATE POLICY "crm_templates_select_members"
  ON public.message_templates
  FOR SELECT
  TO authenticated
  USING (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "crm_templates_insert_owner_manager" ON public.message_templates;
CREATE POLICY "crm_templates_insert_owner_manager"
  ON public.message_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  );

DROP POLICY IF EXISTS "crm_templates_update_owner_manager" ON public.message_templates;
CREATE POLICY "crm_templates_update_owner_manager"
  ON public.message_templates
  FOR UPDATE
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  )
  WITH CHECK (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  );

DROP POLICY IF EXISTS "crm_templates_delete_owner_only" ON public.message_templates;
CREATE POLICY "crm_templates_delete_owner_only"
  ON public.message_templates
  FOR DELETE
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  );

DROP POLICY IF EXISTS "crm_campaigns_select_members" ON public.crm_campaigns;
CREATE POLICY "crm_campaigns_select_members"
  ON public.crm_campaigns
  FOR SELECT
  TO authenticated
  USING (salon_id = public.get_user_salon_id());

DROP POLICY IF EXISTS "crm_campaigns_insert_owner_manager" ON public.crm_campaigns;
CREATE POLICY "crm_campaigns_insert_owner_manager"
  ON public.crm_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  );

DROP POLICY IF EXISTS "crm_campaigns_update_owner_manager" ON public.crm_campaigns;
CREATE POLICY "crm_campaigns_update_owner_manager"
  ON public.crm_campaigns
  FOR UPDATE
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  )
  WITH CHECK (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  );

DROP POLICY IF EXISTS "crm_campaigns_delete_owner_only" ON public.crm_campaigns;
CREATE POLICY "crm_campaigns_delete_owner_only"
  ON public.crm_campaigns
  FOR DELETE
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  );

DROP POLICY IF EXISTS "crm_automations_select_owner_manager" ON public.crm_automations;
CREATE POLICY "crm_automations_select_owner_manager"
  ON public.crm_automations
  FOR SELECT
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  );

DROP POLICY IF EXISTS "crm_automations_insert_owner_only" ON public.crm_automations;
CREATE POLICY "crm_automations_insert_owner_only"
  ON public.crm_automations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  );

DROP POLICY IF EXISTS "crm_automations_update_owner_only" ON public.crm_automations;
CREATE POLICY "crm_automations_update_owner_only"
  ON public.crm_automations
  FOR UPDATE
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  )
  WITH CHECK (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  );

DROP POLICY IF EXISTS "crm_automations_delete_owner_only" ON public.crm_automations;
CREATE POLICY "crm_automations_delete_owner_only"
  ON public.crm_automations
  FOR DELETE
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_salon_role('owner')
  );

DROP POLICY IF EXISTS "crm_message_logs_select_owner_manager" ON public.message_logs;
CREATE POLICY "crm_message_logs_select_owner_manager"
  ON public.message_logs
  FOR SELECT
  TO authenticated
  USING (
    salon_id = public.get_user_salon_id()
    AND public.has_any_salon_role(ARRAY['owner', 'manager'])
  );

DROP POLICY IF EXISTS "crm_message_logs_insert_owner_manager" ON public.message_logs;
DROP POLICY IF EXISTS "crm_message_logs_update_owner_manager" ON public.message_logs;

GRANT ALL ON public.message_templates TO service_role;
GRANT ALL ON public.crm_automations TO service_role;
GRANT ALL ON public.crm_campaigns TO service_role;
GRANT ALL ON public.message_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_automations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_campaigns TO authenticated;
GRANT SELECT ON public.message_logs TO authenticated;

REVOKE ALL ON public.message_templates FROM anon;
REVOKE ALL ON public.crm_automations FROM anon;
REVOKE ALL ON public.crm_campaigns FROM anon;
REVOKE ALL ON public.message_logs FROM anon;

