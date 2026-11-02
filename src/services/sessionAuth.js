import { supabase } from './supabaseClient';

/**
 * Authorization header for Edge Function calls made from the dashboard.
 *
 * Several browser commands used to authenticate with `VITE_SUPABASE_SERVICE_ROLE_KEY`
 * or with the literal string `'fallback_internal_key'`. Both are wrong in the same
 * way: a `VITE_*` value is compiled into the public JS bundle, so either the
 * dashboard ships a full-database credential to every visitor, or the build never
 * sets it and the call fails with `Bearer undefined`. A literal fallback is worse
 * still — it is a credential that is already public.
 *
 * The dashboard only ever acts as the signed-in operator, so it presents that
 * operator's own session token. The receiving function is responsible for
 * deciding what a verified user is allowed to do.
 */
export async function sessionAuthHeaders(extra = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(`Could not read the current session: ${error.message}`);
  }

  const token = data?.session?.access_token;
  if (!token) {
    throw new Error('Not signed in — this command needs an authenticated session.');
  }

  return { ...extra, Authorization: `Bearer ${token}` };
}
