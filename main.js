// Gallery Data Configuration
const galleryData = [
  { src: 'images/image1.webp', alt: 'Exterior view of the luxury wooden cottage' },
  { src: 'images/image2.webp', alt: 'Cozy bedroom interior with nature views' },
  { src: 'images/image3.webp', alt: 'Spacious private balcony overlooking pine forests' },
  { src: 'images/image4.webp', alt: 'Elegant dining area setting' },
  { src: 'images/image5.webp', alt: 'Resort garden area during daytime' },
  { src: 'images/image6.webp', alt: 'Comfortable lounge area for guests' },
  { src: 'images/image7.webp', alt: 'Nighttime view of the resort with ambient lighting' },
  { src: 'images/image8.webp', alt: 'Mountain view from the resort property' }
];

document.addEventListener('DOMContentLoaded', () => {
  initGallery();
  initModals();
  initAnimations();
  initNavigation();
});

// Focus Trap Utility
function trapFocus(element) {
  const focusableEls = element.querySelectorAll('a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select, [tabindex]:not([tabindex="-1"])');
  const firstFocusableEl = focusableEls[0];  
  const lastFocusableEl = focusableEls[focusableEls.length - 1];

  element.addEventListener('keydown', function(e) {
    const isTabPressed = (e.key === 'Tab' || e.keyCode === 9);
    if (!isTabPressed) { 
      return; 
    }
    if (e.shiftKey) /* shift + tab */ {
      if (document.activeElement === firstFocusableEl) {
        lastFocusableEl.focus();
        e.preventDefault();
      }
    } else /* tab */ {
      if (document.activeElement === lastFocusableEl) {
        firstFocusableEl.focus();
        e.preventDefault();
      }
    }
  });
}

function initGallery() {
  const wrapper = document.getElementById('gallery-wrapper');
  if (!wrapper) return;

  galleryData.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'gallery-item reveal';
    itemEl.tabIndex = 0;
    itemEl.setAttribute('role', 'button');
    itemEl.setAttribute('aria-label', `View ${item.alt} in full screen`);
    itemEl.dataset.index = index;
    
    const imgEl = document.createElement('img');
    imgEl.src = item.src;
    imgEl.alt = item.alt;
    imgEl.loading = 'lazy';
    imgEl.dataset.index = index;
    imgEl.width = 600;
    imgEl.height = 600;
    
    itemEl.appendChild(imgEl);
    wrapper.appendChild(itemEl);
    
    // allow keyboard enter/space to open lightbox
    itemEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        document.querySelector('.overlay#lightboxOverlay')?.classList.contains('is-open') 
          ? null 
          : window.openLightboxFromGrid(index);
      }
    });
  });
}

