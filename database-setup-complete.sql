-- SecureChat Database Complete Setup Script
-- Run this script in your Supabase SQL Editor to set up the database properly

-- First, ensure we're working with a clean slate
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP FUNCTION IF EXISTS public.get_user_conversations CASCADE;
DROP FUNCTION IF EXISTS public.mark_messages_as_read CASCADE;
DROP FUNCTION IF EXISTS public.update_user_presence CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at CASCADE;

-- Create user_profiles table
CREATE TABLE public.user_profiles (
    id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email text UNIQUE NOT NULL,
    username text UNIQUE NOT NULL,
    avatar_url text,
    passcode_hash text DEFAULT '',
    is_online boolean DEFAULT false,
    last_active timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create messages table
CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    receiver_id uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    type text CHECK (type IN ('text', 'tiktok')) DEFAULT 'text',
    content text NOT NULL,
    timestamp timestamp with time zone DEFAULT now(),
    is_read boolean DEFAULT false
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON public.messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON public.messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON public.user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_online ON public.user_profiles(is_online);

-- Enable Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_profiles
CREATE POLICY "Allow authenticated users to view all profiles"
    ON public.user_profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow users to insert their own profile"
    ON public.user_profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow users to update their own profile"
    ON public.user_profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Create RLS policies for messages
CREATE POLICY "Allow users to view their own messages"
    ON public.messages FOR SELECT
    TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Allow users to insert their own messages"
    ON public.messages FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Allow users to update messages they received"
    ON public.messages FOR UPDATE
    TO authenticated
    USING (auth.uid() = receiver_id)
    WITH CHECK (auth.uid() = receiver_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user_profiles updated_at
CREATE TRIGGER on_user_profiles_updated
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to get user conversation list
CREATE OR REPLACE FUNCTION public.get_user_conversations(current_user_id uuid)
RETURNS TABLE (
    user_id uuid,
    username text,
    avatar_url text,
    is_online boolean,
    last_active timestamp with time zone,
    last_message text,
    last_message_time timestamp with time zone,
    unread_count bigint
) AS $$
BEGIN
    RETURN QUERY
    WITH user_messages AS (
        SELECT 
            CASE 
                WHEN m.sender_id = current_user_id THEN m.receiver_id
                ELSE m.sender_id
            END AS other_user_id,
            m.content AS last_message,
            m.timestamp AS last_message_time,
            row_number() OVER (
                PARTITION BY CASE 
                    WHEN m.sender_id = current_user_id THEN m.receiver_id
                    ELSE m.sender_id
                END 
                ORDER BY m.timestamp DESC
            ) AS rn
        FROM public.messages m
        WHERE m.sender_id = current_user_id OR m.receiver_id = current_user_id
    ),
    unread_counts AS (
        SELECT 
            m.sender_id AS other_user_id,
            count(*) AS unread_count
        FROM public.messages m
        WHERE m.receiver_id = current_user_id AND m.is_read = false
        GROUP BY m.sender_id
    )
    SELECT 
        up.id,
        up.username,
        up.avatar_url,
        up.is_online,
        up.last_active,
        coalesce(um.last_message, '') AS last_message,
        um.last_message_time,
        coalesce(uc.unread_count, 0) AS unread_count
    FROM public.user_profiles up
    LEFT JOIN user_messages um ON up.id = um.other_user_id AND um.rn = 1
    LEFT JOIN unread_counts uc ON up.id = uc.other_user_id
    WHERE up.id != current_user_id
    ORDER BY um.last_message_time DESC NULLS LAST, up.username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION public.mark_messages_as_read(sender_user_id uuid, receiver_user_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.messages
    SET is_read = true
    WHERE sender_id = sender_user_id 
      AND receiver_id = receiver_user_id 
      AND is_read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user online status
CREATE OR REPLACE FUNCTION public.update_user_presence(user_id uuid, online_status boolean)
RETURNS void AS $$
BEGIN
    UPDATE public.user_profiles
    SET 
        is_online = online_status,
        last_active = CASE WHEN online_status = false THEN now() ELSE last_active END
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.user_profiles TO authenticated;
GRANT ALL ON public.messages TO authenticated;
GRANT SELECT ON public.user_profiles TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_conversations TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_messages_as_read TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_presence TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_updated_at TO authenticated;

-- Enable realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Final verification
SELECT 
    schemaname,
    tablename,
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename IN ('user_profiles', 'messages');

-- Check policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public' AND tablename IN ('user_profiles', 'messages');