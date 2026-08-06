-- Create people table for user role assignments
create table if not exists public.people (
  id uuid default gen_random_uuid() primary key,
  email varchar(255) not null unique,
  role varchar(50) not null check (role in ('administrator', 'tenant', 'contractor', 'cleaner', 'landlord')),
  property_id uuid,
  room_id uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index on email for fast lookups
create index if not exists idx_people_email on public.people(email);

-- Create index on property_id for filtering
create index if not exists idx_people_property_id on public.people(property_id);

-- Create index on role for filtering
create index if not exists idx_people_role on public.people(role);

-- Enable Row Level Security
alter table public.people enable row level security;

-- Policy: Anyone can read their own record (based on email from auth)
create policy "users_can_read_own_record" on public.people
  for select using (auth.jwt() ->> 'email' = email);

-- Policy: Only administrators can insert/update/delete
create policy "only_admin_can_modify" on public.people
  for all using (
    auth.jwt() ->> 'email' in (
      select email from public.people where role = 'administrator'
    )
  );

-- Create a function to update the updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create a trigger to automatically update updated_at
create trigger update_people_updated_at before update on public.people
  for each row execute function public.update_updated_at_column();
