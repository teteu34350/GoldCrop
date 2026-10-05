/* ===================================================
   GoldCrop — Authentication & Registration Logic
   =================================================== */

'use strict';

// ===================================================
// UTILITY FUNCTIONS & MASKS
// ===================================================

/**
 * Format Phone Number Mask (XX) XXXXX-XXXX or (XX) XXXX-XXXX
 */
function maskPhone(value) {
  if (!value) return '';
  value = value.replace(/\D/g, '');
  if (value.length > 11) value = value.slice(0, 11);

  if (value.length > 10) {
    return value.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  } else if (value.length > 6) {
    return value.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
  } else if (value.length > 2) {
    return value.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
  }
  return value;
}

/**
 * Validate Email Format
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

/**
 * Check Password Strength
 */
function checkPasswordStrength(password) {
  let score = 0;
  const reqs = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password)
  };

  if (reqs.length) score++;
  if (reqs.uppercase) score++;
  if (reqs.number) score++;
  if (reqs.special) score++;

  let label = 'Fraca';
  let className = 'weak';
  if (score >= 3) {
    label = 'Média';
    className = 'medium';
  }
  if (score === 4 && password.length >= 10) {
    label = 'Forte';
    className = 'strong';
  }

  return { score, reqs, label, className };
}

// ===================================================
// FORM VALIDATION & UI FEEDBACK HELPERS
// ===================================================

function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  const group = field.closest('.form-group');
  if (group) {
    group.classList.add('has-error');
    const errText = group.querySelector('.form-error-msg span');
    if (errText) errText.textContent = message;
  }
}

function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  const group = field.closest('.form-group');
  if (group) {
    group.classList.remove('has-error');
  }
}

function showAlert(alertId, message, type = 'error') {
  const alertEl = document.getElementById(alertId);
  if (!alertEl) return;

  alertEl.className = `auth-alert auth-alert-${type}`;
  const span = alertEl.querySelector('.alert-msg');
  if (span) span.textContent = message;
  alertEl.style.display = 'flex';
}

function hideAlert(alertId) {
  const alertEl = document.getElementById(alertId);
  if (alertEl) alertEl.style.display = 'none';
}

// ===================================================
// PASSWORD TOGGLE
// ===================================================

function initPasswordToggles() {
  document.querySelectorAll('.password-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling || btn.parentElement.querySelector('input');
      if (!input) return;
      const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
      input.setAttribute('type', type);

      const eyeIcon = btn.querySelector('.eye-icon');
      if (type === 'text') {
        eyeIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
      } else {
        eyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
      }
    });
  });
}

// ===================================================
function validateRegistration() {
  let valid = true;
  const name = document.getElementById('nome').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('telefone').value.trim().replace(/\D/g, '');
  const password = document.getElementById('senha').value;
  const confirmation = document.getElementById('confirmar_senha').value;

  if (name.split(/\s+/).filter(Boolean).length < 2) {
    showFieldError('nome', 'Informe seu nome completo (nome e sobrenome).');
    valid = false;
  } else clearFieldError('nome');

  if (!isValidEmail(email)) {
    showFieldError('email', 'Informe um e-mail válido.');
    valid = false;
  } else clearFieldError('email');

  if (![10, 11].includes(phone.length)) {
    showFieldError('telefone', 'Informe um telefone com DDD válido.');
    valid = false;
  } else clearFieldError('telefone');

  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    showFieldError('senha', 'A senha precisa ter no mínimo 8 caracteres e incluir números e letras.');
    valid = false;
  } else clearFieldError('senha');

  if (!confirmation || confirmation !== password) {
    showFieldError('confirmar_senha', 'As senhas digitadas não coincidem.');
    valid = false;
  } else clearFieldError('confirmar_senha');

  return valid;
}
// API backend services
// ===================================================

const AuthService = {
  async post(url, payload, csrfToken) {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const error = new Error(data.message || 'Não foi possível concluir a solicitação.');
      error.fieldErrors = data.field_errors || {};
      throw error;
    }
    return data;
  },

  async login(email, password, rememberMe) {
    const form = document.getElementById('login-form');
    return this.post(form.dataset.apiUrl, { email, password, remember_me: rememberMe }, form.querySelector('[name=csrfmiddlewaretoken]').value);
  },

  async register(formData) {
    const form = document.getElementById('cadastro-form');
    return this.post(form.dataset.apiUrl, formData, form.querySelector('[name=csrfmiddlewaretoken]').value);
  },

  async requestPasswordReset(email) {
    const form = document.getElementById('forgot-form');
    return this.post(
      form.dataset.apiUrl,
      { email },
      form.querySelector('[name=csrfmiddlewaretoken]').value
    );
  }
};

