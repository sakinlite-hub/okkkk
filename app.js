// SecureChat Application - Main JavaScript File
// Configuration - Supabase credentials
const SUPABASE_URL = 'https://rzxvjxbhbtzfuotapdsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6eHZqeGJoYnR6ZnVvdGFwZHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNTg2OTYsImV4cCI6MjA3MTYzNDY5Nn0.-zMT_s4cNDAi5Hb93OvPCRSmfkVTj-EGo9xcTeK9gys';

// Initialize Supabase client with session persistence
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        storageKey: 'securechat-auth',
        storage: window.localStorage
    }
});

// Global application state
let currentUser = null;
let currentChatUser = null;
let isCalculatorMode = true;
let isMobile = window.innerWidth <= 768; // Will be updated with enhanced detection
let messageSubscription = null;
let presenceSubscription = null;

// Calculator state
let calculatorState = {
    display: '0',
    previousValue: null,
    operation: null,
    waitingForNewNumber: false,
    secretCode: ''
};

// Application initialization
document.addEventListener('DOMContentLoaded', async () => {
    updateTime();
    setInterval(updateTime, 1000);
    
    // Enhanced mobile detection
    isMobile = enhancedMobileDetection();
    console.log('Application initialized, isMobile:', isMobile);
    
    // Check for existing session
    await checkAuthState();
    
    // Setup event listeners
    setupEventListeners();
    
    // Handle mobile device detection and optimizations
    handleMobileDetection();
    optimizeMobileTouchInteractions();
    
    // Handle page visibility change for mobile
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Handle beforeunload for presence
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Initialize mobile message recovery if needed
    if (isMobile) {
        initializeMobileMessageRecovery();
    }
    
    // Hide loading screen
    hideLoadingScreen();
});

// Utility functions
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 300);
        }, 1000);
    }
}

function showError(message, elementId = 'auth-error') {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
        setTimeout(() => {
            errorElement.classList.remove('show');
        }, 5000);
    }
}

function showAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function showPasscodeSetup() {
    const modal = document.getElementById('passcode-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function hidePasscodeModal() {
    const modal = document.getElementById('passcode-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function showCalculator() {
    const calculator = document.getElementById('calculator-container');
    const chat = document.getElementById('chat-container');
    if (calculator && chat) {
        calculator.classList.remove('hidden');
        chat.classList.add('hidden');
        isCalculatorMode = true;
    }
}

// Authentication state management
async function checkAuthState() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) {
            console.error('Session error:', error);
            return;
        }
        
        if (session) {
            currentUser = session.user;
            await loadUserProfile();
            
            // Check if user has set up passcode
            if (currentUser.user_metadata?.has_passcode) {
                showCalculator();
            } else {
                showPasscodeSetup();
            }
        } else {
            showAuthModal();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showAuthModal();
    }
}

// Supabase auth state listener
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state changed:', event, session);
    
    if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        await loadUserProfile();
        
        if (currentUser.user_metadata?.has_passcode) {
            showCalculator();
        } else {
            showPasscodeSetup();
        }
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        showAuthModal();
        cleanupSubscriptions();
    }
});

// User profile management
async function loadUserProfile() {
    try {
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
            
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        if (data) {
            currentUser.profile = data;
            await updateUserPresence(true);
        }
    } catch (error) {
        console.error('Profile load error:', error);
    }
}

// Calculator functions
function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        timeElement.textContent = timeString;
    }
}

function appendNumber(num) {
    const display = document.getElementById('display');
    
    if (calculatorState.waitingForNewNumber) {
        calculatorState.display = num;
        calculatorState.waitingForNewNumber = false;
    } else {
        calculatorState.display = calculatorState.display === '0' ? num : calculatorState.display + num;
    }
    
    // Track secret code entry
    if (calculatorState.operation === null && calculatorState.previousValue === null) {
        calculatorState.secretCode += num;
    }
    
    display.textContent = calculatorState.display;
}

function setOperation(op) {
    if (calculatorState.previousValue === null) {
        calculatorState.previousValue = parseFloat(calculatorState.display);
    } else if (!calculatorState.waitingForNewNumber) {
        const result = performCalculation();
        calculatorState.display = result.toString();
        calculatorState.previousValue = result;
        document.getElementById('display').textContent = calculatorState.display;
    }
    
    calculatorState.operation = op;
    calculatorState.waitingForNewNumber = true;
    calculatorState.secretCode = ''; // Reset secret code when operation is used
}

function calculate() {
    // Check if this might be a passcode entry
    if (calculatorState.operation === null && calculatorState.previousValue === null && calculatorState.secretCode) {
        checkPasscode(calculatorState.secretCode);
        return;
    }
    
    if (calculatorState.previousValue !== null && calculatorState.operation !== null && !calculatorState.waitingForNewNumber) {
        const result = performCalculation();
        calculatorState.display = result.toString();
        calculatorState.previousValue = null;
        calculatorState.operation = null;
        calculatorState.waitingForNewNumber = true;
        document.getElementById('display').textContent = calculatorState.display;
    }
    
    calculatorState.secretCode = ''; // Reset secret code after calculation
}

