# Database Migration Strategy for Cloud SQL

This document outlines the strategy for applying the existing database migrations to the Cloud SQL for PostgreSQL instance.

## Overview

The migrations in this directory were originally created for a Supabase environment. While most of the SQL is standard PostgreSQL, some parts, particularly those related to Row Level Security (RLS) policies, use Supabase-specific functions like `auth.uid()` and `auth.role()`.

When moving to a self-hosted Cloud SQL instance, the application's backend service will be responsible for enforcing access control. The database will no longer have direct knowledge of application-level users via Supabase's `auth` schema.

## Required Modifications

Before applying these migrations to Cloud SQL, the following changes must be made to any `.sql` file containing them:

1.  **Remove Supabase-Specific RLS Policies:** Any `CREATE POLICY` statement that relies on `auth.uid()` or `auth.role()` must be removed. The application backend will handle user-based data access.

    **Example (to be removed):**
    ```sql
    CREATE POLICY "Allow all access to authenticated users"
    ON public.contacts_ax2024
    FOR ALL
    USING (auth.role() = 'authenticated');
    ```

2.  **Add Foreign Key Constraints for User ID:** To maintain data integrity, tables that previously relied on RLS for multi-tenancy should have a `user_id` column with a foreign key constraint referencing a central `users` table. The `gcp-backend` service will then use this `user_id` in its queries.

    *(Note: A `users` table migration would need to be created if one doesn't already exist.)*

3.  **Review Trigger Functions:** Ensure any trigger functions, like `trigger_set_timestamp()`, are defined and compatible with standard PostgreSQL. The existing ones appear to be compatible.

## Migration Application Process

The migrations should be applied in chronological order using a standard PostgreSQL client like `psql` or a dedicated schema migration tool (e.g., Flyway, Liquibase).

A sample command to apply a single migration using `psql`:

```bash
psql "sslmode=disable dbname=<DB_NAME> user=<DB_USER> password=<DB_PASS> host=<DB_HOST>" < 0001_add_api_keys_table.sql
```

For automated deployments, this process should be integrated into the CI/CD pipeline. The pipeline should:
1.  Connect to the Cloud SQL instance securely (e.g., via the Cloud SQL Auth Proxy).
2.  Run a script that applies any new, unapplied migrations from this directory in the correct order.
3.  Keep track of which migrations have already been applied to prevent re-running them (a migration tool handles this automatically by using a schema history table).
