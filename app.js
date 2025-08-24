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
let typingSubscription = null;

// Global variable to store message cache
let messageCache = new Map();

// Store failed messages for retry
let failedMessages = [];
let failedMessageRetryInterval = null;

// Typing indicator variables
let typingTimeout = null;
let isTyping = false;
let typingUsers = new Set();

// Message status tracking
let messageStatusMap = new Map(); // messageId -> status
let deliveredMessages = new Set();
let readMessages = new Set();

// Connection quality tracking
let connectionQuality = 'good'; // good, poor, offline
let lastConnectionCheck = Date.now();

function startFailedMessageRetry() {
    if (failedMessageRetryInterval) {
        clearInterval(failedMessageRetryInterval);
    }
    
    failedMessageRetryInterval = setInterval(() => {
        if (failedMessages.length > 0) {
            retryFailedMessages();
        }
    }, 60000); // Retry every minute
}

function stopFailedMessageRetry() {
    if (failedMessageRetryInterval) {
        clearInterval(failedMessageRetryInterval);
        failedMessageRetryInterval = null;
    }
}

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
        requestNotificationPermission(); // Request notification permission
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
    startConnectionCheck(); // Start connection checking
    startFailedMessageRetry(); // Start retrying failed messages
    
    // Add connection status indicator
    updateConnectionStatus('connected');
}

// Sync offline messages when connection is restored
async function syncOfflineMessages() {
    try {
        // Get any offline messages that might need to be sent
        const offlineMessages = getOfflineMessages();
        
        // For this implementation, we're focusing on ensuring messages persist
        // In a more advanced implementation, we would sync unsent messages
        
        console.log('Offline messages synced:', offlineMessages.length);
    } catch (error) {
        console.error('Failed to sync offline messages:', error);
    }
}

// Update connection status handler
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = status === 'connected' ? 'Online' : 'Offline';
        statusElement.className = status === 'connected' ? 'status-connected' : 'status-disconnected';
    }
    
    // If we're now connected, try to sync offline messages
    if (status === 'connected') {
        syncOfflineMessages();
    }
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
            updateConnectionStatus('connected');
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showCalculator();
            cleanup();
            updateConnectionStatus('disconnected');
        } else if (event === 'TOKEN_REFRESHED') {
            console.log('Token refreshed successfully');
            updateConnectionStatus('connected');
        } else if (event === 'TOKEN_REFRESH_FAILED') {
            console.warn('Token refresh failed - user may be logged out');
            updateConnectionStatus('disconnected');
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

// Calculator Functions with enhanced features
function setupCalculatorEvents() {
    // Remove the touch event prevention that was blocking mobile buttons
    // The CSS will handle touch interactions properly
    
    // Add calculator history tracking
    initCalculatorHistory();
}

// Calculator history functionality
let calculatorHistory = [];
let maxHistoryItems = 10;

function initCalculatorHistory() {
    try {
        const saved = localStorage.getItem('calculator_history');
        if (saved) {
            calculatorHistory = JSON.parse(saved);
        }
    } catch (error) {
        console.warn('Failed to load calculator history:', error);
        calculatorHistory = [];
    }
}

function saveCalculatorHistory() {
    try {
        localStorage.setItem('calculator_history', JSON.stringify(calculatorHistory));
    } catch (error) {
        console.warn('Failed to save calculator history:', error);
    }
}

function addToHistory(expression, result) {
    const historyItem = {
        expression: expression,
        result: result,
        timestamp: new Date().toISOString()
    };
    
    calculatorHistory.unshift(historyItem);
    
    // Keep only the last maxHistoryItems
    if (calculatorHistory.length > maxHistoryItems) {
        calculatorHistory = calculatorHistory.slice(0, maxHistoryItems);
    }
    
    saveCalculatorHistory();
}

function appendNumber(num) {
    if (displayValue === '0' || displayValue === '') {
        displayValue = num;
    } else {
        displayValue += num;
    }
    updateDisplay();
    
    // Add visual feedback
    addCalculatorFeedback();
}

function appendOperator(operator) {
    if (!isPasscodeMode) {
        displayValue += operator;
        updateDisplay();
        addCalculatorFeedback();
    }
}

function clearDisplay() {
    displayValue = '0';
    updateDisplay();
    addCalculatorFeedback('clear');
}

function deleteLast() {
    if (displayValue.length > 1) {
        displayValue = displayValue.slice(0, -1);
    } else {
        displayValue = '0';
    }
    updateDisplay();
    addCalculatorFeedback('delete');
}

function updateDisplay() {
    const display = document.getElementById('calc-display');
    display.textContent = displayValue;
    
    // Add dynamic text size based on length
    if (displayValue.length > 10) {
        display.style.fontSize = '2rem';
    } else if (displayValue.length > 8) {
        display.style.fontSize = '2.4rem';
    } else {
        display.style.fontSize = '2.8rem';
    }
    
    // Add subtle animation
    display.style.transform = 'scale(1.02)';
    setTimeout(() => {
        display.style.transform = 'scale(1)';
    }, 100);
}

function addCalculatorFeedback(type = 'default') {
    const display = document.getElementById('calc-display');
    
    // Remove existing feedback classes
    display.classList.remove('feedback-default', 'feedback-clear', 'feedback-delete', 'feedback-error');
    
    // Add appropriate feedback class
    display.classList.add(`feedback-${type}`);
    
    // Remove class after animation
    setTimeout(() => {
        display.classList.remove(`feedback-${type}`);
    }, 300);
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
                // Success animation
                const display = document.getElementById('calc-display');
                display.style.color = 'var(--accent-green)';
                display.textContent = '✓ Access Granted';
                
                setTimeout(() => {
                    showChatApp();
                }, 1000);
            } else {
                // Enhanced wrong passcode feedback
                const display = document.getElementById('calc-display');
                const calculator = document.getElementById('calculator');
                
                // Visual feedback
                display.style.color = 'var(--accent-red)';
                display.textContent = '✗ Wrong Passcode';
                calculator.style.animation = 'shake 0.5s ease-in-out';
                
                // Haptic feedback if available
                if (navigator.vibrate) {
                    navigator.vibrate([100, 50, 100]);
                }
                
                setTimeout(() => {
                    display.style.color = 'var(--text-primary)';
                    calculator.style.animation = '';
                    displayValue = '';
                    updateDisplay();
                }, 1500);
            }
        } catch (error) {
            console.error('Passcode verification error:', error);
            addCalculatorFeedback('error');
            showError('Verification failed. Please try again.');
        }
    } else {
        // Normal calculator operation with history
        try {
            const expression = displayValue.replace('×', '*');
            const result = eval(expression);
            
            // Add to history if it's a valid calculation
            if (!isNaN(result) && isFinite(result)) {
                addToHistory(displayValue, result.toString());
            }
            
            displayValue = result.toString();
            updateDisplay();
            addCalculatorFeedback();
        } catch (error) {
            displayValue = 'Error';
            updateDisplay();
            addCalculatorFeedback('error');
            
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
// Helper function to load users data without UI updates
async function loadUsersData() {
    if (!currentUser) return [];
    
    try {
        const { data: users, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .neq('id', currentUser.id)
            .order('username');
            
        if (error) {
            console.error('Failed to load users data:', error);
            return [];
        }
        
        return users || [];
    } catch (error) {
        console.error('Error loading users data:', error);
        return [];
    }
}

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
    if (!container) return;
    
    container.innerHTML = '';
    
    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.onclick = () => selectUser(user);
        userElement.setAttribute('data-user-id', user.id);
        
        const statusClass = user.is_online ? 'online' : 'offline';
        const statusText = user.is_online ? 'Active now' : getLastActiveText(user.last_active);
        
        // Get unread count for this user
        const unreadCount = unreadMessageCounts.get(user.id) || 0;
        const unreadIndicator = unreadCount > 0 ? 
            `<div class="unread-indicator active">${unreadCount > 9 ? '9+' : unreadCount}</div>` : 
            '<div class="unread-indicator"></div>';
        
        userElement.innerHTML = `
            <div class="user-status ${statusClass}"></div>
            <div class="user-info">
                <div class="user-name">${user.username}</div>
                <div class="user-last-active">${statusText}</div>
            </div>
            ${unreadIndicator}
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
    console.log('Selecting user:', user.username);
    
    currentChatPartner = user;
    
    // Stop any existing mobile polling
    stopMobilePolling();
    
    // Update UI
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Find and activate the selected user item
    const selectedUserElement = document.querySelector(`[data-user-id="${user.id}"]`);
    if (selectedUserElement) {
        selectedUserElement.classList.add('active');
    }
    
    // Enable message input
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    if (messageInput && sendBtn) {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.placeholder = `Message ${user.username}...`;
    }
    
    // Load chat messages
    loadMessages(user.id);
    
    // Mobile: Show chat area and hide user list
    if (isMobileDevice() || window.innerWidth <= 768) {
        showChatArea(user.username);
        
        // Set up mobile polling fallback after a delay to let real-time try first
        setTimeout(() => {
            if (currentChatPartner && currentChatPartner.id === user.id) {
                console.log('Setting up mobile polling for', user.username);
                setupMobilePollingFallback();
            }
        }, 3000); // 3 second delay
    } else {
        // Desktop: Set up polling fallback if real-time fails
        setTimeout(() => {
            if (currentChatPartner && currentChatPartner.id === user.id) {
                // Check if real-time is working, if not, start polling
                if (connectionQuality === 'poor' || connectionQuality === 'very-poor') {
                    console.log('Poor connection detected, starting polling for', user.username);
                    setupMobilePollingFallback();
                }
            }
        }, 5000); // 5 second delay for desktop
    }
    
    // Focus message input
    setTimeout(() => {
        if (messageInput && !isMobileDevice()) {
            messageInput.focus();
        }
    }, 500);
    
    // Update last message check time
    lastMessageCheck = new Date().toISOString();
    
    // Clear any existing search
    clearSearch();
    
    console.log('User selection complete for:', user.username);
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
        // Clear unread count for this user
        unreadMessageCounts.set(partnerId, 0);
        
        // First, get offline messages to ensure we always have something to show
        const offlineMessages = getOfflineMessages().filter(msg => 
            (msg.sender_id === currentUser.id && msg.receiver_id === partnerId) ||
            (msg.sender_id === partnerId && msg.receiver_id === currentUser.id)
        );
        
        console.log('Found offline messages:', offlineMessages.length);
        
        // Try to get server messages
        let serverMessages = [];
        let serverError = null;
        
        try {
            const { data: messages, error } = await supabaseClient
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUser.id})`)
                .order('timestamp', { ascending: true });
                
            if (error) throw error;
            serverMessages = messages || [];
            console.log('Found server messages:', serverMessages.length);
        } catch (err) {
            console.warn('Failed to load server messages:', err);
            serverError = err;
        }
        
        // Merge offline and server messages - prioritize ALL messages
        const messageMap = new Map();
        
        // Add offline messages first (ensures they're never lost)
        offlineMessages.forEach(msg => {
            if (msg && msg.id) {
                messageMap.set(msg.id, msg);
            }
        });
        
        // Add server messages (may overwrite offline with updated versions)
        serverMessages.forEach(msg => {
            if (msg && msg.id) {
                messageMap.set(msg.id, msg);
            }
        });
        
        // Get final merged list
        const allMessages = Array.from(messageMap.values())
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
        console.log('Total merged messages:', allMessages.length);
        
        // Cache ALL messages
        allMessages.forEach(msg => {
            messageCache.set(msg.id, msg);
        });
        
        // Update offline storage with merged messages
        if (allMessages.length > 0) {
            storeMessagesOffline(allMessages);
        }
        
        // Always display messages, even if some are only offline
        displayMessages(allMessages);
        
        // Update last message check time
        if (allMessages.length > 0) {
            lastMessageCheck = allMessages[allMessages.length - 1].timestamp;
        } else {
            lastMessageCheck = new Date().toISOString();
        }
        
        // Show warning if we couldn't reach server but have offline messages
        if (serverError && offlineMessages.length > 0) {
            showError('Showing cached messages. Some messages may not be current.', null, {
                type: 'warning',
                duration: 5000
            });
        }
        
    } catch (error) {
        console.error('Critical load messages error:', error);
        
        // Last resort: try cached messages
        const cachedMessages = Array.from(messageCache.values()).filter(msg => 
            (msg.sender_id === currentUser.id && msg.receiver_id === partnerId) ||
            (msg.sender_id === partnerId && msg.receiver_id === currentUser.id)
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        if (cachedMessages.length > 0) {
            console.log('Using cached messages as last resort:', cachedMessages.length);
            displayMessages(cachedMessages);
        } else {
            console.log('No messages available - showing empty state');
            displayMessages([]);
            showError('Could not load messages. Please check your connection and try again.');
        }
    }
}

