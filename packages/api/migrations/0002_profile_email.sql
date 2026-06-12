-- packages/api/migrations/0002_profile_email.sql
--
-- Profile + optional receipt email. The public key remains the SOLE canonical
-- identity (founders.identity); username/email are non-identity attributes.
--
--   • username : optional unique handle, set later via the (auth-gated)
--                profile editor. SQLite UNIQUE indexes permit multiple NULLs,
--                so a nullable unique handle is fine.
--   • email    : optional, receipt/confirmation ONLY. Never an identity.
--                Stored on the provisional payments row at checkout, then
--                backfilled onto the founder row when the IPN confirms.

ALTER TABLE founders ADD COLUMN username TEXT;
ALTER TABLE founders ADD COLUMN email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_founders_username
  ON founders (username);

ALTER TABLE payments ADD COLUMN email TEXT;