function performCalculation() {
    const prev = calculatorState.previousValue;
    const current = parseFloat(calculatorState.display);
    
    switch (calculatorState.operation) {
        case '+': return prev + current;
        case '-': return prev - current;
        case '*': return prev * current;
        case '/': return current !== 0 ? prev / current : 0;
        default: return current;
    }
}

function clearDisplay() {
    calculatorState.display = '0';
    calculatorState.previousValue = null;
    calculatorState.operation = null;
    calculatorState.waitingForNewNumber = false;
    calculatorState.secretCode = '';
    document.getElementById('display').textContent = calculatorState.display;
}

function toggleSign() {
    calculatorState.display = (parseFloat(calculatorState.display) * -1).toString();
    document.getElementById('display').textContent = calculatorState.display;
}

function percentage() {
    calculatorState.display = (parseFloat(calculatorState.display) / 100).toString();
    document.getElementById('display').textContent = calculatorState.display;
}

// Passcode verification
async function checkPasscode(enteredCode) {
    if (!currentUser || !currentUser.profile) {
        showError('Please sign in first');
        return;
    }
    
    try {
        const hashedCode = await hashPasscode(enteredCode);
        
        if (hashedCode === currentUser.profile.passcode_hash) {
            // Correct passcode - transition to chat
            await transitionToChat();
        } else {
            // Wrong passcode - show error briefly
            showPasscodeError();
        }
    } catch (error) {
        console.error('Passcode check error:', error);
        showError('Error checking passcode');
    }
}

function showPasscodeError() {
    const display = document.getElementById('display');
    const originalText = display.textContent;
    
    display.textContent = 'WRONG';
    display.style.color = '#FF3B30';
    
    setTimeout(() => {
        display.textContent = originalText;
        display.style.color = '#ffffff';
        clearDisplay();
    }, 1000);
}

// Cryptographic functions
async function hashPasscode(passcode) {
    const encoder = new TextEncoder();
    const data = encoder.encode(passcode);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Authentication functions
async function handleAuthSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const username = document.getElementById('username').value;
    const isSignUp = document.getElementById('auth-submit').textContent === 'Sign Up';
    
    try {
        if (isSignUp) {
            await signUp(email, password, username);
        } else {
            await signIn(email, password);
        }
    } catch (error) {
        showError(error.message);
    }
}

async function signUp(email, password, username) {
    if (!username) {
        throw new Error('Username is required');
    }
    
    // Check if username is already taken
    const { data: existingUser } = await supabaseClient
        .from('user_profiles')
        .select('username')
        .eq('username', username)
        .single();
        
    if (existingUser) {
        throw new Error('Username is already taken');
    }
    
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                username: username,
                has_passcode: false
            }
        }
    });
    
    if (error) throw error;
    
    if (data.user) {
        // Create user profile
        const { error: profileError } = await supabaseClient
            .from('user_profiles')
            .insert({
                id: data.user.id,
                email: email,
                username: username,
                passcode_hash: '',
                is_online: false
            });
            
        if (profileError) {
            console.error('Profile creation error:', profileError);
        }
        
        hideAuthModal();
        showPasscodeSetup();
    }
}

async function signIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });
    
    if (error) throw error;
    
    hideAuthModal();
}

function toggleAuthMode() {
    const title = document.getElementById('auth-title');
    const submit = document.getElementById('auth-submit');
    const switchText = document.getElementById('auth-switch-text');
    const switchLink = document.getElementById('auth-switch-link');
    const usernameGroup = document.getElementById('username-group');
    
    const isSignIn = submit.textContent === 'Sign In';
    
    if (isSignIn) {
        title.textContent = 'Create Account';
        submit.textContent = 'Sign Up';
        switchText.textContent = 'Already have an account?';
        switchLink.textContent = 'Sign In';
        usernameGroup.style.display = 'block';
        document.getElementById('username').required = true;
    } else {
        title.textContent = 'Welcome Back';
        submit.textContent = 'Sign In';
        switchText.textContent = "Don't have an account?";
        switchLink.textContent = 'Sign Up';
        usernameGroup.style.display = 'none';
        document.getElementById('username').required = false;
    }
}

// Passcode setup
async function handlePasscodeSave() {
    const newPasscode = document.getElementById('new-passcode').value;
    const confirmPasscode = document.getElementById('confirm-passcode').value;
    
    if (!newPasscode || newPasscode.length < 4) {
        showError('Passcode must be at least 4 digits', 'passcode-error');
        return;
    }
    
    if (newPasscode !== confirmPasscode) {
        showError('Passcodes do not match', 'passcode-error');
        return;
    }
    
    if (!/^\d+$/.test(newPasscode)) {
        showError('Passcode must contain only numbers', 'passcode-error');
        return;
    }
    
    try {
        const hashedPasscode = await hashPasscode(newPasscode);
        
        // First, check if user profile exists
        const { data: existingProfile } = await supabaseClient
            .from('user_profiles')
            .select('id')
            .eq('id', currentUser.id)
            .single();
            
        let profileError;
        
        if (existingProfile) {
            // Update existing profile
            const { error } = await supabaseClient
                .from('user_profiles')
                .update({ passcode_hash: hashedPasscode })
                .eq('id', currentUser.id);
            profileError = error;
        } else {
            // Create new profile
            const { error } = await supabaseClient
                .from('user_profiles')
                .insert({
                    id: currentUser.id,
                    email: currentUser.email,
                    username: currentUser.user_metadata?.username || currentUser.email.split('@')[0],
                    passcode_hash: hashedPasscode,
                    is_online: false
                });
            profileError = error;
        }
        
        if (profileError) {
            console.error('Profile error:', profileError);
            throw profileError;
        }
        
        // Update user metadata
        const { error: updateError } = await supabaseClient.auth.updateUser({
            data: { has_passcode: true }
        });
        
        if (updateError) {
            console.error('Metadata update error:', updateError);
            throw updateError;
        }
        
        // Update local user object
        if (!currentUser.profile) currentUser.profile = {};
        currentUser.profile.passcode_hash = hashedPasscode;
        
        hidePasscodeModal();
        showCalculator();
        
    } catch (error) {
        console.error('Passcode save error:', error);
        showError('Error saving passcode: ' + (error.message || 'Unknown error'), 'passcode-error');
    }
}

