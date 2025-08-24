# SecureChat - Calculator Disguised Chat App

A secure, real-time chat application that appears as a calculator but unlocks into a private messaging platform. Built with vanilla HTML, CSS, JavaScript, and Supabase backend.

## 🎯 Features

- **Calculator Disguise**: Fully functional calculator that serves as a lock screen
- **Secret Passcode Entry**: Numeric passcode verification to access chat
- **Real-time Messaging**: Instant message delivery using Supabase real-time
- **TikTok Video Embedding**: Share and view TikTok videos directly in chat
- **User Presence Tracking**: See who's online and when they were last active
- **Mobile Optimized**: Works seamlessly on both desktop and mobile browsers
- **Secure Authentication**: Email/password auth with hashed passcode storage
- **Free Hosting**: Deployable on Netlify/Vercel with Supabase free tier

## 🚀 Quick Setup

### 1. Create Supabase Project

1. Go to [Supabase](https://supabase.com) and create a new project
2. In the SQL Editor, run the contents of `database-schema.sql`
3. Go to Settings > API to get your project URL and anon key
4. Update `app.js` with your Supabase credentials:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

### 2. Deploy to Netlify

#### Option A: Drag & Drop
1. Go to [Netlify](https://netlify.com)
2. Drag the entire project folder to the deploy area
3. Your app will be live instantly!

#### Option B: Git Integration
1. Push this code to a GitHub repository
2. Connect your GitHub repo to Netlify
3. Deploy automatically on every push

### 3. Deploy to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the project directory
3. Follow the prompts to deploy

## 📱 How to Use

### First Time Setup
1. Visit your deployed app (it shows a calculator)
2. Click "Need an account? Sign up" at the bottom
3. Register with email and password
4. Set a 4-8 digit secret passcode
5. You'll be returned to the calculator (now in lock mode)

### Accessing Chat
1. Enter your secret passcode on the calculator
2. Press "=" to unlock
3. The calculator transforms into the chat interface
4. Select users from the sidebar to start chatting

### Sending Messages
- **Text**: Type normally and press Enter or Send
- **TikTok Videos**: Paste any TikTok URL and it will embed automatically

## 🔧 Configuration

### Environment Variables (Optional)
For production, you might want to set these in your hosting platform:

```
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
```

### Mobile Optimization
The app includes several mobile-specific optimizations:
- Persistent session storage using IndexedDB fallback
- Touch event handling for calculator buttons
- Viewport meta tags for proper mobile rendering
- Gesture prevention for zoom/scroll interference

## 🛡️ Security Features

- **Client-side Passcode Hashing**: Passcodes are hashed using SHA-256 before storage
- **Row Level Security**: Database policies ensure users only see their data
- **Session Persistence**: Handles mobile browser session issues
- **HTTPS Only**: All communications encrypted in transit
- **No Plain Text Storage**: Sensitive data is never stored in plain text

## 🚨 Troubleshooting

### Mobile Login Issues
If you experience auto-logout on mobile:
1. Clear browser data and cache
2. Ensure cookies/localStorage are enabled
3. Try using the app in a private/incognito tab first
4. Check that the app URL uses HTTPS

### Calculator Not Working
- Ensure JavaScript is enabled
- Check browser console for errors
- Verify Supabase credentials are correct

### Messages Not Appearing
- Check network connection
- Verify Supabase realtime is enabled
- Look for CORS or CSP errors in console

## 📊 Database Schema

### user_profiles
- `id` (UUID): User ID from Supabase Auth
- `email` (TEXT): User email
- `username` (TEXT): Display name
- `passcode_hash` (TEXT): SHA-256 hash of passcode
- `is_online` (BOOLEAN): Current online status
- `last_active` (TIMESTAMP): Last activity time

### messages
- `id` (UUID): Message ID
- `sender_id` (UUID): Sender user ID
- `receiver_id` (UUID): Recipient user ID
- `type` (TEXT): 'text' or 'tiktok'
- `content` (TEXT): Message content
- `timestamp` (TIMESTAMP): When message was sent

## 🎨 Customization

### Theming
Edit `styles.css` to change colors, fonts, and animations:
- Calculator colors: Update `.btn-*` classes
- Chat theme: Modify `.chat-app` styles
- Mobile responsiveness: Adjust `@media` queries

### Adding Message Types
1. Add new type to database enum in schema
2. Update `createMessageElement()` function
3. Add detection logic in `sendMessage()`

## 📝 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Feel free to open issues and pull requests for improvements!

## ⚠️ Disclaimer

This is a demonstration project. For production use, consider additional security measures like:
- Rate limiting
- Content moderation
- User verification
- Advanced encryption
- Backup strategies

---

**Remember**: The calculator interface is the key to your secret chat. Keep your passcode safe! 🔐