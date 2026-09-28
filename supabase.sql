-- Cloud sync table for Output Tracker. Run once in the Supabase SQL editor.
-- One row per user holding the whole app state as JSON.

create table if not exists public.state (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  prev jsonb,                 -- the version before the last save, as a safety net
  prev_updated_at timestamptz
);

alter table public.state enable row level security;

create policy "Read own state" on public.state
  for select to authenticated using (auth.uid() = user_id);
create policy "Insert own state" on public.state
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Update own state" on public.state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.state to authenticated;

-- Server time decides which save is newer, and the previous version is kept on every update.
create or replace function public.state_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.prev := old.data;
  new.prev_updated_at := old.updated_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists state_before_update on public.state;
create trigger state_before_update
  before update on public.state
  for each row execute function public.state_before_update();
