-- Migration: Add health_consent_at to client_forms
-- Purpose: GDPR Art. 9(2)(a) - explicit consent for special category health data
-- Must be populated at form submission time when the template data_category is 'health'
-- or 'sensitive_health'. Null = general form or consent not yet collected.
--
-- Application responsibility:
--   In app/api/forms/submit/[token]/route.ts:
--   - After decoding the fill_token, load the form_template
--   - If template.data_category IN ('health', 'sensitive_health'):
--       SET health_consent_at = NOW() when saving the client_form row
--   - The form UI must show a distinct explicit health consent checkbox
--     (separate from the standard gdpr_consent_text)
--
-- Audit use: presence of health_consent_at proves the client explicitly consented
-- to health data processing at a specific timestamp (demonstrability, Art. 5(2)).

ALTER TABLE public.client_forms
    ADD COLUMN health_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.client_forms.health_consent_at IS
    'Timestamp of explicit health data consent per GDPR Art. 9(2)(a). '
    'Required when form_template.data_category is health or sensitive_health. '
    'Null for general templates or where consent was not yet collected.';

-- Partial index for compliance queries: find health forms without recorded consent
CREATE INDEX idx_client_forms_health_consent
    ON public.client_forms (health_consent_at)
    WHERE health_consent_at IS NOT NULL;
