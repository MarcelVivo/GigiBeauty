(() => {
  'use strict';

  function wire(input) {
    if (input.closest('.password-field')) return;
    const wrap = document.createElement('div');
    wrap.className = 'password-field';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.setAttribute('aria-label', 'Passwort anzeigen');
    toggle.textContent = '👁';
    toggle.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.classList.toggle('is-active', !showing);
      toggle.setAttribute('aria-label', showing ? 'Passwort anzeigen' : 'Passwort verbergen');
    });
    wrap.appendChild(toggle);
  }

  function init() {
    document.querySelectorAll('input[type="password"]').forEach(wire);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