function initModals() {
  // Lightbox
  const lightboxOverlay = document.getElementById('lightboxOverlay');
  const lightboxImage = document.getElementById('lightboxImage');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  const wrapper = document.getElementById('gallery-wrapper');
  let currentLightboxIndex = 0;
  let previousFocusElement = null;

  if (lightboxOverlay) {
    trapFocus(lightboxOverlay);

    wrapper?.addEventListener('click', (e) => {
      const target = e.target.closest('.gallery-item') || e.target.closest('img');
      if (!target || target.dataset.index === undefined) return;
      openLightbox(parseInt(target.dataset.index, 10));
    });

    lightboxClose?.addEventListener('click', closeLightbox);
    lightboxPrev?.addEventListener('click', showPreviousLightbox);
    lightboxNext?.addEventListener('click', showNextLightbox);
    
    lightboxOverlay.addEventListener('click', (e) => {
      if (e.target === lightboxOverlay) closeLightbox();
    });

    // Touch support for lightbox
    let touchStartX = 0;
    lightboxOverlay.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    lightboxOverlay.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const deltaX = touchEndX - touchStartX;
      if (Math.abs(deltaX) < 40) return;
      if (deltaX > 0) showPreviousLightbox();
      else showNextLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (!lightboxOverlay.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') showPreviousLightbox();
      if (e.key === 'ArrowRight') showNextLightbox();
    });
  }

  function openLightbox(index) {
    previousFocusElement = document.activeElement;
    currentLightboxIndex = index;
    updateLightboxImage();
    lightboxOverlay.classList.add('is-open');
    lightboxOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => lightboxClose?.focus(), 100);
  }
  window.openLightboxFromGrid = openLightbox;

  function closeLightbox() {
    lightboxOverlay.classList.remove('is-open');
    lightboxOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (previousFocusElement) previousFocusElement.focus();
  }

  function showPreviousLightbox() {
    currentLightboxIndex = (currentLightboxIndex - 1 + galleryData.length) % galleryData.length;
    updateLightboxImage();
  }

  function showNextLightbox() {
    currentLightboxIndex = (currentLightboxIndex + 1) % galleryData.length;
    updateLightboxImage();
  }

  function updateLightboxImage() {
    lightboxImage.src = galleryData[currentLightboxIndex].src;
    lightboxImage.alt = galleryData[currentLightboxIndex].alt;
  }

  // Contact Modal
  const contactModal = document.getElementById('contactModal');
  const contactModalClose = document.getElementById('contactModalClose');
  const openModalBtns = document.querySelectorAll('[data-modal-target="contactModal"]');
  let contactPrevFocus = null;

  if (contactModal) {
    trapFocus(contactModal);

    openModalBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        contactPrevFocus = document.activeElement;
        contactModal.classList.add('is-open');
        contactModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        
        // close mobile nav if open
        document.documentElement.classList.remove('nav-open');
        const burger = document.querySelector('.burger');
        if(burger) burger.setAttribute('aria-expanded', 'false');

        setTimeout(() => contactModalClose?.focus(), 100);
      });
    });

    contactModalClose?.addEventListener('click', closeContactModal);
    contactModal.addEventListener('click', (e) => {
      if (e.target === contactModal) closeContactModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && contactModal.classList.contains('is-open')) {
        closeContactModal();
      }
    });
  }

    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
      contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(contactForm);
        const name = formData.get('Name') || '';
        const email = formData.get('Email') || '';
        const message = formData.get('Message') || '';
        const mailtoLink = `mailto:kdn@tripsntourism.com?subject=Booking Inquiry from ${encodeURIComponent(name)}&body=${encodeURIComponent(message)}%0A%0A---%0AContact Email: ${encodeURIComponent(email)}`;
        window.location.href = mailtoLink;
        closeContactModal();
        contactForm.reset();
      });
    }

  function closeContactModal() {
    contactModal.classList.remove('is-open');
    contactModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (contactPrevFocus) contactPrevFocus.focus();
  }
}

function initAnimations() {
  const heading = document.querySelector('h1[data-blur-text]');
  if (heading) {
    const text = heading.textContent.trim();
    const words = text.split(/\s+/);
    heading.textContent = '';
    heading.classList.add('blur-text');

    words.forEach((word, index) => {
      const span = document.createElement('span');
      span.className = 'blur-segment';
      span.textContent = word;
      span.style.animationDelay = (index * 240) + 'ms';
      heading.appendChild(span);
    });

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      heading.querySelectorAll('.blur-segment').forEach(span => span.classList.add('is-visible'));
    } else {
      const io = new IntersectionObserver((entries) => {
        if (!entries[0] || !entries[0].isIntersecting) return;
        heading.querySelectorAll('.blur-segment').forEach((span, index) => {
          setTimeout(() => span.classList.add('is-visible'), index * 240);
        });
        io.disconnect();
      }, { threshold: 0.1, rootMargin: '0px' });
      io.observe(heading);
    }
  }

  // Scroll Reveal Logic
  const reveals = document.querySelectorAll('.reveal');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  if (reduceMotion) {
    reveals.forEach(el => el.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      let delay = 0;
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('is-visible'), delay);
          delay += 200; // Stagger effect
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    
    reveals.forEach(el => revealObserver.observe(el));
  }
}

function initNavigation() {
  const burger = document.querySelector('.burger');
  const html = document.documentElement;
  const navBar = document.querySelector('.nav');
  const nav = document.getElementById('primary-nav');

  function updateNavState() {
    navBar?.classList.toggle('is-scrolled', window.scrollY > 16);
  }

  updateNavState();
  window.addEventListener('scroll', updateNavState, { passive: true });

  if (burger && nav) {
    burger.addEventListener('click', function() {
      const expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!expanded));
      html.classList.toggle('nav-open');
      if (!expanded) {
        const firstLink = nav.querySelector('a');
        if (firstLink) setTimeout(() => firstLink.focus(), 100);
      } else {
        this.focus();
      }
    });

    document.addEventListener('click', (e) => {
      if (!html.classList.contains('nav-open')) return;
      const target = e.target;
      if (target === burger || burger.contains(target) || nav.contains(target)) return;
      html.classList.remove('nav-open');
      burger.setAttribute('aria-expanded', 'false');
    });
  }
}
