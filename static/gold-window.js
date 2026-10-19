'use strict';

(() => {
  const api = '/api/janelas-ouro/';
  const labels = {
    ADUBACAO: 'Adubação',
    FITOSSANITARIA: 'Fitossanitária',
    PLANTIO: 'Plantio',
    MECANIZADA: 'Operações agrícolas',
  };
  const classifications = {
    FAVORAVEL: 'Favorável',
    ATENCAO: 'Atenção',
    DESFAVORAVEL: 'Desfavorável',
    DADOS_INSUFICIENTES: 'Dados insuficientes',
  };
  const descriptions = {
    ADUBACAO: 'Os limites são específicos à fonte e à forma de aplicação. Informe parâmetros técnicos aplicáveis ao fertilizante e ao talhão; sem eles o resultado será insuficiente.',
    FITOSSANITARIA: 'Consulte o rótulo e a bula vigentes. Restrições informadas são bloqueios obrigatórios; o sistema não adiciona limites universais.',
    PLANTIO: 'Informe estágio, drenagem e faixas de solo validadas para a cultura. A temperatura e a umidade meteorológicas do solo são estimativas, não medições.',
    MECANIZADA: 'Informe a operação, o limite de chuva adequado ao tipo de solo e a condição de trafegabilidade observada em campo.',
  };
  const criteriaDefinitions = {
    ADUBACAO: [
      { name: 'produto', label: 'Fonte ou produto fertilizante', type: 'text', required: true },
      { name: 'metodo_aplicacao', label: 'Forma de aplicação', type: 'select', required: true, options: ['Superficial', 'Incorporada', 'Fertirrigação', 'Foliar', 'Outra'] },
      { name: 'max_chuva_24h_mm', label: 'Máxima chuva em 24 h (mm)', type: 'number', required: true },
      { name: 'temperatura_max_c', label: 'Temperatura máxima definida para produto/método (°C)', type: 'number', required: true },
      { name: 'umidade_solo_min_m3m3', label: 'Umidade mínima opcional (m³/m³)', type: 'number' },
      { name: 'umidade_solo_max_m3m3', label: 'Umidade máxima opcional (m³/m³)', type: 'number' },
    ],
    FITOSSANITARIA: [
      { name: 'produto', label: 'Produto defensivo', type: 'text', required: true },
      { name: 'metodo_aplicacao', label: 'Método de aplicação', type: 'select', required: true, options: ['Pulverização terrestre', 'Pulverização aérea', 'Outro'] },
      { name: 'rotulo_confirmado', label: 'Rótulo e bula vigentes consultados', type: 'checkbox', required: true },
      { name: 'limites_rotulo_completos', label: 'Todas as restrições meteorológicas aplicáveis foram informadas', type: 'checkbox', required: true },
      { name: 'fonte_referencia', label: 'Fonte do rótulo/bula (identificação ou endereço)', type: 'text', required: true },
      { name: 'data_verificacao', label: 'Data de verificação do rótulo/bula', type: 'date', required: true },
      { name: 'intervalo_sem_chuva_h', label: 'Intervalo sem chuva do rótulo (horas)', type: 'number', required: true },
      { name: 'vento_max_kmh', label: 'Vento máximo do rótulo (km/h)', type: 'number', group: 'limites_rotulo' },
      { name: 'rajada_max_kmh', label: 'Rajada máxima do rótulo (km/h)', type: 'number', group: 'limites_rotulo' },
      { name: 'temperatura_min_c', label: 'Temperatura mínima do rótulo (°C)', type: 'number', group: 'limites_rotulo' },
      { name: 'temperatura_max_c', label: 'Temperatura máxima do rótulo (°C)', type: 'number', group: 'limites_rotulo' },
      { name: 'umidade_min_pct', label: 'Umidade mínima do rótulo (%)', type: 'number', group: 'limites_rotulo' },
      { name: 'umidade_max_pct', label: 'Umidade máxima do rótulo (%)', type: 'number', group: 'limites_rotulo' },
    ],
    PLANTIO: [
      { name: 'estagio', label: 'Época ou estágio de plantio', type: 'text', required: true },
      { name: 'drenagem', label: 'Drenagem observada', type: 'select', required: true, options: ['Boa', 'Moderada', 'Limitada'] },
      { name: 'temperatura_solo_min_c', label: 'Temperatura mínima do solo validada (°C)', type: 'number', required: true },
      { name: 'temperatura_solo_max_c', label: 'Temperatura máxima do solo validada (°C)', type: 'number', required: true },
      { name: 'umidade_solo_min_m3m3', label: 'Umidade mínima do solo (m³/m³)', type: 'number' },
      { name: 'chuva_min_24h_mm', label: 'Chuva mínima em 24 h (mm)', type: 'number' },
      { name: 'max_chuva_recente_24h_mm', label: 'Limite opcional para chuva recente em 24 h (mm)', type: 'number' },
    ],
    MECANIZADA: [
      { name: 'tipo_operacao', label: 'Tipo de operação', type: 'select', required: true, options: ['Preparo', 'Manejo', 'Tráfego de máquinas', 'Outra'] },
      { name: 'max_chuva_24h_mm', label: 'Limite de chuva em 24 h para solo/operação (mm)', type: 'number', required: true },
      { name: 'max_umidade_solo_m3m3', label: 'Umidade máxima opcional do solo (m³/m³)', type: 'number' },
      { name: 'relevo', label: 'Relevo do talhão', type: 'select', required: true, options: ['plano', 'ondulado', 'declivoso'] },
      { name: 'condicao_trafegabilidade', label: 'Condição atual observada no campo', type: 'select', required: true, values: ['trafegavel', 'nao_trafegavel'], options: ['Trafegável', 'Não trafegável'] },
    ],
  };

  let plots = [];
  let recommendations = [];
  let results = [];
  let activities = [];
  let activeOperation = 'ADUBACAO';

  const text = (value) => window.escapeHtml(value ?? '');
  const selectedPlot = () => plots.find((plot) => String(plot.id) === document.getElementById('goldPlotSelect')?.value);

  function localDate(value, timeZone) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: timeZone || undefined }).format(date);
  }

  function localTime(value, timeZone) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timeZone || undefined }).format(date);
  }

  function datePart(value, timeZone) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timeZone || undefined,
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function criteriaFields(operation) {
    const container = document.getElementById('goldCriteriaFields');
    const description = document.getElementById('goldOperationDescription');
    if (!container || !description) return;
    description.textContent = descriptions[operation] || '';
    container.innerHTML = (criteriaDefinitions[operation] || []).map((field) => {
      const required = field.required ? 'required' : '';
      if (field.type === 'checkbox') {
        return `<label class="gold-field"><span>${text(field.label)}</span><span><input type="checkbox" data-criterion="${text(field.name)}" ${required} /> Confirmo</span></label>`;
      }
      if (field.type === 'select') {
        const values = field.values || field.options;
        return `<label class="gold-field">${text(field.label)}<select class="form-input" data-criterion="${text(field.name)}" ${required}>` +
          `<option value="">Selecione</option>${values.map((option, index) => {
            const value = field.values ? field.values[index] : option;
            return `<option value="${text(value)}">${text(option)}</option>`;
          }).join('')}</select></label>`;
      }
      return `<label class="gold-field">${text(field.label)}<input class="form-input" type="${field.type}" step="any" data-criterion="${text(field.name)}" data-group="${text(field.group || '')}" ${required} /></label>`;
    }).join('');
    if (operation === 'FITOSSANITARIA') {
      container.insertAdjacentHTML('beforeend', `<div class="gold-parameter-actions">
        <label class="gold-field">Parâmetros técnicos cadastrados<select class="form-input" id="goldSavedParameters"><option value="">Carregando registros…</option></select></label>
        <button type="button" class="btn-ghost" id="goldSaveParameters">Salvar parâmetros do produto</button>
      </div>`);
      container.querySelector('#goldSavedParameters').addEventListener('change', applySavedParameters);
      container.querySelector('#goldSaveParameters').addEventListener('click', saveParameters);
      container.querySelector('[data-criterion="produto"]').addEventListener('change', loadParameters);
      container.querySelector('[data-criterion="metodo_aplicacao"]').addEventListener('change', loadParameters);
      loadParameters();
    }
  }

  function setActiveOperation(operation) {
    if (!criteriaDefinitions[operation]) return;
    activeOperation = operation;
    document.getElementById('goldOperation').value = operation;
    document.querySelectorAll('[data-gold-tab]').forEach((button) => {
      const active = button.dataset.goldTab === operation;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const calendar = document.getElementById('goldFertilizerCalendar');
    if (calendar) calendar.hidden = operation !== 'ADUBACAO';
    criteriaFields(operation);
  }

  function buildCriteria() {
    const criteria = {};
    const limits = {};
    document.querySelectorAll('#goldCriteriaFields [data-criterion]').forEach((field) => {
      if (field.type === 'checkbox') {
        criteria[field.dataset.criterion] = field.checked;
      } else if (field.value.trim() !== '') {
        const value = field.type === 'number' ? Number(field.value) : field.value.trim();
        if (field.dataset.group === 'limites_rotulo') limits[field.dataset.criterion] = value;
        else criteria[field.dataset.criterion] = value;
      }
    });
    if (Object.keys(limits).length) criteria.limites_rotulo = limits;
    return criteria;
  }

  function parameterQuery() {
    const product = document.querySelector('#goldCriteriaFields [data-criterion="produto"]')?.value.trim();
    const method = document.querySelector('#goldCriteriaFields [data-criterion="metodo_aplicacao"]')?.value;
    if (!product || !method) return null;
    return new URLSearchParams({ operation: 'FITOSSANITARIA', product, method });
  }

  async function loadParameters() {
    const query = parameterQuery();
    const select = document.getElementById('goldSavedParameters');
    if (!select) return;
    if (!query) {
      select.innerHTML = '<option value="">Informe produto e método</option>';
      return;
    }
    select.innerHTML = '<option value="">Carregando registros…</option>';
    try {
      const response = await window.apiRequest(`/api/janelas-ouro/parametros/?${query}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Falha ao carregar parâmetros cadastrados.');
      const items = data.parameters || [];
      select.innerHTML = '<option value="">Selecione um registro salvo</option>' +
        items.map((item, index) => `<option value="${index}">${text(item.source)} · verificado ${text(item.verified_on)}</option>`).join('');
      select._savedParameters = items;
      if (!items.length) select.innerHTML = '<option value="">Nenhum registro para este produto e método</option>';
    } catch (error) {
      select.innerHTML = '<option value="">Não foi possível carregar registros</option>';
      document.getElementById('goldFormMessage').textContent = error.message;
    }
  }

  function applySavedParameters(event) {
    const item = event.currentTarget._savedParameters?.[Number(event.currentTarget.value)];
    if (!item) return;
    const criteria = item.parameters || {};
    document.querySelectorAll('#goldCriteriaFields [data-criterion]').forEach((field) => {
      const group = field.dataset.group;
      const value = group ? criteria[group]?.[field.dataset.criterion] : criteria[field.dataset.criterion];
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else if (value != null) field.value = value;
    });
    document.getElementById('goldFormMessage').textContent = `Parâmetros carregados da fonte ${item.source}, verificada em ${item.verified_on}. Confirme se continuam vigentes.`;
  }

  async function saveParameters(event) {
    const button = event.currentTarget;
    const criteria = buildCriteria();
    button.disabled = true;
    try {
      const response = await window.apiRequest('/api/janelas-ouro/parametros/', {
        method: 'POST',
        body: JSON.stringify({
          operation: activeOperation,
          product: criteria.produto,
          method: criteria.metodo_aplicacao,
          source: criteria.fonte_referencia,
          verified_on: criteria.data_verificacao,
          parameters: criteria,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Não foi possível salvar os parâmetros.');
      document.getElementById('goldFormMessage').textContent = 'Parâmetros técnicos salvos para reutilização pelos membros autorizados da fazenda.';
      await loadParameters();
    } catch (error) {
      document.getElementById('goldFormMessage').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  function listMarkup(items) {
    if (!Array.isArray(items)) return '';
    return items.map((item) => typeof item === 'string' ? `<li>${text(item)}</li>` : `<li>${text(JSON.stringify(item))}</li>`).join('');
  }

  function weatherSummary(metrics) {
    const names = [
      ['temperatura_c', '°C'],
      ['umidade_relativa_pct', '% UR'],
      ['precipitacao_mm', 'mm no período'],
      ['probabilidade_chuva_pct', '% prob. chuva'],
      ['vento_kmh', 'km/h vento'],
      ['rajada_kmh', 'km/h rajada'],
      ['temperatura_solo_6cm_c', '°C solo estimado a 6 cm'],
      ['et0_mm', 'mm ET₀'],
      ['radiacao_solar_wm2', 'W/m² radiação'],
    ];
    return names.filter(([key]) => Number.isFinite(metrics?.[key]))
      .map(([key, unit]) => {
        const range = metrics.faixas_no_intervalo?.[key];
        const value = Number.isFinite(range?.min) && Number.isFinite(range?.max) && range.min !== range.max
          ? `${range.min.toFixed(1)}–${range.max.toFixed(1)} (média ${metrics[key].toFixed(1)})`
          : text(metrics[key]);
        return `${value} ${unit}`;
      }).join(' · ') || 'Métricas relevantes indisponíveis';
  }

  function recommendationMarkup(item) {
    const quality = item.dataQuality || {};
    const timeZone = quality.fuso_horario;
    const classification = item.classification || 'DADOS_INSUFICIENTES';
    const factors = Array.isArray(item.factors) ? item.factors : [];
    const risks = Array.isArray(item.risks) ? item.risks : [];
    const recommendationId = Number(item.id);
    const canPlan = ['FAVORAVEL', 'ATENCAO'].includes(classification) && item.weather_is_current;
    const label = labels[item.operation] || labels[activeOperation];
    const nextOpportunity = item.next24h?.windowStart || item.next48h?.windowStart;
    const criteria = item.context?.criteria || {};
    return `<article class="gold-window-item" data-classification="${text(classification)}">
      <header><h3>${text(item.plot_name || `Talhão ${item.plot_id || ''}`)} · ${text(label)}</h3><span class="gold-classification">${text(classifications[classification] || classification)}</span></header>
      <p><strong>${text(localDate(item.windowStart, timeZone))} · ${text(localTime(item.windowStart, timeZone))}–${text(localTime(item.windowEnd, timeZone))}</strong></p>
      ${nextOpportunity ? `<p>Próxima oportunidade estimada: ${text(localDate(nextOpportunity, timeZone))} · ${text(localTime(nextOpportunity, timeZone))} · ${text(classifications[item.next24h?.classification || item.next48h?.classification] || '')}</p>` : ''}
      <p>${text(item.explanation || 'Sem dados suficientes para emitir justificativa.')}</p>
      <div class="gold-window-details"><span>${text(item.culture || 'Cultura não informada')}</span><span>${text(weatherSummary(item.metrics || {}))}</span></div>
      <div class="gold-window-factors">
        <div><strong>Fatores considerados</strong><ul>${listMarkup(factors) || '<li>Nenhum fator favorável identificado.</li>'}</ul></div>
        <div><strong>Riscos e restrições</strong><ul>${listMarkup(risks) || '<li>Nenhuma restrição configurada foi violada.</li>'}</ul></div>
      </div>
      <div class="gold-window-details">
        <span>Dados: ${text(item.source || quality.fonte || 'indisponíveis')}</span>
        <span>Atualizado: ${text(item.updated_at ? localDate(item.updated_at, timeZone) + ' ' + localTime(item.updated_at, timeZone) : 'sem coleta')}</span>
        <span>Confiança: ${text(quality.confianca_meteorologica || 'inconclusiva; sem probabilidade de sucesso')}</span>
      </div>
      ${item.operation === 'FITOSSANITARIA' && criteria.fonte_referencia ? `<p>Rótulo/bula: ${text(criteria.fonte_referencia)} · verificado em ${text(criteria.data_verificacao || 'data não informada')}. Confirme a vigência antes de aplicar.</p>` : ''}
      ${!item.weather_is_current ? '<p class="gold-stale-warning" role="status">Esta recomendação usa uma previsão anterior ou vencida. Atualize a previsão e reavalie antes de planejar.</p>' : ''}
      <div class="gold-window-actions">
        ${canPlan ? `<button type="button" class="btn-ghost" data-schedule="${recommendationId}">Adicionar ao calendário</button>` : ''}
        <details><summary>Registrar resultado</summary>
          <form class="gold-result-form" data-result-id="${recommendationId}">
            <label class="gold-field">Resultado<select class="form-input" name="status" required><option value="">Selecione</option><option value="REALIZADA">Realizada</option><option value="ADIADA">Adiada</option><option value="CANCELADA">Cancelada</option></select></label>
            <label class="gold-field">Data e hora realizada<input class="form-input" type="datetime-local" name="performed_at" /></label>
            <label class="gold-field">Temp. observada (°C)<input class="form-input" type="number" step="any" name="temperature_2m" /></label>
            <label class="gold-field">Chuva observada (mm)<input class="form-input" type="number" step="any" name="precipitation" /></label>
            <label class="gold-field">Vento observado (km/h)<input class="form-input" type="number" step="any" name="wind_speed_10m" /></label>
            <label class="gold-field">Relato do produtor<input class="form-input" type="text" name="reported_outcome" maxlength="1000" /></label>
            <button class="btn-primary" type="submit">Salvar resultado</button>
          </form>
        </details>
      </div>
    </article>`;
  }

  function filteredRecommendations() {
    const plot = document.getElementById('goldFilterPlot').value;
    const culture = document.getElementById('goldFilterCulture').value;
    const operation = document.getElementById('goldFilterOperation').value;
    const classification = document.getElementById('goldFilterClassification').value;
    const start = document.getElementById('goldFilterStart').value;
    const end = document.getElementById('goldFilterEnd').value;
    return recommendations.filter((item) => {
      const day = item.date || '';
      return (!plot || String(item.plot_id) === plot)
        && (!culture || item.culture === culture)
        && (!operation || item.operation === operation)
        && (!classification || item.classification === classification)
        && (!start || day >= start)
        && (!end || day <= end);
    });
  }

  function renderRecommendations() {
    const list = document.getElementById('goldResultList');
    if (!list) return;
    const items = filteredRecommendations();
    list.innerHTML = items.length
      ? items.map(recommendationMarkup).join('')
      : '<p class="gold-empty">Nenhuma recomendação corresponde aos filtros. Avalie uma operação para registrar novas janelas.</p>';
  }

  function renderActivities() {
    const list = document.getElementById('goldActivitiesList');
    if (!list) return;
    list.innerHTML = activities.length
      ? activities.map((item) => `<article class="gold-activity-item">
          <header><h3>${text(item.title)}</h3><span class="gold-classification">${text(item.status)}</span></header>
          <p>${text(item.date)}${item.start_time ? ` · ${text(item.start_time)}–${text(item.end_time || '')}` : ''} · ${text(item.plot_name || 'Fazenda')}</p>
        </article>`).join('')
      : '<p class="gold-empty">Não há atividades futuras no calendário compartilhado da fazenda.</p>';
  }

  function renderResultsHistory() {
    const list = document.getElementById('goldResultsHistory');
    if (!list) return;
    list.innerHTML = results.length
      ? results.map((item) => {
        const comparison = item.observed_conditions?.forecast_comparison || {};
        const details = Object.entries(comparison).map(([name, values]) => {
          const label = { temperature_2m: 'Temperatura', precipitation: 'Chuva', wind_speed_10m: 'Vento' }[name] || name;
          const forecast = values.forecast == null ? 'sem previsão' : `${values.forecast} ${values.unit}`;
          const observed = `${values.observed} ${values.unit}`;
          const difference = values.difference == null ? '' : ` · diferença ${values.difference > 0 ? '+' : ''}${values.difference} ${values.unit}`;
          return `${label}: previsto ${forecast}, observado pelo produtor ${observed}${difference}`;
        });
        const archiveButton = item.status === 'REALIZADA' && item.performed_at && item.plot_id
          ? `<button type="button" class="btn-ghost" data-history-weather data-plot-id="${Number(item.plot_id)}" data-date="${text(datePart(item.performed_at, item.timezone))}" data-result-id="${Number(item.id)}">Consultar reanálise histórica</button><div id="goldArchive${Number(item.id)}"></div>`
          : '';
        return `<article class="gold-activity-item">
          <header><h3>${text(item.plot_name || 'Talhão')} · ${text(labels[item.operation] || 'Operação')}</h3><span class="gold-classification">${text(item.status)}</span></header>
          <p>${item.performed_at ? `Realizado em ${text(localDate(item.performed_at))} ${text(localTime(item.performed_at))}` : 'Sem horário de execução informado'}</p>
          ${details.length ? `<p>${details.map(text).join('<br>')}</p>` : '<p>Não foram informadas medições meteorológicas observadas para comparação.</p>'}
          ${item.reported_outcome ? `<p>${text(item.reported_outcome)}</p>` : ''}
          <small>Condições registradas pelo produtor; comparação descritiva, não validação causal.</small>
          <div class="gold-window-actions">${archiveButton}</div>
        </article>`;
      }).join('')
      : '<p class="gold-empty">Ainda não há resultados registrados para as recomendações.</p>';
  }

  function populateSelectors(data) {
    plots = data.plots || [];
    const plotOptions = plots.map((plot) => `<option value="${Number(plot.id)}">${text(plot.name)}${plot.culture ? ` · ${text(plot.culture)}` : ''}</option>`).join('');
    document.getElementById('goldPlotSelect').innerHTML = `<option value="">Selecione um talhão</option>${plotOptions}`;
    document.getElementById('goldFilterPlot').innerHTML = `<option value="">Todos os talhões</option>${plotOptions}`;
    document.getElementById('calendarTalhaoSelect').innerHTML = plots.length
      ? plotOptions
      : '<option value="">Nenhum talhão cadastrado</option>';
    document.getElementById('calendarTalhaoSelect').disabled = plots.length === 0;
    const cultures = [...new Set(plots.map((plot) => plot.culture).filter(Boolean))].sort();
    document.getElementById('goldFilterCulture').innerHTML = '<option value="">Todas as culturas</option>' +
      cultures.map((culture) => `<option value="${text(culture)}">${text(culture)}</option>`).join('');
    document.getElementById('goldFilterOperation').innerHTML = '<option value="">Todas</option>' +
      (data.operations || []).map((operation) => `<option value="${text(operation.value)}">${text(operation.label)}</option>`).join('');
    const latestWeather = data.weather;
    const source = document.getElementById('goldWeatherSource');
    source.textContent = latestWeather?.fetched_at
      ? `${latestWeather.source} · atualizado ${localDate(latestWeather.fetched_at, latestWeather.timezone)} ${localTime(latestWeather.fetched_at, latestWeather.timezone)} · horizonte até 7 dias`
      : 'Previsão por talhão obtida sob demanda · Open-Meteo';
  }

  async function loadData() {
    const response = await window.apiRequest(api);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || `Falha ao carregar janelas (${response.status})`);
    populateSelectors(data);
    recommendations = data.recommendations || [];
    results = data.results || [];
    activities = data.activities || [];
    renderRecommendations();
    renderActivities();
    renderResultsHistory();
  }

  function buildResult(item) {
    const actual = {};
    ['temperature_2m', 'precipitation', 'wind_speed_10m'].forEach((name) => {
      const value = item.get(name);
      if (value !== null && value !== '') actual[name] = Number(value);
    });
    const performedAtValue = item.get('performed_at')?.value;
    const performedAt = performedAtValue ? new Date(performedAtValue).toISOString() : null;
    return {
      status: item.get('status').value,
      performed_at: performedAt,
      observed_conditions: actual,
      reported_outcome: item.get('reported_outcome').value.trim(),
    };
  }

  async function saveResult(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const payload = buildResult(new FormData(form));
      const response = await window.apiRequest(`/api/janelas-ouro/${Number(form.dataset.resultId)}/resultado/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Não foi possível registrar o resultado.');
      form.reset();
      await loadData();
      document.getElementById('goldFormMessage').textContent = 'Resultado do produtor salvo no histórico.';
    } catch (error) {
      document.getElementById('goldFormMessage').textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  async function scheduleRecommendation(button) {
    const item = recommendations.find((recommendation) => recommendation.id === Number(button.dataset.schedule));
    if (!item) return;
    const categories = {
      ADUBACAO: 'ADUBACAO',
      FITOSSANITARIA: 'PULVERIZACAO',
      PLANTIO: 'PLANTIO',
      MECANIZADA: 'MANEJO',
    };
    const timeZone = item.dataQuality?.fuso_horario;
    const startDate = datePart(item.windowStart, timeZone) || item.date;
    const endDate = datePart(item.windowEnd, timeZone);
    const payload = {
      title: `${labels[item.operation] || 'Operação'} · ${item.plot_name}`,
      description: item.explanation || '',
      date: startDate,
      start_time: localTime(item.windowStart, timeZone),
      end_time: endDate !== startDate ? '23:59' : localTime(item.windowEnd, timeZone),
      all_day: false,
      category: categories[item.operation] || 'TAREFA',
      status: 'PLANEJADA',
      priority: 'MEDIA',
      plot_id: item.plot_id,
      recommendation_id: item.id,
      notes: item.explanation || '',
    };
    try {
      const response = await window.apiRequest('/api/calendar/events/', { method: 'POST', body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Não foi possível adicionar ao calendário.');
      document.getElementById('goldFormMessage').textContent = 'Atividade adicionada ao calendário compartilhado da fazenda.';
      await loadData();
    } catch (error) {
      document.getElementById('goldFormMessage').textContent = error.message;
    }
  }

  async function loadHistoricalWeather(button) {
    const output = document.getElementById(`goldArchive${Number(button.dataset.resultId)}`);
    const parameters = new URLSearchParams({
      talhao_id: button.dataset.plotId,
      start: button.dataset.date,
      end: button.dataset.date,
    });
    button.disabled = true;
    if (output) output.textContent = 'Consultando a reanálise histórica…';
    try {
      const response = await window.apiRequest(`/api/weather/history/?${parameters}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Não foi possível consultar a reanálise histórica.');
      const day = data.daily || {};
      const times = day.time || [];
      const dayIndex = times.indexOf(button.dataset.date);
      const fields = [
        ['temperature_2m_min', '°C mínima'],
        ['temperature_2m_max', '°C máxima'],
        ['precipitation_sum', 'mm chuva'],
        ['wind_speed_10m_max', 'km/h vento máximo'],
        ['wind_gusts_10m_max', 'km/h rajada máxima'],
        ['et0_fao_evapotranspiration', 'mm ET₀'],
        ['shortwave_radiation_sum', 'MJ/m² radiação'],
      ];
      const values = fields.flatMap(([key, unit]) => {
        const value = Array.isArray(day[key]) ? day[key][dayIndex] : null;
        return value == null ? [] : [`${key}: ${value} ${unit}`];
      });
      if (output) {
        output.innerHTML = `<p>${text(data.data_kind)} · ${text(data.source)} · ${text(localDate(data.updated_at, data.timezone))}</p>` +
          `<p>${values.length ? values.map(text).join(' · ') : 'Sem valores diários disponíveis para esse período.'}</p>`;
      }
    } catch (error) {
      if (output) output.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function evaluate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedPlot()) {
      document.getElementById('goldFormMessage').textContent = 'Selecione um talhão antes de avaliar.';
      return;
    }
    const button = document.getElementById('goldEvaluateButton');
    const message = document.getElementById('goldFormMessage');
    button.disabled = true;
    message.textContent = 'Consultando a previsão compartilhada e avaliando as regras da operação…';
    try {
      const response = await window.apiRequest(api, {
        method: 'POST',
        body: JSON.stringify({
          operation: activeOperation,
          plot_id: Number(document.getElementById('goldPlotSelect').value),
          criteria: buildCriteria(),
          refresh_weather: document.getElementById('goldRefreshWeather').checked,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Não foi possível avaliar a operação.');
      document.getElementById('goldRefreshWeather').checked = false;
      await loadData();
      message.textContent = data.recommendations?.length
        ? `${data.recommendations.length} período(s) avaliado(s). O resultado descreve as regras e os dados disponíveis, não uma probabilidade de sucesso.`
        : 'Não foi possível encontrar um período no horizonte meteorológico.';
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  function refreshRecommendationFilters() {
    renderRecommendations();
  }

  document.querySelectorAll('[data-gold-tab]').forEach((button) => {
    button.addEventListener('click', () => setActiveOperation(button.dataset.goldTab));
  });
  document.getElementById('goldEvaluateForm')?.addEventListener('submit', evaluate);
  document.getElementById('goldResultList')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-schedule]');
    if (button) scheduleRecommendation(button);
  });
  document.getElementById('goldResultList')?.addEventListener('submit', (event) => {
    if (event.target.matches('[data-result-id]')) saveResult(event);
  });
  document.getElementById('goldResultsHistory')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-history-weather]');
    if (button) loadHistoricalWeather(button);
  });
  ['goldFilterPlot', 'goldFilterCulture', 'goldFilterOperation', 'goldFilterClassification', 'goldFilterStart', 'goldFilterEnd']
    .forEach((id) => document.getElementById(id)?.addEventListener('change', refreshRecommendationFilters));
  setActiveOperation(activeOperation);
  loadData().catch((error) => {
    document.getElementById('goldResultList').innerHTML = `<p class="gold-empty">${text(error.message)}</p>`;
    document.getElementById('goldActivitiesList').innerHTML = '<p class="gold-empty">Não foi possível carregar a agenda da fazenda.</p>';
    document.getElementById('goldResultsHistory').innerHTML = '<p class="gold-empty">Não foi possível carregar o histórico de resultados.</p>';
    document.getElementById('goldWeatherSource').textContent = 'Falha ao carregar dados meteorológicos e recomendações.';
  });
})();
