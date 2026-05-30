-- =============================================================================
-- AfrESH Modeling — consolidated PostgreSQL schema (standard Postgres 13+; Supabase-compatible)
-- Requires: gen_random_uuid() (built-in PG 13+; else: CREATE EXTENSION IF NOT EXISTS pgcrypto;)
--
-- Apply (fresh or existing DB): psql "$DATABASE_URL" -f sql/schema.sql
--
-- Safe to re-run on a live database — this file is idempotent:
--   • CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — skips existing objects
--   • INSERT … ON CONFLICT DO NOTHING — never overwrites existing rows (admin_users,
--     site_metrics, landing_content)
--   • UPDATE backfills only NULL or empty jsonb arrays — never replaces populated data
--   • DROP … IF EXISTS before policies, constraints, triggers — reapplies definitions
--   • No TRUNCATE, DELETE, or DROP TABLE
-- =============================================================================

SET client_min_messages = WARNING;

-- ---------------------------------------------------------------------------
-- Admin users (Fastify POST /api/auth/login — bcrypt password_hash)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Optional: seed an admin (generate password_hash with bcrypt, e.g. cost 10)
-- INSERT INTO public.admin_users (email, password_hash)
-- VALUES ('you@example.com', '$2b$10$...')
-- ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Public content
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  image_url text NOT NULL,
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roster ADD COLUMN IF NOT EXISTS image_urls jsonb;
UPDATE public.roster
SET image_urls = jsonb_build_array(image_url)
WHERE image_urls IS NULL
   OR image_urls = '[]'::jsonb
   OR jsonb_array_length(image_urls) = 0;
ALTER TABLE public.roster ALTER COLUMN image_urls SET DEFAULT '[]'::jsonb;
UPDATE public.roster SET image_urls = '[]'::jsonb WHERE image_urls IS NULL;
ALTER TABLE public.roster ALTER COLUMN image_urls SET NOT NULL;

COMMENT ON COLUMN public.roster.image_urls IS 'JSON array of image HTTPS URLs; image_url mirrors the first entry.';

CREATE TABLE IF NOT EXISTS public.editorial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  image_url text,
  video_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Legacy: add video column; allow poster-only or video-only rows
ALTER TABLE public.editorial
  ADD COLUMN IF NOT EXISTS video_url text;

ALTER TABLE public.editorial
  ALTER COLUMN image_url DROP NOT NULL;

ALTER TABLE public.editorial
  DROP CONSTRAINT IF EXISTS editorial_media_required;

