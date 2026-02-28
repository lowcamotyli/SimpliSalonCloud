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
SECURITY DEFINER
AS $$
BEGIN
  PERFORM 1
  FROM bookings
  WHERE employee_id = p_employee_id
    AND booking_date = p_booking_date
    AND booking_time = p_booking_time
    AND status != 'cancelled'
    AND deleted_at IS NULL
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
