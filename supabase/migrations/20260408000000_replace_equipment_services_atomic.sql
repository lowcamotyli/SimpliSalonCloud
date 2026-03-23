CREATE OR REPLACE FUNCTION public.replace_equipment_services(
  p_equipment_id UUID,
  p_service_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_salon_id UUID := public.get_user_salon_id();
  normalized_service_ids UUID[] := COALESCE(
    ARRAY(
      SELECT DISTINCT service_id
      FROM unnest(COALESCE(p_service_ids, ARRAY[]::UUID[])) AS service_id
      WHERE service_id IS NOT NULL
    ),
    ARRAY[]::UUID[]
  );
  requested_service_count INTEGER := COALESCE(array_length(normalized_service_ids, 1), 0);
  matching_service_count INTEGER := 0;
BEGIN
  IF current_salon_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_salon_role(ARRAY['owner', 'manager']) THEN
    RAISE EXCEPTION 'Only owner or manager can update equipment services'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.equipment
    WHERE id = p_equipment_id
      AND salon_id = current_salon_id
  ) THEN
    RAISE EXCEPTION 'Equipment with id % not found', p_equipment_id
      USING ERRCODE = 'P0001';
  END IF;

  IF requested_service_count > 0 THEN
    SELECT count(*)
    INTO matching_service_count
    FROM public.services
    WHERE salon_id = current_salon_id
      AND id = ANY(normalized_service_ids);

    IF matching_service_count <> requested_service_count THEN
      RAISE EXCEPTION 'One or more services do not belong to this salon'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  DELETE FROM public.service_equipment
  WHERE equipment_id = p_equipment_id;

  IF requested_service_count > 0 THEN
    INSERT INTO public.service_equipment (service_id, equipment_id)
    SELECT service_id, p_equipment_id
    FROM unnest(normalized_service_ids) AS service_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_equipment_services(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_equipment_services(UUID, UUID[]) TO service_role;
