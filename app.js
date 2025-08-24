// Supabase Configuration
console.log('🚀 SecureChat app starting...');
const SUPABASE_URL = 'https://kujjgcuoapvkjhcqplpc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1ampnY3VvYXB2a2poY3FwbHBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNDY4MzAsImV4cCI6MjA3MTYyMjgzMH0.EvkhwlbaNQA3VQWKvvBcGR4caKYkIYO4ZOqfgXZU7Ps';

// Initialize Supabase client with mobile-optimized settings
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        storageKey: 'secure-chat-auth',
        storage: window.localStorage,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        // Reduce token refresh frequency to avoid rate limits
        refreshTokenRetryAttempts: 3,
        refreshTokenRetryInterval: 30000 // 30 seconds
    },
    realtime: {
        params: {
            eventsPerSecond: 5 // Reduced from 10 to avoid rate limits
        }
    }
});

// Global Variables
let currentUser = null;
let currentChatPartner = null;
let displayValue = '0';
let isPasscodeMode = false;
let usersSubscription = null;
let messagesSubscription = null;

// DOM Elements
const loadingScreen = document.getElementById('loading-screen');
const authModal = document.getElementById('auth-modal');
const passcodeModal = document.getElementById('passcode-modal');
const calculator = document.getElementById('calculator');
const chatApp = document.getElementById('chat-app');
const calcDisplay = document.getElementById('calc-display');

// Initialize App with error boundary
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('DOM loaded, starting initialization...');
        initializeApp();
    } catch (error) {
        console.error('Critical initialization error:', error);
        hideLoading();
        showCalculator();
    }
});

// Global error handler to prevent infinite loading
window.addEventListener('error', (error) => {
    console.error('Global error caught:', error);
    hideLoading();
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    hideLoading();
});

async function initializeApp() {
    console.log('Initializing app...');
    
    // Set a maximum initialization timeout
    const initTimeout = setTimeout(() => {
        console.error('Initialization timeout - forcing show calculator');
        hideLoading();
        showCalculator();
    }, 10000); // 10 second timeout
    
    try {
        // Simple session check without complex retry logic
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) {
            console.error('Session error:', error);
            clearTimeout(initTimeout);
            hideLoading();
            showCalculator();
            return;
        }

        if (session?.user) {
            currentUser = session.user;
            console.log('User found:', currentUser.email);
            
            // Simple profile check
            try {
                await checkUserProfile();
            } catch (profileError) {
                console.error('Profile check failed:', profileError);
                showCalculator();
            }
        } else {
            console.log('No active session found');
            showCalculator();
        }
        
        setupAuthStateListener();
        setupAuthEventHandlers();
        setupCalculatorEvents();
        
    } catch (error) {
        console.error('App initialization error:', error);
        showCalculator();
    } finally {
        clearTimeout(initTimeout);
        hideLoading();
    }
}

function hideLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
        console.log('Loading screen hidden');
    }
}

// Fallback to hide loading after maximum time
setTimeout(() => {
    hideLoading();
    console.log('Emergency loading screen hide after 15 seconds');
}, 15000);

function showCalculator() {
    hideAllScreens();
    calculator.classList.remove('hidden');
    isPasscodeMode = false;
    displayValue = '0';
    updateDisplay();
    
    // Update auth trigger text based on login state
    const authTrigger = document.querySelector('.auth-trigger span');
    if (currentUser) {
        authTrigger.textContent = 'Logged in - Enter passcode to unlock';
        authTrigger.onclick = null;
    } else {
        authTrigger.textContent = 'Need an account? Sign up';
        authTrigger.onclick = showAuthModal;
    }
}

function showChatApp() {
    hideAllScreens();
    chatApp.classList.remove('hidden');
    
    // Reset mobile layout
    if (window.innerWidth <= 768) {
        const userList = document.getElementById('user-list');
        const chatArea = document.getElementById('chat-area');
        userList.classList.remove('mobile-hidden');
        chatArea.classList.remove('mobile-visible');
    }
    
    loadUsers();
    setupRealtimeSubscriptions();
    updateUserPresence(true);
}

