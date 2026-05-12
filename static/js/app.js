(function() {
  'use strict';

  // --- Toast-уведомления ---
  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => {
        toast.remove();
      });
    }, 3000);
  }
  window.showToast = showToast;

  // --- Flash-сообщения (если используются) ---
  document.addEventListener('DOMContentLoaded', function() {
    const flashData = document.getElementById('flash-data');
    if (flashData) {
      try {
        const messages = JSON.parse(flashData.textContent);
        messages.forEach(function(msg) {
          showToast(msg.text, msg.category || 'success');
        });
      } catch(e) {}
    }
  });

  // --- Анимация при скролле (Intersection Observer) ---
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));

  // --- Обработка отправки форм: спиннер и блокировка ---
  document.addEventListener('submit', function(e) {
    const form = e.target;
    if (form.dataset.noLoading) return;

    // Определяем конкретную кнопку, вызвавшую отправку
    const submitter = e.submitter;
    if (submitter && submitter.type === 'submit') {
      submitter.classList.add('loading');
      submitter.disabled = true;
    } else {
      // Если нет конкретной кнопки, добавляем на первую найденную
      const firstBtn = form.querySelector('button[type="submit"]');
      if (firstBtn) {
        firstBtn.classList.add('loading');
        firstBtn.disabled = true;
      }
    }
  });

  // --- Глобальный прогресс-бар для fetch-запросов ---
  const loadingBar = document.getElementById('loadingBar');
  if (loadingBar) {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      loadingBar.classList.add('active');
      return originalFetch.apply(this, args).finally(() => {
        loadingBar.classList.remove('active');
      });
    };
  }

})();