function displayMessages(messages) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!messages || messages.length === 0) {
        // Show welcome message when no messages
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        welcomeDiv.textContent = 'No messages yet. Start a conversation!';
        container.appendChild(welcomeDiv);
    } else {
        messages.forEach(message => {
            const messageElement = createMessageElement(message);
            messageElement.setAttribute('data-message-id', message.id);
            
            // Mark as read if it's received and in current chat
            if (message.receiver_id === currentUser.id && 
                currentChatPartner && 
                message.sender_id === currentChatPartner.id) {
                markMessageAsRead(message.id);
            }
            
            container.appendChild(messageElement);
        });
    }
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
    
    // Force reflow to ensure messages stay visible
    container.offsetHeight;
    
    // Update unread counts
    updateUnreadCounts();
}

function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    const isSent = message.sender_id === currentUser.id;
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.setAttribute('data-message-id', message.id);
    
    // Add sending/failed class for temporary messages
    if (message.id.toString().startsWith('temp-')) {
        messageDiv.classList.add('sending');
    }
    
    // Check if this is a failed message
    const isFailed = failedMessages.some(failedMsg => failedMsg.content === message.content);
    if (isFailed) {
        messageDiv.classList.add('failed');
    }
    
    // Add message status if specified
    if (message.status) {
        messageDiv.classList.add(message.status);
    }
    
    let content = '';
    if (message.type === 'tiktok') {
        content = createTikTokEmbed(message.content);
    } else {
        content = `<div class="message-content">${escapeHtml(message.content)}</div>`;
    }
    
    const timestamp = new Date(message.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // Enhanced status indicator for sent messages
    let statusIndicator = '';
    if (isSent) {
        let statusIcon = '🕐'; // Clock for sending
        let statusText = 'Sending...';
        let statusClass = 'status-sending';
        
        if (message.id.toString().startsWith('temp-')) {
            statusIcon = '🕐';
            statusText = 'Sending...';
            statusClass = 'status-sending';
        } else if (deliveredMessages.has(message.id)) {
            if (readMessages.has(message.id)) {
                statusIcon = '✓✓';
                statusText = 'Read';
                statusClass = 'status-read';
            } else {
                statusIcon = '✓✓';
                statusText = 'Delivered';
                statusClass = 'status-delivered';
            }
        } else {
            statusIcon = '✓';
            statusText = 'Sent';
            statusClass = 'status-sent';
        }
        
        statusIndicator = `
            <div class="message-status ${statusClass}" title="${statusText}">
                <span class="status-icon">${statusIcon}</span>
            </div>
        `;
    }
    
    // Add retry button for failed messages
    const retryButton = isFailed ? `
        <button class="retry-btn" onclick="retrySpecificMessage(this)" title="Retry sending message">
            <span>🔄</span> Retry
        </button>
    ` : '';
    
    // Add message reactions placeholder
    const reactionsDiv = `
        <div class="message-reactions" data-message-id="${message.id}">
            <!-- Reactions will be added here -->
        </div>
    `;
    
    messageDiv.innerHTML = `
        ${content}
        <div class="message-footer">
            <div class="message-timestamp" title="${new Date(message.timestamp).toLocaleString()}">${timestamp}</div>
            ${statusIndicator}
        </div>
        ${retryButton}
        ${reactionsDiv}
    `;
    
    // Add long press listener for message options (not for temporary messages)
    if (!message.id.toString().startsWith('temp-')) {
        addLongPressListener(messageDiv, message.id);
    }
    
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
    sendBtn.textContent = '✈️';
    sendBtn.disabled = true;
    
    // Generate unique temp ID
    const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
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
        
        // Add the message to UI immediately for better UX
        const tempMessage = {
            id: tempId,
            ...messageData,
            status: 'sending'
        };
        
        // Clear input immediately
        messageInput.value = '';
        
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            // Remove welcome message if it exists
            const welcomeMsg = chatMessages.querySelector('.welcome-message');
            if (welcomeMsg) {
                welcomeMsg.remove();
            }
            
            const tempMessageElement = createMessageElement(tempMessage);
            tempMessageElement.classList.add('sending');
            tempMessageElement.setAttribute('data-message-id', tempId);
            chatMessages.appendChild(tempMessageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // Insert message into database with retry logic
        let insertAttempts = 0;
        let data = null;
        let error = null;
        
        while (insertAttempts < 3 && !data) {
            insertAttempts++;
            
            const result = await supabaseClient
                .from('messages')
                .insert(messageData)
                .select()
                .single();
                
            data = result.data;
            error = result.error;
            
            if (error && insertAttempts < 3) {
                console.warn(`Message send attempt ${insertAttempts} failed, retrying...`, error);
                await new Promise(resolve => setTimeout(resolve, 1000 * insertAttempts));
            }
        }
        
        if (error) throw error;
        
        // Replace temporary message with actual message
        if (chatMessages && data) {
            const tempElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);
            if (tempElement) {
                // Update the temp element with real data
                tempElement.setAttribute('data-message-id', data.id);
                tempElement.classList.remove('sending');
                tempElement.classList.add('sent');
                
                // Update status indicator
                const statusIndicator = tempElement.querySelector('.message-status');
                if (statusIndicator) {
                    statusIndicator.innerHTML = '✓';
                }
            }
            
            // Cache the message permanently
            messageCache.set(data.id, data);
            
            // Store offline for persistence
            storeMessageOffline(data);
            
            // Force reflow to ensure message stays visible
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 100);
        }
        
        console.log('Message sent successfully:', data.id);
        
        // Remove from failed messages if it was there
        const failedIndex = failedMessages.findIndex(msg => msg.content === content);
        if (failedIndex > -1) {
            failedMessages.splice(failedIndex, 1);
        }
        
    } catch (error) {
        console.error('Send message error:', error);
        
        // Update temp message to show failed state
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            const tempElement = chatMessages.querySelector(`[data-message-id="${tempId}"]`);
            if (tempElement) {
                tempElement.classList.remove('sending');
                tempElement.classList.add('failed');
                
                // Add retry button
                const retryBtn = document.createElement('button');
                retryBtn.className = 'retry-btn';
                retryBtn.textContent = '↻ Retry';
                retryBtn.onclick = () => retrySpecificMessage(retryBtn);
                tempElement.appendChild(retryBtn);
            }
        }
        
        // Store failed message for retry
        const failedMessage = {
            tempId: tempId,
            content: content,
            receiver_id: currentChatPartner.id,
            timestamp: new Date().toISOString(),
            retryCount: 0
        };
        
        failedMessages.push(failedMessage);
        
        showError('Message failed to send. Tap retry to resend.');
        
    } finally {
        // Restore send button
        sendBtn.textContent = originalText;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

// Retry a specific failed message
async function retrySpecificMessage(buttonElement) {
    const messageElement = buttonElement.closest('.message');
    const messageContent = messageElement.querySelector('.message-content').textContent;
    
    // Find the failed message
    const failedIndex = failedMessages.findIndex(msg => msg.content === messageContent);
    if (failedIndex === -1) return;
    
    const failedMsg = failedMessages[failedIndex];
    
    try {
        // Disable the retry button
        buttonElement.disabled = true;
        buttonElement.textContent = 'Retrying...';
        
        const isTikTokUrl = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com)/i.test(failedMsg.content);
        const messageType = isTikTokUrl ? 'tiktok' : 'text';
        
        const messageData = {
            sender_id: currentUser.id,
            receiver_id: failedMsg.receiver_id,
            type: messageType,
            content: failedMsg.content,
            timestamp: failedMsg.timestamp
        };
        
        const { data, error } = await supabaseClient
            .from('messages')
            .insert(messageData)
            .select()
            .single();
            
        if (!error && data) {
            // Remove the failed message element
            messageElement.remove();
            
            // Add the successful message
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) {
                const messageElement = createMessageElement(data);
                messageElement.setAttribute('data-message-id', data.id);
                chatMessages.appendChild(messageElement);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // Cache the message
                messageCache.set(data.id, data);
            }
            
            // Remove from failed messages
            failedMessages.splice(failedIndex, 1);
        } else {
            throw new Error('Failed to resend message');
        }
    } catch (error) {
        console.error('Retry failed:', error);
        buttonElement.disabled = false;
        buttonElement.textContent = 'Retry';
        showError('Retry failed. Please try again later.');
    }
}

