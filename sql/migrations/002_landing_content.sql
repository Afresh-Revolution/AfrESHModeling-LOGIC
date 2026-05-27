-- Run once on existing databases:
-- psql "$DATABASE_URL" -f sql/migrations/002_landing_content.sql

CREATE TABLE IF NOT EXISTS public.landing_content (
  id smallint PRIMARY KEY CHECK (id = 1),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.landing_content (id, content)
VALUES (
  1,
  jsonb_build_object(
    'hero_badge','Now Accepting Applications',
    'hero_title_prefix','AfrESH',
    'hero_title_highlight','Modeling',
    'hero_subtitle','Where Elegance Meets Excellence',
    'hero_primary_cta','View Our Talent',
    'hero_secondary_cta','Apply Now',
    'models_section_label','Featured Talent',
    'models_section_title','Our Roster',
    'models_section_description','Discover the faces that define AfrESH Modeling — each selected for their unique presence and professional drive.',
    'ecosystem_section_label','Our Process',
    'ecosystem_section_title','The AfrESH Modeling Ecosystem',
    'ecosystem_section_description','A scientifically structured pipeline that transforms raw potential into industry-leading talent.',
    'data_section_label','Performance Metrics',
    'data_section_title','By The Numbers',
    'data_section_description','Data-driven results that validate our approach to model development and market placement.',
    'apply_section_label','Open Call',
    'apply_section_title','Become Part of AfrESH Modeling',
    'apply_section_description','We are always looking for extraordinary individuals. Submit your application below.',
    'apply_requirements_title','What We Look For',
    'apply_requirements_intro','AfrESH Modeling represents a curated selection of talent. Our scouting process is both intuitive and analytical, seeking individuals who bring something unmistakable to the industry.',
    'apply_requirement_1','Height preference: 5''8" and above for women, 6''0" and above for men',
    'apply_requirement_2','Strong facial bone structure and unique features',
    'apply_requirement_3','Professional attitude and reliability',
    'apply_requirement_4','No prior experience required — we develop raw talent',
    'apply_requirement_5','Must be 16 years or older to apply',
    'apply_requirement_6','Open to all ethnicities, body types within our diverse categories',
    'gallery_section_label','Editorial',
    'gallery_section_title','Recent Campaigns',
    'gallery_section_description','A glimpse into the campaigns and editorial work produced through the AfrESH Modeling ecosystem.',
    'footer_brand_description','Redefining the modeling industry through data-driven talent development and uncompromising standards of elegance.',
    'footer_contact_location','Jos, Nigeria',
    'footer_contact_email','afreshmodeling@gmail.com',
    'footer_apply_button','Apply Now',
    'footer_portfolio_button','View Portfolio',
    'footer_contact_button','Contact Us',
    'footer_copyright_year','2026',
    'footer_copyright_text','AfrESH Modeling. All rights reserved.'
  )
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landing_content_select_public" ON public.landing_content;
CREATE POLICY "landing_content_select_public" ON public.landing_content FOR SELECT USING (true);

DROP TRIGGER IF EXISTS landing_content_set_updated_at ON public.landing_content;
CREATE TRIGGER landing_content_set_updated_at
  BEFORE UPDATE ON public.landing_content
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();
