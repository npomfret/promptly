import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const form = document.querySelector('[data-auth-form]');
if (!form) {
  throw new Error('Authentication form not found on page.');
}

const mode = form.dataset.mode || 'login';
const errorEl = form.querySelector('[data-auth-error]');
const submitTextEl = form.querySelector('[data-auth-submit-text]');
const submitBtn = form.querySelector('button[type="submit"]');

const nextUrl = (() => {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('next');
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return '/';
})();

const state = {
  authPromise: null,
};

function setError(message = '') {
  if (errorEl) {
    errorEl.textContent = message;
  }
}

function setBusy(isBusy) {
  if (submitBtn) {
    submitBtn.disabled = isBusy;
  }
  if (submitTextEl) {
    submitTextEl.textContent = isBusy
      ? mode === 'login'
        ? 'Signing In...'
        : 'Creating Account...'
      : mode === 'login'
        ? 'Sign In'
        : 'Create Account';
  }
}

async function getFirebaseConfig() {
  const response = await fetch('/config/firebase', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load Firebase configuration.');
  }
  return response.json();
}

async function getAuthInstance() {
  if (state.authPromise) {
    return state.authPromise;
  }

  state.authPromise = (async () => {
    const config = await getFirebaseConfig();
    const app = initializeApp(config);
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
    return auth;
  })();

  return state.authPromise;
}

async function syncServerSession(user) {
  const token = await user.getIdToken();
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: '{}',
  });

  if (!response.ok) {
    throw new Error('Failed to sync session with server.');
  }
}

function extractFormData() {
  const formData = new FormData(form);
  const email = formData.get('email')?.toString().trim() || '';
  const password = formData.get('password')?.toString() || '';
  const displayName = formData.get('displayName')?.toString().trim() || '';
  const confirmPassword = formData.get('confirmPassword')?.toString() || '';
  return { email, password, displayName, confirmPassword };
}

function humanizeFirebaseError(error) {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'That email is already registered.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    default:
      return error?.message || 'Something went wrong. Please try again.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('');
  setBusy(true);

  try {
    const auth = await getAuthInstance();
    const { email, password, displayName, confirmPassword } = extractFormData();

    if (!email || !password) {
      setError('Email and password are required.');
      setBusy(false);
      return;
    }

    if (mode === 'register') {
      if (password.length < 12) {
        setError('Password should be at least 12 characters.');
        setBusy(false);
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        setBusy(false);
        return;
      }
    }

    let userCredential;
    if (mode === 'login') {
      userCredential = await signInWithEmailAndPassword(auth, email, password);
    } else {
      userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }
    }

    await syncServerSession(userCredential.user);
    window.location.href = nextUrl;
  } catch (error) {
    console.error('[AUTH] Form submission failed:', error);
    setError(humanizeFirebaseError(error));
    setBusy(false);
  }
});
