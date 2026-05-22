-- Run once on existing databases: psql "$DATABASE_URL" -f onyxx-backend/sql/migrate-image-urls.sql

ALTER TABLE public.roster ADD COLUMN IF NOT EXISTS image_urls jsonb;
UPDATE public.roster
SET image_urls = jsonb_build_array(image_url)
WHERE image_urls IS NULL OR image_urls = '[]'::jsonb OR jsonb_array_length(image_urls) = 0;
ALTER TABLE public.roster ALTER COLUMN image_urls SET DEFAULT '[]'::jsonb;
UPDATE public.roster SET image_urls = '[]'::jsonb WHERE image_urls IS NULL;
ALTER TABLE public.roster ALTER COLUMN image_urls SET NOT NULL;

ALTER TABLE public.hire_models ADD COLUMN IF NOT EXISTS image_urls jsonb;
UPDATE public.hire_models
SET image_urls = jsonb_build_array(image_url)
WHERE image_url IS NOT NULL
  AND TRIM(image_url) <> ''
  AND (image_urls IS NULL OR image_urls = '[]'::jsonb OR jsonb_array_length(image_urls) = 0);
ALTER TABLE public.hire_models ALTER COLUMN image_urls SET DEFAULT '[]'::jsonb;
UPDATE public.hire_models SET image_urls = '[]'::jsonb WHERE image_urls IS NULL;
ALTER TABLE public.hire_models ALTER COLUMN image_urls SET NOT NULL;