// UI transition functions
async function transitionToChat() {
    isCalculatorMode = false;
    
    // Smooth transition
    const calculator = document.getElementById('calculator-container');
    const chat = document.getElementById('chat-container');
    
    calculator.style.transform = 'translateY(-100%)';
    calculator.style.opacity = '0';
    
    setTimeout(() => {
        calculator.classList.add('hidden');
        chat.classList.remove('hidden');
        chat.style.transform = 'translateY(0)';
        chat.style.opacity = '1';
    }, 300);
    
    // Initialize chat
    await initializeChat();
}

async function initializeChat() {
    try {
        console.log('Initializing chat for user:', currentUser.id);
        
        // Load users first
        await loadUsers();
        
        // Setup real-time subscriptions
        setupRealtimeSubscriptions();
        
        // Update user presence to online
        await updateUserPresence(true);
        
        // Show user list on mobile
        if (isMobile) {
            showUserList();
        }
        
        console.log('Chat initialized successfully');
        
    } catch (error) {
        console.error('Chat initialization error:', error);
        showError('Error loading chat: ' + error.message);
    }
}

// User management
async function loadUsers() {
    try {
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .neq('id', currentUser.id)
            .order('username');
            
        if (error) throw error;
        
        displayUsers(data || []);
    } catch (error) {
        console.error('Load users error:', error);
        showError('Error loading users');
    }
}

function displayUsers(users) {
    const userList = document.getElementById('user-list');
    if (!userList) return;
    
    userList.innerHTML = '';
    
    users.forEach(user => {
        const userItem = createUserItem(user);
        userList.appendChild(userItem);
    });
}

function createUserItem(user) {
    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    userItem.dataset.userId = user.id;
    
    const statusClass = user.is_online ? 'online' : 'offline';
    const statusText = user.is_online ? 'Active now' : getLastSeenText(user.last_active);
    
    userItem.innerHTML = `
        <div class="user-avatar">
            <img src="${user.avatar_url || getDefaultAvatar(user.username)}" alt="${user.username}">
            <div class="status-indicator ${statusClass}"></div>
        </div>
        <div class="user-info">
            <div class="user-name">${user.username}</div>
            <div class="user-status ${statusClass}">${statusText}</div>
        </div>
    `;
    
    userItem.addEventListener('click', () => openChat(user));
    
    return userItem;
}

function getDefaultAvatar(username) {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    const colorIndex = username.charCodeAt(0) % colors.length;
    const initials = username.substring(0, 2).toUpperCase();
    
    return `data:image/svg+xml,${encodeURIComponent(`
        <svg width="50" height="50" xmlns="http://www.w3.org/2000/svg">
            <rect width="50" height="50" fill="${colors[colorIndex]}" rx="25"/>
            <text x="25" y="32" text-anchor="middle" fill="white" font-family="Arial" font-size="18" font-weight="bold">${initials}</text>
        </svg>
    `)}`;
}

function getLastSeenText(lastActive) {
    if (!lastActive) return 'Never';
    
    const now = new Date();
    const lastActiveDate = new Date(lastActive);
    const diffMs = now - lastActiveDate;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return lastActiveDate.toLocaleDateString();
}

// Chat functions
async function openChat(user) {
    console.log('=== OPENING CHAT ===');
    console.log('User:', user.username);
    console.log('Window width:', window.innerWidth);
    console.log('Current isMobile value:', isMobile);
    
    // Force mobile detection
    const wasMobile = isMobile;
    isMobile = enhancedMobileDetection();
    console.log('Mobile detection - was:', wasMobile, 'now:', isMobile);
    
    currentChatUser = user;
    
    // Handle mobile navigation FIRST
    if (isMobile) {
        console.log('MOBILE: Applying navigation immediately');
        const userList = document.getElementById('user-list-container');
        const chatArea = document.getElementById('chat-area');
        
        if (userList && chatArea) {
            console.log('MOBILE: Elements found, applying classes');
            
            // Apply classes
            userList.classList.add('hidden-mobile');
            chatArea.classList.add('active-mobile');
            
            // Also apply direct CSS styles as fallback
            userList.style.transform = 'translateX(-100%)';
            userList.style.zIndex = '5';
            chatArea.style.transform = 'translateX(0)';
            chatArea.style.zIndex = '15';
            
            console.log('MOBILE: Classes and direct styles applied:', {
                userList: userList.className,
                chatArea: chatArea.className,
                userListTransform: userList.style.transform,
                chatAreaTransform: chatArea.style.transform
            });
        } else {
            console.log('MOBILE: Elements NOT found!', {
                userList: !!userList,
                chatArea: !!chatArea
            });
        }
    }
    
    // Update UI
    updateChatHeader(user);
    await loadMessages(user.id);
    
    // Show chat area
    showChatArea();
    
    // Mark messages as read
    try {
        await markMessageAsRead(user.id);
    } catch (error) {
        console.error('Mark messages as read error:', error);
    }
    
    console.log('=== CHAT OPENING COMPLETE ===');
}

