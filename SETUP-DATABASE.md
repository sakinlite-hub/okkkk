# 🚨 IMPORTANT: Database Setup Required

## You're seeing a 406 error because the database tables don't exist yet!

### Quick Fix:

1. **Go to your Supabase Dashboard**
   - Open: https://kujjgcuoapvkjhcqplpc.supabase.co

2. **Open SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Run the Database Schema**
   - Copy ALL contents from `database-schema.sql`
   - Paste into the SQL editor
   - Click "Run"

4. **Refresh your app**
   - Go back to your calculator app
   - Refresh the page (Ctrl+F5)
   - Try registering again

### What the SQL creates:
- ✅ `user_profiles` table (for users, usernames, passcodes)
- ✅ `messages` table (for chat messages)
- ✅ Security policies (Row Level Security)
- ✅ Real-time subscriptions
- ✅ Indexes for performance

### After setup works:
1. Register with email/password
2. Set your secret 4-8 digit passcode
3. Calculator becomes lock screen
4. Enter passcode + press "=" to unlock chat
5. Select users and start chatting!

**The 406 error will disappear once you run the SQL schema!**