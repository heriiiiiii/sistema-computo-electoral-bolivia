-- =============================================================================
--  00-create-replication-user.sql
--  Create Streaming Replication User
--  Sistema Nacional de Cómputo Electoral Bolivia
--
--  Runs automatically on first start via /docker-entrypoint-initdb.d/
--  This must be file "00" so it runs BEFORE the schema scripts.
--
--  IDEMPOTENT: uses IF NOT EXISTS.
-- =============================================================================

-- Create the replication user used by postgres-replica to stream WAL
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') THEN
    CREATE USER replicator WITH REPLICATION LOGIN PASSWORD 'replicator_password';
    RAISE NOTICE 'Created replication user: replicator';
  ELSE
    RAISE NOTICE 'Replication user already exists: replicator';
  END IF;
END
$$;
