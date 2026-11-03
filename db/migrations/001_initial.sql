-- CeloAgent durable state schema.
-- Run with a migration tool or psql before enabling DATABASE_URL in production.
-- Monetary values are NUMERIC strings so JavaScript never receives a lossy Number.

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'TERMINATED')),
  active_policy_id TEXT NOT NULL,
  wallet_address TEXT,
  metadata JSONB,
  created_at BIGINT NOT NULL CHECK (created_at > 0),
  updated_at BIGINT NOT NULL CHECK (updated_at > 0),
  status_reason TEXT CHECK (status_reason IS NULL OR char_length(status_reason) <= 500)
);

CREATE TABLE IF NOT EXISTS agent_policy_versions (
  policy_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  policy JSONB NOT NULL,
  created_at BIGINT NOT NULL CHECK (created_at > 0),
  UNIQUE (agent_id, policy_id)
);

ALTER TABLE agents
  DROP CONSTRAINT IF EXISTS agents_active_policy_fk;
ALTER TABLE agents
  ADD CONSTRAINT agents_active_policy_fk
  FOREIGN KEY (active_policy_id) REFERENCES agent_policy_versions(policy_id) ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS budget_states (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  window_id DATE NOT NULL,
  policy_id TEXT,
  daily_limit_wei NUMERIC(78, 0) NOT NULL CHECK (daily_limit_wei >= 0),
  spent_wei NUMERIC(78, 0) NOT NULL DEFAULT 0 CHECK (spent_wei >= 0),
  reserved_wei NUMERIC(78, 0) NOT NULL DEFAULT 0 CHECK (reserved_wei >= 0),
  updated_at BIGINT NOT NULL CHECK (updated_at >= 0),
  PRIMARY KEY (agent_id, window_id)
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  idempotency_key TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  policy_id TEXT,
  window_id DATE NOT NULL,
  amount_wei NUMERIC(78, 0) NOT NULL CHECK (amount_wei > 0),
  amount_cusd TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RESERVED', 'SUBMITTED', 'COMMITTED', 'RELEASED', 'HELD_FOR_RECONCILIATION')),
  created_at BIGINT NOT NULL CHECK (created_at > 0),
  updated_at BIGINT NOT NULL CHECK (updated_at > 0),
  tx_hash TEXT,
  failure_reason TEXT,
  retryable_for_approval BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS reservation_idempotency (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  PRIMARY KEY (agent_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS pending_approvals (
  request_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  amount_cusd TEXT NOT NULL,
  recipient TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  created_at BIGINT NOT NULL CHECK (created_at > 0),
  valid_until BIGINT NOT NULL CHECK (valid_until > 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
  status_reason TEXT,
  resolved_at BIGINT
);

CREATE TABLE IF NOT EXISTS approval_idempotency (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES pending_approvals(request_id) ON DELETE RESTRICT,
  PRIMARY KEY (agent_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS payment_executions (
  reservation_id TEXT PRIMARY KEY REFERENCES reservations(id) ON DELETE RESTRICT,
  request_id TEXT,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  execution_asset TEXT NOT NULL,
  execution_network TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('AUTHORIZED', 'BROADCAST', 'SUBMITTED', 'COMMITTED', 'FAILED', 'UNCERTAIN')),
  tx_hash TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_address TEXT,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  request_id TEXT,
  reservation_id TEXT,
  tx_hash TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS agents_owner_idx ON agents(owner_address);
CREATE INDEX IF NOT EXISTS reservations_reconciliation_idx
  ON reservations(status, updated_at)
  WHERE status IN ('SUBMITTED', 'HELD_FOR_RECONCILIATION');
CREATE INDEX IF NOT EXISTS pending_approvals_agent_status_idx
  ON pending_approvals(agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_nonces_expiry_idx ON auth_nonces(expires_at);
CREATE INDEX IF NOT EXISTS audit_events_agent_created_idx ON audit_events(agent_id, created_at DESC);

CREATE OR REPLACE FUNCTION celoagent_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION celoagent_reject_audit_mutation();

-- Application roles should receive INSERT/SELECT access to audit_events but no
-- UPDATE or DELETE access. The exact role is deployment-specific and is left
-- to the operator rather than guessed in a migration.
