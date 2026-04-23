ALTER TABLE services
    ADD COLUMN price_type TEXT NOT NULL DEFAULT 'fixed'
        CHECK (price_type IN ('fixed', 'variable', 'from', 'hidden', 'free'));
