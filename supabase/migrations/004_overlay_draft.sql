-- Text overlay is stored separately from the raster so users can edit copy/position after upload.
alter table public.patterns
  add column if not exists overlay_draft jsonb;

comment on column public.patterns.overlay_draft is 'Optional {v:1,text,anchorX,anchorY,typography,color}; original_image is crop without baked text when set.';
