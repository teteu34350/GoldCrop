(() => {
  const form = document.getElementById('pesticideLabelForm');
  if (!form) return;

  const grid = document.getElementById('pesticideCalGrid');
  const monthLabel = document.getElementById('pesticideMonthLabel');
  const sourceLine = document.getElementById('pesticideSourceLine');
  const retryButton = document.getElementById('pesticideRetry');
  const emptyPanel = document.getElementById('pesticideDayPanelEmpty');
  const panelContent = document.getElementById('pesticideDayPanelContent');
  const selector = document.getElementById('calendarTalhaoSelect');
  const classifications = {
    favorable: { label: 'Favorável', className: 'green-day' },
    attention: { label: 'Atenção', className: 'yellow-day' },
    unfavorable: { label: 'Desfavorável', className: 'red-day' },
    insufficient: { label: 'Dados insuficientes', className: 'no-data' },
  };
  const metricLabels = {
    temperature_2m: 'Temperatura',
    relative_humidity_2m: 'Umidade relativa',
    precipitation_probability: 'Probabilidade de chuva',
    precipitation: 'Precipitação',
    wind_speed_10m: 'Vento',
    wind_gusts_10m: 'Rajadas',
  };
  const units = {
    temperature_2m: '°C',
    relative_humidity_2m: '%',
    precipitation_probability: '%',
    precipitation: 'mm',
    wind_speed_10m: 'km/h',
    wind_gusts_10m: 'km/h',
  };

  let analysis = null;
  let selectedDate = null;
  let calendarMonth = new Date();
  calendarMonth.setDate(1);
  let requestId = 0;
  let requestController = null;
  let weatherUpdateTimer = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function labelPayload() {
    const payload = {};
    new FormData(form).forEach((value, key) => {
      if (key === 'label_confirmed') {
        payload[key] = true;
      } else if (value !== '') {
        payload[key] = key === 'product' ? value.trim() : Number(value);
      }
    });
    payload.label_confirmed = form.elements.label_confirmed.checked;
    return payload;
  }

  function formatNumber(value, digits = 1) {
    return Number.isFinite(Number(value))
      ? Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits })
      : '—';
  }

  function formatTimestamp(value, options = {}) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Horário não disponível'
      : date.toLocaleString('pt-BR', options);
  }

  function statusText(classification) {
    return classifications[classification]?.label || classifications.insufficient.label;
  }

  function getDayMap() {
    const days = new Map((analysis?.days || []).map(day => [day.date, day]));
    const operations = analysis?.operations || {};
    [
      ['applications', operations.applications || []],
      ['planned', operations.planned || []],
    ].forEach(([key, items]) => {
      items.forEach(item => {
        const day = days.get(item.date) || {
          date: item.date,
          classification: 'insufficient',
          windows: [],
        };
        day[key] = [...(day[key] || []), item];
        days.set(item.date, day);
      });
    });
    return days;
  }

  function renderOperationMarkers(day) {
    const plannedCount = day?.planned?.length || 0;
    const applicationCount = day?.applications?.length || 0;
    const planned = Array.from({ length: Math.min(plannedCount, 3) }, () =>
      `<span class="cal-plan-marker" title="${plannedCount} defensivo(s) planejado(s)">P</span>`);
    const applications = Array.from({ length: Math.min(applicationCount, 3) }, () =>
      `<span class="cal-done-marker" title="${applicationCount} aplicação(ões) registrada(s)">R</span>`);
    return [...planned, ...applications].join('');
  }

  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    monthLabel.textContent = calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayMap = getDayMap();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    grid.replaceChildren();

    for (let index = 0; index < firstDay; index += 1) {
      const blank = document.createElement('div');
      blank.className = 'cal-day empty';
      blank.setAttribute('aria-hidden', 'true');
      grid.append(blank);
    }

    for (let number = 1; number <= daysInMonth; number += 1) {
      const date = new Date(year, month, number);
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(number).padStart(2, '0')}`;
      const day = dayMap.get(dateKey);
      const classification = day?.classification || 'insufficient';
      const status = classifications[classification] || classifications.insufficient;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cal-day ${status.className}${date.getTime() === today.getTime() ? ' today' : ''}${selectedDate === dateKey ? ' selected' : ''}`;
      button.setAttribute('aria-label', `${date.toLocaleDateString('pt-BR')}: ${status.label}`);
      const favorable = day?.windows?.find(window => window.classification === 'favorable');
      const firstWindow = day?.windows?.[0];
      const representative = favorable || firstWindow;
      const operationMarkers = renderOperationMarkers(day);
      button.innerHTML = `
        <span class="cal-day-num">${number}</span>
        <span class="cal-day-iea">${escapeHtml(status.label)}</span>
        ${representative ? `<span class="cal-day-window">${escapeHtml(formatTimestamp(representative.start, { hour: '2-digit', minute: '2-digit' }))}</span>` : '<span class="cal-day-tag">sem dados</span>'}
        ${operationMarkers ? `<div class="cal-day-markers">${operationMarkers}</div>` : ''}`;
      button.addEventListener('click', () => {
        selectedDate = dateKey;
        renderCalendar();
        renderDayPanel(dayMap.get(dateKey) || null, dateKey);
      });
      grid.append(button);
    }
  }

  function renderMetrics(metrics) {
    return Object.entries(metricLabels).map(([key, label]) => {
      const value = metrics?.[key];
      return `<div class="pesticide-metric"><span>${label}</span><strong>${formatNumber(value)} ${units[key]}</strong></div>`;
    }).join('');
  }

  function renderMessages(title, messages, className) {
    if (!messages?.length) return '';
    return `<div class="pesticide-window-notes ${className}"><strong>${title}</strong><ul>${messages.map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul></div>`;
  }

  function renderOperations(day) {
    const applications = (day.applications || []).map(item => ({
      label: 'Aplicação registrada',
      item,
      time: item.time,
    }));
    const planned = (day.planned || []).map(item => ({
      label: 'Defensivo planejado',
      item,
      time: item.start && item.end ? `${item.start}–${item.end}` : item.start,
    }));
    const operations = [...planned, ...applications];
    if (!operations.length) return '';
    return `
      <div class="pesticide-window-notes">
        <strong>Registros deste talhão</strong>
        <ul>${operations.map(({ label, item, time }) => `
          <li>${label}: ${escapeHtml(item.product)} · ${escapeHtml(item.status)}${time ? ` · ${escapeHtml(time)}` : ''}</li>
        `).join('')}</ul>
      </div>`;
  }

  function renderDayPanel(day, dateKey) {
    emptyPanel.style.display = 'none';
    panelContent.style.display = 'block';
    if (!day) {
      panelContent.innerHTML = `
        <div class="pesticide-detail-heading">
          <span class="calendar-eyebrow">${escapeHtml(dateKey)}</span>
          <h3>Dados insuficientes</h3>
        </div>
        <p class="pesticide-detail-copy">Este dia está fora do horizonte horário disponível ou não tem dados meteorológicos completos.</p>`;
      return;
    }

    const dayClass = classifications[day.classification] || classifications.insufficient;
    panelContent.innerHTML = `
      <div class="pesticide-detail-heading">
        <span class="calendar-eyebrow">${escapeHtml(dateKey)}</span>
        <h3>${escapeHtml(statusText(day.classification))}</h3>
      </div>
      <div class="pesticide-hour-list">
      ${(day.windows || []).map(window => {
          const status = classifications[window.classification] || classifications.insufficient;
          return `
            <article class="pesticide-hour ${status.className}">
              <div class="pesticide-hour-heading">
                <strong>${escapeHtml(formatTimestamp(window.start, { hour: '2-digit', minute: '2-digit' }))}–${escapeHtml(formatTimestamp(window.end, { hour: '2-digit', minute: '2-digit' }))}</strong>
                <span>${escapeHtml(status.label)}</span>
              </div>
              <div class="pesticide-metrics">${renderMetrics(window.metrics)}</div>
              ${renderMessages('Fatores favoráveis', window.favorable_factors, 'is-favorable')}
              ${renderMessages('Riscos', window.risks, 'is-risk')}
              ${renderMessages('Restrições', window.restrictions, 'is-restriction')}
              ${renderMessages('Dados ausentes', window.missing, 'is-missing')}
            </article>`;
        }).join('')}
      </div>
      ${dayClass.className === 'no-data' && !day.windows?.length ? '<p class="pesticide-detail-copy">Nenhum horário deste dia teve dados suficientes para avaliação.</p>' : ''}
      ${renderOperations(day)}`;
  }

  function renderSource(result) {
    if (!result?.fetched_at) {
      sourceLine.textContent = result?.message || 'Previsão meteorológica ainda não disponível.';
      return;
    }
    const age = Number.isFinite(result.age_minutes) ? ` · atualização há ${result.age_minutes} min` : '';
    const quality = result.confidence === 'high'
      ? 'dados completos no período'
      : result.confidence === 'limited'
        ? 'dados parciais'
        : 'dados insuficientes';
    const next = result.next_opportunity
      ? ` · próxima janela favorável: ${formatTimestamp(result.next_opportunity.start)}`
      : '';
    const context = [result.message, ...(result.missing || []).slice(0, 3)].filter(Boolean).join(' ');
    sourceLine.textContent = `${result.source || 'Open-Meteo'} · atualizado ${formatTimestamp(result.fetched_at)}${age} · ${result.timezone || 'fuso não informado'} · ${quality}${next}${context ? ` · ${context}` : ''}`;
  }

  function applyAnalysis(result) {
    analysis = result;
    renderSource(result);
    if (result.forecast_start) {
      const start = new Date(result.forecast_start);
      if (!Number.isNaN(start.getTime())) calendarMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    }
    renderCalendar();

    const preferred = result.next_opportunity?.date || result.days?.[0]?.date;
    if (preferred) {
      selectedDate = preferred;
      const selectedDay = result.days.find(day => day.date === preferred);
      renderCalendar();
      renderDayPanel(selectedDay || null, preferred);
    } else {
      selectedDate = null;
      emptyPanel.style.display = 'flex';
      panelContent.style.display = 'none';
    }
  }

  window.openPesticideApplication = () => {
    if (typeof window.openRegistrar !== 'function') return;
    window.openRegistrar();
    const product = document.getElementById('formProduto');
    const type = document.getElementById('formTipo');
    const date = document.getElementById('formData');
    if (product && form.elements.product.value.trim()) product.value = form.elements.product.value.trim();
    if (type) type.value = 'Defensivo';
    if (date && selectedDate) date.value = selectedDate;
  };

  async function analyze() {
    const id = ++requestId;
    const talhaoId = Number(selector.value);
    requestController?.abort();
    requestController = new AbortController();
    retryButton.hidden = true;
    grid.setAttribute('aria-busy', 'true');
    grid.classList.add('is-stale');
    panelContent.classList.add('is-stale');
    sourceLine.textContent = 'Atualizando a previsão fitossanitária; os resultados visíveis são da análise anterior.';
    if (!Number.isInteger(talhaoId) || talhaoId <= 0) {
      applyAnalysis({
        classification: 'insufficient',
        message: 'Cadastre ou selecione um talhão com previsão meteorológica.',
      });
      grid.removeAttribute('aria-busy');
      grid.classList.remove('is-stale');
      panelContent.classList.remove('is-stale');
      return;
    }
    if (analysis?.talhao_id && analysis.talhao_id !== talhaoId) {
      analysis = null;
      selectedDate = null;
      grid.replaceChildren();
      renderCalendar();
      emptyPanel.style.display = 'flex';
      panelContent.style.display = 'none';
    }
    if (!form.elements.product.value.trim() || !form.elements.label_confirmed.checked) {
      sourceLine.textContent = 'Previsão meteorológica disponível. Informe o produto e confirme a consulta à bula/rótulo para analisar.';
      grid.removeAttribute('aria-busy');
      grid.classList.remove('is-stale');
      panelContent.classList.remove('is-stale');
      return;
    }

    try {
      const response = await fetch('/api/pesticide-recommendations/', {
        method: 'POST',
        credentials: 'same-origin',
        signal: requestController.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': document.querySelector('meta[name="csrf-token"]')?.content || '',
        },
        body: JSON.stringify({
          talhao_id: talhaoId,
          product_label: labelPayload(),
        }),
      });
      const result = await response.json();
      if (id !== requestId) return;
      if (!response.ok) throw new Error(result.message || `Falha ao analisar: ${response.status}`);
      applyAnalysis(result);
      grid.removeAttribute('aria-busy');
      grid.classList.remove('is-stale');
      panelContent.classList.remove('is-stale');
      const weatherMessages = [
        ...(result.missing || []),
        ...(result.windows || []).flatMap(window => window.missing || []),
      ];
      const incompleteWeather = result.weather_refreshable !== false && (
        result.weather_complete !== true
        || weatherMessages.some(message =>
          /^(previs|horários|fetched_at|timezone|temperatura|umidade relativa|probabilidade de chuva|precipitação|velocidade do vento|rajadas de vento)/i.test(message)
        )
      );
      retryButton.hidden = !incompleteWeather;
    } catch (error) {
      if (id !== requestId || error.name === 'AbortError') return;
      sourceLine.textContent = `${error.message || 'Não foi possível calcular as janelas.'} A previsão anterior, se exibida, não foi atualizada.`;
      grid.removeAttribute('aria-busy');
      grid.classList.add('is-stale');
      panelContent.classList.add('is-stale');
      retryButton.hidden = false;
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    analyze();
  });
  window.addEventListener('goldcrop:weather-updated', event => {
    const updatedTalhaoId = Number(event.detail?.talhaoId);
    if (!updatedTalhaoId || updatedTalhaoId !== Number(selector.value)) return;
    window.clearTimeout(weatherUpdateTimer);
    weatherUpdateTimer = window.setTimeout(analyze, 100);
  });
  retryButton.addEventListener('click', () => {
    const talhaoId = Number(selector.value);
    if (!Number.isInteger(talhaoId) || talhaoId <= 0) {
      sourceLine.textContent = 'Selecione um talhão válido antes de atualizar a previsão.';
      return;
    }
    retryButton.hidden = true;
    sourceLine.textContent = 'Solicitando atualização da previsão meteorológica...';
    window.dispatchEvent(new CustomEvent('goldcrop:weather-refresh-requested', {
      detail: { talhaoId },
    }));
  });
  document.getElementById('pesticidePrev').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
    if (selectedDate) renderDayPanel(getDayMap().get(selectedDate) || null, selectedDate);
  });
  document.getElementById('pesticideNext').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
    if (selectedDate) renderDayPanel(getDayMap().get(selectedDate) || null, selectedDate);
  });

  renderCalendar();
})();
