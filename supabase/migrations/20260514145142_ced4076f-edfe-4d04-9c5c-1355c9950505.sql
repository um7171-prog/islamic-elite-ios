CREATE TABLE public.announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL,
  body_en TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published announcements"
ON public.announcements FOR SELECT
USING (published = true);

CREATE TRIGGER announcements_touch_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_announcements_created_at ON public.announcements (created_at DESC);