function hideAllScreens() {
    calculator.classList.add('hidden');
    chatApp.classList.add('hidden');
    authModal.style.display = 'none';
    passcodeModal.style.display = 'none';
}

// Auth State Listener for mobile compatibility
function setupAuthStateListener() {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event);
        
        if (event === 'SIGNED_IN' && session?.user) {
            currentUser = session.user;
            await checkUserProfile();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showCalculator();
            cleanup();
        } else if (event === 'TOKEN_REFRESHED') {
            console.log('Token refreshed successfully');
        } else if (event === 'TOKEN_REFRESH_FAILED') {
            console.warn('Token refresh failed - user may be logged out');
            // Don't immediately log out, let the user try to continue
            // The app will handle this gracefully
        }
    });
}

async function checkUserProfile() {
    try {
        console.log('Checking user profile for:', currentUser.email);
        
        const { data: profile, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            // Check if it's a 406 error (table doesn't exist)
            if (error.code === 'PGRST106' || error.message.includes('406')) {
                showError('Database not set up. Please run the SQL schema in your Supabase dashboard first.');
                showCalculator();
                return;
            }
            throw error;
        }

        if (!profile) {
            console.log('Creating new profile for user');
            
            const { error: insertError } = await supabaseClient
                .from('user_profiles')
                .insert({
                    id: currentUser.id,
                    email: currentUser.email,
                    username: currentUser.user_metadata?.username || currentUser.email.split('@')[0],
                    is_online: true,
                    last_active: new Date().toISOString()
                });

            if (insertError) {
                if (insertError.code === 'PGRST106' || insertError.message.includes('406')) {
                    showError('Database not set up. Please run the SQL schema in your Supabase dashboard first.');
                    showCalculator();
                    return;
                }
                throw insertError;
            }
            
            showPasscodeSetup();
        } else if (!profile.passcode_hash) {
            console.log('Profile exists but no passcode set');
            showPasscodeSetup();
        } else {
            console.log('Profile complete, entering passcode mode');
            isPasscodeMode = true;
            displayValue = '';
            updateDisplay();
            hideAllScreens();
            calculator.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Profile check error:', error);
        if (error.message.includes('406') || error.code === 'PGRST106') {
            showError('Database not set up. Please run the SQL schema in your Supabase dashboard first.');
        } else {
            showError('Failed to load user profile: ' + error.message);
        }
        showCalculator();
    }
}

// Authentication Functions
function setupAuthEventHandlers() {
    // Tab switching
    document.getElementById('login-tab').addEventListener('click', () => switchTab('login'));
    document.getElementById('register-tab').addEventListener('click', () => switchTab('register'));
    
    // Form submissions
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    
    // Passcode setup
    document.getElementById('set-passcode-btn').addEventListener('click', handlePasscodeSetup);
}

function switchTab(tab) {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    if (tab === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    } else {
        loginTab.classList.remove('active');
        registerTab.classList.add('active');
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        authModal.style.display = 'none';
        
    } catch (error) {
        showError(error.message, 'auth-error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username
                }
            }
        });
        
        if (error) throw error;
        
        authModal.style.display = 'none';
        
    } catch (error) {
        showError(error.message, 'auth-error');
    }
}

function showAuthModal() {
    authModal.style.display = 'flex';
    switchTab('login');
}

function showPasscodeSetup() {
    passcodeModal.style.display = 'flex';
    document.getElementById('passcode-input').focus();
}

