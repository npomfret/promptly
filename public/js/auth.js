import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  onIdTokenChanged,
  setPersistence,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const REQUIRE_AUTH = document.body.dataset.requireAuth === 'true';

if (REQUIRE_AUTH) {
  const AUTH_RETRY_EVENT = 'promptly-auth';

  const state = {
    auth: null,
    token: null,
    sessionReady: false,
    syncingPromise: null,
    overlay: null,
    overlayError: null,
    userChip: null,
    pendingAutoHx: new Set(),
    authInitialized: false,
    authReadyResolve: null,
  };

  // Promise that resolves when auth state is known
  const authReady = new Promise((resolve) => {
    state.authReadyResolve = resolve;
  });

  function mountOverlay() {
    if (state.overlay) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-card glass-panel">
        <p class="eyebrow tight text-muted">Authentication Required</p>
        <h2>Sign in to continue</h2>
        <p class="text-muted">Please sign in with your email and password to access this page.</p>
        <div class="auth-actions">
          <a href="/login" class="btn btn-primary">Sign In</a>
          <a href="/register" class="btn btn-secondary">Create Account</a>
        </div>
        <p class="auth-error" data-auth="error" role="alert"></p>
      </div>
    `;
    document.body.appendChild(overlay);

    state.overlay = overlay;
    state.overlayError = overlay.querySelector('[data-auth="error"]');
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

  function showOverlay(message) {
    // Lazy mount: only create overlay when we actually need it
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

  function hasCachedAuth() {
    // Synchronously check if Firebase has cached auth in localStorage
    try {
      const keys = Object.keys(localStorage);
      return keys.some(key => key.includes('firebase:authUser'));
    } catch {
      return false;
    }
  }

  async function fetchFirebaseConfig() {
    // Use inline config if available, otherwise fetch
    if (window.__firebaseConfig__) {
      return window.__firebaseConfig__;
    }

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

      state.auth = auth;

      onIdTokenChanged(auth, handleIdTokenChange);
      onAuthStateChanged(auth, handleAuthStateChange);
    } catch (error) {
      console.error('[AUTH] Initialization failed:', error);
      showOverlay('Authentication is unavailable. Check console logs.');
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
      state.authInitialized = true;
      updateUserChip(null);
      // User is NOT authenticated - now we show overlay
      showOverlay();
      document.body.classList.add('auth-locked');
      // Resolve auth ready promise
      if (state.authReadyResolve) {
        state.authReadyResolve();
        state.authReadyResolve = null;
      }
      try {
        await fetch('/api/auth/session', { method: 'DELETE' });
      } catch {
        // ignore
      }
      return;
    }

    try {
      state.token = await user.getIdToken();
      state.authInitialized = true;
      updateUserChip(user);

      // Resolve auth ready promise and flush queued requests BEFORE session sync
      // This allows requests to proceed even if session sync is slow
      if (state.authReadyResolve) {
        state.authReadyResolve();
        state.authReadyResolve = null;
      }
      flushPendingAutoHx();

      await ensureServerSession(true);
      // User IS authenticated - ensure overlay is hidden
      hideOverlay();
      document.body.classList.remove('auth-locked');
    } catch (error) {
      console.error('[AUTH] Failed to sync session:', error);
      state.authInitialized = true;
      showOverlay('Failed to synchronize session. Please retry.');
      document.body.classList.add('auth-locked');
      // Resolve auth ready promise even on error
      if (state.authReadyResolve) {
        state.authReadyResolve();
        state.authReadyResolve = null;
      }
      // Flush pending requests even on error if we have a token
      if (state.token) {
        flushPendingAutoHx();
      }
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

  document.body.addEventListener('htmx:configRequest', (event) => {
    // If auth hasn't initialized yet, queue the request
    if (!state.authInitialized) {
      event.preventDefault();
      queueAutoHx(event.detail.elt);
      return;
    }

    // Auth is initialized - check if we have a token
    if (!state.token) {
      // Check if this is a guarded element that should redirect instead of showing overlay
      const isGuarded = event.detail.elt?.dataset.authGuard === 'true' ||
                        event.detail.elt?.closest('[data-auth-guard="true"]');

      if (isGuarded) {
        // Redirect to login for guarded elements
        event.preventDefault();
        const next = encodeURIComponent(window.location.href);
        window.location.href = `/login?next=${next}`;
        return;
      }

      if (event.detail.elt?.dataset.authRetry === 'auto') {
        queueAutoHx(event.detail.elt);
      }
      event.preventDefault();
      showOverlay();
      return;
    }

    // We have a token - add it to the request
    event.detail.headers = event.detail.headers || {};
    event.detail.headers.Authorization = `Bearer ${state.token}`;
  });

  // Optimistic auth flow: trust cached auth, verify in background
  // Don't mount or show anything initially - let Firebase decide
  mountUserChip();
  bootstrapAuth();
}
