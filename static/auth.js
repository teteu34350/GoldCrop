/* ===================================================
   GoldCrop — Authentication & Registration Logic
   =================================================== */

'use strict';

// Brazilian States & Major Agricultural Cities Database (Offline Fallback & Fast Select)
const BRAZIL_LOCATIONS = {
  MG: ['Varginha', 'Patrocínio', 'Manhuaçu', 'Monte Carmelo', 'Araguari', 'Poços de Caldas', 'Carmo do Rio Claro', 'Três Pontas', 'Passos', 'Uberaba', 'Uberlândia', 'Belo Horizonte'],
  SP: ['Ribeirão Preto', 'Francas', 'São José do Rio Preto', 'Campinas', 'Sorocaba', 'Piracicaba', 'Catanduva', 'Ourinhos', 'Bauru', 'Araraquara', 'São Paulo'],
  PR: ['Cascavel', 'Londrina', 'Maringá', 'Ponta Grossa', 'Guarapuava', 'Toledo', 'Campo Mourão', 'Curitiba'],
  ES: ['Linhares', 'São Mateus', 'Colatina', 'Venda Nova do Imigrante', 'Cachoeiro de Itapemirim', 'Vitória'],
  BA: ['Luís Eduardo Magalhães', 'Barreiras', 'Feira de Santana', 'Vitória da Conquista', 'Juazeiro', 'Salvador'],
  GO: ['Rio Verde', 'Jataí', 'Itumbiara', 'Cristalina', 'Anápolis', 'Goiânia'],
  MT: ['Sorriso', 'Lucas do Rio Verde', 'Sinop', 'Rondonópolis', 'Nova Mutum', 'Primavera do Leste', 'Cuiabá'],
  MS: ['Dourados', 'Maracaju', 'Ponta Porã', 'Sidrolândia', 'Campo Grande'],
  RS: ['Passo Fundo', 'Ijuí', 'Cruz Alta', 'Santa Rosa', 'Pelotas', 'Porto Alegre'],
  SC: ['Chapecó', 'Concórdia', 'Xanxerê', 'Lages', 'Florianópolis'],
  RJ: ['Campos dos Goytacazes', 'Resende', 'Nova Friburgo', 'Rio de Janeiro'],
  CE: ['Tianguá', 'Ubajara', 'Quixeramobim', 'Fortaleza'],
  PE: ['Petrolina', 'Garanhuns', 'Recife'],
  MA: ['Balsas', 'Imperatriz', 'São Luís'],
  PI: ['Uruçuí', 'Bom Jesus', 'Teresina'],
  TO: ['Pedro Afonso', 'Gurupi', 'Palmas']
};

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
 * Format CEP Mask XXXXX-XXX
 */
function maskCEP(value) {
  if (!value) return '';
  value = value.replace(/\D/g, '');
  if (value.length > 8) value = value.slice(0, 8);
  if (value.length > 5) {
    return value.replace(/^(\d{5})(\d{1,3})$/, '$1-$2');
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
// VIA CEP AUTOCOMPLETE INTEGRATION
// ===================================================

async function fetchAddressByCEP(cepValue) {
  const cleanCep = cepValue.replace(/\D/g, '');
  if (cleanCep.length !== 8) return;

  const cepInput = document.getElementById('cep');
  const ufSelect = document.getElementById('estado');
  const cidadeSelect = document.getElementById('cidade');
  const bairroInput = document.getElementById('bairro');
  const enderecoInput = document.getElementById('endereco');

  // Loading state visual on CEP
  if (cepInput) cepInput.classList.add('loading-cep');

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!response.ok) throw new Error('CEP não encontrado');
    const data = await response.json();

    if (data.erro) {
      showFieldError('cep', 'CEP não encontrado. Por favor preencha manualmente.');
      return;
    }

    clearFieldError('cep');

    // Auto fill fields
    if (ufSelect && data.uf) {
      ufSelect.value = data.uf;
      // Trigger change to update cities options
      populateCities(data.uf);
    }
    if (cidadeSelect && data.localidade) {
      // Ensure city exists in select or add it
      let cityOptionExists = Array.from(cidadeSelect.options).some(opt => opt.value === data.localidade);
      if (!cityOptionExists) {
        const opt = document.createElement('option');
        opt.value = data.localidade;
        opt.textContent = data.localidade;
        cidadeSelect.appendChild(opt);
      }
      cidadeSelect.value = data.localidade;
    }
    if (bairroInput && data.bairro) {
      bairroInput.value = data.bairro;
      clearFieldError('bairro');
    }
    if (enderecoInput && data.logradouro) {
      enderecoInput.value = data.logradouro;
    }
  } catch (error) {
    console.warn('ViaCEP Lookup Warning:', error);
  } finally {
    if (cepInput) cepInput.classList.remove('loading-cep');
  }
}

