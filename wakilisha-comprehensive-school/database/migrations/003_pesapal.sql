-- Checkout intents are not payments; only verified completed orders are posted.
CREATE TABLE IF NOT EXISTS pesapal_orders (
 id BIGSERIAL PRIMARY KEY,
 merchant_reference TEXT NOT NULL UNIQUE,
 order_tracking_id TEXT UNIQUE,
 student_id BIGINT NOT NULL REFERENCES students(id),
 initiated_by BIGINT NOT NULL REFERENCES users(id),
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 currency CHAR(3) NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
 status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created','pending','completed','failed','reversed','review')),
 provider_confirmation TEXT,
 provider_status JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pesapal_confirmation ON pesapal_orders(provider_confirmation) WHERE provider_confirmation IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pesapal_student ON pesapal_orders(student_id,created_at DESC);
