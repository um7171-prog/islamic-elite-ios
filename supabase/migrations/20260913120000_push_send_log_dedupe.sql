-- Idempotency log for send-prayer-pushes: guarantees the same prayer/reminder
-- notification is never delivered twice to the same endpoint in the same
-- UTC minute, even if the cron trigger fires concurrently or is retried.
CREATE TABLE public.push_send_log (
  endpoint text NOT NULL,
  tag text NOT NULL,
  minute_bucket text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (endpoint, tag, minute_bucket)
);

ALTER TABLE public.push_send_log ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service role (used exclusively inside the
-- send-prayer-pushes Edge Function) can read or write this table. anon and
-- authenticated get zero access, same as push_subscriptions today.
