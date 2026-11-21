(() => {
  const section = document.querySelector('.gestao-dashboard-summary');
  if (!section) return;

  const currency = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';

  function renderRecentMovements(movements) {
    const container = document.getElementById('dashboardFinanceMovements');
    container.replaceChildren();
    if (!movements.length) {
      const empty = document.createElement('p');
      empty.className = 'gestao-dashboard-empty';
      empty.textContent = 'Ainda não há movimentações registradas.';
      container.append(empty);
      return;
    }

    for (const movement of movements) {
      const item = document.createElement('article');
      item.className = 'gestao-dashboard-movement';
      const copy = document.createElement('div');
      copy.className = 'gestao-dashboard-movement-copy';
      const title = document.createElement('strong');
      title.textContent = movement.titulo || 'Sem descrição';
      const detail = document.createElement('span');
      detail.textContent = `${movement.tipo === 'RECEITA' ? 'Receita' : 'Saída'} · ${movement.categoria || 'Outros'} · ${dateLabel(movement.data)}`;
      copy.append(title, detail);

      const value = document.createElement('span');
      value.className = 'gestao-dashboard-movement-value';
      if (movement.tipo === 'RECEITA') value.classList.add('is-income');
      value.textContent = `${movement.tipo === 'RECEITA' ? '+' : '-'} ${currency(movement.valor)}`;
      item.append(copy, value);
      container.append(item);
    }
  }

  fetch('/gestao/api/relatorios/', { credentials: 'same-origin' })
    .then(async response => {
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Não foi possível carregar o resumo financeiro.');
      document.getElementById('dashboardFinanceIncome').textContent = currency(payload.financeiro.receitas);
      document.getElementById('dashboardFinanceExpenses').textContent = currency(payload.financeiro.despesas);
      document.getElementById('dashboardFinanceBalance').textContent = currency(payload.financeiro.saldo);
      renderRecentMovements(payload.movimentacoes_recentes || []);
    })
    .catch(error => {
      const feedback = document.getElementById('dashboardFinanceError');
      feedback.textContent = error.message;
      feedback.hidden = false;
      ['dashboardFinanceIncome', 'dashboardFinanceExpenses', 'dashboardFinanceBalance'].forEach(id => {
        document.getElementById(id).textContent = '—';
      });
      const movements = document.getElementById('dashboardFinanceMovements');
      movements.replaceChildren();
      const failure = document.createElement('p');
      failure.className = 'gestao-dashboard-empty';
      failure.textContent = 'Não foi possível carregar as movimentações recentes.';
      movements.append(failure);
    });
})();