// Retry failed messages
async function retryFailedMessages() {
    if (failedMessages.length === 0) return;
    
    const chatMessages = document.getElementById('chat-messages');
    
    for (let i = 0; i < failedMessages.length; i++) {
        const failedMsg = failedMessages[i];
        
        // Skip if retry count is too high
        if (failedMsg.retryCount > 3) {
            continue;
        }
        
        try {
            const isTikTokUrl = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com)/i.test(failedMsg.content);
            const messageType = isTikTokUrl ? 'tiktok' : 'text';
            
            const messageData = {
                sender_id: currentUser.id,
                receiver_id: failedMsg.receiver_id,
                type: messageType,
                content: failedMsg.content,
                timestamp: failedMsg.timestamp
            };
            
            const { data, error } = await supabaseClient
                .from('messages')
                .insert(messageData)
                .select()
                .single();
                
            if (!error && data && chatMessages) {
                // Add message to UI
                const messageElement = createMessageElement(data);
                messageElement.setAttribute('data-message-id', data.id);
                chatMessages.appendChild(messageElement);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // Cache the message
                messageCache.set(data.id, data);
                
                // Remove from failed messages
                failedMessages.splice(i, 1);
                i--; // Adjust index after removal
            } else {
                // Increment retry count
                failedMsg.retryCount++;
            }
        } catch (error) {
            // Increment retry count
            failedMsg.retryCount++;
            console.error('Retry failed:', error);
        }
    }
}

// Enter key to send message
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

// Add typing indicator support
document.getElementById('message-input').addEventListener('input', (e) => {
    handleTyping();
});

document.getElementById('message-input').addEventListener('keyup', (e) => {
    if (e.key !== 'Enter') {
        handleTyping();
    }
});

// Typing indicator functions
function handleTyping() {
    if (!currentChatPartner || !currentUser) return;
    
    if (!isTyping) {
        isTyping = true;
        sendTypingIndicator(true);
    }
    
    // Clear existing timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    // Set new timeout to stop typing indicator
    typingTimeout = setTimeout(() => {
        isTyping = false;
        sendTypingIndicator(false);
    }, 1000); // Stop typing after 1 second of inactivity
}

async function sendTypingIndicator(typing) {
    if (!currentChatPartner || !currentUser) return;
    
    try {
        const { error } = await supabaseClient
            .from('typing_indicators')
            .upsert({
                user_id: currentUser.id,
                chat_partner_id: currentChatPartner.id,
                is_typing: typing,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,chat_partner_id'
            });
            
        if (error) {
            console.warn('Failed to send typing indicator:', error);
        }
    } catch (error) {
        console.warn('Typing indicator error:', error);
    }
}

function showTypingIndicator(username) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    // Remove existing typing indicator
    const existingIndicator = chatMessages.querySelector('.typing-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Create new typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.innerHTML = `
        <span>${username} is typing</span>
        <div class="typing-dots">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const typingIndicator = chatMessages.querySelector('.typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

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
                    
                    // Cache the message immediately
                    messageCache.set(message.id, message);
                    
                    // Store offline for persistence
                    storeMessageOffline(message);
                    
                    // Check if this message is for current chat
                    if (currentChatPartner && 
                        ((message.sender_id === currentUser.id && message.receiver_id === currentChatPartner.id) ||
                         (message.sender_id === currentChatPartner.id && message.receiver_id === currentUser.id))) {
                        
                        const chatMessages = document.getElementById('chat-messages');
                        if (chatMessages) {
                            // Check if message already exists to prevent duplicates
                            const existingMessage = chatMessages.querySelector(`[data-message-id="${message.id}"]`);
                            if (existingMessage) {
                                console.log('Message already exists, skipping duplicate');
                                return;
                            }
                            
                            // Remove welcome message if it exists
                            const welcomeMsg = chatMessages.querySelector('.welcome-message');
                            if (welcomeMsg) {
                                welcomeMsg.remove();
                            }
                            
                            // Check if this is replacing a temporary message
                            const tempElements = chatMessages.querySelectorAll('[class*="sending"]');
                            let replacedTemp = false;
                            
                            // If this is our own message, try to replace temp message
                            if (message.sender_id === currentUser.id && tempElements.length > 0) {
                                const lastTempElement = tempElements[tempElements.length - 1];
                                const tempContent = lastTempElement.querySelector('.message-content')?.textContent;
                                
                                // If content matches, replace the temp message
                                if (tempContent === message.content) {
                                    lastTempElement.setAttribute('data-message-id', message.id);
                                    lastTempElement.classList.remove('sending');
                                    lastTempElement.classList.add('sent');
                                    
                                    // Update status indicator
                                    const statusDiv = lastTempElement.querySelector('.message-status');
                                    if (statusDiv) {
                                        statusDiv.innerHTML = '✓';
                                    }
                                    
                                    replacedTemp = true;
                                }
                            }
                            
                            // If we didn't replace a temp message, add as new
                            if (!replacedTemp) {
                                const messageElement = createMessageElement(message);
                                messageElement.setAttribute('data-message-id', message.id);
                                chatMessages.appendChild(messageElement);
                            }
                            
                            // Always scroll to bottom and force update
                            setTimeout(() => {
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                                chatMessages.offsetHeight; // Force reflow
                            }, 50);
                        }
                    }
                    
                    // Update unread counts for other chats
                    if (message.receiver_id === currentUser.id && 
                        (!currentChatPartner || message.sender_id !== currentChatPartner.id)) {
                        const currentCount = unreadMessageCounts.get(message.sender_id) || 0;
                        unreadMessageCounts.set(message.sender_id, currentCount + 1);
                        updateUnreadCounts();
                    }
                }
            )
            .subscribe((status) => {
                console.log('Messages subscription status:', status);
                
                // Update connection status based on subscription status
                if (status === 'SUBSCRIBED') {
                    updateConnectionStatus('connected');
                } else if (status === 'CHANNEL_ERROR') {
                    updateConnectionStatus('disconnected');
                    // If subscription fails on mobile, set up polling fallback
                    if (window.innerWidth <= 768) {
                        console.log('Setting up mobile polling fallback');
                        setupMobilePollingFallback();
                    }
                }
            });
    }, 1000); // 1 second delay for mobile browsers
}

