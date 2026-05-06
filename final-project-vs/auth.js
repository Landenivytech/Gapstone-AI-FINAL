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
        authNav.innerHTML = `<a href="#" id="logoutLink">Logout (${user.username})</a>`;
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
        section.classList.toggle('active', section.id === sectionId);
    });
    document.querySelectorAll('.auth-toggle button').forEach(button => {
        button.classList.toggle('active', button.dataset.section === sectionId);
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
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
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
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        if (!response.ok) {
            return showAuthMessage(data.error || 'Sign-up failed. Please try again.', 'error');
        }

        saveCurrentUser({ userId: data.userId, username: data.username });
        window.location.href = 'leaderboard.html';
    } catch (error) {
        console.error('Sign-up error:', error);
        showAuthMessage('Unable to create an account. Please try again later.', 'error');
    }
}

function initAuthPage() {
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    loginTab?.addEventListener('click', () => showAuthSection('loginSection'));
    signupTab?.addEventListener('click', () => showAuthSection('signupSection'));
    loginForm?.addEventListener('submit', handleLogin);
    signupForm?.addEventListener('submit', handleSignup);
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
    }
});
