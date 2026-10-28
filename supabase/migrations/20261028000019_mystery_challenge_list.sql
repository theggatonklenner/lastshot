-- Mystery shot challenges: up to 20, one per line, picked at random per guest.
-- Applied to the Lastshot project as migration "mystery_challenge_list".
alter table public.events drop constraint events_mystery_prompt_check;
alter table public.events add constraint events_mystery_prompt_check check (char_length(mystery_prompt) <= 2600);