// Enhanced mobile polling fallback for when real-time fails
let mobilePollingInterval = null;
let lastMessageCheck = new Date().toISOString();
let lastPollingCheck = new Date().toISOString();
let pollingRetryCount = 0;
let maxPollingRetries = 5; // Increased for better reliability
let backgroundPollingInterval = null; // For background sync when app is closed

function setupMobilePollingFallback() {
    // Clear existing interval
    if (mobilePollingInterval) {
        clearInterval(mobilePollingInterval);
    }
    
    // Only set up polling if we have a chat partner
    if (!currentChatPartner || !currentUser) {
        console.log('No chat partner or user, skipping mobile polling setup');
        return;
    }
    
    console.log('Setting up enhanced mobile polling fallback for:', currentChatPartner.username);
    
    // Reset polling check time and retry count
    lastPollingCheck = new Date().toISOString();
    pollingRetryCount = 0;
    
    // Store polling state for recovery
    const pollingState = {
        chatPartnerId: currentChatPartner.id,
        chatPartnerUsername: currentChatPartner.username,
        lastPollingCheck: lastPollingCheck,
        userId: currentUser.id,
        setupTime: new Date().toISOString()
    };
    
    try {
        localStorage.setItem('mobile_polling_state', JSON.stringify(pollingState));
    } catch (error) {
        console.warn('Failed to save polling state:', error);
    }
    
    mobilePollingInterval = setInterval(async () => {
        try {
            // Double-check we still have a chat partner
            if (!currentChatPartner || !currentUser) {
                console.log('Chat partner lost, stopping mobile polling');
                stopMobilePolling();
                return;
            }
            
            // More aggressive message checking - get ALL recent messages
            const { data: recentMessages, error } = await supabaseClient
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatPartner.id}),and(sender_id.eq.${currentChatPartner.id},receiver_id.eq.${currentUser.id})`)
                .gte('timestamp', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
                .order('timestamp', { ascending: true });
                
            if (error) {
                console.error('Enhanced mobile polling error:', error);
                pollingRetryCount++;
                
                if (pollingRetryCount >= maxPollingRetries) {
                    console.error('Max polling retries reached, will retry with backoff');
                    // Don't stop completely, just increase interval
                    clearInterval(mobilePollingInterval);
                    setTimeout(() => {
                        if (currentChatPartner) {
                            console.log('Retrying mobile polling with backoff');
                            pollingRetryCount = 0;
                            setupMobilePollingFallback();
                        }
                    }, 30000); // 30 second backoff
                }
                return;
            }
            
            // Reset retry count on success
            pollingRetryCount = 0;
            
            if (recentMessages && recentMessages.length > 0) {
                const chatMessages = document.getElementById('chat-messages');
                let foundNewMessages = false;
                
                if (chatMessages) {
                    // Get current UI messages
                    const currentUIMessageIds = new Set();
                    const messageElements = chatMessages.querySelectorAll('[data-message-id]');
                    messageElements.forEach(el => {
                        const messageId = el.getAttribute('data-message-id');
                        if (messageId && !messageId.startsWith('temp-')) {
                            currentUIMessageIds.add(messageId);
                        }
                    });
                    
                    // Find messages not in UI
                    const newMessages = recentMessages.filter(msg => !currentUIMessageIds.has(msg.id.toString()));
                    
                    if (newMessages.length > 0) {
                        console.log('Found', newMessages.length, 'new messages via enhanced mobile polling');
                        foundNewMessages = true;
                        
                        newMessages.forEach(message => {
                            // Cache the message
                            messageCache.set(message.id, message);
                            
                            // Store offline immediately
                            storeMessageOffline(message);
                            
                            // Remove welcome message if it exists
                            const welcomeMsg = chatMessages.querySelector('.welcome-message');
                            if (welcomeMsg) {
                                welcomeMsg.remove();
                            }
                            
                            // Add message to UI with enhanced animation
                            const messageElement = createMessageElement(message);
                            messageElement.setAttribute('data-message-id', message.id);
                            
                            // Add with slide-in animation
                            messageElement.style.opacity = '0';
                            messageElement.style.transform = 'translateX(20px)';
                            messageElement.style.transition = 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                            
                            chatMessages.appendChild(messageElement);
                            
                            // Trigger animation
                            setTimeout(() => {
                                messageElement.style.opacity = '1';
                                messageElement.style.transform = 'translateX(0)';
                            }, 50);
                            
                            // Add long press listener for mobile
                            addLongPressListener(messageElement, message.id);
                            
                            // Mark as read if it's for current user
                            if (message.receiver_id === currentUser.id) {
                                markMessageAsRead(message.id);
                            }
                        });
                        
                        // Enhanced scrolling with smooth animation
                        setTimeout(() => {
                            chatMessages.scrollTo({
                                top: chatMessages.scrollHeight,
                                behavior: 'smooth'
                            });
                            
                            // Force reflow
                            chatMessages.offsetHeight;
                        }, 150);
                        
                        // Update unread counts
                        updateUnreadCounts();
                    }
                    
                    // Always update polling check time to most recent message or current time
                    const latestMessage = recentMessages[recentMessages.length - 1];
                    if (latestMessage && latestMessage.timestamp) {
                        lastPollingCheck = latestMessage.timestamp;
                    } else {
                        lastPollingCheck = new Date().toISOString();
                    }
                } else {
                    console.warn('Chat messages container not found during polling');
                }
                
                // Update stored offline messages with ALL recent messages
                storeMessagesOffline(recentMessages);
            } else {
                // No new messages, just update timestamp
                lastPollingCheck = new Date().toISOString();
            }
            
            // Update connection status
            updateConnectionStatus('connected');
            
            // Update polling state
            try {
                const updatedPollingState = {
                    chatPartnerId: currentChatPartner.id,
                    chatPartnerUsername: currentChatPartner.username,
                    lastPollingCheck: lastPollingCheck,
                    userId: currentUser.id,
                    lastSuccessfulPoll: new Date().toISOString()
                };
                localStorage.setItem('mobile_polling_state', JSON.stringify(updatedPollingState));
            } catch (error) {
                console.warn('Failed to update polling state:', error);
            }
            
        } catch (error) {
            console.error('Mobile polling critical error:', error);
            pollingRetryCount++;
            
            if (pollingRetryCount >= maxPollingRetries) {
                console.error('Too many polling errors, will retry with exponential backoff');
                clearInterval(mobilePollingInterval);
                
                // Exponential backoff retry
                const backoffTime = Math.min(60000, 5000 * Math.pow(2, pollingRetryCount - maxPollingRetries));
                setTimeout(() => {
                    if (currentChatPartner) {
                        console.log('Retrying mobile polling after', backoffTime / 1000, 'seconds');
                        pollingRetryCount = 0;
                        setupMobilePollingFallback();
                    }
                }, backoffTime);
                
                updateConnectionStatus('disconnected');
                
                // Show user-friendly error with retry option
                showError('Connection issues detected. Messages may be delayed.', null, {
                    type: 'warning',
                    duration: 8000,
                    actions: [
                        {
                            text: 'Retry Now',
                            handler: () => {
                                if (currentChatPartner) {
                                    pollingRetryCount = 0;
                                    setupMobilePollingFallback();
                                }
                            }
                        },
                        {
                            text: 'Reload Messages',
                            handler: () => {
                                if (currentChatPartner) {
                                    loadMessages(currentChatPartner.id);
                                }
                            }
                        }
                    ]
                });
            }
        }
    }, 1500); // Faster polling interval: 1.5 seconds for better mobile experience
    
    console.log('Enhanced mobile polling started successfully with 1.5s interval');
}

function stopMobilePolling() {
    if (mobilePollingInterval) {
        clearInterval(mobilePollingInterval);
        mobilePollingInterval = null;
        console.log('Mobile polling stopped');
    }
    
    if (backgroundPollingInterval) {
        clearInterval(backgroundPollingInterval);
        backgroundPollingInterval = null;
        console.log('Background polling stopped');
    }
    
    // Clear polling state
    try {
        localStorage.removeItem('mobile_polling_state');
    } catch (error) {
        console.warn('Failed to clear polling state:', error);
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
    
    // Stop connection checking
    stopConnectionCheck();
    
    // Stop failed message retry
    stopFailedMessageRetry();
    
    // Clear message cache
    messageCache.clear();
    
    // Clear failed messages
    failedMessages = [];
    
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
        // Create a toast notification for better UX
        const toast = document.createElement('div');
        toast.className = 'toast-error';
        toast.textContent = message;
        
        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => toast.remove();
        toast.appendChild(closeBtn);
        
        document.body.appendChild(toast);
        
        // Auto remove after 8 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 8000);
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

// Add CSS for toast notifications
const toastStyle = document.createElement('style');
toastStyle.textContent = `
.toast-error {
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff4444;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    max-width: 300px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.toast-error button {
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    margin-left: 15px;
}
`;
document.head.appendChild(toastStyle);

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
let connectionCheckInterval = null;
let wasAppHidden = false;
let lastSyncTime = new Date().toISOString();

// Enhanced mobile app lifecycle handling with comprehensive message sync
document.addEventListener('visibilitychange', async () => {
    console.log('Visibility changed:', document.hidden ? 'hidden' : 'visible');
    
    if (currentUser) {
        const now = Date.now();
        
        if (document.hidden) {
            // App going to background - critical mobile sync point
            wasAppHidden = true;
            lastSyncTime = new Date().toISOString();
            
            // Store current app state for recovery
            const appState = {
                currentChatPartnerId: currentChatPartner?.id || null,
                currentChatPartnerUsername: currentChatPartner?.username || null,
                lastSyncTime: lastSyncTime,
                lastMessageCheck: lastMessageCheck,
                backgroundTimestamp: now
            };
            
            try {
                localStorage.setItem('app_state_backup', JSON.stringify(appState));
                localStorage.setItem('app_last_active', lastSyncTime);
                
                // Force save current messages before going to background
                if (currentChatPartner) {
                    const currentMessages = Array.from(messageCache.values()).filter(msg => 
                        (msg.sender_id === currentUser.id && msg.receiver_id === currentChatPartner.id) ||
                        (msg.sender_id === currentChatPartner.id && msg.receiver_id === currentUser.id)
                    );
                    
                    if (currentMessages.length > 0) {
                        storeMessagesOffline(currentMessages);
                        console.log('Force-saved', currentMessages.length, 'messages before background');
                    }
                }
                
                console.log('App state saved before going to background');
            } catch (error) {
                console.error('Failed to save app state:', error);
            }
            
            // Update presence with throttling
            if (now - lastPresenceUpdate > PRESENCE_UPDATE_COOLDOWN) {
                updateUserPresence(false);
                lastPresenceUpdate = now;
            }
            
        } else {
            // App coming back to foreground - critical mobile recovery point
            if (wasAppHidden) {
                console.log('App returned from background, performing comprehensive sync...');
                
                try {
                    // Restore app state if available
                    const savedState = localStorage.getItem('app_state_backup');
                    if (savedState) {
                        const appState = JSON.parse(savedState);
                        console.log('Restored app state:', appState);
                        
                        // Calculate time spent in background
                        const backgroundDuration = now - (appState.backgroundTimestamp || now);
                        console.log('App was in background for:', Math.round(backgroundDuration / 1000), 'seconds');
                        
                        // If we had a chat partner, try to restore and sync
                        if (appState.currentChatPartnerId && currentChatPartner?.id === appState.currentChatPartnerId) {
                            console.log('Syncing messages for restored chat partner:', appState.currentChatPartnerUsername);
                            await syncMissedMessages();
                        } else if (appState.currentChatPartnerId && !currentChatPartner) {
                            console.log('Previous chat partner was lost, attempting recovery');
                            // Try to restore chat partner if we lost context
                            const users = await loadUsersData();
                            const restoredPartner = users?.find(u => u.id === appState.currentChatPartnerId);
                            if (restoredPartner) {
                                console.log('Restored chat partner:', restoredPartner.username);
                                currentChatPartner = restoredPartner;
                                await syncMissedMessages();
                            }
                        }
                    }
                    
                    // Update presence
                    if (now - lastPresenceUpdate > PRESENCE_UPDATE_COOLDOWN) {
                        updateUserPresence(true);
                        lastPresenceUpdate = now;
                    }
                    
                    // Refresh user list to get latest presence and messages
                    loadUsers();
                    
                    // Re-establish real-time subscriptions if needed
                    if (!messagesSubscription || !usersSubscription) {
                        console.log('Re-establishing real-time subscriptions after background');
                        setupRealtimeSubscriptions();
                    }
                    
                } catch (error) {
                    console.error('Error during background recovery:', error);
                }
                
                wasAppHidden = false;
            }
        }
    }
});

// Add page focus/blur events for additional mobile support with enhanced recovery
window.addEventListener('focus', async () => {
    if (currentUser && wasAppHidden) {
        console.log('Window focused, performing comprehensive sync...');
        
        try {
            // Check if we lost chat context and try to restore
            if (!currentChatPartner) {
                const savedState = localStorage.getItem('app_state_backup');
                if (savedState) {
                    const appState = JSON.parse(savedState);
                    if (appState.currentChatPartnerId) {
                        console.log('Attempting to restore lost chat partner:', appState.currentChatPartnerUsername);
                        
                        // Load users and find the previous chat partner
                        const users = await loadUsersData();
                        const restoredPartner = users?.find(u => u.id === appState.currentChatPartnerId);
                        if (restoredPartner) {
                            currentChatPartner = restoredPartner;
                            console.log('Successfully restored chat partner:', restoredPartner.username);
                            
                            // Update UI to show restored chat
                            const messageInput = document.getElementById('message-input');
                            const sendBtn = document.getElementById('send-btn');
                            if (messageInput && sendBtn) {
                                messageInput.disabled = false;
                                sendBtn.disabled = false;
                                messageInput.placeholder = `Message ${restoredPartner.username}...`;
                            }
                            
                            // Load messages for restored partner
                            await loadMessages(restoredPartner.id);
                        }
                    }
                }
            }
            
            // Sync missed messages
            if (currentChatPartner) {
                await syncMissedMessages();
            }
            
            // Force reload messages to ensure we have the latest
            if (currentChatPartner) {
                console.log('Force reloading messages after focus');
                await loadMessages(currentChatPartner.id);
            }
            
            updateUserPresence(true);
            
        } catch (error) {
            console.error('Error during window focus recovery:', error);
        }
        
        wasAppHidden = false;
    }
});

window.addEventListener('blur', () => {
    if (currentUser) {
        wasAppHidden = true;
        lastSyncTime = new Date().toISOString();
        
        // Enhanced state backup on blur
        const appState = {
            currentChatPartnerId: currentChatPartner?.id || null,
            currentChatPartnerUsername: currentChatPartner?.username || null,
            lastSyncTime: lastSyncTime,
            lastMessageCheck: lastMessageCheck,
            blurTimestamp: Date.now()
        };
        
        try {
            localStorage.setItem('app_state_backup', JSON.stringify(appState));
            localStorage.setItem('app_last_active', lastSyncTime);
            console.log('Enhanced app state saved on blur');
        } catch (error) {
            console.error('Failed to save app state on blur:', error);
        }
    }
});

// Enhanced sync for missed messages with comprehensive mobile support
async function syncMissedMessages() {
    if (!currentChatPartner || !currentUser) {
        console.log('No chat partner or user for message sync');
        return;
    }
    
    try {
        const lastActive = localStorage.getItem('app_last_active') || lastSyncTime;
        
        console.log('Syncing missed messages since:', lastActive, 'for partner:', currentChatPartner.username);
        
        // Get ALL messages for this conversation to ensure we didn't miss any
        const { data: allMessages, error: allError } = await supabaseClient
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatPartner.id}),and(sender_id.eq.${currentChatPartner.id},receiver_id.eq.${currentUser.id})`)
            .order('timestamp', { ascending: true });
            
        if (allError) {
            console.error('Failed to get all messages:', allError);
            
            // Fallback: try just missed messages
            const { data: missedMessages, error: missedError } = await supabaseClient
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatPartner.id}),and(sender_id.eq.${currentChatPartner.id},receiver_id.eq.${currentUser.id})`)
                .gt('timestamp', lastActive)
                .order('timestamp', { ascending: true });
                
            if (missedError) {
                console.error('Failed to sync any missed messages:', missedError);
                return;
            }
            
            if (missedMessages && missedMessages.length > 0) {
                console.log('Found', missedMessages.length, 'missed messages (fallback)');
                await processSyncedMessages(missedMessages, 'missed');
            }
            return;
        }
        
        if (allMessages && allMessages.length > 0) {
            console.log('Retrieved', allMessages.length, 'total messages for sync verification');
            
            // Get current UI messages to compare
            const chatMessages = document.getElementById('chat-messages');
            const currentUIMessageIds = new Set();
            
            if (chatMessages) {
                const messageElements = chatMessages.querySelectorAll('[data-message-id]');
                messageElements.forEach(el => {
                    const messageId = el.getAttribute('data-message-id');
                    if (messageId && !messageId.startsWith('temp-')) {
                        currentUIMessageIds.add(messageId);
                    }
                });
            }
            
            // Find messages that are in server but not in UI
            const missingMessages = allMessages.filter(msg => !currentUIMessageIds.has(msg.id.toString()));
            
            if (missingMessages.length > 0) {
                console.log('Found', missingMessages.length, 'messages missing from UI');
                await processSyncedMessages(missingMessages, 'missing');
                
                // Force full reload to ensure consistency
                console.log('Performing full message reload for consistency');
                await loadMessages(currentChatPartner.id);
            } else {
                console.log('All messages are in sync');
            }
            
            // Update offline storage with complete message set
            storeMessagesOffline(allMessages);
        }
        
    } catch (error) {
        console.error('Error syncing missed messages:', error);
        
        // Last resort: reload all messages
        try {
            console.log('Attempting full message reload as last resort');
            await loadMessages(currentChatPartner.id);
        } catch (reloadError) {
            console.error('Even full reload failed:', reloadError);
        }
    }
}

// Helper function to process synced messages
async function processSyncedMessages(messages, syncType) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages || !messages.length) return;
    
    let addedNewMessages = false;
    
    messages.forEach(message => {
        // Check if message already exists to prevent duplicates
        const existingMessage = chatMessages.querySelector(`[data-message-id="${message.id}"]`);
        if (!existingMessage) {
            // Cache the message
            messageCache.set(message.id, message);
            
            // Store offline
            storeMessageOffline(message);
            
            // Remove welcome message if it exists
            const welcomeMsg = chatMessages.querySelector('.welcome-message');
            if (welcomeMsg) {
                welcomeMsg.remove();
            }
            
            // Add to UI
            const messageElement = createMessageElement(message);
            messageElement.setAttribute('data-message-id', message.id);
            
            // Add with animation for better UX
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateY(20px)';
            chatMessages.appendChild(messageElement);
            
            // Animate in
            setTimeout(() => {
                messageElement.style.opacity = '1';
                messageElement.style.transform = 'translateY(0)';
                messageElement.style.transition = 'all 0.3s ease';
            }, 50);
            
            addedNewMessages = true;
            
            // Mark as read if it's for current user
            if (message.receiver_id === currentUser.id) {
                markMessageAsRead(message.id);
            }
        }
    });
    
    if (addedNewMessages) {
        // Show notification to user
        showError(`${messages.length} ${syncType} message${messages.length > 1 ? 's' : ''} synced`, null, {
            type: 'info',
            duration: 3000
        });
        
        // Scroll to bottom smoothly
        setTimeout(() => {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    }
}

// Periodic connection check with quality monitoring
function startConnectionCheck() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    
    connectionCheckInterval = setInterval(async () => {
        const startTime = Date.now();
        
        try {
            // Simple connectivity check with timing
            const { data, error } = await supabaseClient
                .from('user_profiles')
                .select('id')
                .eq('id', currentUser.id)
                .limit(1)
                .single();
                
            const responseTime = Date.now() - startTime;
            
            if (error) {
                updateConnectionStatus('disconnected');
                connectionQuality = 'offline';
            } else {
                updateConnectionStatus('connected');
                
                // Determine connection quality based on response time
                if (responseTime < 500) {
                    connectionQuality = 'good';
                } else if (responseTime < 2000) {
                    connectionQuality = 'poor';
                } else {
                    connectionQuality = 'very-poor';
                }
                
                updateConnectionQuality(connectionQuality);
            }
        } catch (error) {
            updateConnectionStatus('disconnected');
            connectionQuality = 'offline';
            updateConnectionQuality('offline');
        }
        
        lastConnectionCheck = Date.now();
    }, 15000); // Check every 15 seconds for better battery life
}

function updateConnectionQuality(quality) {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement) return;
    
    // Remove existing quality classes
    statusElement.classList.remove('quality-good', 'quality-poor', 'quality-very-poor', 'quality-offline');
    
    // Add current quality class
    statusElement.classList.add(`quality-${quality}`);
    
    // Update status text with quality indicator
    let statusText = 'Online';
    let qualityIcon = '🟢'; // Green circle
    
    switch (quality) {
        case 'good':
            statusText = 'Online';
            qualityIcon = '🟢'; // Green circle
            break;
        case 'poor':
            statusText = 'Slow';
            qualityIcon = '🟡'; // Yellow circle
            break;
        case 'very-poor':
            statusText = 'Very Slow';
            qualityIcon = '🔴'; // Red circle
            break;
        case 'offline':
            statusText = 'Offline';
            qualityIcon = '⚫'; // Black circle
            break;
    }
    
    statusElement.innerHTML = `<span class="quality-icon">${qualityIcon}</span> ${statusText}`;
}

// Enhanced error handling with retry logic
function showError(message, elementId = null, options = {}) {
    console.error('App Error:', message);
    
    const {
        duration = 8000,
        type = 'error',
        persistent = false,
        actions = []
    } = options;
    
    if (elementId) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.className = `error-message ${type}`;
            
            if (!persistent) {
                setTimeout(() => {
                    errorElement.textContent = '';
                    errorElement.className = 'error-message';
                }, duration);
            }
        }
    } else {
        // Create enhanced toast notification
        const toast = document.createElement('div');
        toast.className = `toast-${type}`;
        
        const content = document.createElement('div');
        content.className = 'toast-content';
        content.textContent = message;
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.className = 'toast-close';
        closeBtn.onclick = () => toast.remove();
        
        toast.appendChild(content);
        toast.appendChild(closeBtn);
        
        // Add action buttons if provided
        if (actions.length > 0) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'toast-actions';
            
            actions.forEach(action => {
                const actionBtn = document.createElement('button');
                actionBtn.textContent = action.text;
                actionBtn.className = 'toast-action-btn';
                actionBtn.onclick = () => {
                    action.handler();
                    if (action.closeOnClick !== false) {
                        toast.remove();
                    }
                };
                actionsDiv.appendChild(actionBtn);
            });
            
            toast.appendChild(actionsDiv);
        }
        
        document.body.appendChild(toast);
        
        // Auto remove if not persistent
        if (!persistent) {
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, duration);
        }
    }
    
    // Handle specific error types
    if (message.includes('429') || message.includes('Rate limited')) {
        setTimeout(() => {
            showError('Rate limit detected. This usually resolves automatically.', null, {
                type: 'warning',
                actions: [
                    {
                        text: 'Clear Cache',
                        handler: clearCachedData
                    }
                ]
            });
        }, 2000);
    }
    
    if (message.includes('Network') || message.includes('connection')) {
        // Auto-retry network errors
        setTimeout(() => {
            if (connectionQuality === 'offline') {
                showError('Still offline. Checking connection...', null, {
                    type: 'info',
                    duration: 3000
                });
            }
        }, 5000);
    }
}

function stopConnectionCheck() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
    }
}

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

// Start connection check when user is authenticated
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
    startConnectionCheck(); // Start connection checking
    startFailedMessageRetry(); // Start retrying failed messages
    
    // Initialize mobile message recovery
    initializeMobileMessageRecovery();
    
    // Add connection status indicator
    updateConnectionStatus('connected');
}

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

// Track unread messages
let unreadMessageCounts = new Map();

function displayUsers(users) {
    const container = document.getElementById('users-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.onclick = () => selectUser(user);
        userElement.setAttribute('data-user-id', user.id);
        
        const statusClass = user.is_online ? 'online' : 'offline';
        const statusText = user.is_online ? 'Active now' : getLastActiveText(user.last_active);
        
        // Get unread count for this user
        const unreadCount = unreadMessageCounts.get(user.id) || 0;
        const unreadIndicator = unreadCount > 0 ? 
            `<div class="unread-indicator active">${unreadCount > 9 ? '9+' : unreadCount}</div>` : 
            '<div class="unread-indicator"></div>';
        
        userElement.innerHTML = `
            <div class="user-status ${statusClass}"></div>
            <div class="user-info">
                <div class="user-name">${user.username}</div>
                <div class="user-last-active">${statusText}</div>
            </div>
            ${unreadIndicator}
        `;
        
        container.appendChild(userElement);
    });
}

// Update unread message counts
function updateUnreadCounts() {
    // This would be implemented with real-time subscriptions or polling
    // For now, we'll just refresh the user list
    if (currentUser) {
        loadUsers();
    }
}

// Track message read status - using existing readMessages from global scope
function markMessageAsRead(messageId) {
    readMessages.add(messageId);
}

function isMessageRead(messageId) {
    return readMessages.has(messageId);
}

// Update the displayMessages function to mark messages as read
function displayMessages(messages) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!messages || messages.length === 0) {
        // Show welcome message when no messages
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        welcomeDiv.textContent = 'No messages yet. Start a conversation!';
        container.appendChild(welcomeDiv);
    } else {
        messages.forEach(message => {
            const messageElement = createMessageElement(message);
            messageElement.setAttribute('data-message-id', message.id);
            
            // Mark as read if it's received and in current chat
            if (message.receiver_id === currentUser.id && 
                currentChatPartner && 
                message.sender_id === currentChatPartner.id) {
                markMessageAsRead(message.id);
            }
            
            container.appendChild(messageElement);
        });
    }
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
    
    // Force reflow to ensure messages stay visible
    container.offsetHeight;
    
    // Update unread counts
    updateUnreadCounts();
}

// Store messages in localStorage for offline access with enhanced mobile persistence
function storeMessagesOffline(messages) {
    if (!currentUser || !messages) return;
    
    try {
        const key = `securechat_messages_${currentUser.id}`;
        const existingMessages = getOfflineMessages();
        
        // Merge with existing messages, avoiding duplicates
        const messageMap = new Map();
        
        // Add existing messages first
        existingMessages.forEach(msg => {
            if (msg && msg.id) {
                messageMap.set(msg.id, msg);
            }
        });
        
        // Add new messages (may overwrite existing)
        messages.forEach(msg => {
            if (msg && msg.id) {
                messageMap.set(msg.id, msg);
            }
        });
        
        const allMessages = Array.from(messageMap.values());
        
        // Store with timestamp for debugging
        const storageData = {
            messages: allMessages,
            lastUpdated: new Date().toISOString(),
            version: 2 // Version for future migrations
        };
        
        localStorage.setItem(key, JSON.stringify(storageData));
        console.log('Stored', allMessages.length, 'messages offline');
        
        // Also store in sessionStorage as backup for mobile browsers
        try {
            sessionStorage.setItem(key + '_backup', JSON.stringify(storageData));
        } catch (sessionError) {
            console.warn('Failed to store backup in sessionStorage:', sessionError);
        }
        
    } catch (error) {
        console.error('Failed to store messages offline:', error);
        
        // Try alternative storage method for mobile
        try {
            const fallbackKey = `securechat_fallback_${currentUser.id}`;
            const simpleData = messages.map(msg => ({
                id: msg.id,
                sender_id: msg.sender_id,
                receiver_id: msg.receiver_id,
                content: msg.content,
                timestamp: msg.timestamp,
                type: msg.type || 'text'
            }));
            localStorage.setItem(fallbackKey, JSON.stringify(simpleData));
            console.log('Used fallback storage for', simpleData.length, 'messages');
        } catch (fallbackError) {
            console.error('Even fallback storage failed:', fallbackError);
        }
    }
}

// Store a single message offline with enhanced persistence
function storeMessageOffline(message) {
    if (!currentUser || !message || !message.id) return;
    
    try {
        const key = `securechat_messages_${currentUser.id}`;
        const existingMessages = getOfflineMessages();
        
        // Check if message already exists
        const messageExists = existingMessages.some(msg => msg && msg.id === message.id);
        if (!messageExists) {
            existingMessages.push(message);
            
            // Store with metadata
            const storageData = {
                messages: existingMessages,
                lastUpdated: new Date().toISOString(),
                version: 2
            };
            
            localStorage.setItem(key, JSON.stringify(storageData));
            console.log('Stored new message offline:', message.id);
            
            // Backup to sessionStorage
            try {
                sessionStorage.setItem(key + '_backup', JSON.stringify(storageData));
            } catch (sessionError) {
                console.warn('Failed to backup message to sessionStorage:', sessionError);
            }
        } else {
            console.log('Message already exists offline:', message.id);
        }
    } catch (error) {
        console.error('Failed to store message offline:', error);
        
        // Try fallback method
        try {
            const fallbackKey = `securechat_fallback_${currentUser.id}`;
            const fallbackMessages = JSON.parse(localStorage.getItem(fallbackKey) || '[]');
            const messageExists = fallbackMessages.some(msg => msg.id === message.id);
            if (!messageExists) {
                fallbackMessages.push({
                    id: message.id,
                    sender_id: message.sender_id,
                    receiver_id: message.receiver_id,
                    content: message.content,
                    timestamp: message.timestamp,
                    type: message.type || 'text'
                });
                localStorage.setItem(fallbackKey, JSON.stringify(fallbackMessages));
                console.log('Used fallback storage for message:', message.id);
            }
        } catch (fallbackError) {
            console.error('Even fallback message storage failed:', fallbackError);
        }
    }
}

function getOfflineMessages() {
    if (!currentUser) return [];
    
    try {
        const key = `securechat_messages_${currentUser.id}`;
        const stored = localStorage.getItem(key);
        
        if (stored) {
            const parsedData = JSON.parse(stored);
            
            // Handle new format with metadata
            if (parsedData.messages && Array.isArray(parsedData.messages)) {
                console.log('Retrieved', parsedData.messages.length, 'messages from offline storage (v2)');
                return parsedData.messages;
            }
            
            // Handle old format (direct array)
            if (Array.isArray(parsedData)) {
                console.log('Retrieved', parsedData.length, 'messages from offline storage (v1)');
                return parsedData;
            }
        }
        
        // Try backup from sessionStorage
        try {
            const backupStored = sessionStorage.getItem(key + '_backup');
            if (backupStored) {
                const backupData = JSON.parse(backupStored);
                if (backupData.messages && Array.isArray(backupData.messages)) {
                    console.log('Retrieved', backupData.messages.length, 'messages from backup storage');
                    return backupData.messages;
                }
            }
        } catch (backupError) {
            console.warn('Failed to retrieve backup messages:', backupError);
        }
        
        // Try fallback storage
        try {
            const fallbackKey = `securechat_fallback_${currentUser.id}`;
            const fallbackStored = localStorage.getItem(fallbackKey);
            if (fallbackStored) {
                const fallbackData = JSON.parse(fallbackStored);
                if (Array.isArray(fallbackData)) {
                    console.log('Retrieved', fallbackData.length, 'messages from fallback storage');
                    return fallbackData;
                }
            }
        } catch (fallbackError) {
            console.warn('Failed to retrieve fallback messages:', fallbackError);
        }
        
        return [];
        
    } catch (error) {
        console.error('Failed to retrieve offline messages:', error);
        return [];
    }
}

// Show notification for new messages
function showNewMessageNotification(message) {
    // Only show notification if user is not currently viewing the chat
    if (!currentChatPartner || currentChatPartner.id !== message.sender_id) {
        // Check if browser supports notifications
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('New message from ' + message.sender_username || 'Unknown', {
                body: message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content,
                icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
            });
        }
    }
}

// Request notification permission
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// Message search functionality
let searchQuery = '';
let searchResults = [];
let searchHighlightTimeout = null;

function searchMessages(query) {
    if (!query || query.length < 2) {
        clearSearchHighlights();
        return [];
    }
    
    searchQuery = query.toLowerCase();
    searchResults = [];
    
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return [];
    
    const messages = chatMessages.querySelectorAll('.message');
    
    messages.forEach((messageElement, index) => {
        const messageContent = messageElement.querySelector('.message-content');
        if (!messageContent) return;
        
        const text = messageContent.textContent.toLowerCase();
        if (text.includes(searchQuery)) {
            searchResults.push({
                element: messageElement,
                index: index,
                text: messageContent.textContent
            });
        }
    });
    
    highlightSearchResults();
    return searchResults;
}

function highlightSearchResults() {
    clearSearchHighlights();
    
    searchResults.forEach(result => {
        result.element.classList.add('search-highlight');
        
        const messageContent = result.element.querySelector('.message-content');
        if (messageContent) {
            const originalText = messageContent.textContent;
            const regex = new RegExp(`(${escapeRegex(searchQuery)})`, 'gi');
            const highlightedText = originalText.replace(regex, '<mark>$1</mark>');
            messageContent.innerHTML = highlightedText;
        }
    });
}

function clearSearchHighlights() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const highlightedMessages = chatMessages.querySelectorAll('.search-highlight');
    highlightedMessages.forEach(message => {
        message.classList.remove('search-highlight');
        
        const messageContent = message.querySelector('.message-content');
        if (messageContent) {
            // Remove HTML tags and restore original text
            const text = messageContent.textContent;
            messageContent.innerHTML = escapeHtml(text);
        }
    });
    
    searchResults = [];
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scrollToSearchResult(index) {
    if (index < 0 || index >= searchResults.length) return;
    
    const result = searchResults[index];
    result.element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
    
    // Add temporary highlight
    result.element.classList.add('search-active');
    
    if (searchHighlightTimeout) {
        clearTimeout(searchHighlightTimeout);
    }
    
    searchHighlightTimeout = setTimeout(() => {
        result.element.classList.remove('search-active');
    }, 2000);
}

// Long press detection for message options
let longPressTimer = null;
let isLongPress = false;

function addLongPressListener(element, messageId) {
    let touchStartTime = 0;
    
    element.addEventListener('touchstart', (e) => {
        touchStartTime = Date.now();
        isLongPress = false;
        
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            showMessageOptions(messageId);
            
            // Haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 500); // 500ms for long press
    });
    
    element.addEventListener('touchend', (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
        }
        
        const touchDuration = Date.now() - touchStartTime;
        if (touchDuration < 500) {
            isLongPress = false;
        }
    });
    
    element.addEventListener('touchmove', (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
        }
    });
    
    // Also support mouse events for desktop
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMessageOptions(messageId);
    });
}

function showMessageOptions(messageId) {
    console.log('Message options for:', messageId);
    
    const message = messageCache.get(messageId);
    if (message) {
        const options = [
            'Copy message',
            'Reply to message',
            'Forward message'
        ];
        
        if (message.sender_id === currentUser.id) {
            options.push('Delete message');
        }
        
        console.log('Available options:', options);
        
        // For future implementation of context menu
        showError(`Message options: ${options.join(', ')}`, null, {
            type: 'info',
            duration: 3000
        });
    }
}

// Enhanced media handling for TikTok and other media
function createTikTokEmbed(url) {
    // Extract TikTok video ID and create enhanced embed
    const tiktokRegex = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com)\/@[\w.-]+\/video\/(\d+)/;
    const match = url.match(tiktokRegex);
    
    if (match) {
        const videoId = match[1];
        return `
            <div class="tiktok-embed">
                <div class="media-loading" id="tiktok-${videoId}">
                    <div class="media-spinner"></div>
                    <p>Loading TikTok video...</p>
                </div>
                <iframe 
                    width="100%" 
                    height="400" 
                    src="https://www.tiktok.com/embed/v2/${videoId}" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen
                    onload="hideTikTokLoading('${videoId}')"
                    onerror="showTikTokError('${videoId}', '${url}')"
                    style="border-radius: 12px;">
                </iframe>
            </div>
        `;
    }
    
    return `
        <div class="tiktok-link">
            <span class="media-icon">🎥</span>
            <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>
        </div>
    `;
}

function hideTikTokLoading(videoId) {
    const loadingDiv = document.getElementById(`tiktok-${videoId}`);
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
}

function showTikTokError(videoId, url) {
    const loadingDiv = document.getElementById(`tiktok-${videoId}`);
    if (loadingDiv) {
        loadingDiv.innerHTML = `
            <div class="media-error">
                <span class="error-icon">⚠️</span>
                <p>Could not load TikTok video</p>
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="fallback-link">View on TikTok</a>
            </div>
        `;
    }
}

// Chat search functionality handlers
function performSearch() {
    const searchInput = document.getElementById('chat-search');
    if (!searchInput) {
        console.error('Search input not found');
        return;
    }
    
    const query = searchInput.value.trim();
    
    if (!query) {
        clearSearch();
        return;
    }
    
    console.log('Performing search for:', query);
    
    try {
        const results = searchMessages(query);
        
        // Show search results count with better UX
        if (results.length > 0) {
            // Create a better search results indicator
            const searchStatus = document.createElement('div');
            searchStatus.className = 'search-status success';
            searchStatus.innerHTML = `
                <span class="search-icon">🔍</span>
                Found ${results.length} message${results.length > 1 ? 's' : ''}
                <button class="search-nav" onclick="scrollToSearchResult(0)" title="Go to first result">↓</button>
            `;
            
            // Show toast with navigation
            showSearchToast(searchStatus.outerHTML, 'success');
            
            // Scroll to first result
            scrollToSearchResult(0);
            
            // Add search navigation if multiple results
            if (results.length > 1) {
                addSearchNavigation();
            }
        } else {
            const searchStatus = document.createElement('div');
            searchStatus.className = 'search-status warning';
            searchStatus.innerHTML = `
                <span class="search-icon">🔍</span>
                No messages found for "${escapeHtml(query)}"
            `;
            
            showSearchToast(searchStatus.outerHTML, 'warning');
        }
        
        // Update button states
        const clearBtn = document.getElementById('clear-search-btn');
        const searchBtn = document.getElementById('search-btn');
        
        if (clearBtn && searchBtn) {
            clearBtn.classList.remove('hidden');
            searchBtn.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('Search error:', error);
        showSearchToast(`
            <span class="search-icon">⚠️</span>
            Search failed. Please try again.
        `, 'error');
    }
}

function showSearchToast(content, type = 'info') {
    // Remove existing search toasts
    const existingToasts = document.querySelectorAll('.search-toast');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `search-toast toast-${type}`;
    toast.innerHTML = content;
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.className = 'search-toast-close';
    closeBtn.onclick = () => toast.remove();
    toast.appendChild(closeBtn);
    
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

function addSearchNavigation() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages || searchResults.length <= 1) return;
    
    // Remove existing navigation
    const existingNav = document.querySelector('.search-navigation-overlay');
    if (existingNav) existingNav.remove();
    
    // Create navigation overlay
    const navOverlay = document.createElement('div');
    navOverlay.className = 'search-navigation-overlay';
    navOverlay.innerHTML = `
        <div class="search-nav-controls">
            <button onclick="navigateSearchResults(-1)" title="Previous result">↑</button>
            <span class="search-counter">1 / ${searchResults.length}</span>
            <button onclick="navigateSearchResults(1)" title="Next result">↓</button>
        </div>
    `;
    
    chatMessages.appendChild(navOverlay);
}

let currentSearchIndex = 0;

function navigateSearchResults(direction) {
    if (searchResults.length === 0) return;
    
    currentSearchIndex += direction;
    
    // Wrap around
    if (currentSearchIndex < 0) {
        currentSearchIndex = searchResults.length - 1;
    } else if (currentSearchIndex >= searchResults.length) {
        currentSearchIndex = 0;
    }
    
    // Update counter
    const counter = document.querySelector('.search-counter');
    if (counter) {
        counter.textContent = `${currentSearchIndex + 1} / ${searchResults.length}`;
    }
    
    // Scroll to result
    scrollToSearchResult(currentSearchIndex);
}

function clearSearch() {
    const searchInput = document.getElementById('chat-search');
    if (searchInput) {
        searchInput.value = '';
    }
    
    clearSearchHighlights();
    
    // Remove search navigation
    const navOverlay = document.querySelector('.search-navigation-overlay');
    if (navOverlay) navOverlay.remove();
    
    // Remove search toasts
    const searchToasts = document.querySelectorAll('.search-toast');
    searchToasts.forEach(toast => toast.remove());
    
    // Update button states
    const clearBtn = document.getElementById('clear-search-btn');
    const searchBtn = document.getElementById('search-btn');
    
    if (clearBtn && searchBtn) {
        clearBtn.classList.add('hidden');
        searchBtn.classList.remove('hidden');
    }
    
    // Reset search state
    currentSearchIndex = 0;
    searchResults = [];
    
    console.log('Search cleared');
}

// Enhanced chat functionality with mobile optimizations
function setupEnhancedChatFeatures() {
    console.log('Setting up enhanced chat features...');
    
    try {
        // Add search input handler
        const searchInput = document.getElementById('chat-search');
        if (searchInput) {
            console.log('Setting up search functionality');
            
            // Remove existing listeners to prevent duplicates
            searchInput.removeEventListener('keypress', handleSearchKeypress);
            searchInput.removeEventListener('input', handleSearchInput);
            
            // Add new listeners
            searchInput.addEventListener('keypress', handleSearchKeypress);
            searchInput.addEventListener('input', handleSearchInput);
            
            // Mobile-specific: Add touch-friendly search behavior
            if (isMobileDevice()) {
                searchInput.addEventListener('focus', () => {
                    // Scroll search input into view on mobile
                    setTimeout(() => {
                        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                });
            }
        } else {
            console.warn('Search input not found, search functionality disabled');
        }
        
        // Add message input enhancements
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            console.log('Setting up message input enhancements');
            
            // Remove existing listeners
            messageInput.removeEventListener('input', autoResizeTextarea);
            messageInput.removeEventListener('keydown', handleKeyboardShortcuts);
            
            // Add auto-resize functionality
            messageInput.addEventListener('input', autoResizeTextarea);
            
            // Add keyboard shortcuts (desktop only)
            if (!isMobileDevice()) {
                messageInput.addEventListener('keydown', handleKeyboardShortcuts);
            }
            
            // Mobile-specific enhancements
            if (isMobileDevice()) {
                // Prevent zoom on focus
                messageInput.style.fontSize = '16px';
                
                // Add mobile-friendly behavior
                messageInput.addEventListener('focus', () => {
                    // Scroll message input into view
                    setTimeout(() => {
                        messageInput.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    }, 300);
                });
            }
        } else {
            console.warn('Message input not found');
        }
        
        // Add long press listeners to existing messages
        addLongPressToExistingMessages();
        
        console.log('Enhanced chat features setup complete');
        
    } catch (error) {
        console.error('Error setting up enhanced chat features:', error);
    }
}

// Detect mobile device
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           window.innerWidth <= 768 || 
           ('ontouchstart' in window);
}

// Search event handlers
function handleSearchKeypress(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
    }
}

function handleSearchInput(e) {
    if (e.target.value === '') {
        clearSearch();
    }
}

// Add long press to existing messages
function addLongPressToExistingMessages() {
    const messages = document.querySelectorAll('.message[data-message-id]');
    messages.forEach(messageElement => {
        const messageId = messageElement.getAttribute('data-message-id');
        if (messageId && !messageId.startsWith('temp-')) {
            addLongPressListener(messageElement, messageId);
        }
    });
}

function autoResizeTextarea() {
    const textarea = document.getElementById('message-input');
    if (!textarea) return;
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Set height based on content, with min and max limits
    const minHeight = 44; // Minimum height in pixels
    const maxHeight = 120; // Maximum height in pixels
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    
    textarea.style.height = newHeight + 'px';
    
    // Enable/disable scrolling based on content
    if (textarea.scrollHeight > maxHeight) {
        textarea.style.overflowY = 'auto';
    } else {
        textarea.style.overflowY = 'hidden';
    }
}

function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + Enter to send message
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
    
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('chat-search');
        if (searchInput) {
            searchInput.focus();
        }
    }
}

// Message reactions functionality (placeholder)
function addMessageReaction(messageId, reaction) {
    console.log(`Adding reaction ${reaction} to message ${messageId}`);
    
    // This would normally send the reaction to the database
    // For now, just show a visual indicator
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        const reactionsDiv = messageElement.querySelector('.message-reactions');
        if (reactionsDiv) {
            const reactionElement = document.createElement('div');
            reactionElement.className = 'message-reaction reacted';
            reactionElement.innerHTML = `${reaction} <span>1</span>`;
            reactionsDiv.appendChild(reactionElement);
        }
    }
}

// Initialize enhanced chat features when chat app is shown
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
    startConnectionCheck();
    startFailedMessageRetry();
    setupEnhancedChatFeatures(); // Add enhanced features
    
    // Add connection status indicator
    updateConnectionStatus('connected');
}
