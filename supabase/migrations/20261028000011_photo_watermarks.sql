-- Free-plan photos also get watermarked copies (<file>.wm.jpg). This marks which photos have them.
alter table public.photos add column watermarked boolean not null default false;