async function handlePasscodeSetup() {
    const passcode = document.getElementById('passcode-input').value;
    
    if (passcode.length < 4) {
        showError('Passcode must be at least 4 digits', 'passcode-error');
        return;
    }
    
    try {
        // Hash the passcode client-side
        const hashedPasscode = CryptoJS.SHA256(passcode).toString();
        
        const { error } = await supabaseClient
            .from('user_profiles')
            .update({ passcode_hash: hashedPasscode })
            .eq('id', currentUser.id);
        
        if (error) throw error;
        
        passcodeModal.style.display = 'none';
        isPasscodeMode = true;
        displayValue = '';
        updateDisplay();
        
    } catch (error) {
        showError('Failed to set passcode', 'passcode-error');
    }
}

// Calculator Functions
function setupCalculatorEvents() {
    // Remove the touch event prevention that was blocking mobile buttons
    // The CSS will handle touch interactions properly
}

function appendNumber(num) {
    if (displayValue === '0' || displayValue === '') {
        displayValue = num;
    } else {
        displayValue += num;
    }
    updateDisplay();
}

function appendOperator(operator) {
    if (!isPasscodeMode) {
        displayValue += operator;
        updateDisplay();
    }
}

function clearDisplay() {
    displayValue = '0';
    updateDisplay();
}

function deleteLast() {
    if (displayValue.length > 1) {
        displayValue = displayValue.slice(0, -1);
    } else {
        displayValue = '0';
    }
    updateDisplay();
}

function updateDisplay() {
    calcDisplay.textContent = displayValue;
}

async function checkPasscode() {
    if (isPasscodeMode && currentUser) {
        try {
            const hashedInput = CryptoJS.SHA256(displayValue).toString();
            
            const { data: profile, error } = await supabaseClient
                .from('user_profiles')
                .select('passcode_hash')
                .eq('id', currentUser.id)
                .single();
                
            if (error) throw error;
            
            if (profile.passcode_hash === hashedInput) {
                showChatApp();
            } else {
                // Shake animation for wrong passcode
                calcDisplay.style.animation = 'shake 0.5s ease-in-out';
                setTimeout(() => {
                    calcDisplay.style.animation = '';
                    displayValue = '';
                    updateDisplay();
                }, 500);
            }
        } catch (error) {
            console.error('Passcode verification error:', error);
            showError('Verification failed');
        }
    } else {
        // Normal calculator operation
        try {
            const result = eval(displayValue.replace('×', '*'));
            displayValue = result.toString();
            updateDisplay();
        } catch (error) {
            displayValue = 'Error';
            updateDisplay();
            setTimeout(() => {
                displayValue = '0';
                updateDisplay();
            }, 1500);
        }
    }
}

// Add shake animation to CSS
const style = document.createElement('style');
style.textContent = `
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-10px); }
    75% { transform: translateX(10px); }
}
`;
document.head.appendChild(style);

// Chat Functions
async function loadUsers() {
    try {
        const { data: users, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .neq('id', currentUser.id);
            
        if (error) throw error;
        
        displayUsers(users);
        
        // Update current user info
        const currentProfile = await getCurrentUserProfile();
        if (currentProfile) {
            document.getElementById('user-info').textContent = `Welcome, ${currentProfile.username}`;
        }
        
    } catch (error) {
        console.error('Load users error:', error);
    }
}

async function getCurrentUserProfile() {
    try {
        const { data: profile, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
            
        return error ? null : profile;
    } catch (error) {
        return null;
    }
}

function displayUsers(users) {
    const container = document.getElementById('users-container');
    container.innerHTML = '';
    
    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.onclick = () => selectUser(user);
        
        const statusClass = user.is_online ? 'online' : 'offline';
        const statusText = user.is_online ? 'Active now' : getLastActiveText(user.last_active);
        
        userElement.innerHTML = `
            <div class="user-status ${statusClass}"></div>
            <div class="user-info">
                <div class="user-name">${user.username}</div>
                <div class="user-last-active">${statusText}</div>
            </div>
        `;
        
        container.appendChild(userElement);
    });
}

