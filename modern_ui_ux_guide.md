# Modern UI/UX Reference (Engineering Edition)

A condensed field guide for engineers who need to ship cinematic, high-trust web interfaces without resorting to ad‑hoc styling. The focus here is on *why* each technique matters, *how* to implement it, and which failure modes to avoid. Examples reference the Promptly control room UI, but the guidance generalizes to any modern dashboard or tool.

---

## 1. Layered Foundations

### 1.1. Design tokens first, pixels later
- **Why:** Centralized tokens (`--accent-teal`, `--radius-lg`, `--shadow-soft`) guarantee visual coherence and make global tweaks (e.g., brand color shifts) cheap.
- **How:** Declare tokens on `:root` and compose everything from them—no literal colors, radii, or easing curves sprinkled through the CSS. Clamp typography/spacing (`clamp(1.5rem, 5vw, 3.5rem)`) to keep layouts fluid without breakpoints.
- **Anti-patterns:** Mixing raw hex values with tokens, or defining tokens that never get used (lint for dead vars).
- **Reference:** [Design Tokens W3C Community Group](https://design-tokens.github.io/community-group/format/) for cross-platform naming conventions.

### 1.2. Atmospheric backdrops without layout hacks
- **Why:** Animated gradients plus blurred aurora layers create depth that makes glass surfaces meaningful.
- **How:**
  - Use two fixed pseudo-elements on `<body>` for background motion so content layers stay lightweight.
  - Animate `background-position` over ≥20s to avoid visual fatigue; stick to opacity/transform for performant transitions ([CSS-Tricks: Animating Gradients](https://css-tricks.com/animating-css-gradients/)).
- **Anti-patterns:** Parallax scripts or scroll handlers for backgrounds—GPU-friendly CSS gradients already provide fluidity without jank.

---

## 2. Surfaces, Depth, and Hierarchy

### 2.1. Glassmorphism with restraint
- **Why:** A frosted card instantly communicates elevation and interaction priority.
- **How:**
  ```css
  .glass-panel {
    background: var(--bg-elevated);
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(24px);
    box-shadow: var(--shadow-soft);
  }
  @supports not (backdrop-filter: blur(1px)) {
    .glass-panel { background: rgba(9,11,25,0.9); }
  }
  ```
- **Anti-patterns:** Applying blur everywhere or forgetting Safari fallbacks. If everything is glass, nothing is elevated.
- **Reference:** [MDN: `backdrop-filter`](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)

### 2.2. Status-aware micro components
- **Why:** Small, repeatable badges and alerts reduce bespoke CSS and keep state changes obvious.
- **How:** Build semantic utilities (`.status-badge`, `.alert.error`, `.text-faint`) fed by tokens. Keep DOM clean by toggling classes (e.g., `.is-hidden`) rather than mutating inline styles.
- **Anti-patterns:** Custom inline color tweaks (hard to theme) or overlays that intercept clicks—ensure decorative pseudo-elements set `pointer-events: none`.

---

## 3. Layout System

### 3.1. Container primitives
- `page-shell`: clamps width, defines column spacing.
- `split-grid` / `stats-grid`: `repeat(auto-fit, minmax())` grids built once, reused everywhere.
- Utility helpers (`.flex`, `.align-end`, `.gap-md`) replace inline style soup and make audits trivial (search for `style="` should return zero hits).

### 3.2. Responsive strategy
- Prefer fluid dimensions via `clamp()` and intrinsic grids over breakpoint jungles.
- Collapse button rows by flipping flex direction within a single media query rather than duplicating markup.
- Anti-pattern: pixel-perfect desktop assumptions that break as soon as a form field wraps.

---

## 4. Motion & Feedback

### 4.1. Scroll-triggered reveals
- **Why:** Guides attention, improves perceived performance when data arrives incrementally.
- **How:**
  ```js
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.25, rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('[data-animate]').forEach(node => observer.observe(node));
  ```
- **Respect preferences:** Gate animation bootstrapping behind `prefers-reduced-motion` and provide utility classes (`.fade-up`, `.is-visible`). ([MDN: Prefers Reduced Motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion))
- **Anti-patterns:** Scroll event listeners firing `classList` mutations on every frame; chaining long-running animations that compete with layout.

### 4.2. Interaction states
- Use consistent transitions (`var(--transition)`) and subtle transforms (`translateY(-2px)`, no `box-shadow` jitter).
- Buttons and tabs share the same hover/active timing, so mixed components still feel cohesive.
- Anti-pattern: Spectacular hover effects on some controls while others stay dead—consistency > novelty.

---

## 5. Content Modules

### 5.1. Hero blocks & call-to-actions
- Compose from tokens + utilities. Examples: `.hero` for gradient section, `.hero-actions` for button cluster, `.eyebrow.tight` for overline copy.
- Avoid embedding SVGs or icons without re-running `lucide.createIcons()` after HTMX swaps; centralize icon hydration listeners.

### 5.2. Forms
- One `.form-group` ruleset governs inputs, textarea, helper text, and inline actions (token-based border + focus rings).
- Button rows use `.button-row` + modifiers (`.align-start`) rather than ad-hoc `style="justify-content:flex-start"` tweaks.
- Anti-pattern: Varying padding or font stacks between form elements—developers notice, users *feel* it.

### 5.3. Tables & data panes
- Table shells (`border-spacing: 0`, translucent background) and `.prompt-row` for expandable context ensure HTMX responses slot straight into the design without post-processing.
- Keep destructive controls (delete) visually distinct via gradient-danger tokens; reuse `.actions` flex pattern.

### 5.4. Chat/terminal surfaces
- Chat bubbles leverage `.message.user|.model` with consistent padding/border; metadata uses `.mode-badge` + `.text-faint` utilities.
- Scroll containers (`max-height`, `overflow-y: auto`) prevent layout jumps when HTMX swaps in new messages.

---

## 6. Accessibility, Resilience & Tooling

1. **Motion controls:** Default to animation, but immediately reveal content when `prefers-reduced-motion` flips at runtime (listen for `MediaQueryList` changes).
2. **Blur fallbacks:** Gate glassmorphism behind `@supports`; otherwise revert to opaque backgrounds.
3. **Pointer safety:** Decorative overlays must set `pointer-events: none`. We caught a production issue where `.glass-panel::after` blocked buttons—easy to avoid when overlays live in CSS, not extra DOM nodes.
4. **Partial page updates:** HTMX replaces fragments; re-run idempotent setup (`lucide.createIcons()`, textarea autoresize) on `htmx:afterSwap` once, not per component.
5. **Lint styling debt:** Treat `style="` or raw hex usage as lint failures. Same for unused utility classes—dead code hides inconsistencies.

External resources for deeper dives:
- [Every Layout: Layout primitives](https://every-layout.dev/)
- [Smashing Magazine: Practical Aspect of Modern CSS Layouts](https://www.smashingmagazine.com/2023/05/practical-aspects-modern-css-layouts/)
- [Google UX Engineering: Motion guidelines](https://material.io/design/motion/understanding-motion.html)

---

## 7. Anti-Patterns to Avoid

| Anti-pattern | Why it hurts | Remedy |
|--------------|-------------|--------|
| Inline styles patching spacing/alignments | Impossible to audit; theme changes miss them | Use flex/spacing utilities; lint for `style="` |
| Overlapping interactive layers (e.g., pointer-blocking pseudo elements) | Breaks buttons and scroll | Always set `pointer-events: none` on decorative overlays |
| Mixing animation systems (scroll handlers + CSS transitions) | Leads to frame drops and conflicting easing | Centralize motion via CSS + IntersectionObserver |
| Token drift (e.g., new colors defined ad hoc) | Creates brand fragmentation | Extend `:root` tokens, never ad-hoc hex |
| Ignoring motion/accessibility preferences | Triggers nausea, fails compliance | Wire `prefers-reduced-motion`, respect user toggles |

---

## 8. Implementation Checklist

1. **Tokens:** Audit CSS for raw values; convert to `:root` variables.
2. **Utilities:** Ensure flex/spacing helpers cover every inline-style scenario witnessed during review.
3. **Surfaces:** Reuse `.glass-panel`, `.stats-grid`, `.hero`, `.chat-shell`—no bespoke card wrappers.
4. **Motion:** All reveal effects via `[data-animate]` + IntersectionObserver; confirm reduced-motion path.
5. **Accessibility:** Check contrast over animated backgrounds, blur fallbacks, pointer events.
6. **Performance:** Animate only `opacity`/`transform`; watch `csstriggers.com` for any property you tweak.

Following these constraints gives teams a portable recipe: rich gradients supply atmosphere, glass surfaces establish hierarchy, subtle motion provides feedback, and disciplined utilities keep the codebase malleable. The payoff is a UI that looks “expensive” yet remains maintainable and accessible.
