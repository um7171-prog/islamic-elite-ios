CREATE TABLE public.job_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT 'جميع المدن',
  employment_type text NOT NULL DEFAULT 'all',
  experience_level text NOT NULL DEFAULT 'all',
  contact text,
  device_token text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.job_alerts TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.job_alerts TO authenticated;
GRANT ALL ON public.job_alerts TO service_role;

ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can create a job alert"
  ON public.job_alerts FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "admins can read job alerts"
  ON public.job_alerts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins can update job alerts"
  ON public.job_alerts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins can delete job alerts"
  ON public.job_alerts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER job_alerts_touch_updated_at
  BEFORE UPDATE ON public.job_alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();