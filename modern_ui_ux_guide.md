# Modern UI/UX Reference (Engineering Edition)

A condensed field guide for engineers who need to ship cinematic, high-trust web interfaces without resorting to ad‑hoc styling. The focus here is on *why* each technique matters, *how* to implement it, and which failure modes to avoid. Examples reference the Promptly control room UI, but the guidance generalizes to any modern dashboard or tool.

---

## 1. Layered Foundations

### 1.1. Design tokens first, pixels later

**Why:** Centralized tokens (`--accent-teal`, `--radius-lg`, `--shadow-soft`) guarantee visual coherence and make global tweaks (e.g., brand color shifts) cheap. Tokens enable systematic design changes without find-and-replace hell. When your PM wants to "make it more purple," you change one variable instead of hunting through 40 files.

**How:**
```css
:root {
  /* Semantic color system */
  --bg-base: #05060a;
  --bg-elevated: rgba(9, 11, 25, 0.65);
  --glass-border: rgba(255, 255, 255, 0.07);
  --text-primary: #f8fafc;
  --text-muted: rgba(248, 250, 252, 0.7);

  /* Accent palette */
  --accent-teal: #34d399;
  --accent-cyan: #22d3ee;

  /* Spatial system */
  --radius: 18px;
  --radius-lg: 28px;
  --shadow-soft: 0 20px 45px rgba(5, 6, 10, 0.45);

  /* Motion system */
  --transition: 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
```

Use `clamp()` for fluid typography that responds to viewport without media queries:
```css
font-size: clamp(1.5rem, 5vw, 3.5rem); /* min, preferred, max */
padding: clamp(1.5rem, 4vw, 3rem);
```