function updateChatHeader(user) {
    const chatUserName = document.getElementById('chat-user-name');
    const chatUserAvatar = document.getElementById('chat-user-avatar');
    const chatUserPresence = document.getElementById('chat-user-presence');
    const chatUserStatus = document.getElementById('chat-user-status');
    
    if (chatUserName) chatUserName.textContent = user.username;
    if (chatUserAvatar) chatUserAvatar.src = user.avatar_url || getDefaultAvatar(user.username);
    if (chatUserPresence) {
        chatUserPresence.textContent = user.is_online ? 'Active now' : getLastSeenText(user.last_active);
    }
    if (chatUserStatus) {
        chatUserStatus.className = `status-indicator ${user.is_online ? 'online' : 'offline'}`;
    }
}

async function loadMessages(userId) {
    try {
        const { data, error } = await supabaseClient
            .from('messages')
            .select(`
                *,
                sender:sender_id(username, avatar_url),
                receiver:receiver_id(username, avatar_url)
            `)
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`)
            .order('timestamp', { ascending: true });
            
        if (error) throw error;
        
        displayMessages(data || []);
    } catch (error) {
        console.error('Load messages error:', error);
        showError('Error loading messages');
    }
}

function displayMessages(messages) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    chatMessages.innerHTML = '';
    
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        chatMessages.appendChild(messageElement);
    });
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    const isSent = message.sender_id === currentUser.id;
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    const avatarUrl = isSent 
        ? (currentUser.profile?.avatar_url || getDefaultAvatar(currentUser.profile?.username || currentUser.email)) 
        : (currentChatUser?.avatar_url || getDefaultAvatar(currentChatUser?.username || 'User'));
    avatar.innerHTML = `<img src="${avatarUrl}" alt="">`;
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    if (message.type === 'tiktok') {
        content.innerHTML = createTikTokEmbed(message.content);
    } else {
        content.textContent = message.content;
    }
    
    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = formatMessageTime(message.timestamp);
    
    // Create content wrapper for content and timestamp
    const contentWrapper = document.createElement('div');
    contentWrapper.style.display = 'flex';
    contentWrapper.style.flexDirection = 'column';
    contentWrapper.appendChild(content);
    contentWrapper.appendChild(timestamp);
    
    // Append elements based on message direction
    if (isSent) {
        messageDiv.appendChild(contentWrapper);
        messageDiv.appendChild(avatar);
    } else {
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentWrapper);
    }
    
    return messageDiv;
}

function createTikTokEmbed(url) {
    const tiktokRegex = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com)\/[@\w\-\.]*(\/)?(video\/)?(\d+)/;
    const match = url.match(tiktokRegex);
    
    if (match) {
        const videoId = match[3];
        return `
            <div class="tiktok-embed">
                <blockquote class="tiktok-embed" cite="${url}" data-video-id="${videoId}" style="max-width: 605px;min-width: 325px;">
                    <section>
                        <a target="_blank" title="TikTok Video" href="${url}">Open TikTok Video</a>
                    </section>
                </blockquote>
                <script async src="https://www.tiktok.com/embed.js"></script>
            </div>
        `;
    }
    
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
}

function formatMessageTime(timestamp) {
    const messageDate = new Date(timestamp);
    const now = new Date();
    const isToday = messageDate.toDateString() === now.toDateString();
    
    if (isToday) {
        return messageDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } else {
        return messageDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }
}

// Helper function to mark messages as read
async function markMessageAsRead(senderId) {
    try {
        await supabaseClient.rpc('mark_messages_as_read', {
            sender_user_id: senderId,
            receiver_user_id: currentUser.id
        });
    } catch (error) {
        console.error('Mark messages as read error:', error);
    }
}

// Message sending
async function sendMessage() {
    const messageText = document.getElementById('message-text');
    const text = messageText.value.trim();
    
    if (!text || !currentChatUser) {
        console.log('Cannot send message - missing text or chat user');
        return;
    }
    
    // Disable send button to prevent double sending
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.disabled = true;
    
    try {
        console.log('Sending message:', { text, to: currentChatUser.username });
        
        const { data, error } = await supabaseClient
            .from('messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: currentChatUser.id,
                type: 'text',
                content: text
            })
            .select();
            
        if (error) {
            console.error('Send message error:', error);
            throw error;
        }
        
        console.log('Message sent successfully:', data);
        messageText.value = '';
        
    } catch (error) {
        console.error('Send message error:', error);
        showError('Error sending message: ' + error.message);
    } finally {
        // Re-enable send button
        if (sendBtn) sendBtn.disabled = false;
    }
}

// TikTok video sharing
function showTikTokModal() {
    const modal = document.getElementById('tiktok-modal');
    modal.classList.remove('hidden');
    document.getElementById('tiktok-url').focus();
}

function hideTikTokModal() {
    const modal = document.getElementById('tiktok-modal');
    modal.classList.add('hidden');
    document.getElementById('tiktok-url').value = '';
}

async function sendTikTokVideo() {
    const url = document.getElementById('tiktok-url').value.trim();
    
    if (!url || !currentChatUser) {
        showError('Please enter a TikTok URL and select a chat user');
        return;
    }
    
    const tiktokRegex = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com)/;
    if (!tiktokRegex.test(url)) {
        showError('Please enter a valid TikTok URL');
        return;
    }
    
    try {
        console.log('Sending TikTok video:', { url, to: currentChatUser.username });
        
        const { data, error } = await supabaseClient
            .from('messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: currentChatUser.id,
                type: 'tiktok',
                content: url
            })
            .select();
            
        if (error) {
            console.error('Send TikTok error:', error);
            throw error;
        }
        
        console.log('TikTok video sent successfully:', data);
        hideTikTokModal();
        
    } catch (error) {
        console.error('Send TikTok error:', error);
        showError('Error sending TikTok video: ' + error.message);
    }
}

// Real-time subscriptions
function setupRealtimeSubscriptions() {
    // Clean up existing subscriptions first
    cleanupSubscriptions();
    
    // Set up message subscription
    messageSubscription = supabaseClient
        .channel('messages_channel')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
        }, (payload) => {
            console.log('New message received:', payload.new);
            handleNewMessage(payload.new);
        })
        .subscribe((status) => {
            console.log('Message subscription status:', status);
        });
    
    // Set up presence subscription
    presenceSubscription = supabaseClient
        .channel('presence_channel')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_profiles'
        }, (payload) => {
            console.log('Presence update:', payload.new);
            handlePresenceUpdate(payload.new);
        })
        .subscribe((status) => {
            console.log('Presence subscription status:', status);
        });
}

function handleNewMessage(message) {
    // Store message in mobile cache for persistence
    if (isMobile) {
        storeMessageInCache(message);
    }
    
    if (currentChatUser && 
        ((message.sender_id === currentUser.id && message.receiver_id === currentChatUser.id) ||
         (message.sender_id === currentChatUser.id && message.receiver_id === currentUser.id))) {
        
        // Check if message already exists to avoid duplicates
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            const existingMessage = chatMessages.querySelector(`[data-message-id="${message.id}"]`);
            if (!existingMessage) {
                const messageElement = createMessageElement(message);
                messageElement.setAttribute('data-message-id', message.id);
                chatMessages.appendChild(messageElement);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }
        
        // Mark as read if it's a message we received
        if (message.receiver_id === currentUser.id) {
            markMessageAsRead(message.sender_id);
        }
    }
    
    // Refresh user list to update last message preview
    loadUsers();
}

function handlePresenceUpdate(userProfile) {
    const userItem = document.querySelector(`[data-user-id="${userProfile.id}"]`);
    if (userItem) {
        const statusIndicator = userItem.querySelector('.status-indicator');
        const userStatus = userItem.querySelector('.user-status');
        
        if (statusIndicator && userStatus) {
            const isOnline = userProfile.is_online;
            statusIndicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
            userStatus.className = `user-status ${isOnline ? 'online' : 'offline'}`;
            userStatus.textContent = isOnline ? 'Active now' : getLastSeenText(userProfile.last_active);
        }
    }
    
    if (currentChatUser && currentChatUser.id === userProfile.id) {
        currentChatUser = userProfile;
        updateChatHeader(userProfile);
    }
}

// User presence management
async function updateUserPresence(isOnline) {
    if (!currentUser) return;
    
    try {
        await supabaseClient.rpc('update_user_presence', {
            user_id: currentUser.id,
            online_status: isOnline
        });
    } catch (error) {
        console.error('Update presence error:', error);
    }
}

// Event listeners setup
function setupEventListeners() {
    const authForm = document.getElementById('auth-form');
    const authSwitchLink = document.getElementById('auth-switch-link');
    const savePasscodeBtn = document.getElementById('save-passcode');
    const sendBtn = document.getElementById('send-btn');
    const messageText = document.getElementById('message-text');
    const attachBtn = document.getElementById('attach-btn');
    const backBtn = document.getElementById('back-to-users');
    const logoutBtn = document.getElementById('logout-btn');
    const searchToggle = document.getElementById('search-toggle');
    const userSearch = document.getElementById('user-search');
    const sendTikTok = document.getElementById('send-tiktok');
    const cancelTikTok = document.getElementById('cancel-tiktok');
    
    if (authForm) authForm.addEventListener('submit', handleAuthSubmit);
    if (authSwitchLink) authSwitchLink.addEventListener('click', toggleAuthMode);
    if (savePasscodeBtn) savePasscodeBtn.addEventListener('click', handlePasscodeSave);
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (messageText) {
        messageText.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    if (attachBtn) attachBtn.addEventListener('click', showTikTokModal);
    if (backBtn) backBtn.addEventListener('click', showUserList);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (searchToggle) searchToggle.addEventListener('click', toggleSearch);
    if (userSearch) userSearch.addEventListener('input', handleUserSearch);
    if (sendTikTok) sendTikTok.addEventListener('click', sendTikTokVideo);
    if (cancelTikTok) cancelTikTok.addEventListener('click', hideTikTokModal);
    
    window.addEventListener('resize', () => {
        isMobile = enhancedMobileDetection();
        handleMobileDetection();
        if (isMobile) {
            optimizeMobileTouchInteractions();
        }
    });
}

// Mobile-specific functions
function handleMobileDetection() {
    const body = document.body;
    if (isMobile) {
        body.classList.add('mobile');
    } else {
        body.classList.remove('mobile');
    }
}

function showUserList() {
    console.log('Showing user list, isMobile:', isMobile);
    
    if (isMobile) {
        const userList = document.getElementById('user-list-container');
        const chatArea = document.getElementById('chat-area');
        
        console.log('Mobile navigation - showing user list, hiding chat area');
        
        if (userList && chatArea) {
            userList.classList.remove('hidden-mobile');
            chatArea.classList.remove('active-mobile');
        }
        
        // Clear current chat user when going back to user list
        currentChatUser = null;
        
        // Hide chat messages and show welcome screen
        const chatMessages = document.getElementById('chat-messages');
        const messageInput = document.getElementById('message-input-container');
        const welcomeScreen = document.querySelector('.welcome-screen');
        
        if (chatMessages && messageInput && welcomeScreen) {
            chatMessages.style.display = 'none';
            messageInput.style.display = 'none';
            welcomeScreen.style.display = 'flex';
        }
    }
}

function showChatArea() {
    // Force mobile detection update
    isMobile = enhancedMobileDetection();
    console.log('Showing chat area, isMobile:', isMobile, 'window.innerWidth:', window.innerWidth);
    
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input-container');
    const welcomeScreen = document.querySelector('.welcome-screen');
    
    // Always show chat UI elements (CSS will handle mobile display)
    if (chatMessages && messageInput && welcomeScreen) {
        if (!isMobile) {
            // For desktop, use JavaScript to control display
            chatMessages.style.display = 'flex';
            messageInput.style.display = 'block';
            welcomeScreen.style.display = 'none';
        }
        console.log('Chat UI elements updated');
    }
    
    if (isMobile) {
        const userList = document.getElementById('user-list-container');
        const chatArea = document.getElementById('chat-area');
        
        console.log('Mobile navigation - Elements found:', {
            userList: !!userList,
            chatArea: !!chatArea,
            userListClasses: userList?.className,
            chatAreaClasses: chatArea?.className
        });
        
        if (userList && chatArea) {
            userList.classList.add('hidden-mobile');
            chatArea.classList.add('active-mobile');
            
            // Force show chat elements for mobile
            if (chatMessages) chatMessages.style.display = 'flex';
            if (messageInput) messageInput.style.display = 'block';
            if (welcomeScreen) welcomeScreen.style.display = 'none';
            
            console.log('Mobile navigation applied - Classes after:', {
                userListClasses: userList.className,
                chatAreaClasses: chatArea.className,
                chatMessagesDisplay: chatMessages?.style.display,
                messageInputDisplay: messageInput?.style.display
            });
        }
    }
}

function toggleSearch() {
    const searchContainer = document.getElementById('search-container');
    if (searchContainer) {
        searchContainer.classList.toggle('hidden');
        if (!searchContainer.classList.contains('hidden')) {
            document.getElementById('user-search').focus();
        }
    }
}

function handleUserSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const userItems = document.querySelectorAll('.user-item');
    
    userItems.forEach(item => {
        const username = item.querySelector('.user-name').textContent.toLowerCase();
        if (username.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

async function logout() {
    try {
        await updateUserPresence(false);
        await supabaseClient.auth.signOut();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function cleanupSubscriptions() {
    console.log('Cleaning up subscriptions...');
    
    if (messageSubscription) {
        messageSubscription.unsubscribe();
        messageSubscription = null;
        console.log('Message subscription cleaned up');
    }
    
    if (presenceSubscription) {
        presenceSubscription.unsubscribe();
        presenceSubscription = null;
        console.log('Presence subscription cleaned up');
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        updateUserPresence(false);
    } else {
        updateUserPresence(true);
        // Mobile message recovery when app comes back to foreground
        initializeMobileMessageRecovery();
    }
}

function handleBeforeUnload() {
    updateUserPresence(false);
}

// Mobile Message Persistence with Triple-Layer Storage
function storeMessageInCache(message) {
    try {
        // Layer 1: sessionStorage
        const sessionMessages = JSON.parse(sessionStorage.getItem('chat-messages') || '[]');
        sessionMessages.push(message);
        sessionStorage.setItem('chat-messages', JSON.stringify(sessionMessages));
        
        // Layer 2: localStorage
        const localMessages = JSON.parse(localStorage.getItem('chat-messages-backup') || '[]');
        localMessages.push(message);
        localStorage.setItem('chat-messages-backup', JSON.stringify(localMessages));
        
        // Layer 3: In-memory cache
        if (!window.messageCache) window.messageCache = [];
        window.messageCache.push(message);
    } catch (error) {
        console.error('Message cache storage error:', error);
    }
}

function retrieveCachedMessages() {
    try {
        // Try sessionStorage first
        let messages = JSON.parse(sessionStorage.getItem('chat-messages') || '[]');
        if (messages.length === 0) {
            // Fallback to localStorage
            messages = JSON.parse(localStorage.getItem('chat-messages-backup') || '[]');
        }
        if (messages.length === 0 && window.messageCache) {
            // Final fallback to memory cache
            messages = window.messageCache;
        }
        return messages;
    } catch (error) {
        console.error('Message cache retrieval error:', error);
        return [];
    }
}

function clearMessageCache() {
    try {
        sessionStorage.removeItem('chat-messages');
        localStorage.removeItem('chat-messages-backup');
        if (window.messageCache) window.messageCache = [];
    } catch (error) {
        console.error('Message cache clear error:', error);
    }
}

// Mobile Message Recovery Function
async function initializeMobileMessageRecovery() {
    if (!isMobile || !currentUser || !currentChatUser) return;
    
    try {
        // Sync missed messages while app was in background
        const lastSyncTime = localStorage.getItem('last-message-sync') || new Date(Date.now() - 300000).toISOString(); // 5 minutes ago default
        
        const { data: missedMessages, error } = await supabaseClient
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatUser.id}),and(sender_id.eq.${currentChatUser.id},receiver_id.eq.${currentUser.id})`)
            .gte('timestamp', lastSyncTime)
            .order('timestamp', { ascending: true });
            
        if (!error && missedMessages && missedMessages.length > 0) {
            missedMessages.forEach(message => {
                storeMessageInCache(message);
                if (currentChatUser && 
                    ((message.sender_id === currentUser.id && message.receiver_id === currentChatUser.id) ||
                     (message.sender_id === currentChatUser.id && message.receiver_id === currentUser.id))) {
                    const messageElement = createMessageElement(message);
                    const chatMessages = document.getElementById('chat-messages');
                    if (chatMessages) {
                        chatMessages.appendChild(messageElement);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                }
            });
        }
        
        // Update last sync time
        localStorage.setItem('last-message-sync', new Date().toISOString());
    } catch (error) {
        console.error('Mobile message recovery error:', error);
        // Fallback to polling if real-time sync fails
        startMobilePollingFallback();
    }
}

