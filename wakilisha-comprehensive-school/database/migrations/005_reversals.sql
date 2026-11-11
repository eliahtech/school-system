-- Immutable reversal journal. Never DELETE a posted payment.
CREATE TABLE IF NOT EXISTS payment_reversals(
 id BIGSERIAL PRIMARY KEY,
 payment_id BIGINT NOT NULL UNIQUE REFERENCES payments(id),
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 reason TEXT NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('manual','pesapal')),
 recorded_by BIGINT REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_reversals_time ON payment_reversals(created_at);