**Anti-patterns:**
- Mixing raw hex values (`#34d399`) with tokens in the same codebase
- Defining tokens that never get used (lint for dead CSS variables)
- Over-tokenizing (don't create `--button-hover-shadow-on-tuesday`)

**Why this works:** Browsers optimize CSS custom property lookups. Tokens add negligible runtime cost while making theme switching, dark mode, and A/B testing trivial. See [CSS Custom Properties on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties) for performance characteristics.

**References:**
- [Design Tokens W3C Community Group](https://design-tokens.github.io/community-group/format/) - Cross-platform token format specification
- [Style Dictionary](https://amzn.github.io/style-dictionary/) - Build system for design tokens
- [Open Props](https://open-props.style/) - Modern token system you can adopt wholesale

### 1.2. Atmospheric backdrops without layout hacks

**Why:** Animated gradients plus blurred aurora layers create depth that makes glass surfaces meaningful. Static backgrounds feel flat; subtle motion adds life without distraction. The key is *subliminal* animation—users shouldn't consciously notice it, but should feel the UI is "alive."

**How:**
```css
body::before,
body::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none; /* Critical: don't block interaction */
  z-index: 0;
}

body::before {
  background:
    radial-gradient(circle at 20% 20%, rgba(79, 70, 229, 0.4), transparent 55%),
    radial-gradient(circle at 80% 0%, rgba(236, 72, 153, 0.35), transparent 60%);
  filter: blur(25px);
}

body::after {
  background:
    radial-gradient(circle at 40% 80%, rgba(34, 211, 238, 0.35), transparent 60%),
    radial-gradient(circle at 80% 60%, rgba(52, 211, 153, 0.25), transparent 75%);
  animation: aurora 24s ease-in-out infinite alternate;
}

@keyframes aurora {
  0%   { transform: translateY(0); opacity: 0.8; }
  50%  { transform: translateY(-40px); opacity: 0.65; }
  100% { transform: translateY(20px); opacity: 0.85; }
}
```

**Why 24 seconds?** Anything faster feels jittery; anything slower feels static. 20-30s hits the sweet spot where motion is perceivable but not distracting.

**Anti-patterns:**
- Parallax scroll handlers that fire on every scroll event (causes jank)
- Animating `background-position` with `background-size: cover` (forces expensive repaints)
- Forgetting `pointer-events: none` (blocks all clicks on the page!)

**Performance notes:** Only animate `transform` and `opacity`—these are GPU-accelerated and don't trigger layout/paint. Check [CSS Triggers](https://csstriggers.com/) before animating any property. `transform` triggers composite only; `background-position` triggers paint on every frame.

**References:**
- [High Performance Animations](https://www.html5rocks.com/en/tutorials/speed/high-performance-animations/) - Why transform/opacity matter
- [CSS Triggers](https://csstriggers.com/) - Which CSS properties trigger layout/paint/composite
- [Stripe gradient backgrounds](https://stripe.com/) - Production example of animated gradients at scale

---

## 2. Surfaces, Depth, and Hierarchy

### 2.1. Glassmorphism with restraint

**Why:** A frosted card instantly communicates elevation and interaction priority. Glassmorphism creates visual hierarchy through transparency and blur—foreground elements feel physically "above" the background. But restraint is critical: if everything is glass, nothing stands out.

**How:**
```css
.glass-panel {
  backdrop-filter: blur(24px);
  background: var(--bg-elevated); /* rgba(9, 11, 25, 0.65) */
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
  position: relative;
  overflow: hidden;
}

/* Optional hover glow */
.glass-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.08), transparent 60%);
  opacity: 0;
  transition: opacity var(--transition);
  pointer-events: none; /* CRITICAL: Don't block interaction */
}

.glass-panel:hover::after {
  opacity: 1;
}

/* Fallback for browsers without backdrop-filter */
@supports not (backdrop-filter: blur(1px)) {
  .glass-panel {
    background: rgba(9, 11, 25, 0.95); /* More opaque when blur unavailable */
  }
}
```

**Why 24px blur?** Smaller values (≤12px) look pixelated; larger values (≥40px) obscure content. 20-30px is the sweet spot for readability over complex backgrounds.

**The pointer-events gotcha:** We spent an hour debugging "buttons not working" because `.glass-panel::after` covered interactive elements. Always set `pointer-events: none` on decorative overlays. This is the #1 glassmorphism bug in production.

**Anti-patterns:**
- Applying glass effect to every surface (use sparingly for elevation hierarchy)
- Forgetting `@supports` fallback for Firefox < 103, Safari < 9
- Overlays without `pointer-events: none` (blocks all interaction)
- Using blur on elements that animate or scroll (causes stuttering)

**Browser support:** `backdrop-filter` is ~94% global support as of 2024 but requires `-webkit-` prefix for Safari. Always test fallback on Firefox ESR.

**References:**
- [MDN: backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter) - Browser support and syntax
- [Can I Use: backdrop-filter](https://caniuse.com/css-backdrop-filter) - Current browser support
- [Glassmorphism Generator](https://hype4.academy/tools/glassmorphism-generator) - Visual tool for tuning parameters
- [Apple Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) - Source of glassmorphism design language

### 2.2. Status-aware micro components

**Why:** Small, repeatable badges and alerts reduce bespoke CSS and keep state changes obvious. Status indicators are the "LEDs" of your UI—they should be instantly scannable without reading text.

**How:**
```css
/* Badge system */
.status-badge {
  display: inline-flex;
  padding: 0.2rem 0.75rem;
  font-size: 0.7rem;
  border-radius: 999px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-ready {
  background: rgba(52, 211, 153, 0.15);
  color: #a7f3d0;
}

.status-error {
  background: rgba(248, 113, 113, 0.18);
  color: #fecaca;
}

/* Alert system */
.alert {
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.alert.success {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(52, 211, 153, 0.12);
  color: #d1fae5;
}
```

**Design principle:** Use color + text, never color alone (WCAG 2.1 requirement). "Ready" status should be green AND say "Ready" for colorblind users.

**DOM manipulation:** Toggle classes, don't mutate inline styles:
```javascript
// Good
element.classList.toggle('is-hidden');
element.classList.add('status-error');

// Bad - inline styles are hard to audit and override
element.style.display = 'none';
element.style.color = '#f43f5e';
```

**Anti-patterns:**
- Custom inline color tweaks (impossible to theme or audit)
- Using color as the only status indicator (fails accessibility)
- Decorative pseudo-elements without `pointer-events: none`
- Relying on JavaScript for state that CSS classes can handle

**References:**
- [WCAG 2.1: Use of Color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html) - Why color alone isn't enough
- [Tailwind Status Colors](https://tailwindcss.com/docs/customizing-colors#color-palette-reference) - Well-designed semantic color system
- [Inclusive Components: Notifications](https://inclusive-components.design/notifications/) - Accessible alert patterns

---

## 3. Layout System

### 3.1. Container primitives

**Why:** Reusable layout primitives eliminate "one-off" containers that drift over time. Define your grid and spacing system once, compose everywhere. Every new layout request should combine existing primitives, not spawn new CSS.

**How:**
```css
/* Main container with sensible width constraints */
.page-shell {
  position: relative;
  z-index: 1;
  width: min(1200px, 95vw); /* Never wider than 1200px, but fluid on mobile */
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

/* Auto-responsive grids */
.split-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.75rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.25rem;
}

/* Utility classes for flex layouts */
.flex { display: flex; }
.flex-column { flex-direction: column; }
.align-center { align-items: center; }
.gap-md { gap: 1rem; }
```

**Why `auto-fit` grids?** They collapse intelligently without media queries. A 3-column grid becomes 2-column, then 1-column based on available space. No breakpoint math required.

**Utility class philosophy:** Utilities handle 80% of layout needs without writing new CSS. But don't become Tailwind—keep utilities semantic (`.gap-md` not `.gap-4`) and coarse-grained (`.flex` not `.flex-nowrap-reverse-row`). The goal is readable HTML, not inline styling in class names.

**Anti-patterns:**
- Writing one-off containers instead of composing primitives
- Inline styles (`style="display: flex; gap: 1rem"`) that can't be audited or themed
- Over-abstracting utilities (don't need `.margin-top-3px-on-tuesdays`)
- Duplicating markup for mobile/desktop (use CSS media queries instead)

**Linting rule:** Search codebase for `style="` should return zero results. If you find inline styles, convert to utility classes or component styles.

**References:**
- [Every Layout](https://every-layout.dev/) - Layout primitives as a design system
- [CSS Grid auto-fit vs auto-fill](https://css-tricks.com/auto-sizing-columns-css-grid-auto-fill-vs-auto-fit/) - Understanding responsive grids
- [Utopia Fluid Type Scale](https://utopia.fyi/) - Mathematical fluid typography and spacing

### 3.2. Responsive strategy

**Why:** Fluid dimensions via `clamp()` and intrinsic grids eliminate 90% of breakpoints. Media queries become exception handling, not the foundation of responsive design.

**How:**
```css
/* Fluid typography (no media queries needed) */
h1 {
  font-size: clamp(2.5rem, 5vw, 3.75rem);
  line-height: 1.05;
}

/* Fluid padding */
body {
  padding: clamp(1.5rem, 4vw, 3rem);
}

/* Single breakpoint for major layout shifts */
@media (max-width: 768px) {
  .hero-actions {
    flex-direction: column;
    align-items: flex-start;
  }

  .button-row {
    flex-direction: column;
    align-items: stretch;
  }

  .button-row .btn {
    width: 100%;
  }
}
```

**Mobile-first vs desktop-first?** Doesn't matter with fluid design. Start with sensible defaults that work everywhere, add breakpoints only when layout fundamentally changes (horizontal to vertical button rows, collapsing nav, etc.).

**The single breakpoint philosophy:** If you have more than 2-3 breakpoints, your layout primitives are wrong. Fluid grids + clamp() should handle the continuum; breakpoints handle discrete jumps (sidebar collapse, nav transformation).

**Anti-patterns:**
- Pixel-perfect desktop designs that assume 1920px screens
- Breakpoint soup (mobile, tablet, desktop, wide, ultrawide, retina...)
- Duplicating DOM for different screen sizes
- Fixed-width containers that overflow on small screens

**Testing strategy:** Resize browser from 320px to 2560px and watch for breaks. Should be smooth except at defined breakpoints.

**References:**
- [Smashing Magazine: Practical Aspects of Modern CSS Layouts](https://www.smashingmagazine.com/2023/05/practical-aspects-modern-css-layouts/) - Fluid layout patterns
- [Modern Fluid Typography](https://www.smashingmagazine.com/2022/01/modern-fluid-typography-css-clamp/) - Math behind clamp()
- [Responsive Grid Without Media Queries](https://css-tricks.com/look-ma-no-media-queries-responsive-layouts-using-css-grid/) - Auto-fit grid deep dive

---

## 4. Motion & Feedback

### 4.1. Scroll-triggered reveals

**Why:** Guides attention, improves perceived performance when data arrives incrementally. Scroll-triggered animations create a sense of progression and make content feel "built for you" rather than dumped on the page. But the key is subtlety—users should notice the polish, not the animation.

**How:**
```javascript
// Use IntersectionObserver, never scroll events
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const target = entry.target;
      target.classList.add('is-visible');
      observer.unobserve(target); // One-time reveal
    }
  });
}, {
  threshold: 0.25, // Trigger when 25% of element is visible
  rootMargin: '0px 0px -10% 0px' // Offset trigger point
});

document.querySelectorAll('[data-animate]').forEach(node => {
  const delay = Number(node.dataset.delay || 0);
  node.style.transitionDelay = `${delay}ms`;
  observer.observe(node);
});
```

```css
/* Fade-up animation utility */
.fade-up {
  opacity: 0;
  transform: translateY(35px);
  transition: opacity 900ms ease, transform 900ms ease;
}

.fade-up.is-visible {
  opacity: 1;
  transform: translateY(0);
}

/* Staggered reveals via data-delay */
.fade-up[data-delay="100"] { transition-delay: 100ms; }
.fade-up[data-delay="200"] { transition-delay: 200ms; }
```

**Respecting motion preferences:** Always provide escape hatch for users with vestibular disorders:
```css
@media (prefers-reduced-motion: reduce) {
  .fade-up {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

```javascript
// Listen for runtime changes to motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const handleMotionPreference = (event) => {
  if (event.matches) {
    // User enabled reduced motion
    document.querySelectorAll('.fade-up').forEach(el => el.classList.add('is-visible'));
  } else {
    // User disabled reduced motion - initialize animations
    animate();
  }
};

handleMotionPreference(prefersReducedMotion);
prefersReducedMotion.addEventListener('change', handleMotionPreference);
```

**Why IntersectionObserver?** Scroll event listeners fire 60+ times per second and force synchronous layout calculations. IntersectionObserver is async, batched, and doesn't block the main thread. Performance difference is dramatic on low-end devices.

**Anti-patterns:**
- Scroll event listeners firing `classList` mutations on every frame
- Long-running animations (>1s) that compete with layout
- Animating properties other than `transform`/`opacity`
- Not providing `prefers-reduced-motion` escape hatch
- Chaining animations that require JavaScript orchestration

**References:**
- [MDN: IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) - API documentation
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) - Accessibility requirement
- [Scroll-Linked Animations Proposal](https://drafts.csswg.org/scroll-animations-1/) - Future native scroll-linked animations
- [Web.dev: IntersectionObserver](https://web.dev/intersectionobserver/) - Performance implications

### 4.2. Interaction states

**Why:** Consistent transitions create a cohesive "feel" across the entire interface. Users develop muscle memory for timing—when every button has different hover behavior, the UI feels janky even if each individual animation is polished.

**How:**
```css
/* Single transition token for entire app */
:root {
  --transition: 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* Button hover states */
.btn {
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.btn:hover {
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 15px 30px rgba(15, 23, 42, 0.35);
}

/* Tab hover states - same timing, different visual */
.tab-btn {
  transition: var(--transition);
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--accent-teal);
}
```

**Why these easing curves?**
- `cubic-bezier(0.22, 1, 0.36, 1)` - Natural "ease-out" that feels springy
- Default `ease` is too slow and linear
- `ease-in-out` is too symmetrical for UI (looks robotic)

**The 2px rule:** Hover transforms should be subtle. `translateY(-2px)` lifts the element just enough to notice; larger values feel cartoonish. Same principle as our 24s background animation—subliminal, not spectacular.

**Anti-patterns:**
- Inconsistent timing (some buttons 200ms, others 500ms)
- Spectacular hover effects on some controls, none on others
- Animating `box-shadow` alone (causes jitter)—combine with `transform`
- Using `transition: all` (animates everything, kills performance)
- Hover effects on mobile (no hover state exists—use `:active` instead)

**Accessibility note:** Ensure focus states are as prominent as hover states. Keyboard users deserve the same feedback as mouse users.

**References:**
- [Material Design: Motion](https://material.io/design/motion/understanding-motion.html) - Why timing matters
- [Cubic-bezier.com](https://cubic-bezier.com/) - Visual easing function editor
- [Val Head: Designing Safer Web Animation](https://alistapart.com/article/designing-safer-web-animation-for-motion-sensitivity/) - Motion sensitivity considerations
- [Josh Comeau: Animated Buttons](https://www.joshwcomeau.com/animation/css-transitions/) - Deep dive on button animations

---

## 5. Content Modules

### 5.1. Hero blocks & call-to-actions

**Why:** Hero sections set the tone—they're the first thing users see. Compose from tokens + utilities instead of writing bespoke CSS so your hero stays consistent with the rest of the UI.

**How:**
```css
.hero {
  padding: clamp(2rem, 5vw, 3.5rem);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.35), rgba(236, 72, 153, 0.2));
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow-soft);
}

.hero h1 {
  font-size: clamp(2.5rem, 5vw, 3.75rem);
  line-height: 1.05;
}

.hero h1 span {
  background: linear-gradient(120deg, var(--accent-teal), var(--accent-cyan));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 1.75rem;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.4em;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.eyebrow.tight {
  margin-bottom: 0.35rem;
}
```

**Icon hydration pattern:** When using icon libraries (Lucide, Feather, etc.) with dynamic content, re-run hydration after DOM updates:
```javascript
// Centralize icon hydration
document.body.addEventListener('htmx:afterSwap', () => {
  lucide.createIcons();
});

// Initial page load
lucide.createIcons();
```

**Anti-patterns:**
- Embedding SVGs inline without idempotent hydration
- Bespoke hero CSS per page (reuse `.hero` + modifiers)
- Forgetting to hydrate icons after HTMX swaps

### 5.2. Forms

**Why:** Forms are where users interact most directly with your app. Inconsistent spacing or focus states make forms feel broken even when they work perfectly.

**How:**
```css
.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.form-group input,
.form-group textarea {
  width: 100%;
  border-radius: var(--radius);
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(2, 6, 23, 0.65);
  color: var(--text-primary);
  padding: 0.85rem 1rem;
  font-size: 1rem;
  transition: border-color var(--transition), box-shadow var(--transition);
  font-family: inherit; /* Critical: don't let inputs use system font */
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--accent-teal);
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.35);
}

.button-row {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.button-row.align-start {
  justify-content: flex-start;
}
```

**Autoresize textareas:** Prevent fixed-height textareas that cut off content:
```javascript
document.querySelectorAll('textarea[data-auto-resize]').forEach(textarea => {
  const resize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener('input', resize);
  resize(); // Initial sizing
});
```

**Anti-patterns:**
- Varying padding/font between form elements (users notice subconsciously)
- Custom inline `style="justify-content:flex-start"` instead of utility classes
- Missing focus states or inconsistent focus rings
- System fonts in inputs (use `font-family: inherit`)

**References:**
- [Inclusive Components: A Complete Guide to Buttons](https://inclusive-components.design/buttons/) - Form button patterns
- [Web.dev: Building a Textarea Component](https://web.dev/building-a-textarea-component/) - Auto-resize implementation

### 5.3. Tables & data panes

**Why:** Tables display dense information—inconsistent styling makes them unreadable. HTMX partial updates should slot in seamlessly without post-processing.

**How:**
```css
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border-radius: var(--radius);
  overflow: hidden;
  background: rgba(4, 7, 20, 0.9);
  border: 1px solid var(--glass-border-strong);
}

thead {
  background: rgba(148, 163, 184, 0.08);
}

thead th {
  padding: 1rem 1.25rem;
  text-align: left;
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

tbody tr {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background var(--transition);
}

tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

tbody td {
  padding: 1.1rem 1.25rem;
  vertical-align: middle;
}

/* Action column with vertical buttons */
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: stretch;
}

.actions .btn {
  width: 100%;
  min-width: 120px;
  justify-content: flex-start;
}
```

**Destructive actions:** Make delete/destroy actions visually distinct:
```css
.btn-danger {
  background: linear-gradient(135deg, var(--danger), var(--danger-hover));
  border: none;
  color: #fff5f6;
}
```

**Anti-patterns:**
- Using `border-collapse: collapse` (can't apply border-radius)
- Inconsistent padding between columns
- Destructive actions that look like primary actions
- Not confirming destructive actions (use `hx-confirm`)

### 5.4. Chat/terminal surfaces

**Why:** Chat interfaces need clear visual distinction between user and system messages. Scroll containers must handle dynamic content without layout shifts.

**How:**
```css
.chat-messages {
  max-height: 55vh;
  overflow-y: auto;
  padding: 1.5rem;
  border-radius: var(--radius);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(2, 6, 23, 0.55);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  padding: 1rem 1.25rem;
  border-radius: var(--radius);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.message.user {
  border-color: rgba(52, 211, 153, 0.35);
  background: rgba(16, 185, 129, 0.08);
}

.message.model {
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(37, 99, 235, 0.08);
}

.message-time {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
```

**Auto-scroll to bottom after new messages:**
```javascript
document.body.addEventListener('htmx:afterSwap', () => {
  const messages = document.getElementById('messages');
  if (messages) {
    messages.scrollTop = messages.scrollHeight;
  }
});
```

**Enter to submit (Shift+Enter for newline):**
```javascript
textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    e.target.closest('form').requestSubmit();
  }
});
```

**Anti-patterns:**
- No visual distinction between message authors
- Fixed-height chat containers (prevents content from growing)
- Layout shifts when new messages arrive
- No loading states during AI responses

**References:**
- [Web.dev: Building a Chat Component](https://web.dev/building-a-chat-component/) - Scroll management patterns
- [Chat UI Kit](https://chatscope.io/) - Reference implementations

---

## 6. Accessibility, Resilience & Tooling

### 6.1. Motion and accessibility preferences

**Why:** ~35% of users experience motion sensitivity, and WCAG 2.1 Level AA requires respecting `prefers-reduced-motion`. Failing this isn't just bad UX—it can trigger nausea, migraines, or seizures.

**How:** Default to animation, but provide escape hatch:
```css
@media (prefers-reduced-motion: reduce) {
  .fade-up,
  .btn,
  .tab-btn {
    transition: none !important;
    animation: none !important;
  }

  .fade-up {
    opacity: 1 !important;
    transform: none !important;
  }
}
```

**Runtime changes:** Users can toggle accessibility settings without refreshing:
```javascript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const handleMotionPreference = (event) => {
  if (event.matches) {
    // User enabled reduced motion - reveal everything immediately
    document.querySelectorAll('.fade-up').forEach(el => el.classList.add('is-visible'));
  }
};

// Initial check
handleMotionPreference(prefersReducedMotion);

// Listen for changes
prefersReducedMotion.addEventListener('change', handleMotionPreference);
```

**Testing:** macOS: System Preferences → Accessibility → Display → Reduce motion. Windows: Settings → Ease of Access → Display → Show animations.

**References:**
- [WCAG 2.1: Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html) - Compliance requirement
- [A11y Project: prefers-reduced-motion](https://www.a11yproject.com/posts/understanding-vestibular-disorders/) - Why it matters

### 6.2. Progressive enhancement with @supports

**Why:** `backdrop-filter` has 94% support but fails on older Firefox/Safari. Graceful degradation means your UI works everywhere, looks great on modern browsers.

**How:**
```css
.glass-panel {
  background: rgba(9, 11, 25, 0.95); /* Fallback: opaque */
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
}

@supports (backdrop-filter: blur(1px)) {
  .glass-panel {
    backdrop-filter: blur(24px);
    background: rgba(9, 11, 25, 0.65); /* Semi-transparent only if blur available */
  }
}
```

**Testing fallbacks:** Firefox DevTools → Responsive Design Mode → touch simulation disables backdrop-filter.

**References:**
- [MDN: @supports](https://developer.mozilla.org/en-US/docs/Web/CSS/@supports) - Feature queries
- [Can I Use: backdrop-filter](https://caniuse.com/css-backdrop-filter) - Browser support data

### 6.3. Pointer events safety

**Why:** Decorative overlays that cover interactive elements are the #1 glassmorphism bug. We spent an hour debugging "buttons not working" before discovering `.glass-panel::after` blocked all clicks.

**How:** Always set `pointer-events: none` on decorative pseudo-elements:
```css
.glass-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.08), transparent 60%);
  pointer-events: none; /* CRITICAL */
}
```

**Testing:** Click buttons/links inside glass panels. If they don't work, check for overlays.

**Rule:** Pseudo-elements used for visual effects should NEVER intercept pointer events.

### 6.4. HTMX and partial page updates

**Why:** HTMX replaces DOM fragments, which means any JavaScript initialization (icon hydration, event listeners) must be idempotent and re-run after swaps.

**How:** Centralize initialization and hook into HTMX lifecycle:
```javascript
// Centralize all initialization
function initializePage() {
  lucide.createIcons();

  // Autoresize textareas
  document.querySelectorAll('textarea[data-auto-resize]').forEach(textarea => {
    const resize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    textarea.addEventListener('input', resize);
    resize();
  });
}

// Initial page load
initializePage();

// After every HTMX swap
document.body.addEventListener('htmx:afterSwap', initializePage);
```

**Anti-pattern:** Initializing components once on page load, then wondering why dynamically loaded content is broken.

**References:**
- [HTMX Events](https://htmx.org/events/) - Lifecycle hooks
- [HTMX Examples](https://htmx.org/examples/) - Partial update patterns

### 6.5. Linting and styling debt

**Why:** Inline styles and raw hex values are technical debt that compounds over time. Enforce standards with linting.

**Rules:**
1. Search for `style="` should return zero results
2. Search for `#[0-9a-f]{6}` (hex colors) outside `:root` should return zero results
3. Unused CSS classes should be removed (use PurgeCSS or similar)

**Enforcement:**
```javascript
// .stylelintrc.json
{
  "rules": {
    "declaration-block-no-duplicate-properties": true,
    "color-named": "never",
    "color-no-hex": true, // Force use of CSS variables
    "selector-class-pattern": "^[a-z][a-z0-9-]*$" // kebab-case only
  }
}
```

**Audit commands:**
```bash
# Find inline styles
grep -r 'style="' views/

# Find hex colors outside :root
grep -rE '#[0-9a-fA-F]{6}' public/css/ | grep -v ':root'

# Find unused CSS classes (requires PurgeCSS)
purgecss --content 'views/**/*.html' --css 'public/css/style.css'
```

**References:**
- [Stylelint](https://stylelint.io/) - CSS linter with extensive rules
- [PurgeCSS](https://purgecss.com/) - Remove unused CSS
- [CSS Stats](https://cssstats.com/) - Analyze CSS complexity

---

## 7. Anti-Patterns to Avoid

Understanding what NOT to do is as important as understanding best practices. These are the patterns that will bite you in production.

### 7.1. Inline styles and one-off tweaks

**Why it hurts:** Impossible to audit, theme changes miss them, can't be overridden with utility classes. Every `style="margin-top: 10px"` is a snowflake that makes your codebase less maintainable.

**Examples of pain:**
```html
<!-- Bad: inline styles scattered everywhere -->
<div style="display: flex; gap: 1rem; align-items: center;">
  <button style="margin-right: 8px;">OK</button>
  <button style="margin-right: 10px;">Cancel</button> <!-- Inconsistent! -->
</div>

<!-- Good: utility classes -->
<div class="flex gap-md align-center">
  <button class="btn btn-primary">OK</button>
  <button class="btn btn-secondary">Cancel</button>
</div>
```

**Remedy:** Ban inline styles. Use utilities for layout, tokens for styling. Lint for `style="` and fail CI if found.

### 7.2. Pointer-blocking pseudo-elements

**Why it hurts:** Glassmorphism overlays that forget `pointer-events: none` block ALL interaction. This is a silent killer—UI looks perfect but nothing works.

**The bug we hit:**
```css
/* Bad: blocks all clicks */
.glass-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.08), transparent 60%);
  /* Missing: pointer-events: none */
}

/* Good: decorative only */
.glass-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.08), transparent 60%);
  pointer-events: none; /* CRITICAL */
}
```

**Remedy:** ALL decorative pseudo-elements must have `pointer-events: none`. No exceptions.

### 7.3. Scroll event listeners for animations

**Why it hurts:** Fires 60+ times per second, blocks main thread, causes jank on scroll. Users on low-end devices will notice immediately.

**Performance comparison:**
```javascript
// Bad: synchronous scroll handler
window.addEventListener('scroll', () => {
  document.querySelectorAll('.fade-up').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      el.classList.add('is-visible'); // Forces layout
    }
  });
}); // Runs 60+ times/second

// Good: async IntersectionObserver
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
    }
  });
});
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
// Only fires when elements cross threshold
```

**Remedy:** Use IntersectionObserver for scroll-triggered effects. Never use scroll event listeners.

### 7.4. Token drift and ad-hoc colors

**Why it hurts:** Brand inconsistency, impossible to theme, creates design debt that compounds over time.

**Example of drift:**
```css
/* Bad: colors defined all over */
.btn-primary { background: #34d399; }
.status-ready { color: #34d399; }
.link-green { color: #10b981; } /* Close but not identical */
.success-badge { background: #22c55e; } /* Also green-ish? */

/* Good: single source of truth */
:root {
  --accent-teal: #34d399;
}

.btn-primary { background: var(--accent-teal); }
.status-ready { color: var(--accent-teal); }
.link { color: var(--accent-teal); }
.success-badge { background: var(--accent-teal); }
```

**Remedy:** All colors must be tokens. Lint for hex values outside `:root`. Add new colors to the token system, never inline.

### 7.5. Ignoring motion preferences

**Why it hurts:** Triggers nausea/migraines in users with vestibular disorders. WCAG 2.1 Level AA violation. Could expose you to lawsuits.

**Statistics:** ~35% of users experience some motion sensitivity. 1 in 20 people will feel sick from your animations if you don't respect `prefers-reduced-motion`.

**Remedy:** Always implement `@media (prefers-reduced-motion: reduce)` and listen for runtime changes.

### 7.6. Breakpoint soup

**Why it hurts:** Maintenance nightmare. Every layout change requires updating 5+ breakpoints. Fluid design eliminates this.

**Example:**
```css
/* Bad: breakpoint soup */
.container { width: 1200px; }
@media (max-width: 1199px) { .container { width: 960px; } }
@media (max-width: 991px) { .container { width: 720px; } }
@media (max-width: 767px) { .container { width: 540px; } }
@media (max-width: 575px) { .container { width: 100%; } }

/* Good: fluid */
.container { width: min(1200px, 95vw); }
```

**Remedy:** Use `clamp()`, `min()`, `max()`, and auto-fit grids. Aim for 0-2 breakpoints max.

### 7.7. Animating expensive properties

**Why it hurts:** Forces layout/paint on every frame. Causes stuttering, drains battery, fails on low-end devices.

**Performance impact:**
```css
/* Bad: triggers layout on every frame */
.btn:hover {
  margin-top: -2px; /* Layout */
  width: 102%; /* Layout */
  background: #fff; /* Paint */
}

/* Good: only composite */
.btn:hover {
  transform: translateY(-2px) scale(1.02); /* Composite only */
}
```

**Remedy:** Only animate `transform` and `opacity`. Check [CSS Triggers](https://csstriggers.com/) before animating any property.

**References:**
- [Paul Irish: Why Moving Elements With Translate Is Better Than Pos](https://www.paulirish.com/2012/why-moving-elements-with-translate-is-better-than-posabs-topleft/) - Transform performance
- [Google: Avoid Large, Complex Layouts](https://developers.google.com/web/fundamentals/performance/rendering/avoid-large-complex-layouts-and-layout-thrashing) - Layout thrashing

---

## 8. Implementation Checklist

Use this checklist when implementing or auditing a UI built with these patterns:

### Phase 1: Foundation
- [ ] **Design tokens defined** - All colors, spacing, radii, shadows in `:root`
- [ ] **Semantic naming** - Tokens use role names (`--accent-teal`, not `--color-1`)
- [ ] **No raw values** - Zero hex colors or px values outside `:root`
- [ ] **Animated background** - Two `::before`/`::after` pseudo-elements on body, animating over 20-30s
- [ ] **Background non-blocking** - Fixed positioning, `pointer-events: none`, `z-index: 0`

### Phase 2: Layout Primitives
- [ ] **Container system** - `.page-shell` for max-width + centering
- [ ] **Responsive grids** - `.split-grid`, `.stats-grid` using `auto-fit`
- [ ] **Utility classes** - Flex/spacing/alignment helpers (`.flex`, `.gap-md`, etc.)
- [ ] **Fluid typography** - All font sizes use `clamp(min, preferred, max)`
- [ ] **Minimal breakpoints** - 0-2 media queries for the entire site

### Phase 3: Glassmorphism
- [ ] **Backdrop filter** - `backdrop-filter: blur(24px)` on glass surfaces
- [ ] **Fallback** - `@supports` query with opaque background for older browsers
- [ ] **Border/shadow** - Subtle border and soft shadow for depth
- [ ] **Hover glow** - Optional `::after` pseudo-element with gradient
- [ ] **Pointer safety** - ALL decorative pseudo-elements have `pointer-events: none`

### Phase 4: Motion System
- [ ] **IntersectionObserver** - Scroll reveals use Observer, not scroll events
- [ ] **Fade-up utility** - `.fade-up` + `.is-visible` pattern implemented
- [ ] **Staggered delays** - `data-delay` attribute for sequential reveals
- [ ] **Reduced motion** - `@media (prefers-reduced-motion: reduce)` implemented
- [ ] **Runtime listener** - `MediaQueryList` change listener for accessibility toggle
- [ ] **GPU-friendly** - Only animating `transform` and `opacity`

### Phase 5: Components
- [ ] **Button variants** - `.btn-primary`, `.btn-secondary`, `.btn-danger`
- [ ] **Consistent timing** - All interactive elements use same transition token
- [ ] **Status badges** - Semantic color system (`.status-ready`, `.status-error`)
- [ ] **Form consistency** - Single `.form-group` governs all inputs
- [ ] **Focus states** - As prominent as hover states for keyboard users
- [ ] **Tables** - `border-collapse: separate` for rounded corners

### Phase 6: Accessibility
- [ ] **Color contrast** - WCAG AA minimum (4.5:1 for text)
- [ ] **Focus indicators** - Visible on all interactive elements
- [ ] **Motion preference** - Respects `prefers-reduced-motion`
- [ ] **Semantic HTML** - Proper heading hierarchy, landmarks
- [ ] **Alt text** - All images and icons have text alternatives

### Phase 7: Performance
- [ ] **CSS Triggers audit** - No animated properties that trigger layout/paint
- [ ] **Lighthouse score** - 90+ performance score
- [ ] **Bundle size** - CSS < 50KB compressed
- [ ] **Unused CSS** - PurgeCSS or similar removes dead code
- [ ] **Critical CSS** - Above-fold styles inlined

### Phase 8: Maintenance
- [ ] **Lint rules** - Stylelint configured to catch anti-patterns
- [ ] **No inline styles** - `grep -r 'style="'` returns zero results
- [ ] **Documentation** - Component library or style guide exists
- [ ] **HTMX hydration** - Icon/component initialization on `htmx:afterSwap`
- [ ] **Browser testing** - Tested in Chrome, Firefox, Safari (including fallbacks)

---

## 9. Conclusion

Following these patterns gives teams a portable recipe: **rich gradients supply atmosphere**, **glass surfaces establish hierarchy**, **subtle motion provides feedback**, and **disciplined utilities keep the codebase malleable**.

The payoff is a UI that looks "expensive" yet remains:
- **Maintainable** - Tokens and utilities make global changes cheap
- **Accessible** - Motion preferences, contrast, keyboard navigation
- **Performant** - GPU-accelerated animations, minimal repaints
- **Resilient** - Progressive enhancement, graceful degradation

When your PM asks "can we make it pop more?" you change one token. When accessibility requirements change, you update one media query. When performance matters, you're already animating the right properties.

This is not cutting-edge tech—it's battle-tested CSS and JavaScript that works on 95% of browsers. The magic is in the discipline: every new component should compose from existing primitives, not spawn new patterns.

**Further reading:**
- [Web.dev: Learn CSS](https://web.dev/learn/css/) - Comprehensive modern CSS guide
- [Josh Comeau: CSS for JavaScript Developers](https://css-for-js.dev/) - Deep understanding of CSS fundamentals
- [Every Layout](https://every-layout.dev/) - Layout primitives philosophy
- [Refactoring UI](https://www.refactoringui.com/) - Design patterns for developers
- [Inclusive Components](https://inclusive-components.design/) - Accessible component patterns
