
ALTER TABLE public.roster ADD COLUMN IF NOT EXISTS social_url text;

COMMENT ON COLUMN public.roster.social_url IS
  'Optional HTTPS profile link (e.g. Instagram) shown under the model card on the public site.';
