CREATE OR REPLACE FUNCTION create_group_booking_atomic(
  p_salon_id UUID,
  p_client_id UUID,
  p_payment_method TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]',
  p_terms_accepted_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit_group_id UUID;
  v_booking_id UUID;
  v_bookings JSONB := '[]'::jsonb;
  v_total_price NUMERIC := 0;
  v_total_duration INT := 0;
  i INT;
  j INT;
  item JSONB;
  item_i JSONB;
  item_j JSONB;
  start_i INT;
  end_i INT;
  start_j INT;
  end_j INT;
  existing_booking RECORD;
  existing_start INT;
  existing_end INT;
BEGIN
  FOR i IN 0 .. jsonb_array_length(p_items) - 1 LOOP
    item := p_items -> i;
    PERFORM 1
    FROM bookings
    WHERE
      salon_id = p_salon_id AND
      employee_id = (item->>'employee_id')::UUID AND
      booking_date = (item->>'booking_date')::DATE AND
      status != 'cancelled' AND
      deleted_at IS NULL
    FOR UPDATE;
  END LOOP;

  FOR i IN 0 .. jsonb_array_length(p_items) - 1 LOOP
    FOR j IN i + 1 .. jsonb_array_length(p_items) - 1 LOOP
      item_i := p_items -> i;
      item_j := p_items -> j;

      IF item_i->>'employee_id' = item_j->>'employee_id' AND item_i->>'booking_date' = item_j->>'booking_date' THEN
        start_i := EXTRACT(EPOCH FROM (item_i->>'booking_time')::TIME) / 60;
        end_i := start_i + (item_i->>'duration')::INT;
        start_j := EXTRACT(EPOCH FROM (item_j->>'booking_time')::TIME) / 60;
        end_j := start_j + (item_j->>'duration')::INT;

        IF start_i < end_j AND start_j < end_i THEN
          RAISE EXCEPTION 'within_group_conflict' USING ERRCODE = '23P01', DETAIL = format('items %s %s', i, j);
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  FOR i IN 0 .. jsonb_array_length(p_items) - 1 LOOP
    item := p_items -> i;
    start_i := EXTRACT(EPOCH FROM (item->>'booking_time')::TIME) / 60;
    end_i := start_i + (item->>'duration')::INT;

    FOR existing_booking IN
      SELECT booking_time, duration
      FROM bookings
      WHERE
        salon_id = p_salon_id AND
        employee_id = (item->>'employee_id')::UUID AND
        booking_date = (item->>'booking_date')::DATE AND
        status != 'cancelled' AND
        deleted_at IS NULL
    LOOP
      existing_start := EXTRACT(EPOCH FROM existing_booking.booking_time) / 60;
      existing_end := existing_start + COALESCE(existing_booking.duration, 0);

      IF start_i < existing_end AND existing_start < end_i THEN
        RAISE EXCEPTION 'db_conflict' USING ERRCODE = '23P01', DETAIL = format('item %s', i);
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO visit_groups(salon_id, client_id, payment_method, notes, status)
  VALUES (p_salon_id, p_client_id, p_payment_method, p_notes, 'confirmed')
  RETURNING id INTO v_visit_group_id;

  FOR i IN 0 .. jsonb_array_length(p_items) - 1 LOOP
    item := p_items -> i;

    INSERT INTO bookings(
      salon_id,
      client_id,
      service_id,
      employee_id,
      booking_date,
      booking_time,
      duration,
      base_price,
      visit_group_id,
      status,
      terms_accepted_at
    )
    VALUES (
      p_salon_id,
      p_client_id,
      (item->>'service_id')::UUID,
      (item->>'employee_id')::UUID,
      (item->>'booking_date')::DATE,
      (item->>'booking_time')::TIME,
      (item->>'duration')::INT,
      (item->>'base_price')::NUMERIC,
      v_visit_group_id,
      'scheduled',
      p_terms_accepted_at
    )
    RETURNING id INTO v_booking_id;

    v_total_price := v_total_price + (item->>'base_price')::NUMERIC;
    v_total_duration := v_total_duration + (item->>'duration')::INT;
    v_bookings := v_bookings || jsonb_build_object('id', v_booking_id);
  END LOOP;

  UPDATE visit_groups
  SET
    total_price = v_total_price,
    total_duration = v_total_duration
  WHERE id = v_visit_group_id;

  RETURN jsonb_build_object('visit_group_id', v_visit_group_id, 'bookings', v_bookings);

END;
$$;