ALTER TABLE public.editorial
  ADD CONSTRAINT editorial_media_required CHECK (
    NULLIF(TRIM(COALESCE(image_url, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(video_url, '')), '') IS NOT NULL
  );

COMMENT ON COLUMN public.editorial.video_url IS
  'HTTPS URL to campaign video after Cloudinary upload (e.g. .../video/upload/...mp4); surfaced on the public site Film section.';

CREATE TABLE IF NOT EXISTS public.hire_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text,
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  video_url text,
  accomplishments text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hire_models ADD COLUMN IF NOT EXISTS image_urls jsonb;
UPDATE public.hire_models
SET image_urls = jsonb_build_array(image_url)
WHERE image_url IS NOT NULL
  AND TRIM(image_url) <> ''
  AND (
    image_urls IS NULL
    OR image_urls = '[]'::jsonb
    OR jsonb_array_length(image_urls) = 0
  );
ALTER TABLE public.hire_models ALTER COLUMN image_urls SET DEFAULT '[]'::jsonb;
UPDATE public.hire_models SET image_urls = '[]'::jsonb WHERE image_urls IS NULL;
ALTER TABLE public.hire_models ALTER COLUMN image_urls SET NOT NULL;

COMMENT ON COLUMN public.hire_models.image_urls IS 'JSON array of profile image URLs; image_url mirrors the first entry.';

ALTER TABLE public.hire_models
  DROP CONSTRAINT IF EXISTS hire_models_media_required;

ALTER TABLE public.hire_models
  ADD CONSTRAINT hire_models_media_required CHECK (
    NULLIF(TRIM(COALESCE(image_url, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(video_url, '')), '') IS NOT NULL
  );

COMMENT ON COLUMN public.hire_models.accomplishments IS
  'Career highlights, bookings, and records shown on the public Hiring Models section.';

-- ---------------------------------------------------------------------------
-- Applications (public apply form + admin API)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  date_of_birth date,
  height text,
  city text,
  experience_level text,
  portfolio_url text,
  message text,
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new',
  interview_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applications_status_check CHECK (
    status = ANY (
      ARRAY[
        'new'::text,
        'reviewed'::text,
        'shortlisted'::text,
        'rejected'::text,
        'archived'::text
      ]
    )
  )
);

-- Legacy columns / backfill (safe if already present)
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS interview_at timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS photo_urls jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.applications SET photo_urls = '[]'::jsonb WHERE photo_urls IS NULL;
ALTER TABLE public.applications ALTER COLUMN photo_urls SET DEFAULT '[]'::jsonb;

UPDATE public.applications
SET updated_at = created_at
WHERE updated_at IS NULL AND created_at IS NOT NULL;

COMMENT ON COLUMN public.applications.message IS 'Tell us about yourself (public apply form).';
COMMENT ON COLUMN public.applications.interview_at IS 'Scheduled interview when status is shortlisted.';
COMMENT ON COLUMN public.applications.photo_urls IS 'JSON array of image HTTPS URLs (e.g. Cloudinary).';

CREATE INDEX IF NOT EXISTS applications_created_at_idx ON public.applications (created_at DESC);
CREATE INDEX IF NOT EXISTS applications_status_idx ON public.applications (status);
CREATE INDEX IF NOT EXISTS applications_email_idx ON public.applications (email);

-- ---------------------------------------------------------------------------
-- Homepage performance metrics + chart data (singleton row id = 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_metrics (
  id smallint PRIMARY KEY CHECK (id = 1),
  total_earnings_display text NOT NULL DEFAULT '₦6.5B',
  brand_partnerships integer NOT NULL DEFAULT 87,
  countries_placements integer NOT NULL DEFAULT 32,
  models_represented integer NOT NULL DEFAULT 250,
  campaigns_delivered integer NOT NULL DEFAULT 1200,
  years_excellence integer NOT NULL DEFAULT 12,
  placement_rate_percent integer NOT NULL DEFAULT 94 CHECK (placement_rate_percent >= 0 AND placement_rate_percent <= 100),
  category_distribution jsonb NOT NULL DEFAULT '[
    {"label":"Editorial","value":35},
    {"label":"Commercial","value":25},
    {"label":"Runway","value":20},
    {"label":"Plus Size","value":12},
    {"label":"Fitness","value":8}
  ]'::jsonb,
  placement_by_year jsonb NOT NULL DEFAULT '[
    {"year":2019,"rate":72},
    {"year":2020,"rate":65},
    {"year":2021,"rate":78},
    {"year":2022,"rate":85},
    {"year":2023,"rate":91},
    {"year":2024,"rate":94},
    {"year":2025,"rate":95},
    {"year":2026,"rate":96}
  ]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_metrics (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Landing page copy (singleton row id = 1; admin-editable JSON)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.landing_content (
  id smallint PRIMARY KEY CHECK (id = 1),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.landing_content (id, content)
VALUES (
  1,
  jsonb_build_object(
    'hero_badge', 'Now Accepting Applications',
    'hero_title_prefix', 'AfrESH',
    'hero_title_highlight', 'Modeling',
    'hero_subtitle', 'Where Elegance Meets Excellence',
    'hero_primary_cta', 'View Our Talent',
    'hero_secondary_cta', 'Apply Now',
    'models_section_label', 'Featured Talent',
    'models_section_title', 'Our Roster',
    'models_section_description', 'Discover the faces that define AfrESH Modeling — each selected for their unique presence and professional drive.',
    'ecosystem_section_label', 'Our Process',
    'ecosystem_section_title', 'The AfrESH Modeling Ecosystem',
    'ecosystem_section_description', 'A scientifically structured pipeline that transforms raw potential into industry-leading talent.',
    'data_section_label', 'Performance Metrics',
    'data_section_title', 'By The Numbers',
    'data_section_description', 'Data-driven results that validate our approach to model development and market placement.',
    'apply_section_label', 'Open Call',
    'apply_section_title', 'Become Part of AfrESH Modeling',
    'apply_section_description', 'We are always looking for extraordinary individuals. Submit your application below.',
    'apply_requirements_title', 'What We Look For',
    'apply_requirements_intro', 'AfrESH Modeling represents a curated selection of talent. Our scouting process is both intuitive and analytical, seeking individuals who bring something unmistakable to the industry.',
    'apply_requirement_1', 'Height preference: 5''8" and above for women, 6''0" and above for men',
    'apply_requirement_2', 'Strong facial bone structure and unique features',
    'apply_requirement_3', 'Professional attitude and reliability',
    'apply_requirement_4', 'No prior experience required — we develop raw talent',
    'apply_requirement_5', 'Must be 16 years or older to apply',
    'apply_requirement_6', 'Open to all ethnicities, body types within our diverse categories',
    'gallery_section_label', 'Editorial',
    'gallery_section_title', 'Recent Campaigns',
    'gallery_section_description', 'A glimpse into the campaigns and editorial work produced through the AfrESH Modeling ecosystem.',
    'footer_brand_description', 'Redefining the modeling industry through data-driven talent development and uncompromising standards of elegance.',
    'footer_contact_location', 'Jos, Nigeria',
    'footer_contact_email', 'afreshmodeling@gmail.com',
    'footer_apply_button', 'Apply Now',
    'footer_portfolio_button', 'View Portfolio',
    'footer_contact_button', 'Contact Us',
    'footer_copyright_year', '2026',
    'footer_copyright_text', 'AfrESH Modeling. All rights reserved.'
  )
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.landing_content IS 'Singleton homepage copy; content JSON is edited via admin API.';

-- ---------------------------------------------------------------------------
-- Row level security (Supabase: anon uses policies; direct Postgres role may bypass)
-- ---------------------------------------------------------------------------
ALTER TABLE public.roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hire_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roster_select_public" ON public.roster;
CREATE POLICY "roster_select_public" ON public.roster FOR SELECT USING (true);

DROP POLICY IF EXISTS "editorial_select_public" ON public.editorial;
CREATE POLICY "editorial_select_public" ON public.editorial FOR SELECT USING (true);

DROP POLICY IF EXISTS "hire_models_select_public" ON public.hire_models;
CREATE POLICY "hire_models_select_public" ON public.hire_models FOR SELECT USING (true);

ALTER TABLE public.site_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_metrics_select_public" ON public.site_metrics;
CREATE POLICY "site_metrics_select_public" ON public.site_metrics FOR SELECT USING (true);

ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landing_content_select_public" ON public.landing_content;
CREATE POLICY "landing_content_select_public" ON public.landing_content FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- Indexes (sort order)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS roster_sort_idx ON public.roster (sort_order);
CREATE INDEX IF NOT EXISTS editorial_sort_idx ON public.editorial (sort_order);
CREATE INDEX IF NOT EXISTS hire_models_sort_idx ON public.hire_models (sort_order);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roster_set_updated_at ON public.roster;
CREATE TRIGGER roster_set_updated_at
  BEFORE UPDATE ON public.roster
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS editorial_set_updated_at ON public.editorial;
CREATE TRIGGER editorial_set_updated_at
  BEFORE UPDATE ON public.editorial
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS hire_models_set_updated_at ON public.hire_models;
CREATE TRIGGER hire_models_set_updated_at
  BEFORE UPDATE ON public.hire_models
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS applications_set_updated_at ON public.applications;
CREATE TRIGGER applications_set_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS site_metrics_set_updated_at ON public.site_metrics;
CREATE TRIGGER site_metrics_set_updated_at
  BEFORE UPDATE ON public.site_metrics
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS landing_content_set_updated_at ON public.landing_content;
CREATE TRIGGER landing_content_set_updated_at
  BEFORE UPDATE ON public.landing_content
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- One-time currency display migration (USD placeholder -> Naira).
UPDATE public.site_metrics
SET total_earnings_display = '₦6.5B'
WHERE id = 1
  AND total_earnings_display IN ('$4.2M', '$4.2m', '4.2M', '4.2m');
