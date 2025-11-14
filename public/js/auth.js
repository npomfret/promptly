import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  onIdTokenChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const REQUIRE_AUTH = document.body.dataset.requireAuth === 'true';

if (REQUIRE_AUTH) {
  const AUTH_RETRY_EVENT = 'promptly-auth';

  const state = {
    auth: null,
    provider: null,
    token: null,
    sessionReady: false,
    syncingPromise: null,
    overlay: null,
    overlayError: null,
    signInButton: null,
    userChip: null,
    pendingAutoHx: new Set(),
  };

  function mountOverlay() {
    if (state.overlay) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-card glass-panel">
        <p class="eyebrow tight text-muted">Authentication Required</p>
        <h2>Sign in to Promptly</h2>
        <p class="text-muted">Use an account that belongs to the configured Firebase project.</p>
        <button type="button" class="btn btn-primary" data-auth="sign-in">
          <span data-auth="sign-in-label">Sign in with Google</span>
        </button>
        <p class="auth-alt-links">
          Prefer email? <a href="/login">Log in</a> or <a href="/register">Register</a>
        </p>
        <p class="auth-error" data-auth="error" role="alert"></p>
      </div>
    `;
    document.body.appendChild(overlay);

    state.overlay = overlay;
    state.overlayError = overlay.querySelector('[data-auth="error"]');
    state.signInButton = overlay.querySelector('[data-auth="sign-in"]');
    if (state.signInButton) {
      state.signInButton.addEventListener('click', handleSignIn);
    }
  }

  function mountUserChip() {
    if (state.userChip) {
      return;
    }

    const chip = document.createElement('button');
    chip.id = 'auth-user-chip';
    chip.type = 'button';
    chip.innerHTML = `
      <span class="auth-avatar" data-auth-avatar></span>
      <div class="auth-user-details">
        <span class="auth-user-name" data-auth-name>Signed out</span>
        <span class="auth-user-email" data-auth-email></span>
      </div>
      <span class="auth-user-action">Sign out</span>
    `;
    chip.addEventListener('click', handleSignOut);
    chip.hidden = true;
    document.body.appendChild(chip);
    state.userChip = chip;
  }

  function setOverlayError(message = '') {
    if (state.overlayError) {
      state.overlayError.textContent = message;
    }
  }

  function setSignInBusy(isBusy) {
    if (!state.signInButton) {
      return;
    }
    state.signInButton.disabled = isBusy;
    const label = state.signInButton.querySelector('[data-auth="sign-in-label"]');
    if (label) {
      label.textContent = isBusy ? 'Working...' : 'Sign in with Google';
    }
  }

  function showOverlay(message) {
    document.body.classList.add('auth-locked');
    if (!state.overlay) {
      mountOverlay();
    }
    state.overlay?.classList.add('visible');
    if (message) {
      setOverlayError(message);
    }
  }

  function hideOverlay() {
    document.body.classList.remove('auth-locked');
    setOverlayError('');
    state.overlay?.classList.remove('visible');
  }

  function avatarInitial(user) {
    const source = user.displayName || user.email || user.uid || '';
    return source.charAt(0).toUpperCase();
  }

  function updateUserChip(user) {
    if (!state.userChip) {
      mountUserChip();
    }

    if (!state.userChip) {
      return;
    }

    if (!user) {
      state.userChip.hidden = true;
      return;
    }

    const nameEl = state.userChip.querySelector('[data-auth-name]');
    const emailEl = state.userChip.querySelector('[data-auth-email]');
    const avatarEl = state.userChip.querySelector('[data-auth-avatar]');

    if (nameEl) {
      nameEl.textContent = user.displayName || 'Authenticated';
    }
    if (emailEl) {
      emailEl.textContent = user.email || '';
    }
    if (avatarEl) {
      avatarEl.textContent = avatarInitial(user);
    }

    state.userChip.hidden = false;
  }

  async function fetchFirebaseConfig() {
    const response = await fetch('/config/firebase', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to load Firebase configuration.');
    }
    return response.json();
  }

  async function bootstrapAuth() {
    try {
      const config = await fetchFirebaseConfig();
      const app = initializeApp(config);
      const auth = getAuth(app);
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      state.auth = auth;
      state.provider = provider;

      onIdTokenChanged(auth, handleIdTokenChange);
      onAuthStateChanged(auth, handleAuthStateChange);
    } catch (error) {
      console.error('[AUTH] Initialization failed:', error);
      showOverlay('Authentication is unavailable. Check console logs.');
    }
  }

  async function handleSignIn(event) {
    event.preventDefault();
    if (!state.auth || !state.provider) {
      return;
    }

    setOverlayError('');
    setSignInBusy(true);
    try {
      await signInWithPopup(state.auth, state.provider);
    } catch (error) {
      console.error('[AUTH] Sign in failed:', error);
      setOverlayError('Unable to sign in. Please try again.');
    } finally {
      setSignInBusy(false);
    }
  }

  async function handleSignOut(event) {
    event.preventDefault();
    if (!state.auth) {
      return;
    }

    state.sessionReady = false;
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch (error) {
      console.warn('[AUTH] Failed to clear session during sign out:', error);
    }
    await signOut(state.auth);
  }

  async function handleAuthStateChange(user) {
    if (!user) {
      state.token = null;
      state.sessionReady = false;
      updateUserChip(null);
      showOverlay();
      try {
        await fetch('/api/auth/session', { method: 'DELETE' });
      } catch {
        // ignore
      }
      return;
    }

    try {
      state.token = await user.getIdToken();
      updateUserChip(user);
      await ensureServerSession(true);
      hideOverlay();
      flushPendingAutoHx();
    } catch (error) {
      console.error('[AUTH] Failed to sync session:', error);
      showOverlay('Failed to synchronize session. Please retry.');
    }
  }

  async function handleIdTokenChange(user) {
    if (!user) {
      state.token = null;
      state.sessionReady = false;
      return;
    }

    try {
      state.token = await user.getIdToken();
      state.sessionReady = false;
      await ensureServerSession();
    } catch (error) {
      console.warn('[AUTH] Token refresh failed:', error);
    }
  }

  async function ensureServerSession(force = false) {
    if (!state.token) {
      return;
    }

    if (state.sessionReady && !force) {
      return;
    }

    if (state.syncingPromise) {
      return state.syncingPromise;
    }

    state.syncingPromise = fetch('/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`,
      },
      body: '{}',
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Session sync failed');
        }
        state.sessionReady = true;
      })
      .catch(error => {
        state.sessionReady = false;
        throw error;
      })
      .finally(() => {
        state.syncingPromise = null;
      });

    return state.syncingPromise;
  }

  function queueAutoHx(element) {
    if (element) {
      state.pendingAutoHx.add(element);
    }
  }

  function flushPendingAutoHx() {
    if (state.pendingAutoHx.size === 0) {
      return;
    }

    if (!window.htmx || typeof window.htmx.trigger !== 'function') {
      state.pendingAutoHx.clear();
      return;
    }

    state.pendingAutoHx.forEach(el => {
      window.htmx.trigger(el, AUTH_RETRY_EVENT);
    });
    state.pendingAutoHx.clear();
  }

  document.body.addEventListener('htmx:configRequest', event => {
    if (!state.token) {
      if (event.detail.elt?.dataset.authRetry === 'auto') {
        queueAutoHx(event.detail.elt);
      }
      event.preventDefault();
      showOverlay();
      return;
    }

    event.detail.headers = event.detail.headers || {};
    event.detail.headers.Authorization = `Bearer ${state.token}`;
  });

  document.body.classList.add('auth-locked');
  mountOverlay();
  mountUserChip();
  showOverlay();
  bootstrapAuth();
}