// Mobile Polling Fallback with Exponential Backoff
let pollingInterval = null;
let pollingRetryCount = 0;
const MAX_RETRY_COUNT = 5;
const BASE_POLLING_INTERVAL = 1500; // 1.5 seconds

function startMobilePollingFallback() {
    if (!isMobile || pollingInterval) return;
    
    const poll = async () => {
        try {
            if (!currentUser || !currentChatUser) return;
            
            const { data: newMessages, error } = await supabaseClient
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatUser.id}),and(sender_id.eq.${currentChatUser.id},receiver_id.eq.${currentUser.id})`)
                .gte('timestamp', new Date(Date.now() - 30000).toISOString()) // Last 30 seconds
                .order('timestamp', { ascending: true });
                
            if (!error && newMessages && newMessages.length > 0) {
                newMessages.forEach(message => {
                    storeMessageInCache(message);
                    const messageElement = createMessageElement(message);
                    const chatMessages = document.getElementById('chat-messages');
                    if (chatMessages) {
                        chatMessages.appendChild(messageElement);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                });
            }
            
            // Reset retry count on success
            pollingRetryCount = 0;
        } catch (error) {
            console.error('Polling error:', error);
            pollingRetryCount++;
            
            if (pollingRetryCount >= MAX_RETRY_COUNT) {
                stopMobilePollingFallback();
                showMobileRetryOption();
            }
        }
    };
    
    // Start polling with exponential backoff
    const currentInterval = BASE_POLLING_INTERVAL * Math.pow(2, pollingRetryCount);
    pollingInterval = setInterval(poll, currentInterval);
}

function stopMobilePollingFallback() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

function showMobileRetryOption() {
    if (!document.getElementById('mobile-retry-banner')) {
        const retryBanner = document.createElement('div');
        retryBanner.id = 'mobile-retry-banner';
        retryBanner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: rgba(255, 149, 0, 0.9);
            color: white;
            padding: 10px;
            text-align: center;
            z-index: 10000;
            font-size: 14px;
        `;
        retryBanner.innerHTML = `
            <span>Connection lost. Messages may be delayed.</span>
            <button onclick="retryMobileConnection()" style="margin-left: 10px; background: white; color: #FF9500; border: none; padding: 5px 10px; border-radius: 5px; font-weight: bold;">Retry</button>
        `;
        document.body.appendChild(retryBanner);
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (document.getElementById('mobile-retry-banner')) {
                document.body.removeChild(retryBanner);
            }
        }, 10000);
    }
}

