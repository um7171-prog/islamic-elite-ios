CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  tz TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  lang TEXT NOT NULL DEFAULT 'ar',
  enabled BOOLEAN NOT NULL DEFAULT true,
  pre_reminder_minutes INT NOT NULL DEFAULT 0,
  dhikr_reminder_minutes INT NOT NULL DEFAULT 0,
  night_alerts BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Anonymous device subscriptions: anyone can register/update their own by endpoint.
CREATE POLICY "anyone can insert push subscriptions"
ON public.push_subscriptions FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "anyone can update push subscriptions"
ON public.push_subscriptions FOR UPDATE TO anon, authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "anyone can delete push subscriptions"
ON public.push_subscriptions FOR DELETE TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER push_subscriptions_touch
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;