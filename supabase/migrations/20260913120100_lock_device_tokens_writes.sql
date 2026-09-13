-- device_tokens previously allowed ANY anon/authenticated caller to UPDATE
-- (or upsert-conflict-update) ANY row via `USING (true) WITH CHECK (true)`.
-- Since the anon key ships inside the app bundle, this let anyone disable or
-- overwrite every registered device's push token in one request.
--
-- Fix: remove direct client write access entirely. Registration and opt-out
-- now go exclusively through the `register-device-token` Edge Function, which
-- uses the service role and scopes every write to the exact token supplied by
-- the caller — the same pattern already used for push_subscriptions
-- (see migrations 20260514115230 / 20260514115255).
DROP POLICY IF EXISTS "anyone can register a device token" ON public.device_tokens;
DROP POLICY IF EXISTS "anyone can refresh their device token" ON public.device_tokens;

REVOKE INSERT, UPDATE ON public.device_tokens FROM anon, authenticated;

-- Admin SELECT policy (has_role check) is unchanged and still applies.