function retryMobileConnection() {
    const banner = document.getElementById('mobile-retry-banner');
    if (banner) {
        document.body.removeChild(banner);
    }
    
    pollingRetryCount = 0;
    setupRealtimeSubscriptions();
    initializeMobileMessageRecovery();
}

// Enhanced Mobile Detection and Touch Optimization
function enhancedMobileDetection() {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    
    // Be more aggressive about mobile detection
    const isNarrowScreen = window.innerWidth <= 900; // Wider threshold
    const result = isMobileDevice || (isTouchDevice && isSmallScreen) || isNarrowScreen;
    
    console.log('=== MOBILE DETECTION ===');
    console.log('User Agent contains mobile indicators:', /mobile|android|iphone/.test(userAgent));
    console.log('Is mobile device:', isMobileDevice);
    console.log('Is touch device:', isTouchDevice);
    console.log('Is small screen (<=768px):', isSmallScreen);
    console.log('Is narrow screen (<=900px):', isNarrowScreen);
    console.log('Window width:', window.innerWidth);
    console.log('Final mobile result:', result);
    console.log('========================');
    
    return result;
}

// Test function for mobile navigation (can be called from console)
window.testMobileNavigation = function() {
    console.log('Testing mobile navigation...');
    isMobile = true; // Force mobile mode
    console.log('Forced isMobile to true');
    
    const userList = document.getElementById('user-list-container');
    const chatArea = document.getElementById('chat-area');
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input-container');
    const welcomeScreen = document.querySelector('.welcome-screen');
    
    if (userList && chatArea) {
        console.log('Elements found, applying mobile navigation');
        userList.classList.add('hidden-mobile');
        chatArea.classList.add('active-mobile');
        
        // Force show chat elements
        if (chatMessages) chatMessages.style.display = 'flex';
        if (messageInput) messageInput.style.display = 'block';
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        
        console.log('Mobile classes applied:', {
            userListClasses: userList.className,
            chatAreaClasses: chatArea.className,
            chatMessagesDisplay: chatMessages?.style.display,
            messageInputDisplay: messageInput?.style.display,
            welcomeScreenDisplay: welcomeScreen?.style.display
        });
    } else {
        console.log('Elements not found:', { userList: !!userList, chatArea: !!chatArea });
    }
};

