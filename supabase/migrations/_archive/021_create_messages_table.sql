-- Create messages table for notifications
create table messages (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  title text not null,
  content text,
  type text default 'notification', -- notification, alert, message
  action_link text,
  read boolean default false,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create index for recipient queries
create index idx_messages_recipient_id on messages(recipient_id);
create index idx_messages_read on messages(recipient_id, read);

-- Enable RLS
alter table messages enable row level security;

-- Users can view their own messages
create policy "users_can_view_own_messages"
  on messages for select
  using (auth.uid() = recipient_id);

-- System can insert messages
create policy "system_can_insert_messages"
  on messages for insert
  with check (true);

-- Users can mark their messages as read
create policy "users_can_update_own_messages"
  on messages for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);
