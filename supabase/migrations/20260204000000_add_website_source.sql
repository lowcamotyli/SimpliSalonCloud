ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_source_check;
ALTER TABLE bookings
ADD CONSTRAINT bookings_source_check CHECK (source IN ('manual', 'booksy', 'api', 'website'));