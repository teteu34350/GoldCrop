(() => {
  const root = document.getElementById("pecuariaApp");
  if (!root) return;

  const state = { animals: [], productions: [], management: [], reproduction: [], feeding: [], products: [], summary: null, milkPeriod: null, chartType: "dia" };
  const modal = document.getElementById("pecuariaModal");
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
  const localDate = (date = new Date()) => {
    const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return adjusted.toISOString().slice(0, 10);
  };
  const today = localDate();
  const categories = [
    ["VACA_LACTACAO", "Vaca em lactação"], ["VACA_SECA", "Vaca seca"], ["NOVILHA", "Novilha"],
    ["BEZERRA", "Bezerra"], ["BEZERRO", "Bezerro"], ["TOURO", "Touro"],
  ];
  const statuses = [["ATIVO", "Ativo"], ["VENDIDO", "Vendido"], ["MORTO", "Morto"], ["TRANSFERIDO", "Transferido"], ["OUTRO", "Outro"]];
  const eventTypes = [
    ["VACINACAO", "Vacinação"], ["MEDICAMENTO", "Medicamento"], ["VERMIFUGACAO", "Vermifugação"],
    ["DOENCA", "Doença"], ["TRATAMENTO", "Tratamento"], ["PESAGEM", "Pesagem"], ["PARTO", "Parto"],
    ["INSEMINACAO", "Inseminação"], ["DIAGNOSTICO_GESTACAO", "Diagnóstico de gestação"],
    ["SECAGEM", "Secagem"], ["ALTERACAO_CATEGORIA", "Alteração de categoria"], ["OUTRO", "Outro"],
  ];
  const reproductionTypes = [
    ["INSEMINACAO", "Inseminação"], ["MONTA", "Monta"], ["DIAGNOSTICO", "Diagnóstico de gestação"],
    ["GESTACAO", "Gestação confirmada"], ["PARTO", "Parto"], ["ABORTO", "Aborto"], ["SECAGEM", "Secagem"],
  ];

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const fmtNumber = (value, digits = 1) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(Number(value || 0));
  const fmtDate = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "—";
  const field = (label, name, value = "", type = "text", required = false, extra = "") =>
    `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""} ${extra}></label>`;
  const selectField = (label, name, options, selected = "", required = false) =>
    `<label>${label}<select name="${name}" ${required ? "required" : ""}>${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
  const areaField = (label, name, value = "", full = true) =>
    `<label class="${full ? "full" : ""}">${label}<textarea name="${name}">${escapeHtml(value)}</textarea></label>`;

  async function api(url, options = {}) {
    const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
    if (options.method && options.method !== "GET") headers["X-CSRFToken"] = csrfToken;
    const response = await fetch(url, { credentials: "same-origin", ...options, headers });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error("Não foi possível interpretar a resposta do servidor.");
    }
    if (!response.ok || body.ok === false) throw new Error(body.message || "Não foi possível concluir a operação.");
    return body;
  }

  function notify(message, isError = false) {
    const notice = document.getElementById("pecuariaMessage");
    notice.textContent = message;
    notice.classList.toggle("error", isError);
    notice.hidden = false;
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => { notice.hidden = true; }, 5000);
  }

  function showError(error) {
    notify(error.message || "Ocorreu um erro ao carregar os dados.", true);
  }

  function setTab(name) {
    document.querySelectorAll(".pecuaria-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === name);
    });
    document.querySelectorAll(".pecuaria-panel").forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  async function refresh() {
    try {
      const start = document.getElementById("milkStart").value;
      const end = document.getElementById("milkEnd").value;
      const periodQuery = start || end ? `?inicio=${encodeURIComponent(start)}&fim=${encodeURIComponent(end)}` : "";
      const [dashboard, animals, productions, management, reproduction, feeding, stock] = await Promise.all([
        api("/pecuaria/api/dashboard/"),
        api("/pecuaria/api/animais/"),
        api(`/pecuaria/api/producao/${periodQuery}`),
        api("/pecuaria/api/manejo/"),
        api("/pecuaria/api/reproducao/"),
        api("/pecuaria/api/alimentacao/"),
        api("/api/estoque/produtos/"),
      ]);
      state.summary = dashboard;
      state.animals = animals.animais;
      state.productions = productions.producoes;
      state.milkPeriod = productions;
      state.management = management.manejos;
      state.reproduction = reproduction.reproducoes;
      state.feeding = feeding.alimentacoes;
      state.products = stock.produtos;
      document.getElementById("farmName").textContent = dashboard.fazenda;
      renderDashboard();
      renderAnimals();
      renderProduction();
      renderManagement();
      renderReproduction();
      renderFeeding();
      populateFilterOptions();
      const detailMatch = window.location.pathname.match(/^\/pecuaria\/animais\/(\d+)\/$/);
      if (detailMatch && !state.initialDetailShown) {
        state.initialDetailShown = true;
        setTab("animals");
        await showAnimal(Number(detailMatch[1]));
      }
    } catch (error) {
      showError(error);
      ["herdStats", "animalList", "productionList", "managementList", "reproductionList", "feedingList"].forEach((id) => {
        const target = document.getElementById(id);
        if (target) target.innerHTML = `<div class="pecuaria-empty">Não foi possível carregar estes dados.</div>`;
      });
    }
  }

  function renderDashboard() {
    const { resumo, categorias: herd, alertas: alerts, eventos: events } = state.summary;
    const stats = [
      ["Total de animais", resumo.total_animais], ["Vacas em lactação", resumo.vacas_lactacao],
      ["Vacas secas", resumo.vacas_secas], ["Novilhas", resumo.novilhas], ["Bezerros", resumo.bezerros],
      ["Touros", resumo.touros], ["Leite hoje", `${fmtNumber(resumo.producao_hoje)} L`],
      ["Média por vaca/dia", `${fmtNumber(resumo.media_litros_vaca_dia)} L`],
    ];
    document.getElementById("herdStats").innerHTML = stats.map(([label, value]) =>
      `<article class="pecuaria-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
    drawChart();
    document.getElementById("categoryList").innerHTML = herd.length
      ? herd.map((item) => `<div class="pecuaria-category-row"><span>${escapeHtml(item.nome)}</span><strong>${item.quantidade}</strong></div>`).join("")
      : `<p class="pecuaria-empty">Cadastre animais para acompanhar as categorias.</p>`;
    document.getElementById("alertList").innerHTML = alerts.length
      ? alerts.map((item) => `<div class="pecuaria-item"><i class="pecuaria-alert-dot ${item.tipo === "estoque" ? "danger" : ""}"></i><span>${escapeHtml(item.mensagem)}</span></div>`).join("")
      : `<p class="pecuaria-empty">Nenhum alerta no momento.</p>`;
    document.getElementById("upcomingList").innerHTML = events.length
      ? events.map((item) => `<div class="pecuaria-item"><i class="pecuaria-alert-dot"></i><span><strong>${escapeHtml(item.animal)}</strong> · ${escapeHtml(item.tipo || item.status)}<br>${fmtDate(item.data)}${item.descricao ? `<br>${escapeHtml(item.descricao)}` : ""}</span></div>`).join("")
      : `<p class="pecuaria-empty">Nenhum parto previsto.</p>`;
    const stock = state.summary.estoques || [];
    document.getElementById("livestockStockList").innerHTML = stock.length
      ? stock.map((item) => `<div class="pecuaria-item"><i class="pecuaria-alert-dot ${item.situacao === "danger" ? "danger" : ""}"></i><span><strong>${escapeHtml(item.produto)}</strong><br>${fmtNumber(item.quantidade)} ${escapeHtml(item.unidade)}${item.autonomia_dias === null ? "" : ` · ${fmtNumber(item.autonomia_dias)} dias`}</span></div>`).join("")
      : `<p class="pecuaria-empty">Ainda não há insumos vinculados à alimentação.</p>`;
  }

  function drawChart() {
    const target = document.getElementById("productionChart");
    const rows = state.summary[`producao_${state.chartType === "dia" ? "diaria" : state.chartType === "semana" ? "semanal" : "mensal"}`] || [];
    const rangeLabels = { dia: "Últimos 14 dias", semana: "Últimas 12 semanas", mes: "Últimos 12 meses" };
    document.getElementById("productionChartRange").textContent = rangeLabels[state.chartType];
    const width = 560;
    const height = 190;
    const padding = { top: 12, right: 12, bottom: 26, left: 12 };
    const values = rows.map((item) => item.litros);
    const max = Math.max(...values, 1);
    const points = values.map((value, index) => {
      const x = padding.left + index * ((width - padding.left - padding.right) / Math.max(values.length - 1, 1));
      const y = height - padding.bottom - (value / max) * (height - padding.top - padding.bottom);
      return [x, y];
    });
    const line = points.map(([x, y]) => `${x},${y}`).join(" ");
    const area = `${padding.left},${height - padding.bottom} ${line} ${width - padding.right},${height - padding.bottom}`;
    const labelInterval = state.chartType === "dia" ? 3 : 2;
    const labels = rows.filter((_, index) => index % labelInterval === 0 || index === rows.length - 1).map((item) => {
      const sourceIndex = rows.indexOf(item);
      const x = padding.left + sourceIndex * ((width - padding.left - padding.right) / Math.max(values.length - 1, 1));
      return `<text x="${x}" y="${height - 5}" text-anchor="middle">${escapeHtml(item.data.slice(5))}</text>`;
    }).join("");
    target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Produção dos últimos 14 dias em litros"><defs><linearGradient id="milkFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#53a96e" stop-opacity=".22"/><stop offset="1" stop-color="#53a96e" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#milkFill)"/><polyline points="${line}" fill="none" stroke="#26834f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#26834f"/>`).join("")}<g fill="#758078" font-size="10">${labels}</g></svg>`;
  }

  function populateFilterOptions() {
    const categorySelect = document.getElementById("animalCategory");
    const statusSelect = document.getElementById("animalStatus");
    if (categorySelect.options.length === 1) {
      categories.forEach(([value, label]) => categorySelect.add(new Option(label, value)));
      statuses.forEach(([value, label]) => statusSelect.add(new Option(label, value)));
    }
  }

  function filteredAnimals() {
    const query = document.getElementById("animalSearch").value.trim().toLocaleLowerCase("pt-BR");
    const category = document.getElementById("animalCategory").value;
    const status = document.getElementById("animalStatus").value;
    const breed = document.getElementById("animalBreed").value.trim().toLocaleLowerCase("pt-BR");
    return state.animals.filter((animal) =>
      (!query || `${animal.identificacao} ${animal.nome}`.toLocaleLowerCase("pt-BR").includes(query))
      && (!category || animal.categoria === category)
      && (!status || animal.status === status)
      && (!breed || animal.raca.toLocaleLowerCase("pt-BR").includes(breed)));
  }

  function renderAnimals() {
    const animals = filteredAnimals();
    document.getElementById("animalList").innerHTML = animals.length ? animals.map((animal) =>
      `<article class="pecuaria-record-card"><div class="pecuaria-record-main"><strong>${escapeHtml(animal.nome ? `${animal.identificacao} · ${animal.nome}` : animal.identificacao)}</strong><span>${escapeHtml(animal.categoria_label)} · ${escapeHtml(animal.raca || "Raça não informada")} · ${escapeHtml(animal.status_label)}</span><small>${animal.peso ? `${fmtNumber(animal.peso)} kg` : "Peso não informado"}${animal.data_nascimento ? ` · Nascimento ${fmtDate(animal.data_nascimento)}` : ""}</small></div><div class="pecuaria-record-actions"><a href="/pecuaria/animais/${animal.id}/">Ficha</a><button type="button" data-action="edit-animal" data-id="${animal.id}">Editar</button></div></article>`).join("")
      : `<div class="pecuaria-empty">Nenhum animal encontrado. Ajuste os filtros ou cadastre um animal.</div>`;
  }

  function renderProduction() {
    const records = state.productions;
    const todayTotal = state.summary?.resumo.producao_hoje || 0;
    const weekTotal = state.summary?.resumo.producao_semana || 0;
    const monthTotal = state.summary?.resumo.producao_mes || 0;
    const periodTotal = state.milkPeriod?.total_litros || 0;
    const lactatingCount = state.summary?.resumo.vacas_lactacao || 0;
    document.getElementById("milkSummary").innerHTML = [
      ["Hoje", `${fmtNumber(todayTotal)} L`], ["Últimos 7 dias", `${fmtNumber(weekTotal)} L`],
      ["Este mês", `${fmtNumber(monthTotal)} L`],
      ["Período selecionado", `${fmtNumber(periodTotal)} L`],
      ["Média hoje / vaca", `${fmtNumber(state.summary?.resumo.media_litros_vaca_dia || 0)} L`],
      ["Média últimos 7 dias", `${fmtNumber(state.summary?.resumo.media_semanal_litros_vaca_dia || 0)} L/vaca/dia`],
      ["Média no mês", `${fmtNumber(state.summary?.resumo.media_mensal_litros_vaca_dia || 0)} L/vaca/dia`],
    ].map(([label, value]) => `<article class="pecuaria-stat"><span>${label}</span><strong>${value}</strong></article>`).join("");
    const byAnimal = state.milkPeriod?.por_animal || [];
    document.getElementById("milkByAnimal").innerHTML = byAnimal.length
      ? byAnimal.map((item) => `<div class="pecuaria-category-row"><span>${escapeHtml(item.animal)}</span><strong>${fmtNumber(item.litros)} L</strong></div>`).join("")
      : `<p class="pecuaria-empty">Sem produção registrada neste período.</p>`;
    document.getElementById("milkSummary").dataset.lactating = String(lactatingCount);
    document.getElementById("productionList").innerHTML = recordCards(records, (record) =>
      `<strong>${fmtDate(record.data)} · ${fmtNumber(record.quantidade)} L</strong><span>${escapeHtml(record.animal)} · Ordenha ${escapeHtml(record.ordenha)}</span>${record.observacao ? `<small>${escapeHtml(record.observacao)}</small>` : ""}`);
  }

  function renderManagement() {
    document.getElementById("managementList").innerHTML = recordCards(state.management, (record) =>
      `<strong>${escapeHtml(record.tipo_label)} · ${escapeHtml(record.animal)}</strong><span>${fmtDate(record.data)}${record.descricao ? ` · ${escapeHtml(record.descricao)}` : ""}</span><small>${escapeHtml([record.produto, record.dosagem, record.responsavel].filter(Boolean).join(" · ") || record.observacoes || "")}</small>`);
  }

  function renderReproduction() {
    document.getElementById("reproductionList").innerHTML = recordCards(state.reproduction, (record) =>
      `<strong>${escapeHtml(record.tipo_label)} · ${escapeHtml(record.animal)}</strong><span>${fmtDate(record.data)}${record.status_gestacao_label ? ` · ${escapeHtml(record.status_gestacao_label)}` : ""}</span><small>${record.data_estimada_parto ? `Previsão de parto: ${fmtDate(record.data_estimada_parto)}` : escapeHtml(record.observacoes || record.touro_inseminador)}</small>`);
  }

  function renderFeeding() {
    document.getElementById("feedingList").innerHTML = recordCards(state.feeding, (record) =>
      `<strong>${escapeHtml(record.tipo_alimento)} · ${fmtNumber(record.quantidade)} ${escapeHtml(record.unidade)}</strong><span>${fmtDate(record.data)} · ${escapeHtml(record.animal)}${record.produto ? ` · Estoque: ${escapeHtml(record.produto)}` : ""}</span>${record.observacao ? `<small>${escapeHtml(record.observacao)}</small>` : ""}`);
  }

  function recordCards(rows, content) {
    return rows.length ? rows.map((row) => `<article class="pecuaria-record-card"><div class="pecuaria-record-main">${content(row)}</div></article>`).join("")
      : `<div class="pecuaria-empty">Nenhum registro encontrado.</div>`;
  }

  function animalOptions(selected = "", includeEmpty = false) {
    const options = state.animals.filter((animal) => !animal.arquivado).map((animal) =>
      [String(animal.id), `${animal.identificacao}${animal.nome ? ` · ${animal.nome}` : ""}`]);
    if (includeEmpty) options.unshift(["", "Lote / geral"]);
    return options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(selected) === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function productOptions(selected = "", includeEmpty = false) {
    const options = state.products.map((product) =>
      [String(product.id), `${product.nome} · ${fmtNumber(product.quantidade_atual)} ${product.unidade}`, product.unidade]);
    if (includeEmpty) options.unshift(["", "Sem vínculo com estoque", ""]);
    return options.map(([value, label, unit]) => `<option value="${escapeHtml(value)}" data-unit="${escapeHtml(unit)}" ${String(selected) === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function openModal(title, content) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalContent").innerHTML = content;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    modal.querySelector("input,select,button")?.focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function formMarkup(kind, animal = null) {
    let fields = "";
    let title = "";
    let method = "POST";
    let endpoint = "";
    if (kind === "animal") {
      title = animal ? "Editar animal" : "Cadastrar animal";
      method = animal ? "PATCH" : "POST";
      endpoint = animal ? `/pecuaria/api/animais/${animal.id}/` : "/pecuaria/api/animais/";
      fields = `${field("Identificação / brinco", "identificacao", animal?.identificacao || "", "text", true)}
        ${field("Nome / apelido", "nome", animal?.nome || "")}
        ${selectField("Tipo", "tipo", [["LEITE","Gado leiteiro"],["CORTE","Gado de corte"],["MISTO","Misto"],["OUTRO","Outro"]], animal?.tipo || "LEITE", true)}
        ${selectField("Categoria", "categoria", categories, animal?.categoria || "VACA_LACTACAO", true)}
        ${selectField("Sexo", "sexo", [["F","Fêmea"],["M","Macho"]], animal?.sexo || "F", true)}
        ${field("Raça", "raca", animal?.raca || "")}
        ${field("Nascimento", "data_nascimento", animal?.data_nascimento || "", "date")}
        ${field("Peso (kg)", "peso", animal?.peso ?? "", "number", false, 'min="0.01" step="0.01"')}
        ${field("Origem", "origem", animal?.origem || "")}
        ${selectField("Mãe", "mae_id", [["", "Não informada"], ...state.animals.filter((item) => item.sexo === "F" && item.id !== animal?.id).map((item) => [String(item.id), item.identificacao])], animal?.mae_id || "")}
        ${selectField("Pai", "pai_id", [["", "Não informado"], ...state.animals.filter((item) => item.sexo === "M" && item.id !== animal?.id).map((item) => [String(item.id), item.identificacao])], animal?.pai_id || "")}
        ${field("Entrada na propriedade", "data_entrada", animal?.data_entrada || "", "date")}
        ${selectField("Status", "status", statuses, animal?.status || "ATIVO", true)}
        ${areaField("Observações", "observacoes", animal?.observacoes || "")}`;
    } else if (kind === "production") {
      title = "Registrar produção de leite";
      endpoint = "/pecuaria/api/producao/";
      fields = `${field("Data", "data", today, "date", true)}<label>Animal ou lote<select name="animal_id">${animalOptions("", true)}</select></label>${field("Quantidade (litros)", "quantidade", "", "number", true, 'min="0.01" step="0.01"')}${selectField("Ordenha", "ordenha", [["MANHA","Manhã"],["TARDE","Tarde"],["NOITE","Noite"],["UNICA","Única"]], "UNICA", true)}${areaField("Observação", "observacao")}`;
    } else if (kind === "management") {
      title = "Registrar manejo";
      endpoint = "/pecuaria/api/manejo/";
      fields = `<label>Animal<select name="animal_id" required>${animalOptions()}</select></label>${selectField("Tipo de evento", "tipo", eventTypes, "VACINACAO", true)}${field("Data", "data", today, "date", true)}<label>Produto utilizado<select name="produto_id"><option value="">Nenhum</option>${productOptions()}</select></label>${field("Quantidade utilizada", "quantidade_produto", "", "number", false, 'min="0.01" step="0.01"')}`;
      fields += `${field("Dosagem / aplicação", "dosagem")}${field("Responsável", "responsavel")}${areaField("Descrição", "descricao", "")}${areaField("Observações", "observacoes")}`;
    } else if (kind === "reproduction") {
      title = "Registrar reprodução";
      endpoint = "/pecuaria/api/reproducao/";
      fields = `<label>Animal<select name="animal_id" required>${animalOptions()}</select></label>${selectField("Evento", "tipo", reproductionTypes, "INSEMINACAO", true)}${field("Data", "data", today, "date", true)}${field("Touro / sêmen", "touro_inseminador")}${field("Previsão de parto", "data_estimada_parto", "", "date")}${selectField("Status da gestação", "status_gestacao", [["","Automático"],["PENDENTE","Aguardando diagnóstico"],["CONFIRMADA","Confirmada"],["NEGATIVA","Negativa / falha"],["CONCLUIDA","Concluída"]])}${areaField("Observações", "observacoes")}`;
    } else {
      title = "Registrar alimentação";
      endpoint = "/pecuaria/api/alimentacao/";
      fields = `<label>Animal ou lote<select name="animal_id">${animalOptions("", true)}</select></label><label>Produto do estoque<select name="produto_id">${productOptions("", true)}</select></label>${field("Tipo de alimento", "tipo_alimento", "", "text", true)}${field("Quantidade consumida", "quantidade", "", "number", true, 'min="0.01" step="0.01"')}${field("Unidade", "unidade", "kg", "text", true)}${field("Data", "data", today, "date", true)}${areaField("Observação", "observacao")}`;
    }
    const submitLabel = animal ? "Salvar alterações" : "Salvar registro";
    openModal(title, `<form class="pecuaria-form" data-submit-endpoint="${endpoint}" data-submit-method="${method}" data-kind="${kind}">${fields}<div class="pecuaria-form-error" hidden></div><div class="pecuaria-form-actions full"><button type="button" class="btn-ghost" data-action="close-modal">Cancelar</button><button type="submit" class="btn-primary">${submitLabel}</button></div></form>`);
  }

  async function showAnimal(animalId) {
    try {
      const data = await api(`/pecuaria/api/animais/${animalId}/`);
      const animal = data.animal;
      const history = animal.historico.length ? animal.historico.map((event) =>
        `<article><strong>${escapeHtml(event.tipo)}</strong><span>${fmtDate(event.data)} · ${escapeHtml(event.descricao)}</span>${event.observacao ? `<small>${escapeHtml(event.observacao)}</small>` : ""}</article>`).join("")
        : `<p class="pecuaria-empty">Este animal ainda não tem registros de histórico.</p>`;
      const age = animal.data_nascimento ? Math.max(0, new Date().getFullYear() - new Date(`${animal.data_nascimento}T00:00:00`).getFullYear()) : null;
      openModal(`${animal.nome ? `${animal.nome} · ` : ""}${animal.identificacao}`, `<div class="pecuaria-detail-grid"><p><strong>Categoria:</strong> ${escapeHtml(animal.categoria_label)}</p><p><strong>Status:</strong> ${escapeHtml(animal.status_label)}</p><p><strong>Raça:</strong> ${escapeHtml(animal.raca || "Não informada")}</p><p><strong>Idade:</strong> ${age === null ? "Não informada" : `${age} anos`}</p><p><strong>Peso:</strong> ${animal.peso ? `${fmtNumber(animal.peso)} kg` : "Não informado"}</p><p><strong>Sexo:</strong> ${escapeHtml(animal.sexo_label)}</p><p><strong>Mãe:</strong> ${escapeHtml(animal.mae || "Não informada")}</p><p><strong>Pai:</strong> ${escapeHtml(animal.pai || "Não informado")}</p><p><strong>Entrada:</strong> ${fmtDate(animal.data_entrada)}</p></div>${animal.observacoes ? `<p>${escapeHtml(animal.observacoes)}</p>` : ""}<div class="pecuaria-section-heading"><h3>Histórico do animal</h3><button class="pecuaria-text-button" type="button" data-action="edit-animal" data-id="${animal.id}">Editar ficha</button></div><div class="pecuaria-timeline">${history}</div><div class="pecuaria-form-actions"><button class="btn-ghost" type="button" data-action="archive-animal" data-id="${animal.id}">Arquivar animal</button></div>`);
    } catch (error) {
      showError(error);
    }
  }

  root.addEventListener("click", async (event) => {
    const chartButton = event.target.closest("[data-chart]");
    if (chartButton) {
      state.chartType = chartButton.dataset.chart;
      document.querySelectorAll("[data-chart]").forEach((button) => button.classList.toggle("active", button === chartButton));
      drawChart();
      return;
    }
    const tab = event.target.closest("[data-tab]");
    if (tab) return setTab(tab.dataset.tab);
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const id = Number(action.dataset.id);
    switch (action.dataset.action) {
      case "new-animal": formMarkup("animal"); break;
      case "new-production": formMarkup("production"); break;
      case "new-management": formMarkup("management"); break;
      case "new-reproduction": formMarkup("reproduction"); break;
      case "new-feeding": formMarkup("feeding"); break;
      case "animal-detail": await showAnimal(id); break;
      case "edit-animal": {
        const animal = state.animals.find((item) => item.id === id);
        if (animal) formMarkup("animal", animal);
        break;
      }
      case "archive-animal":
        if (window.confirm("Arquivar este animal? O histórico será preservado.")) {
          try {
            await api(`/pecuaria/api/animais/${id}/`, { method: "DELETE" });
            closeModal();
            notify("Animal arquivado. O histórico foi preservado.");
            await refresh();
          } catch (error) { showError(error); }
        }
        break;
      case "close-modal": closeModal(); break;
      default: break;
    }
  });

  document.getElementById("animalSearch").addEventListener("input", renderAnimals);
  ["animalCategory", "animalStatus", "animalBreed"].forEach((id) =>
    document.getElementById(id).addEventListener(id === "animalBreed" ? "input" : "change", renderAnimals));

  modal.addEventListener("change", (event) => {
    if (event.target.name !== "produto_id") return;
    const form = event.target.closest("form");
    const unit = event.target.selectedOptions[0]?.dataset.unit;
    const unitInput = form?.querySelector('[name="unidade"]');
    const foodInput = form?.querySelector('[name="tipo_alimento"]');
    const product = state.products.find((item) => String(item.id) === event.target.value);
    if (unitInput && unit) unitInput.value = unit;
    if (foodInput && product && !foodInput.value) foodInput.value = product.nome;
  });

  modal.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-submit-endpoint]");
    if (!form) return;
    event.preventDefault();
    const errorBox = form.querySelector(".pecuaria-form-error");
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    errorBox.hidden = true;
    const payload = Object.fromEntries(new FormData(form).entries());
    Object.keys(payload).forEach((key) => {
      if (payload[key] === "") payload[key] = null;
    });
    try {
      await api(form.dataset.submitEndpoint, {
        method: form.dataset.submitMethod,
        body: JSON.stringify(payload),
      });
      closeModal();
      notify("Registro salvo com sucesso.");
      await refresh();
    } catch (error) {
      errorBox.textContent = error.message || "Não foi possível salvar.";
      errorBox.hidden = false;
      submit.disabled = false;
    }
  });

  modal.addEventListener("click", async (event) => {
    if (event.target === modal) return closeModal();
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const id = Number(action.dataset.id);
    if (action.dataset.action === "close-modal") closeModal();
    if (action.dataset.action === "edit-animal") {
      const animal = state.animals.find((item) => item.id === id);
      if (animal) formMarkup("animal", animal);
    }
    if (action.dataset.action === "archive-animal" && window.confirm("Arquivar este animal? O histórico será preservado.")) {
      try {
        await api(`/pecuaria/api/animais/${id}/`, { method: "DELETE" });
        closeModal();
        notify("Animal arquivado. O histórico foi preservado.");
        await refresh();
      } catch (error) { showError(error); }
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  const milkStart = document.getElementById("milkStart");
  const milkEnd = document.getElementById("milkEnd");
  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 29);
  milkStart.value = localDate(defaultStart);
  milkEnd.value = today;
  document.getElementById("filterMilk").addEventListener("click", refresh);

  refresh();
})();