function getLastActiveText(lastActive) {
    if (!lastActive) return 'Long time ago';
    
    const now = new Date();
    const last = new Date(lastActive);
    const diffMs = now - last;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function selectUser(user) {
    currentChatPartner = user;
    
    // Stop any existing mobile polling
    stopMobilePolling();
    
    // Update UI
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // Enable message input
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.placeholder = `Message ${user.username}...`;
    
    // Load chat messages
    loadMessages(user.id);
    
    // Mobile: Show chat area and hide user list
    if (window.innerWidth <= 768) {
        showChatArea(user.username);
        
        // Set up mobile polling fallback after a delay
        setTimeout(() => {
            if (currentChatPartner && currentChatPartner.id === user.id) {
                setupMobilePollingFallback();
            }
        }, 5000); // 5 second delay to let real-time try first
    }
    
    // Focus message input
    messageInput.focus();
    
    // Update last message check time
    lastMessageCheck = new Date().toISOString();
}

// Mobile navigation functions
function showChatArea(username) {
    const userList = document.getElementById('user-list');
    const chatArea = document.getElementById('chat-area');
    const currentChatUser = document.getElementById('current-chat-user');
    
    if (window.innerWidth <= 768) {
        userList.classList.add('mobile-hidden');
        chatArea.classList.add('mobile-visible');
        if (currentChatUser) {
            currentChatUser.textContent = username;
        }
    }
}

function showUserList() {
    const userList = document.getElementById('user-list');
    const chatArea = document.getElementById('chat-area');
    
    if (window.innerWidth <= 768) {
        userList.classList.remove('mobile-hidden');
        chatArea.classList.remove('mobile-visible');
    }
}

async function loadMessages(partnerId) {
    try {
        const { data: messages, error } = await supabaseClient
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUser.id})`)
            .order('timestamp', { ascending: true });
            
        if (error) throw error;
        
        displayMessages(messages);
        
    } catch (error) {
        console.error('Load messages error:', error);
    }
}

function displayMessages(messages) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        container.appendChild(messageElement);
    });
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    const isSent = message.sender_id === currentUser.id;
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    let content = '';
    if (message.type === 'tiktok') {
        content = createTikTokEmbed(message.content);
    } else {
        content = `<div>${escapeHtml(message.content)}</div>`;
    }
    
    const timestamp = new Date(message.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageDiv.innerHTML = `
        ${content}
        <div class="message-timestamp">${timestamp}</div>
    `;
    
    return messageDiv;
}

function createTikTokEmbed(url) {
    // Extract TikTok video ID and create embed
    const tiktokRegex = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com)\/@[\w.-]+\/video\/(\d+)/;
    const match = url.match(tiktokRegex);
    
    if (match) {
        const videoId = match[1];
        return `
            <div class="tiktok-embed">
                <iframe width="100%" height="315" 
                    src="https://www.tiktok.com/embed/v2/${videoId}" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            </div>
        `;
    }
    
    return `<div>TikTok: <a href="${url}" target="_blank">${url}</a></div>`;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const content = messageInput.value.trim();
    
    if (!content || !currentChatPartner) return;
    
    // Show sending indicator
    const sendBtn = document.getElementById('send-btn');
    const originalText = sendBtn.textContent;
    sendBtn.textContent = 'Sending...';
    sendBtn.disabled = true;
    
    try {
        // Detect if message is a TikTok URL
        const isTikTokUrl = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com)/i.test(content);
        const messageType = isTikTokUrl ? 'tiktok' : 'text';
        
        const messageData = {
            sender_id: currentUser.id,
            receiver_id: currentChatPartner.id,
            type: messageType,
            content: content,
            timestamp: new Date().toISOString()
        };
        
        const { data, error } = await supabaseClient
            .from('messages')
            .insert(messageData)
            .select()
            .single();
        
        if (error) throw error;
        
        messageInput.value = '';
        
        // On mobile, immediately add the message to UI (don't wait for real-time)
        if (window.innerWidth <= 768 && data) {
            const messageElement = createMessageElement(data);
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) {
                chatMessages.appendChild(messageElement);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }
        
        console.log('Message sent successfully');
        
    } catch (error) {
        console.error('Send message error:', error);
        showError('Failed to send message: ' + error.message);
        
        // Restore message content on error
        messageInput.value = content;
    } finally {
        // Restore send button
        sendBtn.textContent = originalText;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

// Enter key to send message
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Real-time subscriptions
function setupRealtimeSubscriptions() {
    // Clean up existing subscriptions first
    if (usersSubscription) {
        supabaseClient.removeChannel(usersSubscription);
        usersSubscription = null;
    }
    if (messagesSubscription) {
        supabaseClient.removeChannel(messagesSubscription);
        messagesSubscription = null;
    }
    
    // Add delay for mobile browsers
    setTimeout(() => {
        // Subscribe to user presence updates
        usersSubscription = supabaseClient
            .channel('user_presence_' + Date.now())
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'user_profiles' },
                (payload) => {
                    console.log('User presence update:', payload);
                    loadUsers();
                }
            )
            .subscribe((status) => {
                console.log('User presence subscription status:', status);
            });
        
        // Subscribe to new messages with mobile-optimized settings
        messagesSubscription = supabaseClient
            .channel('messages_' + Date.now())
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    console.log('New message received:', payload);
                    const message = payload.new;
                    
                    // Check if this message is for current chat
                    if (currentChatPartner && 
                        ((message.sender_id === currentUser.id && message.receiver_id === currentChatPartner.id) ||
                         (message.sender_id === currentChatPartner.id && message.receiver_id === currentUser.id))) {
                        
                        // Add message to chat immediately
                        const messageElement = createMessageElement(message);
                        const chatMessages = document.getElementById('chat-messages');
                        if (chatMessages) {
                            chatMessages.appendChild(messageElement);
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                            
                            // Force a visual update for mobile
                            if (window.innerWidth <= 768) {
                                setTimeout(() => {
                                    chatMessages.scrollTop = chatMessages.scrollHeight;
                                }, 100);
                            }
                        }
                    }
                }
            )
            .subscribe((status) => {
                console.log('Messages subscription status:', status);
                
                // If subscription fails on mobile, set up polling fallback
                if (status === 'CHANNEL_ERROR' && window.innerWidth <= 768) {
                    console.log('Setting up mobile polling fallback');
                    setupMobilePollingFallback();
                }
            });
    }, 1000); // 1 second delay for mobile browsers
}

// Mobile polling fallback for when real-time fails
let mobilePollingInterval = null;
let lastMessageCheck = new Date().toISOString();

function setupMobilePollingFallback() {
    // Clear existing interval
    if (mobilePollingInterval) {
        clearInterval(mobilePollingInterval);
    }
    
    // Only set up polling if we have a chat partner
    if (!currentChatPartner) return;
    
    console.log('Setting up mobile polling fallback');
    
    mobilePollingInterval = setInterval(async () => {
        try {
            // Check for new messages since last check
            const { data: newMessages, error } = await supabaseClient
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatPartner.id}),and(sender_id.eq.${currentChatPartner.id},receiver_id.eq.${currentUser.id})`)
                .gt('timestamp', lastMessageCheck)
                .order('timestamp', { ascending: true });
                
            if (error) {
                console.error('Polling error:', error);
                return;
            }
            
            if (newMessages && newMessages.length > 0) {
                console.log('Found new messages via polling:', newMessages.length);
                
                const chatMessages = document.getElementById('chat-messages');
                newMessages.forEach(message => {
                    const messageElement = createMessageElement(message);
                    if (chatMessages) {
                        chatMessages.appendChild(messageElement);
                    }
                });
                
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                
                // Update last check time
                lastMessageCheck = newMessages[newMessages.length - 1].timestamp;
            }
        } catch (error) {
            console.error('Mobile polling error:', error);
        }
    }, 3000); // Check every 3 seconds
}

