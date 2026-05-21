-- Run once on existing databases: psql "$DATABASE_URL" -f sql/migrations/001_hire_models.sql

CREATE TABLE IF NOT EXISTS public.hire_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text,
  video_url text,
  accomplishments text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hire_models
  DROP CONSTRAINT IF EXISTS hire_models_media_required;

ALTER TABLE public.hire_models
  ADD CONSTRAINT hire_models_media_required CHECK (
    NULLIF(TRIM(COALESCE(image_url, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(video_url, '')), '') IS NOT NULL
  );

ALTER TABLE public.hire_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hire_models_select_public" ON public.hire_models;
CREATE POLICY "hire_models_select_public" ON public.hire_models FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS hire_models_sort_idx ON public.hire_models (sort_order);

DROP TRIGGER IF EXISTS hire_models_set_updated_at ON public.hire_models;
CREATE TRIGGER hire_models_set_updated_at
  BEFORE UPDATE ON public.hire_models
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();
