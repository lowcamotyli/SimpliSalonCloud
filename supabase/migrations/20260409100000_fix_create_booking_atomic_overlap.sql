-- Fix create_booking_atomic to detect time-range overlap, not just exact-time match.

CREATE OR REPLACE FUNCTION create_booking_atomic(
  p_salon_id UUID,
  p_employee_id UUID,
  p_client_id UUID,
  p_service_id UUID,
  p_booking_date DATE,
  p_booking_time TIME,
  p_duration INT,
  p_base_price NUMERIC,
  p_notes TEXT,
  p_status TEXT,
  p_created_by UUID,
  p_source TEXT
)
RETURNS SETOF bookings
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_new_start INT;
  v_new_end INT;
BEGIN
  v_new_start := EXTRACT(EPOCH FROM p_booking_time)::INT / 60;
  v_new_end := v_new_start + p_duration;

  PERFORM 1
  FROM bookings
  WHERE
    bookings.employee_id = p_employee_id
    AND bookings.booking_date = p_booking_date
    AND bookings.status <> 'cancelled'
    AND bookings.deleted_at IS NULL
    AND (EXTRACT(EPOCH FROM bookings.booking_time)::INT / 60) < v_new_end
    AND v_new_start < (EXTRACT(EPOCH FROM bookings.booking_time)::INT / 60 + COALESCE(bookings.duration, 0))
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = '23P01';
  END IF;

  RETURN QUERY
  INSERT INTO bookings (
    salon_id,
    employee_id,
    client_id,
    service_id,
    booking_date,
    booking_time,
    duration,
    base_price,
    notes,
    status,
    created_by,
    source
  )
  VALUES (
    p_salon_id,
    p_employee_id,
    p_client_id,
    p_service_id,
    p_booking_date,
    p_booking_time,
    p_duration,
    p_base_price,
    p_notes,
    p_status,
    p_created_by,
    p_source
  )
  RETURNING *;
END;
$$;