// Test function to go back to user list
window.testBackToUsers = function() {
    console.log('Testing back to users...');
    const userList = document.getElementById('user-list-container');
    const chatArea = document.getElementById('chat-area');
    
    if (userList && chatArea) {
        userList.classList.remove('hidden-mobile');
        chatArea.classList.remove('active-mobile');
        console.log('Back navigation applied');
    }
};

// Force mobile mode and navigation (for testing)
window.forceMobileNavigation = function() {
    console.log('=== FORCING MOBILE NAVIGATION ===');
    
    // Force mobile detection
    isMobile = true;
    
    const userList = document.getElementById('user-list-container');
    const chatArea = document.getElementById('chat-area');
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input-container');
    const welcomeScreen = document.querySelector('.welcome-screen');
    
    console.log('Elements check:', {
        userList: !!userList,
        chatArea: !!chatArea,
        chatMessages: !!chatMessages,
        messageInput: !!messageInput,
        welcomeScreen: !!welcomeScreen
    });
    
    if (userList && chatArea) {
        // Apply mobile navigation classes
        userList.classList.add('hidden-mobile');
        chatArea.classList.add('active-mobile');
        
        // Apply direct CSS styles as backup
        userList.style.transform = 'translateX(-100%)';
        userList.style.zIndex = '5';
        userList.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        
        chatArea.style.transform = 'translateX(0)';
        chatArea.style.zIndex = '15';
        chatArea.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        
        // Force show chat elements
        if (chatMessages) {
            chatMessages.style.display = 'flex';
            console.log('Chat messages display set to flex');
        }
        if (messageInput) {
            messageInput.style.display = 'block';
            console.log('Message input display set to block');
        }
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
            console.log('Welcome screen hidden');
        }
        
        console.log('Mobile navigation forced successfully!');
        console.log('Final state:', {
            userListClasses: userList.className,
            chatAreaClasses: chatArea.className,
            userListTransform: userList.style.transform,
            chatAreaTransform: chatArea.style.transform,
            userListZIndex: userList.style.zIndex,
            chatAreaZIndex: chatArea.style.zIndex
        });
    } else {
        console.log('ERROR: Required elements not found!');
    }
};

function optimizeMobileTouchInteractions() {
    if (!enhancedMobileDetection()) return;
    
    // Add touch feedback to all interactive elements
    const interactiveElements = document.querySelectorAll('button, .btn, .user-item, .message-input');
    interactiveElements.forEach(element => {
        element.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.95)';
            this.style.transition = 'transform 0.1s ease';
        });
        
        element.addEventListener('touchend', function() {
            this.style.transform = 'scale(1)';
        });
    });
    
    // Optimize keyboard behavior for mobile
    const messageInput = document.getElementById('message-text');
    if (messageInput) {
        messageInput.addEventListener('focus', () => {
            // Scroll input into view on mobile
            setTimeout(() => {
                messageInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        });
    }
}