function stopMobilePolling() {
    if (mobilePollingInterval) {
        clearInterval(mobilePollingInterval);
        mobilePollingInterval = null;
    }
}

async function updateUserPresence(isOnline) {
    if (!currentUser) return;
    
    try {
        const updateData = {
            is_online: isOnline,
            last_active: new Date().toISOString()
        };
        
        const { error } = await supabaseClient
            .from('user_profiles')
            .update(updateData)
            .eq('id', currentUser.id);
            
        if (error) throw error;
        
    } catch (error) {
        console.error('Update presence error:', error);
    }
}

async function logout() {
    try {
        await updateUserPresence(false);
        await supabaseClient.auth.signOut();
        cleanup();
        showCalculator();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function cleanup() {
    if (usersSubscription) {
        supabaseClient.removeChannel(usersSubscription);
        usersSubscription = null;
    }
    if (messagesSubscription) {
        supabaseClient.removeChannel(messagesSubscription);
        messagesSubscription = null;
    }
    
    // Stop mobile polling
    stopMobilePolling();
    
    currentChatPartner = null;
}

function showError(message, elementId = null) {
    console.error('App Error:', message);
    
    if (elementId) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = message;
            setTimeout(() => {
                errorElement.textContent = '';
            }, 8000);
        }
    } else {
        alert(message);
    }
    
    // If rate limited, suggest clearing storage
    if (message.includes('429') || message.includes('Rate limited')) {
        setTimeout(() => {
            if (confirm('You\'re being rate limited. Clear cached data to fix this?')) {
                clearCachedData();
            }
        }, 2000);
    }
}

