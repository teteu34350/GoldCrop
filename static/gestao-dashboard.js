(() => {
  const section = document.querySelector('.gestao-dashboard-summary');
  if (!section) return;

  const currency = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

  fetch('/gestao/api/relatorios/', { credentials: 'same-origin' })
    .then(async response => {
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Não foi possível carregar o resumo financeiro.');
      document.getElementById('dashboardFinanceIncome').textContent = currency(payload.financeiro.receitas);
      document.getElementById('dashboardFinanceExpenses').textContent = currency(payload.financeiro.despesas);
      document.getElementById('dashboardFinanceBalance').textContent = currency(payload.financeiro.saldo);
    })
    .catch(error => {
      const feedback = document.getElementById('dashboardFinanceError');
      feedback.textContent = error.message;
      feedback.hidden = false;
      ['dashboardFinanceIncome', 'dashboardFinanceExpenses', 'dashboardFinanceBalance'].forEach(id => {
        document.getElementById(id).textContent = '—';
      });
    });
})();
