# Database Setup Guide for SecureChat

This guide will help you set up the Supabase database for the SecureChat application.

## Prerequisites

- A Supabase account (free tier is sufficient)
- Access to the Supabase dashboard

## Step 1: Create a New Supabase Project

1. Go to [Supabase](https://supabase.com) and sign in
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - **Name**: SecureChat (or any name you prefer)
   - **Database Password**: Choose a strong password
   - **Region**: Select the region closest to your users
5. Click "Create new project"
6. Wait for the project to be created (usually takes 2-3 minutes)

## Step 2: Configure Database Schema

### IMPORTANT: Use the Complete Setup Script

To avoid RLS policy issues and "unrestricted" table warnings:

1. In your Supabase project dashboard, go to the **SQL Editor**
2. **IMPORTANT**: Use `database-setup-complete.sql` instead of the regular schema file
3. Copy the entire contents of `database-setup-complete.sql`
4. Paste it into the SQL Editor
5. Click "Run" to execute the complete setup

This script will:
- Clean up any existing tables and policies
- Create tables with proper structure
- Set up Row Level Security correctly
- Create all necessary functions
- Grant proper permissions
- Enable real-time subscriptions
- Verify the setup

### Alternative: Manual Setup
If you prefer to use the regular `database-schema.sql`, you may encounter "unrestricted" warnings in the Supabase dashboard. This is normal and the app will still work, but for production use, we recommend the complete setup script.

## Step 3: Enable Real-time

1. Go to **Database** > **Replication**
2. Make sure the following tables are enabled for real-time:
   - `user_profiles`
   - `messages`
3. If they're not enabled, click the toggle to enable them

## Step 4: Configure Authentication

1. Go to **Authentication** > **Settings**
2. Under **Auth Providers**, ensure **Email** is enabled
3. Configure the following settings:
   - **Enable email confirmations**: You can disable this for development
   - **Enable phone confirmations**: Keep disabled
   - **Session timeout**: Set to 604800 (7 days) for better mobile experience

## Step 5: Get API Credentials

1. Go to **Settings** > **API**
2. Copy the following values:
   - **Project URL**: This is your SUPABASE_URL
   - **anon public**: This is your SUPABASE_ANON_KEY
3. Update these values in your `app.js` file:

```javascript
const SUPABASE_URL = 'your-project-url-here';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

## Step 6: Security Configuration (Optional but Recommended)

### Configure Row Level Security (RLS)
The schema automatically sets up RLS policies, but you can review them:

1. Go to **Authentication** > **Policies**
2. Review the policies for:
   - `user_profiles`: Users can view all profiles, update only their own
   - `messages`: Users can only see messages they sent or received

### Configure URL Restrictions
1. Go to **Settings** > **API**
2. Under **URL Configuration**, add your domain(s):
   - Your Netlify/Vercel deployment URL
   - `localhost:8000` for development
   - Any custom domains you'll use

## Step 7: Test the Connection

1. Deploy your application or run it locally
2. Try to register a new user
3. Check the **Authentication** > **Users** section in Supabase
4. Verify that a user profile was created in **Database** > **Table Editor** > **user_profiles**

## Database Functions Explained

The schema includes several custom functions:

### `get_user_conversations(user_id)`
Returns a list of all users with their last message and unread count for the given user.

### `mark_messages_as_read(sender_user_id, receiver_user_id)`
Marks all messages from a specific sender to a specific receiver as read.

### `update_user_presence(user_id, online_status)`
Updates a user's online status and last active timestamp.

### `handle_updated_at()`
Automatically updates the `updated_at` timestamp when a record is modified.

## Troubleshooting

### "relation does not exist" Error
- Make sure you ran the complete schema from `database-schema.sql`
- Check that all tables were created in the **Database** > **Table Editor**

### RLS Policy Errors
- Verify that RLS is enabled on both tables
- Check that the policies are correctly applied
- Ensure you're using the correct user ID in your queries

### Real-time Not Working
- Confirm that real-time replication is enabled for both tables
- Check that your client is properly subscribing to the channels
- Verify WebSocket connections in browser developer tools

### Authentication Issues
- Make sure email provider is enabled
- Check that your site URL is configured correctly
- Verify that your API keys are correct and properly set

## Sample Data (Optional)

The schema includes sample users for testing:
- **Email**: test1@example.com, **Password**: Use the auth signup
- **Email**: test2@example.com, **Password**: Use the auth signup
- **Default Passcode**: 123 (SHA-256 hashed)

You can remove these after testing by running:
```sql
DELETE FROM auth.users WHERE email LIKE 'test%@example.com';
DELETE FROM public.user_profiles WHERE email LIKE 'test%@example.com';
```

## Performance Optimization

For production use, consider:

1. **Indexing**: The schema includes essential indexes, but monitor query performance
2. **Connection Pooling**: Use Supabase's connection pooling for high traffic
3. **Real-time Limits**: Be aware of Supabase's real-time connection limits
4. **Database Size**: Monitor your database size to stay within free tier limits

## Backup and Recovery

1. **Automatic Backups**: Supabase provides automatic backups for paid plans
2. **Manual Backup**: Use `pg_dump` to create manual backups
3. **Schema Versioning**: Keep your schema files in version control

## Security Best Practices

1. **Environment Variables**: Store API keys in environment variables in production
2. **HTTPS Only**: Always use HTTPS in production
3. **Regular Updates**: Keep Supabase libraries updated
4. **Monitor Logs**: Regularly check Supabase logs for suspicious activity

## Need Help?

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord Community](https://discord.supabase.com)
- [Supabase GitHub Issues](https://github.com/supabase/supabase/issues)

Remember to replace all placeholder values with your actual Supabase credentials before deploying!