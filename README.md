# SecureChat - Calculator Disguised Chat App

A secure, real-time chat application disguised as a calculator to provide private messaging with a unique secret entry system.

## 🔥 Features

- **Calculator Disguise**: Fully functional calculator interface that serves as the lock screen
- **Secret Passcode Entry**: Numeric passcode authentication through calculator interface
- **Real-time Messaging**: Instant messaging powered by Supabase real-time subscriptions
- **TikTok Video Embedding**: Share and view TikTok videos directly in chat
- **User Presence Tracking**: See who's online and when they were last active
- **Modern Dark UI**: Glassmorphism design with smooth animations
- **Mobile Optimized**: Responsive design with mobile-specific optimizations
- **Secure Authentication**: Email/password login with client-side passcode hashing
- **Free Hosting**: Compatible with Netlify and Vercel free tiers

## 🚀 Quick Start

### 1. Setup Supabase Backend

1. Create a new project at [Supabase](https://supabase.com)
2. Run the SQL schema from `database-schema.sql` in your Supabase SQL editor
3. Copy your project URL and anon key from Settings > API

### 2. Configure the Application

1. Open `app.js` and replace the Supabase credentials:
```javascript
const SUPABASE_URL = 'your-supabase-url';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key';
```

### 3. Deploy

#### Option A: Netlify
1. Drag and drop the project folder to [Netlify](https://netlify.com)
2. Or connect your GitHub repository for automatic deployments

#### Option B: Vercel
1. Install Vercel CLI: `npm install -g vercel`
2. Run `vercel` in the project directory
3. Follow the prompts to deploy

## 📱 How to Use

### First Time Setup
1. Visit your deployed app (appears as a calculator)
2. Click any button to trigger the authentication modal
3. Sign up with email and password
4. Set a numeric passcode (4-8 digits)

### Using the App
1. Open the calculator interface
2. Enter your secret passcode using the number buttons
3. Press "=" to unlock the chat interface
4. Start chatting with other users!

### TikTok Video Sharing
1. In any chat, click the attachment button (📎)
2. Paste a TikTok URL
3. The video will embed directly in the chat

## 🔧 Technical Architecture

### Frontend
- **HTML5/CSS3/Vanilla JavaScript**: Lightweight and fast
- **Glassmorphism Design**: Modern UI with backdrop blur effects
- **Responsive Layout**: Works on desktop and mobile browsers
- **Progressive Web App**: Installable on mobile devices

### Backend
- **Supabase**: Authentication, PostgreSQL database, real-time subscriptions
- **Row Level Security**: Secure data access policies
- **Client-side Hashing**: Passcodes are SHA-256 hashed before storage

### Database Schema
- **user_profiles**: User information, passcode hashes, presence status
- **messages**: Chat messages with text and TikTok video support

## 🔐 Security Features

- **Client-side Passcode Hashing**: Passcodes never sent in plain text
- **Session Persistence**: Reliable login sessions across mobile browsers
- **Row Level Security**: Database-level access control
- **HTTPS Only**: Secure communication
- **Content Security Policy**: XSS protection

## 📱 Mobile Optimizations

- **Session Persistence**: Fixes common mobile browser logout issues
- **Responsive Design**: Touch-friendly interface
- **Viewport Handling**: Proper mobile browser behavior
- **PWA Support**: Install as a mobile app

## 🛠️ Development

### Local Development
1. Serve the files using any HTTP server:
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

2. Open `http://localhost:8000` in your browser

### Project Structure
```
├── index.html          # Main HTML file
├── styles.css          # CSS styles with glassmorphism design
├── app.js              # JavaScript application logic
├── database-schema.sql # Supabase database schema
├── manifest.json       # PWA manifest
├── netlify.toml        # Netlify configuration
├── vercel.json         # Vercel configuration
└── README.md           # This file
```

## 🐛 Troubleshooting

### Calculator Not Working
- Check browser console for JavaScript errors
- Verify Supabase credentials in `app.js`
- Ensure you're accessing via HTTPS in production

### Mobile Login Issues
- Clear browser data and try again
- The app implements session persistence to prevent logout issues
- Try using an incognito/private browser window

### Messages Not Appearing
- Check network connectivity
- Verify Supabase real-time is enabled
- Check browser console for WebSocket errors

## 📋 Browser Support

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support with some limitations on iOS
- **Mobile Browsers**: Optimized for iOS Safari and Chrome Mobile

## 🚀 Deployment Tips

### Environment Variables
For additional security, you can use environment variables for Supabase credentials:
- Create a build process that replaces the credentials at build time
- Use Netlify/Vercel environment variables for sensitive data

### Custom Domain
- Configure a custom domain to make the calculator disguise more convincing
- Use a domain name that doesn't suggest it's a chat app

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on both desktop and mobile
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This application is for educational and legitimate privacy purposes only. Users are responsible for complying with their local laws and regulations regarding encrypted communications.

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) for the amazing backend-as-a-service
- [TikTok](https://www.tiktok.com) for the embed API
- The open-source community for inspiration and resources