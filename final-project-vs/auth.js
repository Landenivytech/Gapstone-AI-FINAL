const AUTH_STORAGE_KEY = 'currentUser';

function getCurrentUser() {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

function saveCurrentUser(user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    updateAuthNav();
}

function clearCurrentUser() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    updateAuthNav();
}

function updateAuthNav() {
    const authNav = document.getElementById('authNav');
    if (!authNav) return;

    const user = getCurrentUser();
    if (user && user.username) {
        authNav.innerHTML = `<button type="button" id="logoutLink">Logout (${user.username})</button>`;
        const logoutLink = document.getElementById('logoutLink');
        if (logoutLink) {
            logoutLink.addEventListener('click', logoutUser);
        }
    } else {
        authNav.innerHTML = '<a href="index.html">Login</a>';
    }
}

function logoutUser(event) {
    if (event) event.preventDefault();
    clearCurrentUser();
    window.location.href = 'index.html';
}

function showAuthSection(sectionId) {
    document.querySelectorAll('.auth-section').forEach(section => {
        if (section.id === sectionId) {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    });
    document.querySelectorAll('.auth-toggle button').forEach(button => {
        if (button.dataset.section === sectionId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    clearAuthMessage();
}

function showAuthMessage(message, type = 'error') {
    const el = document.getElementById('authMessage');
    if (!el) return;
    el.textContent = message;
    el.className = `auth-message ${type}`;
    el.style.display = 'block';
}

function clearAuthMessage() {
    const el = document.getElementById('authMessage');
    if (!el) return;
    el.textContent = '';
    el.className = 'auth-message';
    el.style.display = 'none';
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleLogin(event) {
    event.preventDefault();
    clearAuthMessage();

    const username = document.getElementById('loginUsername')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;

    if (!username || !password) {
        return showAuthMessage('Please enter both username and password.', 'error');
    }

    try {
        const formData = new FormData();
        formData.append('action', 'login');
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData
        });

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Invalid JSON response from auth.php:', responseText);
            throw new Error('Invalid server response. Check auth.php output and browser console.');
        }

        if (!response.ok) {
            return showAuthMessage(data.error || 'Login failed. Please check your credentials.', 'error');
        }

        saveCurrentUser({ userId: data.userId, username: data.username });
        window.location.href = 'leaderboard.html';
    } catch (error) {
        console.error('Login error:', error);
        showAuthMessage('Unable to log in. Please try again later.', 'error');
    }
}

async function handleSignup(event) {
    event.preventDefault();
    clearAuthMessage();

    const username = document.getElementById('signupUsername')?.value.trim();
    const email = document.getElementById('signupEmail')?.value.trim();
    const password = document.getElementById('signupPassword')?.value;
    const confirmPassword = document.getElementById('signupConfirmPassword')?.value;

    if (!username || !email || !password || !confirmPassword) {
        return showAuthMessage('Please complete all sign-up fields.', 'error');
    }

    if (!validateEmail(email)) {
        return showAuthMessage('Please enter a valid email address.', 'error');
    }

    if (password !== confirmPassword) {
        return showAuthMessage('Passwords do not match.', 'error');
    }

    try {
        const formData = new FormData();
        formData.append('action', 'register');
        formData.append('username', username);
        formData.append('email', email);
        formData.append('password', password);

        console.log('Sending request to auth.php...');
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Invalid JSON response from auth.php:', responseText);
            throw new Error('Invalid server response. Check auth.php output and browser console.');
        }

        console.log('Response data:', data);

        if (!response.ok) {
            return showAuthMessage(data.error || 'Sign-up failed. Please try again.', 'error');
        }

        saveCurrentUser({ userId: data.userId, username: data.username });
        window.location.href = 'leaderboard.html';
    } catch (error) {
        console.error('Sign-up error:', error);
        showAuthMessage('Unable to create an account. Network error or server issue. Check console for details.', 'error');
    }
}

function initAuthPage() {
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const testConnectionBtn = document.getElementById('testConnection');

    loginTab?.addEventListener('click', () => showAuthSection('loginSection'));
    signupTab?.addEventListener('click', () => showAuthSection('signupSection'));
    loginForm?.addEventListener('submit', handleLogin);
    signupForm?.addEventListener('submit', handleSignup);
    testConnectionBtn?.addEventListener('click', testConnection);
}

function requireAuth() {
    const authRequiredPages = ['leaderboard.html', 'import.html', 'info.html'];
    const currentPage = window.location.pathname.split('/').pop();
    if (!authRequiredPages.includes(currentPage)) {
        return true;
    }

    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

async function testConnection() {
    try {
        const formData = new FormData();
        formData.append('action', 'test');

        console.log('Testing connection to auth.php...');
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData
        });

        console.log('Test response status:', response.status);
        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Invalid JSON response from auth.php:', responseText);
            throw new Error('Invalid server response for test connection.');
        }
        console.log('Test response data:', data);

        if (response.ok) {
            showAuthMessage('Connection successful! PHP is working.', 'success');
        } else {
            showAuthMessage('Connection failed: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Test connection error:', error);
        showAuthMessage('Connection failed: ' + error.message, 'error');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    updateAuthNav();
    const user = getCurrentUser();

    if (document.body.dataset.authPage === 'true') {
        if (user) {
            window.location.href = 'leaderboard.html';
            return;
        }
        initAuthPage();
    } else {
        requireAuth();
    }
});