// Clear cached authentication data
function clearCachedData() {
    try {
        // Clear Supabase auth storage
        localStorage.removeItem('secure-chat-auth');
        localStorage.removeItem('sb-' + SUPABASE_URL.replace('https://', '').replace('.supabase.co', '') + '-auth-token');
        
        // Clear other potential auth keys
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.includes('supabase') || key.includes('auth') || key.includes('secure-chat')) {
                localStorage.removeItem(key);
            }
        });
        
        // Also clear session storage
        sessionStorage.clear();
        
        alert('Cached data cleared. Please refresh the page.');
        location.reload();
    } catch (error) {
        console.error('Error clearing cached data:', error);
    }
}

// Handle page visibility and mobile app lifecycle
let lastPresenceUpdate = 0;
const PRESENCE_UPDATE_COOLDOWN = 5000; // 5 seconds

document.addEventListener('visibilitychange', () => {
    if (currentUser) {
        const now = Date.now();
        if (now - lastPresenceUpdate > PRESENCE_UPDATE_COOLDOWN) {
            updateUserPresence(!document.hidden);
            lastPresenceUpdate = now;
        }
    }
});

// Handle window resize for mobile responsiveness
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        // Desktop view - reset mobile classes
        const userList = document.getElementById('user-list');
        const chatArea = document.getElementById('chat-area');
        if (userList) userList.classList.remove('mobile-hidden');
        if (chatArea) chatArea.classList.remove('mobile-visible');
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (currentUser) {
        // Use navigator.sendBeacon for more reliable offline update
        const data = JSON.stringify({
            user_id: currentUser.id,
            is_online: false,
            last_active: new Date().toISOString()
        });
        
        // Try sendBeacon first (more reliable)
        if (navigator.sendBeacon) {
            navigator.sendBeacon(SUPABASE_URL + '/rest/v1/user_profiles', data);
        } else {
            // Fallback to regular update (may not complete)
            updateUserPresence(false);
        }
    }
});

// Prevent zoom on mobile (simplified)
document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
});

// Simple double-tap prevention that doesn't interfere with buttons
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    // Only prevent double-tap zoom on non-button elements
    if (!e.target.closest('button')) {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }
}, false);