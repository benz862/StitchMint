-- Tier chosen at create time: basic | plus | pro (see src/config/pricing.ts; legacy starter/premium normalized in app)
alter table public.patterns
  add column if not exists pricing_tier text;

comment on column public.patterns.pricing_tier is 'Checkout tier id: basic, plus, pro — maps to Stripe pattern_basic, pattern_premium, pattern_pro';
