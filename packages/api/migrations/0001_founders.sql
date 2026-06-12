-- packages/api/migrations/0001_founders.sql
--
-- Sidecoin Founders + Payments schema (Cloudflare D1 / SQLite).
--
-- Bound to the sidecoin-api Worker as binding "DB".
--   • payment routes (routes/payments.ts) -> writes (webhook mints/credits)
--   • founders read routes                 -> reads  (public leaderboard)
--
-- Money model (Mullvad-style): one purchase = plan x quantity, paid up
-- front, NO auto-renew. PRO is active while now_secs < paid_through.
-- All timestamps and the paid_through extension are computed in the Worker
-- (Date.now()/1000), NOT in SQL, so behavior never depends on which SQLite
-- math/date functions D1 has enabled.
--
-- Founder mechanics:
--   • founder_number is minted on FIRST confirmed payment, by payment order
--     (AUTOINCREMENT). It never changes.
--   • The cut line is DERIVED in the Worker: max(1, ceil(COUNT(*) * 0.20)).
--     It only descends as the population grows, so a row can only ever move
--     ABOVE the line, never below it.
--   • is_alpha is set ONCE, at the fork, for every founder above the final
--     line -- locking Lifetime PRO + public profile permanently.

PRAGMA foreign_keys = ON;

-- One row per founder identity. Minted on first confirmed payment.
CREATE TABLE IF NOT EXISTS founders (
  founder_number  INTEGER PRIMARY KEY AUTOINCREMENT,  -- immutable join order
  identity        TEXT    NOT NULL UNIQUE,            -- wallet public key
  display_name    TEXT,                               -- optional, user-set
  avatar_seed     TEXT    NOT NULL,                   -- deterministic avatar seed
  bio             TEXT,                               -- public profile (gated by cut line)
  links_json      TEXT,                               -- JSON array of social links
  paid_through    INTEGER NOT NULL,                   -- unix secs; PRO active while now < this
  is_alpha        INTEGER NOT NULL DEFAULT 0,         -- 1 = locked Alpha Circle (set at fork)
  created_at      INTEGER NOT NULL,                   -- unix secs of first confirmed payment
  updated_at      INTEGER NOT NULL
);

-- Supports "is PRO currently active?" sweeps and lapse checks.
CREATE INDEX IF NOT EXISTS idx_founders_paid_through
  ON founders (paid_through);

-- Append-only ledger of every payment seen from NOWPayments. The payment_id
-- PK is the idempotency key: NOWPayments RETRIES IPNs, so the webhook uses
-- INSERT ... ON CONFLICT(payment_id) to avoid double-crediting.
CREATE TABLE IF NOT EXISTS payments (
  payment_id      TEXT    PRIMARY KEY,                -- NOWPayments payment_id
  identity        TEXT    NOT NULL,                   -- wallet public key from order_id
  founder_number  INTEGER,                            -- linked after minting (nullable)
  order_id        TEXT    NOT NULL,                   -- raw order_id we generated
  plan            TEXT    NOT NULL,                   -- 'monthly' | 'yearly'
  quantity        INTEGER NOT NULL,                   -- N periods purchased
  duration_months INTEGER NOT NULL,                   -- monthly:N, yearly:N*12
  price_amount    REAL    NOT NULL,                   -- USD invoiced
  pay_currency    TEXT,                               -- e.g. 'btc'
  actually_paid   REAL,                               -- from IPN
  status          TEXT    NOT NULL,                   -- last seen payment_status
  created_at      INTEGER NOT NULL,
  confirmed_at    INTEGER,                            -- set when status='finished'
  FOREIGN KEY (founder_number) REFERENCES founders (founder_number)
);

CREATE INDEX IF NOT EXISTS idx_payments_identity
  ON payments (identity);

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments (status);
