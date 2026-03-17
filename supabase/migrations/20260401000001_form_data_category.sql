-- Migration: Add data_category to form_templates
-- Purpose: GDPR Art. 5(1)(c) data minimization - classify templates by sensitivity
-- Values:
--   general        - contact/preference data, no special category (Art. 9)
--   health         - health-related questions (medications, allergies, pregnancy)
--   sensitive_health - special category data (Art. 9): chronic illness, cancer, pacemaker, etc.
--
-- Impact on salons: all existing templates default to 'general'.
-- Salons should manually reclassify templates that collect health data.

CREATE TYPE public.form_data_category AS ENUM ('general', 'health', 'sensitive_health');

ALTER TABLE public.form_templates
    ADD COLUMN data_category public.form_data_category NOT NULL DEFAULT 'general';

COMMENT ON COLUMN public.form_templates.data_category IS
    'GDPR data sensitivity classification. general = no special category data. '
    'health = health-related fields (Art. 9 applies). '
    'sensitive_health = special category data requiring explicit consent per Art. 9(2)(a).';

-- Index for filtering templates by category in import UI
CREATE INDEX idx_form_templates_data_category ON public.form_templates (data_category);
