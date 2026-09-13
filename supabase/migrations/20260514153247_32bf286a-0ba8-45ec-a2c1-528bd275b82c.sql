
-- Visitors table
CREATE TABLE public.visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'unknown',
  os TEXT,
  os_version TEXT,
  browser TEXT,
  country TEXT,
  country_code TEXT,
  city TEXT,
  app_version TEXT,
  language TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_visitors_created_at ON public.visitors (created_at DESC);
CREATE INDEX idx_visitors_session ON public.visitors (session_id);
CREATE INDEX idx_visitors_device ON public.visitors (device_type);
CREATE INDEX idx_visitors_country ON public.visitors (country_code);

-- Download events
CREATE TABLE public.download_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  file_name TEXT NOT NULL,
  source_url TEXT,
  device_type TEXT NOT NULL DEFAULT 'unknown',
  country_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_downloads_created_at ON public.download_events (created_at DESC);

-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Visitors: anyone can insert, only admin can read
CREATE POLICY "anyone can insert visitors"
ON public.visitors FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "admins can read visitors"
ON public.visitors FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Downloads: anyone can insert, only admin can read
CREATE POLICY "anyone can insert downloads"
ON public.download_events FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "admins can read downloads"
ON public.download_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- user_roles: admins can read; users can read their own
CREATE POLICY "users read own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "admins read all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Auto-assign admin role to first user
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Allow admins to manage announcements (insert/update/delete)
CREATE POLICY "admins can insert announcements"
ON public.announcements FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can update announcements"
ON public.announcements FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete announcements"
ON public.announcements FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
