CREATE TABLE public.device_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'ios',
  lang text NOT NULL DEFAULT 'ar',
  app_version text,
  device_model text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.device_tokens TO anon, authenticated;
GRANT ALL ON public.device_tokens TO service_role;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can register a device token"
  ON public.device_tokens FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anyone can refresh their device token"
  ON public.device_tokens FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "admins can read device tokens"
  ON public.device_tokens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER device_tokens_touch
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'announcement',
  ADD COLUMN IF NOT EXISTS push_sent_at timestamp with time zone;