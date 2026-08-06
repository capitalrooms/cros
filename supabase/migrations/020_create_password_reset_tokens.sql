-- Create password reset tokens table
create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone
);

-- Create index for token lookup
create index idx_password_reset_tokens_token on password_reset_tokens(token);
create index idx_password_reset_tokens_user_id on password_reset_tokens(user_id);

-- Enable RLS
alter table password_reset_tokens enable row level security;

-- Allow anyone to insert (for password reset flow)
create policy "anyone_can_insert_reset_token"
  on password_reset_tokens for insert
  with check (true);

-- Allow users to view their own tokens
create policy "users_can_view_own_reset_tokens"
  on password_reset_tokens for select
  using (auth.uid() = user_id);
