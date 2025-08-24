-- SecureChat Database Schema for Supabase
-- This file contains the PostgreSQL schema for the SecureChat application

-- Create user_profiles table
create table if not exists public.user_profiles (
    id uuid references auth.users(id) on delete cascade primary key,
    email text unique not null,
    username text unique not null,
    avatar_url text,
    passcode_hash text default '', -- Allow empty initially, will be set during setup
    is_online boolean default false,
    last_active timestamp with time zone default now(),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Create messages table
create table if not exists public.messages (
    id uuid default gen_random_uuid() primary key,
    sender_id uuid references public.user_profiles(id) on delete cascade not null,
    receiver_id uuid references public.user_profiles(id) on delete cascade not null,
    type text check (type in ('text', 'tiktok')) default 'text',
    content text not null,
    timestamp timestamp with time zone default now(),
    is_read boolean default false
);

-- Enable RLS (Row Level Security) AFTER table creation
alter table public.user_profiles enable row level security;
alter table public.messages enable row level security;

-- Create indexes for better performance
create index if not exists idx_messages_sender_receiver on public.messages(sender_id, receiver_id);
create index if not exists idx_messages_timestamp on public.messages(timestamp desc);
create index if not exists idx_user_profiles_username on public.user_profiles(username);
create index if not exists idx_user_profiles_is_online on public.user_profiles(is_online);

-- Create function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Create trigger for user_profiles updated_at
drop trigger if exists on_user_profiles_updated on public.user_profiles;
create trigger on_user_profiles_updated
    before update on public.user_profiles
    for each row execute procedure public.handle_updated_at();

-- Row Level Security Policies

-- User Profiles RLS Policies
drop policy if exists "Users can view all profiles" on public.user_profiles;
create policy "Users can view all profiles"
    on public.user_profiles for select
    using (auth.role() = 'authenticated');

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
    on public.user_profiles for update
    using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
    on public.user_profiles for insert
    with check (auth.uid() = id);

-- Messages RLS Policies
drop policy if exists "Users can view messages they sent or received" on public.messages;
create policy "Users can view messages they sent or received"
    on public.messages for select
    using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Users can insert messages they send" on public.messages;
create policy "Users can insert messages they send"
    on public.messages for insert
    with check (auth.uid() = sender_id);

drop policy if exists "Users can update messages they received" on public.messages;
create policy "Users can update messages they received"
    on public.messages for update
    using (auth.uid() = receiver_id);

-- Function to get user conversation list
create or replace function public.get_user_conversations(current_user_id uuid)
returns table (
    user_id uuid,
    username text,
    avatar_url text,
    is_online boolean,
    last_active timestamp with time zone,
    last_message text,
    last_message_time timestamp with time zone,
    unread_count bigint
) as $$
begin
    return query
    with user_messages as (
        select 
            case 
                when m.sender_id = current_user_id then m.receiver_id
                else m.sender_id
            end as other_user_id,
            m.content as last_message,
            m.timestamp as last_message_time,
            row_number() over (
                partition by case 
                    when m.sender_id = current_user_id then m.receiver_id
                    else m.sender_id
                end 
                order by m.timestamp desc
            ) as rn
        from public.messages m
        where m.sender_id = current_user_id or m.receiver_id = current_user_id
    ),
    unread_counts as (
        select 
            m.sender_id as other_user_id,
            count(*) as unread_count
        from public.messages m
        where m.receiver_id = current_user_id and m.is_read = false
        group by m.sender_id
    )
    select 
        up.id,
        up.username,
        up.avatar_url,
        up.is_online,
        up.last_active,
        coalesce(um.last_message, '') as last_message,
        um.last_message_time,
        coalesce(uc.unread_count, 0) as unread_count
    from public.user_profiles up
    left join user_messages um on up.id = um.other_user_id and um.rn = 1
    left join unread_counts uc on up.id = uc.other_user_id
    where up.id != current_user_id
    order by um.last_message_time desc nulls last, up.username;
end;
$$ language plpgsql security definer;

-- Function to mark messages as read
create or replace function public.mark_messages_as_read(sender_user_id uuid, receiver_user_id uuid)
returns void as $$
begin
    update public.messages
    set is_read = true
    where sender_id = sender_user_id 
      and receiver_id = receiver_user_id 
      and is_read = false;
end;
$$ language plpgsql security definer;

-- Function to update user online status
create or replace function public.update_user_presence(user_id uuid, online_status boolean)
returns void as $$
begin
    update public.user_profiles
    set 
        is_online = online_status,
        last_active = case when online_status = false then now() else last_active end
    where id = user_id;
end;
$$ language plpgsql security definer;

-- Grant necessary permissions
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all functions in schema public to anon, authenticated;

-- Insert some sample data (optional - remove in production)
-- This is just for testing purposes
insert into auth.users (id, email, created_at, updated_at, email_confirmed_at)
values 
    ('11111111-1111-1111-1111-111111111111', 'test1@example.com', now(), now(), now()),
    ('22222222-2222-2222-2222-222222222222', 'test2@example.com', now(), now(), now())
on conflict (id) do nothing;

insert into public.user_profiles (id, email, username, passcode_hash, is_online)
values 
    ('11111111-1111-1111-1111-111111111111', 'test1@example.com', 'Alice', '', false),
    ('22222222-2222-2222-2222-222222222222', 'test2@example.com', 'Bob', '', false)
on conflict (id) do nothing;

-- Enable realtime for tables
alter publication supabase_realtime add table public.user_profiles;
alter publication supabase_realtime add table public.messages;