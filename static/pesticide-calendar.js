(() => {
  const selector = document.getElementById('calendarTalhaoSelect');
  if (!selector) return;

  const sourceLine = document.getElementById('pesticideSourceLine');
  const retryButton = document.getElementById('pesticideRetry');
  const windowsContainer = document.getElementById('pesticideWindows');
  const dailyContainer = document.getElementById('pesticideDailyForecast');
  const timelineContainer = document.getElementById('pesticideTimeline');
  const currentCondition = document.getElementById('pesticideCurrentCondition');
  const updatedAt = document.getElementById('pesticideUpdatedAt');
  const classifications = {
    favorable: { label: 'Favorável', className: 'is-favorable' },
    attention: { label: 'Atenção', className: 'is-attention' },
    unfavorable: { label: 'Desfavorável', className: 'is-unfavorable' },
    insufficient: { label: 'Dados insuficientes', className: 'is-insufficient' },
  };
  const metrics = [
    ['temperature_2m', 'Temperatura', '°C'],
    ['relative_humidity_2m', 'Umidade', '%'],
    ['wind_speed_10m', 'Vento', 'km/h'],
    ['wind_gusts_10m', 'Rajadas', 'km/h'],
    ['precipitation_probability', 'Prob. chuva', '%'],
    ['precipitation', 'Chuva', 'mm'],
  ];
  const weatherCodes = {
    0: 'Céu limpo', 1: 'Pouco nublado', 2: 'Parcialmente nublado', 3: 'Nublado',
    45: 'Neblina', 48: 'Neblina', 51: 'Garoa', 53: 'Garoa', 55: 'Garoa forte',
    61: 'Chuva fraca', 63: 'Chuva moderada', 65: 'Chuva forte', 80: 'Pancadas de chuva',
    81: 'Pancadas de chuva', 82: 'Pancadas fortes', 95: 'Trovoada',
    96: 'Trovoada com granizo', 99: 'Trovoada com granizo',
  };
  let requestId = 0;
  let requestController = null;
  let weatherUpdateTimer = null;
  let selectedWindowDate = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function number(value, digits = 1) {
    const parsed = value === null || value === undefined || value === '' ? null : Number(value);
    return Number.isFinite(parsed)
      ? parsed.toLocaleString('pt-BR', { maximumFractionDigits: digits })
      : '—';
  }

  function formatDate(value, timezone, options) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Horário não disponível';
    try {
      return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, ...options }).format(date);
    } catch (error) {
      console.warn('Fuso horário meteorológico inválido:', error);
      return new Intl.DateTimeFormat('pt-BR', options).format(date);
    }
  }

  function metricValue(hour, key, unit) {
    const value = hour?.metrics?.[key];
    return value === null || value === undefined ? '—' : `${number(value)} ${unit}`;
  }

  function numericValues(hours, key) {
    return (hours || [])
      .map(hour => hour.metrics?.[key])
      .filter(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)))
      .map(Number);
  }

  function renderMetricList(hour) {
    return metrics.map(([key, label, unit]) => `
      <div class="pesticide-timeline-metric">
        <span>${label}</span><strong>${escapeHtml(metricValue(hour, key, unit))}</strong>
      </div>`).join('');
  }

  function setSummary(weather, result) {
    const current = weather?.current?.values || {};
    const hourly = weather?.hourly?.values || {};
    const timezone = result.timezone || weather?.location?.timezone || 'UTC';
    const code = current.weather_code;
    currentCondition.textContent = weatherCodes[code] || 'Condição não informada';
    updatedAt.textContent = `Previsão atualizada em ${formatDate(result.fetched_at, timezone, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })}`;
    document.getElementById('pesticideTemperature').textContent = `${number(current.temperature_2m)} °C`;
    document.getElementById('pesticideFeelsLike').textContent = current.apparent_temperature == null
      ? 'Sensação térmica indisponível'
      : `Sensação ${number(current.apparent_temperature)} °C`;
    document.getElementById('pesticideHumidity').textContent = current.relative_humidity_2m == null
      ? '—'
      : `${number(current.relative_humidity_2m, 0)}%`;
    document.getElementById('pesticideWind').textContent =
      `${number(current.wind_speed_10m)} / ${number(current.wind_gusts_10m)} km/h`;

    const probabilities = (hourly.precipitation_probability || [])
      .slice(0, 24).map(value => Number(value)).filter(Number.isFinite);
    const probability = probabilities.length ? Math.max(...probabilities) : null;
    const precipitation = (weather?.daily?.values?.precipitation_sum || [])[0];
    document.getElementById('pesticideRain').textContent =
      `${number(probability, 0)}% de prob. · ${number(precipitation)} mm`;
    document.getElementById('pesticideRainDaily').textContent = 'probabilidade nas próximas 24h · volume diário previsto';
  }

  function renderDailyForecast(weather) {
    const daily = weather?.daily || {};
    const dates = daily.timestamps || [];
    const values = daily.values || {};
    if (!dates.length) {
      dailyContainer.innerHTML = '<p class="pesticide-empty">Previsão diária indisponível para este talhão.</p>';
      return;
    }
    dailyContainer.innerHTML = dates.map((date, index) => {
      const midday = new Date(`${date}T12:00:00Z`);
      const dateLabel = Number.isNaN(midday.getTime())
        ? date
        : new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short',
        }).format(midday);
      const code = values.weather_code?.[index];
      return `
        <article class="pesticide-daily-card">
          <strong>${escapeHtml(dateLabel)}</strong>
          <span class="pesticide-daily-condition">${escapeHtml(weatherCodes[code] || 'Condição não informada')}</span>
          <span class="pesticide-daily-temperature">${number(values.temperature_2m_min?.[index])}–${number(values.temperature_2m_max?.[index])} °C</span>
          <span>Chuva: ${number(values.precipitation_probability_max?.[index], 0)}% · ${number(values.precipitation_sum?.[index])} mm</span>
          <span>Rajadas máx.: ${number(values.wind_gusts_10m_max?.[index])} km/h</span>
        </article>`;
    }).join('');
  }

  function renderWindow(window, timezone) {
    const status = classifications[window.classification] || classifications.insufficient;
    const first = window.hours?.[0];
    const last = window.hours?.[window.hours.length - 1];
    const temperatureValues = numericValues(window.hours, 'temperature_2m');
    const windValues = numericValues(window.hours, 'wind_speed_10m');
    const rainProbabilities = numericValues(window.hours, 'precipitation_probability');
    const temperatureRange = temperatureValues.length
      ? `${number(Math.min(...temperatureValues))}–${number(Math.max(...temperatureValues))} °C`
      : '—';
    const start = formatDate(window.start, timezone, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const end = formatDate(window.end, timezone, { hour: '2-digit', minute: '2-digit' });
    const reasons = (window.reasons || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
    const alerts = (window.alerts || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
    return `
      <article class="pesticide-window-card ${status.className}${selectedWindowDate === window.date && window.classification === 'favorable' ? ' is-selected' : ''}">
        <div class="pesticide-window-card-heading">
          <span class="pesticide-window-badge">${status.label}</span>
          <span>${window.duration_hours}h</span>
        </div>
        <h3>${escapeHtml(start)} – ${escapeHtml(end)}</h3>
        <div class="pesticide-window-conditions">
          <span>Temperatura<strong>${temperatureRange}</strong></span>
          <span>Vento máx.<strong>${number(windValues.length ? Math.max(...windValues) : null)} km/h</strong></span>
          <span>Chuva máx.<strong>${number(rainProbabilities.length ? Math.max(...rainProbabilities) : null, 0)}%</strong></span>
        </div>
        ${reasons ? `<div class="pesticide-window-reasons"><strong>Motivos</strong><ul>${reasons}</ul></div>` : ''}
        ${alerts ? `<div class="pesticide-window-alerts"><strong>Alertas</strong><ul>${alerts}</ul></div>` : ''}
        ${window.missing?.length ? `<div class="pesticide-window-alerts"><strong>Dados ausentes</strong><ul>${window.missing.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
        ${first && last ? `<button type="button" class="pesticide-window-select" data-window-date="${escapeHtml(window.date)}" data-window-start="${escapeHtml(window.start)}">Ver no horário</button>` : ''}
      </article>`;
  }

  function renderWindows(result) {
    const timezone = result.timezone || 'UTC';
    const windows = result.windows || [];
    const favorableWindows = windows.filter(window => window.classification === 'favorable');
    selectedWindowDate = favorableWindows[0]?.date || null;
    if (!windows.length || !favorableWindows.length) {
      const emptyMessage = result.message || 'Nenhuma janela favorável com duração mínima foi encontrada.';
      windowsContainer.innerHTML = `<p class="pesticide-empty">${escapeHtml(emptyMessage)} Consulte os horários de atenção e os alertas antes de planejar.</p>`;
    }
    if (windows.length) {
      windowsContainer.insertAdjacentHTML('beforeend', windows.map(window => renderWindow(window, timezone)).join(''));
    }
    windowsContainer.querySelectorAll('[data-window-date]').forEach(button => {
      button.addEventListener('click', () => {
        const date = button.dataset.windowDate;
        selectedWindowDate = date;
        windowsContainer.querySelectorAll('.pesticide-window-card.is-selected')
          .forEach(card => card.classList.remove('is-selected'));
        button.closest('.pesticide-window-card')?.classList.add('is-selected');
        const item = (result.hours || []).find(hour => hour.start === button.dataset.windowStart);
        if (!item) return;
        const timelineItem = document.getElementById(`pesticide-hour-${(result.hours || []).indexOf(item)}`);
        timelineItem?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      });
    });
  }

  function renderTimeline(result) {
    const hours = result.hours || [];
    if (!hours.length) {
      timelineContainer.innerHTML = '<p class="pesticide-empty">Previsão horária indisponível para exibir.</p>';
      return;
    }
    const timezone = result.timezone || 'UTC';
    timelineContainer.innerHTML = hours.map((hour, index) => {
      const status = classifications[hour.classification] || classifications.insufficient;
      const code = hour.metrics.weather_code;
      const condition = weatherCodes[code] || '';
      return `
        <article id="pesticide-hour-${index}" class="pesticide-timeline-hour ${status.className}">
          <div class="pesticide-timeline-time">
            <strong>${escapeHtml(formatDate(hour.start, timezone, { hour: '2-digit', minute: '2-digit' }))}</strong>
            <span>${escapeHtml(formatDate(hour.start, timezone, { weekday: 'short', day: '2-digit', month: 'short' }))}</span>
          </div>
          <span class="pesticide-timeline-status">${status.label}</span>
          ${condition ? `<span class="pesticide-timeline-condition">${escapeHtml(condition)}</span>` : ''}
          <div class="pesticide-timeline-metrics">${renderMetricList(hour)}</div>
          ${(hour.alerts || []).length ? `<p class="pesticide-timeline-alert">${escapeHtml(hour.alerts.join(' '))}</p>` : ''}
          ${(hour.missing || []).length ? `<p class="pesticide-timeline-alert">${escapeHtml(`Dados insuficientes: ${hour.missing.join(', ')}`)}</p>` : ''}
        </article>`;
    }).join('');
  }

  function showNoForecast(message, refreshable) {
    sourceLine.textContent = message;
    retryButton.hidden = !refreshable;
    currentCondition.textContent = 'Previsão indisponível';
    updatedAt.textContent = '';
    ['pesticideTemperature', 'pesticideHumidity', 'pesticideWind', 'pesticideRain'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
    document.getElementById('pesticideFeelsLike').textContent = '';
    document.getElementById('pesticideRainDaily').textContent = '';
    windowsContainer.innerHTML = `<p class="pesticide-empty">${escapeHtml(message)}</p>`;
    dailyContainer.innerHTML = `<p class="pesticide-empty">${escapeHtml(message)}</p>`;
    timelineContainer.innerHTML = `<p class="pesticide-empty">${escapeHtml(message)}</p>`;
  }

  async function analyze() {
    const id = ++requestId;
    const talhaoId = Number(selector.value);
    requestController?.abort();
    requestController = new AbortController();
    retryButton.hidden = true;
    if (!Number.isInteger(talhaoId) || talhaoId <= 0) {
      showNoForecast('Selecione um talhão cadastrado para consultar a previsão.', false);
      return;
    }
    sourceLine.textContent = 'Analisando a previsão horária do talhão...';
    windowsContainer.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`/api/pesticide-recommendations/?talhao_id=${encodeURIComponent(talhaoId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: requestController.signal,
      });
      const result = await response.json();
      if (id !== requestId) return;
      if (!response.ok) throw new Error(result.message || `Falha ao consultar a previsão (HTTP ${response.status}).`);
      if (result.talhao_id !== talhaoId) return;
      if (result.weather) {
        setSummary(result.weather, result);
        renderWindows(result);
        renderDailyForecast(result.weather);
        renderTimeline(result);
        const quality = result.confidence === 'high' ? 'dados meteorológicos completos' : 'dados meteorológicos parciais';
        sourceLine.textContent = `${result.talhao} · ${result.source || 'Previsão meteorológica'} · atualizada ${updatedAt.textContent.replace('Previsão atualizada em ', '')} · ${quality}`;
        retryButton.hidden = Boolean(result.weather_complete) || !result.weather_refreshable;
      } else {
        showNoForecast(result.message || 'Previsão meteorológica ainda não disponível para este talhão.', result.weather_refreshable);
      }
    } catch (error) {
      if (id !== requestId || error.name === 'AbortError') return;
      console.error('Falha ao analisar a previsão fitossanitária:', error);
      showNoForecast(`${error.message || 'Não foi possível carregar a análise meteorológica.'} Tente novamente.`, true);
    } finally {
      if (id === requestId) windowsContainer.removeAttribute('aria-busy');
    }
  }

  window.openPesticideApplication = () => {
    if (typeof window.openRegistrar !== 'function') return;
    window.openRegistrar(Number(selector.value) || undefined);
    const type = document.getElementById('formTipo');
    const date = document.getElementById('formData');
    if (type) type.value = 'Defensivo';
    if (date && selectedWindowDate) date.value = selectedWindowDate;
  };

  selector.addEventListener('change', () => {
    selectedWindowDate = null;
    showNoForecast('Carregando previsão do talhão selecionado...', false);
  });
  window.addEventListener('goldcrop:weather-updated', event => {
    const updatedTalhaoId = Number(event.detail?.talhaoId);
    if ((!updatedTalhaoId && !selector.value) || updatedTalhaoId === Number(selector.value)) {
      window.clearTimeout(weatherUpdateTimer);
      weatherUpdateTimer = window.setTimeout(analyze, 100);
    }
  });
  retryButton.addEventListener('click', () => {
    const talhaoId = Number(selector.value);
    if (!Number.isInteger(talhaoId) || talhaoId <= 0) return;
    retryButton.hidden = true;
    sourceLine.textContent = 'Atualizando a previsão meteorológica...';
    window.dispatchEvent(new CustomEvent('goldcrop:weather-refresh-requested', { detail: { talhaoId } }));
  });

  renderTimeline({});
})();
