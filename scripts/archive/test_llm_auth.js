// Supabase Functions client should automatically include the user's session token if they are logged in via `supabase.auth.signIn`.
// But wait, the passport-verify also failed with 401: Access to fetch at '.../functions/v1/passport-verify' ... blocked by CORS policy. (The CORS is fixed now).
// For Onyx worker, I've appended the token using this:
// const { data: { session } } = await this.supabase.auth.getSession();
// const token = session?.access_token || secureKey;
// 'Authorization': 'Bearer ' + token
