-- Adds a "composition" PNG path: cropped photo + overlay text BEFORE DMC quantization.
-- Used on the preview page so the user sees their actual design (with readable title) alongside
-- the stitched simulation, instead of relying on quantized stitches to render legible text.
alter table public.patterns
  add column if not exists composition_image_url text;

comment on column public.patterns.composition_image_url is 'Storage path (previews bucket) for the WYSIWYG composition PNG (cropped + overlay text, pre-quantization).';
