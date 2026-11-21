(() => {
  const root = document.querySelector('[data-gestao-module]');
  if (!root) return;

  const moduleName = root.dataset.gestaoModule;
  const feedback = document.getElementById('gestaoFeedback');
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const apiByModule = {
    financeiro: '/gestao/api/financeiro/',
    safras: '/gestao/api/safras/',
    servicos: '/gestao/api/servicos/',
    equipamentos: '/gestao/api/equipamentos/',
    registros: '/gestao/api/registros/',
    relatorios: '/gestao/api/relatorios/',
  };
  const listTargetByModule = {
    financeiro: ['lancamentos', 'financeList'],
    safras: ['safras', 'safrasList'],
    servicos: ['servicos', 'servicosList'],
    equipamentos: ['equipamentos', 'equipamentosList'],
    registros: ['registros', 'registrosList'],
  };
  const currency = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';

  function showFeedback(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
    feedback.hidden = false;
  }

  function appendListItem(container, title, detail, value = '') {
    const item = document.createElement('article');
    item.className = 'gestao-list-item';
    const text = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = title || 'Sem descrição';
    const subtitle = document.createElement('span');
    subtitle.textContent = detail || '';
    text.append(heading, subtitle);
    item.append(text);
    if (value) {
      const amount = document.createElement('span');
      amount.className = 'gestao-list-value';
      amount.textContent = value;
      item.append(amount);
    }
    container.append(item);
  }

  function renderItems(payload) {
    const config = listTargetByModule[moduleName];
    if (!config) return;
    const container = document.getElementById(config[1]);
    if (!container) return;
    container.replaceChildren();
    const items = payload[config[0]] || [];
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'gestao-empty';
      empty.textContent = 'Ainda não há registros nesta fazenda.';
      container.append(empty);
      return;
    }
    for (const item of items) {
      if (moduleName === 'financeiro') {
        appendListItem(container, item.titulo, `${item.tipo} · ${item.categoria} · ${dateLabel(item.data)}`, currency(item.valor));
      } else if (moduleName === 'safras') {
        appendListItem(container, `${item.cultura} · ${item.ano_safra}`, `${item.variedade || 'Sem variedade'} · ${item.area_hectares} ha · ${item.status} · ${item.talhoes.join(', ') || 'Sem talhões'}`);
      } else if (moduleName === 'servicos') {
        appendListItem(container, item.nome, `${item.tipo} · ${item.pessoa || 'Sem responsável'} · ${dateLabel(item.data)} · ${item.status}`, item.valor ? currency(item.valor) : '');
      } else if (moduleName === 'equipamentos') {
        appendListItem(container, item.nome, `${item.tipo} · ${item.identificacao || 'Sem identificação'} · ${item.status} · Próxima manutenção: ${dateLabel(item.proxima_manutencao)}`);
      } else {
        appendListItem(container, item.titulo, `${item.categoria} · ${dateLabel(item.data)} · ${item.talhao || 'Fazenda'} · ${item.status}`, '');
      }
    }
  }

  function renderFinanceTotals(payload) {
    if (moduleName !== 'financeiro') return;
    const income = Number(payload.totals?.receitas || 0);
    const expenses = Number(payload.totals?.despesas || 0);
    document.getElementById('financeIncome').textContent = currency(income);
    document.getElementById('financeExpenses').textContent = currency(expenses);
    document.getElementById('financeBalance').textContent = currency(income - expenses);
  }

  function renderReport(payload) {
    if (moduleName !== 'relatorios') return;
    document.getElementById('reportPeriod').textContent = `Período: ${payload.periodo}`;
    document.getElementById('reportIncome').textContent = currency(payload.financeiro.receitas);
    document.getElementById('reportExpenses').textContent = currency(payload.financeiro.despesas);
    document.getElementById('reportBalance').textContent = currency(payload.financeiro.saldo);
    const stockList = document.getElementById('reportStock');
    stockList.replaceChildren();
    if (payload.estoque_baixo.length) {
      payload.estoque_baixo.forEach(item => appendListItem(stockList, item.nome, `Saldo ${item.quantidade} ${item.unidade} · mínimo ${item.estoque_minimo} ${item.unidade}`));
    } else {
      appendListItem(stockList, 'Estoque regular', 'Nenhum produto no mínimo ou abaixo dele.');
    }
    const operations = document.getElementById('reportOperations');
    operations.replaceChildren();
    appendListItem(operations, `${payload.servicos_pendentes} serviço(s) pendente(s)`, 'Serviços com status pendente.');
    appendListItem(operations, `${payload.equipamentos_manutencao} equipamento(s) em manutenção`, 'Equipamentos que requerem atenção.');
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'X-CSRFToken': csrfToken,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.message || 'Não foi possível concluir a operação.');
    return payload;
  }

  async function loadModule() {
    const url = apiByModule[moduleName];
    if (!url) return;
    const payload = await requestJson(url);
    renderItems(payload);
    renderFinanceTotals(payload);
    renderReport(payload);
  }

  document.querySelectorAll('.gestao-form').forEach(form => {
    const dateInput = form.querySelector('input[type="date"][name="data"]');
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        const multiSelect = form.querySelector('select[multiple][name="talhoes"]');
        if (multiSelect) payload.talhoes = Array.from(multiSelect.selectedOptions, option => option.value);
        await requestJson(form.dataset.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        form.reset();
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        showFeedback('Registro salvo no banco desta fazenda.');
        await loadModule();
      } catch (error) {
        showFeedback(error.message, true);
      } finally {
        submit.disabled = false;
      }
    });
  });

  const assistantForm = document.getElementById('assistantForm');
  if (assistantForm) {
    const messages = document.getElementById('assistantMessages');
    const input = document.getElementById('assistantInput');
    const pending = document.getElementById('assistantPendingActions');
    const confirmButton = document.getElementById('assistantConfirm');
    const cancelButton = document.getElementById('assistantCancel');
    let busy = false;

    function appendMessage(text, from = 'bot') {
      const message = document.createElement('p');
      message.className = `assistant-message assistant-message-${from}`;
      message.textContent = text;
      messages.append(message);
      messages.scrollTop = messages.scrollHeight;
    }

    async function sendAssistant(payload) {
      if (busy) return;
      busy = true;
      confirmButton.disabled = true;
      cancelButton.disabled = true;
      try {
        const result = await requestJson('/gestao/api/assistente/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        appendMessage(result.reply);
        pending.hidden = !result.confirmation_required;
        if (result.saved) pending.hidden = true;
      } catch (error) {
        appendMessage(error.message);
        pending.hidden = true;
      } finally {
        busy = false;
        confirmButton.disabled = false;
        cancelButton.disabled = false;
        input.focus();
      }
    }

    assistantForm.addEventListener('submit', event => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message) return;
      appendMessage(message, 'user');
      input.value = '';
      pending.hidden = true;
      void sendAssistant({ message });
    });
    confirmButton.addEventListener('click', () => void sendAssistant({ action: 'confirm' }));
    cancelButton.addEventListener('click', () => void sendAssistant({ action: 'cancel' }));
    document.querySelectorAll('[data-assistant-prompt]').forEach(button => {
      button.addEventListener('click', () => {
        input.value = button.dataset.assistantPrompt;
        input.focus();
      });
    });
  }

  loadModule().catch(error => showFeedback(error.message, true));
})();