// ===================================================
// INITIALIZATION ON DOM LOAD
// ===================================================

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggles();

  // --- LOGIN PAGE LOGIC ---
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert('login-alert');

      const identifier = document.getElementById('email').value.trim();
      const password = document.getElementById('senha').value;
      const remember = document.getElementById('remember_me')?.checked || false;

      let valid = true;

      if (!identifier) {
        showFieldError('email', 'Digite seu e-mail ou usuário.');
        valid = false;
      } else {
        clearFieldError('email');
      }

      if (!password) {
        showFieldError('senha', 'Digite sua senha.');
        valid = false;
      } else {
        clearFieldError('senha');
      }

      if (!valid) return;

      const btn = document.getElementById('btn-login-submit');
      btn.disabled = true;
      btn.classList.add('btn-loading');

      try {
        const response = await AuthService.login(identifier, password, remember);
        showAlert('login-alert', 'Login realizado com sucesso! Redirecionando...', 'success');

        window.location.href = response.redirect_url;
      } catch (err) {
        Object.entries(err.fieldErrors || {}).forEach(([field, message]) => showFieldError(field, message));
        showAlert('login-alert', err.message || 'Erro ao realizar login. Tente novamente.', 'error');
        btn.disabled = false;
        btn.classList.remove('btn-loading');
      }
    });
  }

  // --- FORGOT PASSWORD MODAL ---
  const forgotBtn = document.getElementById('forgot-password-link');
  const modalOverlay = document.getElementById('forgot-modal');
  const modalClose = document.getElementById('modal-close-btn');
  const forgotForm = document.getElementById('forgot-form');

  if (forgotBtn && modalOverlay) {
    forgotBtn.addEventListener('click', (e) => {
      e.preventDefault();
      modalOverlay.classList.add('active');
    });

    if (modalClose) {
      modalClose.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
      });
    }

    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) modalOverlay.classList.remove('active');
    });

    if (forgotForm) {
      forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const resetEmail = document.getElementById('reset_email').value.trim();
        if (!resetEmail || !isValidEmail(resetEmail)) {
          showFieldError('reset_email', 'Digite um e-mail válido.');
          return;
        }

        const btn = document.getElementById('btn-forgot-submit');
        btn.disabled = true;
        btn.classList.add('btn-loading');

        try {
          const result = await AuthService.requestPasswordReset(resetEmail);
          showAlert('forgot-alert', result.message, 'success');
          setTimeout(() => {
            modalOverlay.classList.remove('active');
            btn.disabled = false;
            btn.classList.remove('btn-loading');
          }, 2000);
        } catch (err) {
          showAlert('forgot-alert', err.message || 'Não foi possível enviar as instruções de redefinição.', 'error');
          btn.disabled = false;
          btn.classList.remove('btn-loading');
        }
      });
    }
  }

  // --- CADASTRO PAGE LOGIC ---
  const registerForm = document.getElementById('cadastro-form');
  if (registerForm) {
    const phoneInput = document.getElementById('telefone');
    phoneInput?.addEventListener('input', event => {
      event.target.value = maskPhone(event.target.value);
      clearFieldError('telefone');
    });

    const passwordInput = document.getElementById('senha');
    passwordInput?.addEventListener('input', event => {
      const result = checkPasswordStrength(event.target.value);
      const barFill = document.getElementById('strength-bar-fill');
      const textLabel = document.getElementById('strength-text-label');
      if (barFill) {
        barFill.className = `strength-bar-fill ${result.className}`;
        barFill.style.width = event.target.value ? `${result.score * 25}%` : '0%';
      }
      if (textLabel) textLabel.textContent = event.target.value ? result.label : 'Força da senha';
      const requirements = {
        'req-len': result.reqs.length,
        'req-num': result.reqs.number,
        'req-upper': result.reqs.uppercase,
        'req-spec': result.reqs.special,
      };
      Object.entries(requirements).forEach(([id, valid]) => {
        const item = document.getElementById(id);
        if (item) item.className = `strength-req-item ${valid ? 'valid' : ''}`;
      });
    });

    document.getElementById('confirmar_senha')?.addEventListener('input', event => {
      if (event.target.value === document.getElementById('senha').value) {
        clearFieldError('confirmar_senha');
      }
    });

    registerForm.addEventListener('submit', async event => {
      event.preventDefault();
      hideAlert('register-alert');
      if (!validateRegistration()) {
        showAlert('register-alert', 'Por favor, corrija os campos destacados antes de continuar.', 'error');
        return;
      }

      const button = document.getElementById('btn-register-submit');
      button.disabled = true;
      button.classList.add('btn-loading');
      try {
        const result = await AuthService.register({
          nome: document.getElementById('nome').value.trim(),
          email: document.getElementById('email').value.trim(),
          telefone: document.getElementById('telefone').value.trim(),
          senha: document.getElementById('senha').value,
        });
        showAlert('register-alert', 'Conta criada. Escolha uma fazenda para continuar.', 'success');
        window.location.href = result.redirect_url;
      } catch (error) {
        Object.entries(error.fieldErrors || {}).forEach(([field, message]) => showFieldError(field, message));
        showAlert('register-alert', error.message || 'Erro ao criar sua conta.', 'error');
        button.disabled = false;
        button.classList.remove('btn-loading');
      }
    });
  }
});