function populateCities(uf) {
  const cidadeSelect = document.getElementById('cidade');
  if (!cidadeSelect) return;

  cidadeSelect.innerHTML = '<option value="">Selecione a cidade</option>';
  const cities = BRAZIL_LOCATIONS[uf] || ['Cidade Principal', 'Zona Rural / Outra'];

  cities.forEach(city => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = city;
    cidadeSelect.appendChild(opt);
  });
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
// STEPPER WIZARD FOR CADASTRO
// ===================================================

let currentWizardStep = 1;
const totalWizardSteps = 3;

function updateWizardUI(step) {
  currentWizardStep = step;

  // Update step cards visibility
  for (let i = 1; i <= totalWizardSteps; i++) {
    const stepEl = document.getElementById(`wizard-step-${i}`);
    const navItem = document.getElementById(`step-indicator-${i}`);
    if (stepEl) {
      if (i === step) {
        stepEl.classList.add('active');
      } else {
        stepEl.classList.remove('active');
      }
    }

    if (navItem) {
      navItem.classList.remove('active', 'completed');
      if (i < step) {
        navItem.classList.add('completed');
      } else if (i === step) {
        navItem.classList.add('active');
      }
    }
  }

  // Update progress bar width
  const progressBar = document.getElementById('stepper-progress');
  if (progressBar) {
    const percent = ((step - 1) / (totalWizardSteps - 1)) * 100;
    progressBar.style.width = `${percent}%`;
  }

  // Scroll to top of form
  const formCard = document.querySelector('.auth-form-card');
  if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStep(step) {
  let isValid = true;

  if (step === 1) {
    const nome = document.getElementById('nome')?.value.trim() || '';
    const email = document.getElementById('email')?.value.trim() || '';
    const telefone = document.getElementById('telefone')?.value.trim() || '';
    const senha = document.getElementById('senha')?.value || '';
    const confirmarSenha = document.getElementById('confirmar_senha')?.value || '';

    if (!nome || nome.split(' ').length < 2) {
      showFieldError('nome', 'Informe seu nome completo (nome e sobrenome).');
      isValid = false;
    } else {
      clearFieldError('nome');
    }

    if (!email || !isValidEmail(email)) {
      showFieldError('email', 'Informe um e-mail válido.');
      isValid = false;
    } else {
      clearFieldError('email');
    }

    if (!telefone || telefone.replace(/\D/g, '').length < 10) {
      showFieldError('telefone', 'Informe um telefone com DDD válido.');
      isValid = false;
    } else {
      clearFieldError('telefone');
    }

    const passCheck = checkPasswordStrength(senha);
    if (!senha || passCheck.score < 2) {
      showFieldError('senha', 'A senha precisa ter no mínimo 8 caracteres e incluir números e letras.');
      isValid = false;
    } else {
      clearFieldError('senha');
    }

    if (!confirmarSenha || confirmarSenha !== senha) {
      showFieldError('confirmar_senha', 'As senhas digitadas não coincidem.');
      isValid = false;
    } else {
      clearFieldError('confirmar_senha');
    }
  }

  if (step === 2) {
    const nomeFazenda = document.getElementById('nome_fazenda')?.value.trim() || '';
    const estado = document.getElementById('estado')?.value || '';
    const cidade = document.getElementById('cidade')?.value.trim() || '';
    const bairro = document.getElementById('bairro')?.value.trim() || '';
    const cep = document.getElementById('cep')?.value.trim() || '';

    if (!nomeFazenda) {
      showFieldError('nome_fazenda', 'Informe o nome da sua fazenda ou propriedade.');
      isValid = false;
    } else {
      clearFieldError('nome_fazenda');
    }

    if (!estado) {
      showFieldError('estado', 'Selecione o Estado (UF).');
      isValid = false;
    } else {
      clearFieldError('estado');
    }

    if (!cidade) {
      showFieldError('cidade', 'Informe a cidade da propriedade.');
      isValid = false;
    } else {
      clearFieldError('cidade');
    }

    if (!bairro) {
      showFieldError('bairro', 'Informe o bairro ou distrito da fazenda.');
      isValid = false;
    } else {
      clearFieldError('bairro');
    }

    if (!cep || cep.replace(/\D/g, '').length !== 8) {
      showFieldError('cep', 'Informe um CEP válido com 8 dígitos.');
      isValid = false;
    } else {
      clearFieldError('cep');
    }
  }

  if (step === 3) {
    const area = Number(document.getElementById('area_hectares')?.value);
    const talhoes = Number(document.getElementById('quantidade_talhoes')?.value);
    const culturas = document.querySelectorAll('.culture-chip.selected').length;
    if (!Number.isFinite(area) || area <= 0) {
      showFieldError('area_hectares', 'Informe uma área maior que zero.');
      isValid = false;
    } else {
      clearFieldError('area_hectares');
    }
    if (!Number.isInteger(talhoes) || talhoes < 1) {
      showFieldError('quantidade_talhoes', 'Informe ao menos um talhão.');
      isValid = false;
    } else {
      clearFieldError('quantidade_talhoes');
    }
    if (!culturas) {
      isValid = false;
    }
  }

  return isValid;
}

function nextWizardStep() {
  hideAlert('register-alert');
  if (validateStep(currentWizardStep)) {
    if (currentWizardStep < totalWizardSteps) {
      updateWizardUI(currentWizardStep + 1);
    }
  } else {
    showAlert('register-alert', 'Por favor, corrija os campos destacados antes de avançar.', 'error');
  }
}

function prevWizardStep() {
  hideAlert('register-alert');
  if (currentWizardStep > 1) {
    updateWizardUI(currentWizardStep - 1);
  }
}

// ===================================================
// API BACKEND INTEGRATION SERVICES (Mock + Prepared)
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
    console.log('🔗 Sending POST request to /api/auth/login:', { email, rememberMe });
    const form = document.getElementById('login-form');
    return this.post(form.dataset.apiUrl, { email, password, remember_me: rememberMe }, form.querySelector('[name=csrfmiddlewaretoken]').value);
  },

  async register(formData) {
    console.log('🔗 Sending POST request to /api/auth/register with payload:', formData);
    const form = document.getElementById('cadastro-form');
    return this.post(form.dataset.apiUrl, formData, form.querySelector('[name=csrfmiddlewaretoken]').value);
  },

  async requestPasswordReset(email) {
    console.log('🔗 Sending POST request to /api/auth/forgot-password:', { email });
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { status: 'success', message: 'Instruções de recuperação enviadas para o seu e-mail.' };
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
          await AuthService.requestPasswordReset(resetEmail);
          showAlert('forgot-alert', 'Instruções enviadas para ' + resetEmail, 'success');
          setTimeout(() => {
            modalOverlay.classList.remove('active');
            btn.disabled = false;
            btn.classList.remove('btn-loading');
          }, 2000);
        } catch (err) {
          showAlert('forgot-alert', 'Erro ao enviar. Verifique o e-mail.', 'error');
          btn.disabled = false;
          btn.classList.remove('btn-loading');
        }
      });
    }
  }

  // --- CADASTRO PAGE LOGIC ---
  const registerForm = document.getElementById('cadastro-form');
  if (registerForm) {
    // Phone mask listener
    const phoneInput = document.getElementById('telefone');
    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        e.target.value = maskPhone(e.target.value);
        clearFieldError('telefone');
      });
    }

    // CEP mask & Auto-fill listener
    const cepInput = document.getElementById('cep');
    if (cepInput) {
      cepInput.addEventListener('input', (e) => {
        e.target.value = maskCEP(e.target.value);
        clearFieldError('cep');
        if (e.target.value.replace(/\D/g, '').length === 8) {
          fetchAddressByCEP(e.target.value);
        }
      });
    }

    // Estado dropdown listener
    const ufSelect = document.getElementById('estado');
    if (ufSelect) {
      ufSelect.addEventListener('change', (e) => {
        clearFieldError('estado');
        populateCities(e.target.value);
      });
    }

    // Password strength listener
    const passwordInput = document.getElementById('senha');
    if (passwordInput) {
      passwordInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const res = checkPasswordStrength(val);
        const barFill = document.getElementById('strength-bar-fill');
        const textLabel = document.getElementById('strength-text-label');

        if (barFill) {
          barFill.className = `strength-bar-fill ${res.className}`;
          if (!val) barFill.style.width = '0%';
        }
        if (textLabel) {
          textLabel.textContent = val ? res.label : 'Nível da senha';
        }

        // Requirements list
        const reqLen = document.getElementById('req-len');
        const reqNum = document.getElementById('req-num');
        const reqUpper = document.getElementById('req-upper');
        const reqSpec = document.getElementById('req-spec');

        if (reqLen) reqLen.className = `strength-req-item ${res.reqs.length ? 'valid' : ''}`;
        if (reqNum) reqNum.className = `strength-req-item ${res.reqs.number ? 'valid' : ''}`;
        if (reqUpper) reqUpper.className = `strength-req-item ${res.reqs.uppercase ? 'valid' : ''}`;
        if (reqSpec) reqSpec.className = `strength-req-item ${res.reqs.special ? 'valid' : ''}`;
      });
    }

    // Confirm password matching listener
    const confirmInput = document.getElementById('confirmar_senha');
    if (confirmInput) {
      confirmInput.addEventListener('input', (e) => {
        const pass = document.getElementById('senha').value;
        if (e.target.value && e.target.value === pass) {
          clearFieldError('confirmar_senha');
        }
      });
    }

    // Culture Multi-select Chips Toggle
    document.querySelectorAll('.culture-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
      });
    });

    // Step Nav Button Listeners
    document.getElementById('btn-step1-next')?.addEventListener('click', () => nextWizardStep());
    document.getElementById('btn-step2-prev')?.addEventListener('click', () => prevWizardStep());
    document.getElementById('btn-step2-next')?.addEventListener('click', () => nextWizardStep());
    document.getElementById('btn-step3-prev')?.addEventListener('click', () => prevWizardStep());

    // Step Click Direct Navigation (if step completed)
    for (let i = 1; i <= totalWizardSteps; i++) {
      const stepIndicator = document.getElementById(`step-indicator-${i}`);
      if (stepIndicator) {
        stepIndicator.addEventListener('click', () => {
          if (i < currentWizardStep || validateStep(currentWizardStep)) {
            updateWizardUI(i);
          }
        });
      }
    }

    // Final Form Submission
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert('register-alert');

      if (!validateStep(3)) {
        showAlert('register-alert', 'Por favor preencha os dados da propriedade.', 'error');
        return;
      }

      // Collect selected cultures
      const selectedCulturas = Array.from(document.querySelectorAll('.culture-chip.selected'))
        .map(chip => chip.getAttribute('data-value'));

      // Collect radio values
      const tipoCultivo = document.querySelector('input[name="tipo_cultivo"]:checked')?.value || 'Convencional';
      const irrigacao = document.querySelector('input[name="irrigacao"]:checked')?.value || 'Nenhuma';

      // Build Structured Data Schema for Backend API
      const payload = {
        nome: document.getElementById('nome').value.trim(),
        email: document.getElementById('email').value.trim(),
        telefone: document.getElementById('telefone').value.trim(),
        senha: document.getElementById('senha').value,
        nome_fazenda: document.getElementById('nome_fazenda').value.trim(),
        estado: document.getElementById('estado').value,
        cidade: document.getElementById('cidade').value.trim(),
        bairro: document.getElementById('bairro').value.trim(),
        cep: document.getElementById('cep').value.trim(),
        endereco: document.getElementById('endereco').value.trim(),
        area_hectares: parseFloat(document.getElementById('area_hectares').value) || 0,
        quantidade_talhoes: parseInt(document.getElementById('quantidade_talhoes').value, 10) || 1,
        culturas: selectedCulturas,
        tipo_cultivo: tipoCultivo,
        irrigacao: irrigacao
      };

      const btnSubmit = document.getElementById('btn-register-submit');
      btnSubmit.disabled = true;
      btnSubmit.classList.add('btn-loading');

      try {
        const res = await AuthService.register(payload);
        showAlert('register-alert', '🎉 Cadastro da fazenda realizado com sucesso! Redirecionando para o sistema...', 'success');

        window.location.href = res.redirect_url;
      } catch (err) {
        Object.entries(err.fieldErrors || {}).forEach(([field, message]) => showFieldError(field, message));
        showAlert('register-alert', err.message || 'Erro ao realizar cadastro.', 'error');
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('btn-loading');
      }
    });
  }
});
