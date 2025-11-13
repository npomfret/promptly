let animationsBound = false;

const animate = () => {
  if (animationsBound) return;
  animationsBound = true;
  const nodes = document.querySelectorAll('[data-animate]');
  if (!nodes.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const target = entry.target;
        target.classList.add('is-visible');
        observer.unobserve(target);
      }
    });
  }, {
    threshold: 0.25,
    rootMargin: '0px 0px -10% 0px',
  });

  nodes.forEach(node => {
    const delay = Number(node.dataset.delay || 0);
    node.style.transitionDelay = `${delay}ms`;
    observer.observe(node);
  });
};

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const revealImmediately = () => {
  document.querySelectorAll('.fade-up').forEach(el => el.classList.add('is-visible'));
};

const handleMotionPreference = (event) => {
  if (event.matches) {
    revealImmediately();
  } else {
    animate();
  }
};

handleMotionPreference(prefersReducedMotion);

if (prefersReducedMotion.addEventListener) {
  prefersReducedMotion.addEventListener('change', handleMotionPreference);
} else if (prefersReducedMotion.addListener) {
  prefersReducedMotion.addListener(handleMotionPreference);
}

// Auto-resize textareas marked with data-auto-resize
const autoTextareas = document.querySelectorAll('textarea[data-auto-resize]');
autoTextareas.forEach(textarea => {
  const resize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener('input', resize);
  resize();
});

// Smooth scroll for in-page anchors
const localLinks = document.querySelectorAll('a[href^="#"]');
localLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    const targetId = link.getAttribute('href')?.slice(1);
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
