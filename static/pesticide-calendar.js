(() => {
  const selector = document.getElementById('calendarTalhaoSelect');
  if (!selector) return;

  const byId = id => document.getElementById(id);
  const sourceLine = byId('pesticideSourceLine');
  const currentCondition = byId('pesticideCurrentCondition');
  const retryButton = byId('pesticideRetry');
  const calendarGrid = byId('pesticideCalendarGrid');
  const monthLabel = byId('pesticideMonthLabel');
  const emptyPanel = byId('pesticideDayPanelEmpty');
  const detailPanel = byId('pesticideDayPanelContent');
  const windowsContainer = byId('pesticideWindows');
  const dailyContainer = byId('pesticideDailyForecast');
  const hoursContainer = byId('pesticideTimeline');
  const classifications = {
    favorable: { label: 'Favorável', icon: '✓', className: 'is-favorable' },
    attention: { label: 'Atenção', icon: '!', className: 'is-attention' },
    unfavorable: { label: 'Desfavorável', icon: '×', className: 'is-unfavorable' },
    insufficient: { label: 'Dados insuficientes', icon: '?', className: 'is-insufficient' },
  };
  const metrics = [
    ['temperature_2m', 'Temperatura', '°C'],
    ['relative_humidity_2m', 'Umidade relativa', '%'],
    ['wind_speed_10m', 'Vento médio', 'km/h'],
    ['wind_gusts_10m', 'Rajadas', 'km/h'],
    ['precipitation_probability', 'Prob. chuva', '%'],
    ['precipitation', 'Precipitação', 'mm'],
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
  let resultData = null;
  let weatherData = null;
  let timezone = 'UTC';
  let selectedDate = null;
  let displayedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function number(value, digits = 1) {
    const parsed = value === null || value === undefined || value === '' ? null : Number(value);
    return Number.isFinite(parsed)
      ? parsed.toLocaleString('pt-BR', { maximumFractionDigits: digits })
      : '—';
  }

  function formatDate(value, zone, options) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Horário não disponível';
    try {
      return new Intl.DateTimeFormat('pt-BR', { timeZone: zone, ...options }).format(date);
    } catch (error) {
      console.warn('Fuso horário meteorológico inválido:', error);
      return new Intl.DateTimeFormat('pt-BR', options).format(date);
    }
  }

  function dateInTimezone(value, zone) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(date);
      const part = type => parts.find(item => item.type === type)?.value || '';
      return `${part('year')}-${part('month')}-${part('day')}`;
    } catch (error) {
      console.warn('Fuso horário meteorológico inválido:', error);
      return date.toISOString().slice(0, 10);
    }
  }

  function dateLabel(value, options = {}) {
    const date = new Date(`${value}T12:00:00Z`);
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...options }).format(date);
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
    const current = weather?.current?.values || weather?.current || {};
    const hourly = weather?.hourly?.values || {};
    timezone = result.timezone || weather?.location?.timezone || 'UTC';
    currentCondition.textContent = weatherCodes[current.weather_code] || 'Condição não informada';
    byId('pesticideUpdatedAt').textContent = `Previsão atualizada em ${formatDate(result.fetched_at, timezone, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })}`;
    byId('pesticideTemperature').textContent = current.temperature_2m == null ? '—' : `${number(current.temperature_2m)} °C`;
    byId('pesticideFeelsLike').textContent = current.apparent_temperature == null
      ? 'Sensação térmica indisponível'
      : `Sensação ${number(current.apparent_temperature)} °C`;
    byId('pesticideHumidity').textContent = current.relative_humidity_2m == null
      ? '—'
      : `${number(current.relative_humidity_2m, 0)}%`;
    byId('pesticideWind').textContent =
      `${number(current.wind_speed_10m)} / ${number(current.wind_gusts_10m)} km/h`;

    const probabilities = (hourly.precipitation_probability || [])
      .slice(0, 24).map(Number).filter(Number.isFinite);
    const probability = probabilities.length ? Math.max(...probabilities) : null;
    const precipitation = (weather?.daily?.values?.precipitation_sum || [])[0];
    byId('pesticideRain').textContent =
      `${probability == null ? '—' : `${number(probability, 0)}%`} · ${precipitation == null ? '—' : `${number(precipitation)} mm`}`;
    byId('pesticideRainDaily').textContent = 'probabilidade máxima · volume diário previsto';
  }

  function hoursForDate(data, date) {
    return (data?.hours || [])
      .filter(hour => (hour.date || dateInTimezone(hour.start, data.timezone || timezone)) === date)
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  function groupHours(hours) {
    const groups = [];
    hours.forEach(hour => {
      const classification = classifications[hour.classification] ? hour.classification : 'insufficient';
      const previous = groups[groups.length - 1];
      if (
        previous
        && previous.classification === classification
        && previous.hours[previous.hours.length - 1].end === hour.start
      ) {
        previous.hours.push(hour);
      } else {
        groups.push({ classification, hours: [hour] });
      }
    });
    return groups.map(group => ({
      ...group,
      date: group.hours[0].date,
      start: group.hours[0].start,
      end: group.hours[group.hours.length - 1].end,
      duration_hours: group.hours.length,
      alerts: [...new Set(group.hours.flatMap(hour => hour.alerts || []))],
      reasons: [...new Set(group.hours.flatMap(hour => hour.reasons || []))],
      missing: [...new Set(group.hours.flatMap(hour => hour.missing || []))],
    }));
  }

  function windowsForDate(data, date) {
    return groupHours(hoursForDate(data, date));
  }

  function summarizeDay(data, date) {
    const windows = windowsForDate(data, date);
    if (!windows.length) {
      return {
        classification: 'insufficient', windows, favorableHours: 0,
        overview: 'Não há dados horários suficientes para classificar esta data.',
      };
    }

    const favorable = windows.filter(window => window.classification === 'favorable');
    const attention = windows.filter(window => window.classification === 'attention');
    const unfavorable = windows.filter(window => window.classification === 'unfavorable');
    const insufficient = windows.filter(window => window.classification === 'insufficient');
    const favorableHours = favorable.reduce((total, window) => total + window.duration_hours, 0);
    let classification;
    if (favorable.length && unfavorable.length) classification = 'attention';
    else if (unfavorable.length) classification = 'unfavorable';
    else if (!favorable.length && !attention.length && insufficient.length) classification = 'insufficient';
    else if (attention.length || insufficient.length || favorableHours < (Number(data.minimum_window_hours) || 2)) classification = 'attention';
    else classification = 'favorable';

    const parts = [];
    if (favorable.length) parts.push(`${favorable.length} ${favorable.length === 1 ? 'período favorável' : 'períodos favoráveis'}`);
    if (attention.length) parts.push(`${attention.length} ${attention.length === 1 ? 'período em atenção' : 'períodos em atenção'}`);
    if (unfavorable.length) parts.push(`${unfavorable.length} ${unfavorable.length === 1 ? 'período desfavorável' : 'períodos desfavoráveis'}`);
    if (insufficient.length) parts.push(`${insufficient.length} ${insufficient.length === 1 ? 'período com dados insuficientes' : 'períodos com dados insuficientes'}`);
    const overview = parts.length
      ? `A previsão inclui ${parts.join(', ')}. Consulte cada horário: as condições podem variar ao longo do dia.`
      : 'A previsão não contém períodos classificáveis para esta data.';
    return { classification, windows, favorableHours, overview };
  }

  function renderCalendar() {
    if (!calendarGrid || !monthLabel) return;
    monthLabel.textContent = new Intl.DateTimeFormat('pt-BR', {
      month: 'long', year: 'numeric',
    }).format(displayedMonth);
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();
    const today = dateInTimezone(new Date().toISOString(), timezone);
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    calendarGrid.innerHTML = '';

    for (let empty = 0; empty < firstWeekday; empty += 1) {
      const placeholder = document.createElement('span');
      placeholder.className = 'cal-day empty';
      placeholder.setAttribute('aria-hidden', 'true');
      calendarGrid.appendChild(placeholder);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const summary = resultData ? summarizeDay(resultData, date) : {
        classification: 'insufficient', windows: [], favorableHours: 0,
        overview: 'A previsão desta data não está disponível.',
      };
      const status = classifications[summary.classification] || classifications.insufficient;
      const isPast = date < today;
      const isToday = date === today;
      const best = summary.windows.find(window => window.classification === 'favorable');
      const time = best
        ? `${formatDate(best.start, timezone, { hour: '2-digit', minute: '2-digit' })}–${formatDate(best.end, timezone, { hour: '2-digit', minute: '2-digit' })}`
        : '';
      const label = isPast ? 'Período passado' : status.label;
      const button = document.createElement(isPast ? 'div' : 'button');
      button.className = [
        'cal-day', 'pesticide-calendar-day', isPast ? 'past' : status.className,
        isToday ? 'today' : '', selectedDate === date ? 'selected' : '',
      ].filter(Boolean).join(' ');
      if (!isPast) {
        button.type = 'button';
        button.dataset.date = date;
        button.setAttribute('aria-pressed', String(selectedDate === date));
        button.setAttribute('aria-label', `${dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${label}`);
      } else {
        button.setAttribute('aria-label', `${dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })}: período passado`);
        button.setAttribute('aria-disabled', 'true');
      }
      button.innerHTML = `
        <span class="cal-day-num">${day}</span>
        <span class="pesticide-day-indicator" aria-hidden="true">${isPast ? '—' : status.icon}</span>
        <span class="pesticide-day-label">${isPast ? 'Passado' : status.label}</span>
        ${time && !isPast ? `<span class="pesticide-day-window">${escapeHtml(time)}</span>` : ''}`;
      if (!isPast) {
        button.addEventListener('click', () => selectDate(date, true));
      }
      calendarGrid.appendChild(button);
    }
  }

  function selectDate(date, shouldScroll = false) {
    selectedDate = date;
    renderCalendar();
    renderDayDetails(date);
    if (shouldScroll && window.matchMedia('(max-width: 900px)').matches) {
      byId('pesticideDayPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderDailyForecast(weather, date) {
    const daily = weather?.daily || {};
    const dates = daily.timestamps || [];
    const index = dates.indexOf(date);
    if (index < 0) {
      dailyContainer.innerHTML = '<p class="pesticide-empty">Resumo diário indisponível para esta data.</p>';
      return;
    }
    const values = daily.values || {};
    const code = values.weather_code?.[index];
    const min = values.temperature_2m_min?.[index];
    const max = values.temperature_2m_max?.[index];
    const rainProbability = values.precipitation_probability_max?.[index];
    const rainVolume = values.precipitation_sum?.[index];
    const gusts = values.wind_gusts_10m_max?.[index];
    dailyContainer.innerHTML = `
      <article class="pesticide-daily-card">
        <strong>${escapeHtml(dateLabel(date, { weekday: 'long', day: '2-digit', month: 'long' }))}</strong>
        <span class="pesticide-daily-condition">${escapeHtml(weatherCodes[code] || 'Condição não informada')}</span>
        <span class="pesticide-daily-temperature">${min == null || max == null ? 'Temperatura indisponível' : `${number(min)}–${number(max)} °C`}</span>
        <span>Chuva: ${rainProbability == null ? '—' : `${number(rainProbability, 0)}%`} · ${rainVolume == null ? '—' : `${number(rainVolume)} mm`}</span>
        <span>Rajadas máximas: ${gusts == null ? '—' : `${number(gusts)} km/h`}</span>
      </article>`;
  }

  function renderWindow(window) {
    const status = classifications[window.classification] || classifications.insufficient;
    const temps = numericValues(window.hours, 'temperature_2m');
    const humidity = numericValues(window.hours, 'relative_humidity_2m');
    const winds = numericValues(window.hours, 'wind_speed_10m');
    const gusts = numericValues(window.hours, 'wind_gusts_10m');
    const probabilities = numericValues(window.hours, 'precipitation_probability');
    const rainfall = numericValues(window.hours, 'precipitation');
    const start = formatDate(window.start, timezone, { hour: '2-digit', minute: '2-digit' });
    const end = formatDate(window.end, timezone, { hour: '2-digit', minute: '2-digit' });
    const reasons = (window.reasons || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
    const alerts = (window.alerts || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
    const missing = (window.missing || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
    return `
      <article class="pesticide-window-card ${status.className}">
        <div class="pesticide-window-card-heading">
          <span class="pesticide-window-badge"><span aria-hidden="true">${status.icon}</span> ${status.label}</span>
          <span>${window.duration_hours}h</span>
        </div>
        <h4>${escapeHtml(start)}–${escapeHtml(end)}</h4>
        <div class="pesticide-window-conditions">
          <span>Temperatura<strong>${temps.length ? `${number(Math.min(...temps))}–${number(Math.max(...temps))} °C` : '—'}</strong></span>
          <span>Umidade<strong>${humidity.length ? `${number(Math.min(...humidity), 0)}–${number(Math.max(...humidity), 0)}%` : '—'}</strong></span>
          <span>Vento médio máx.<strong>${number(winds.length ? Math.max(...winds) : null)} km/h</strong></span>
          <span>Rajadas máx.<strong>${number(gusts.length ? Math.max(...gusts) : null)} km/h</strong></span>
          <span>Prob. chuva máx.<strong>${probabilities.length ? `${number(Math.max(...probabilities), 0)}%` : '—'}</strong></span>
          <span>Precipitação<strong>${rainfall.length ? `${number(rainfall.reduce((sum, value) => sum + value, 0))} mm` : '—'}</strong></span>
        </div>
        ${reasons ? `<div class="pesticide-window-reasons"><strong>Por que recebeu esta classificação</strong><ul>${reasons}</ul></div>` : ''}
        ${alerts ? `<div class="pesticide-window-alerts"><strong>Alertas</strong><ul>${alerts}</ul></div>` : ''}
        ${missing ? `<div class="pesticide-window-alerts"><strong>Dados ausentes</strong><ul>${missing}</ul></div>` : ''}
      </article>`;
  }

  function renderWindows(date, windows) {
    if (!windows.length) {
      const message = resultData?.message || 'Não há janelas horárias disponíveis para esta data.';
      windowsContainer.innerHTML = `<p class="pesticide-empty">${escapeHtml(message)}</p>`;
      return;
    }
    windowsContainer.innerHTML = windows.map(renderWindow).join('');
  }

  function renderHours(date, hours) {
    if (!hours.length) {
      hoursContainer.innerHTML = '<p class="pesticide-empty">Não há horários previstos para esta data. Consulte a atualização da previsão ou selecione outro dia.</p>';
      return;
    }
    hoursContainer.innerHTML = hours.map((hour, index) => {
      const status = classifications[hour.classification] || classifications.insufficient;
      const condition = weatherCodes[hour.metrics?.weather_code] || '';
      const alerts = (hour.alerts || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
      const missing = (hour.missing || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
      return `
        <article class="pesticide-timeline-hour ${status.className}">
          <div class="pesticide-timeline-time">
            <strong>${escapeHtml(formatDate(hour.start, timezone, { hour: '2-digit', minute: '2-digit' }))}</strong>
            <span>${index + 1}º período</span>
          </div>
          <span class="pesticide-timeline-status"><span aria-hidden="true">${status.icon}</span> ${status.label}</span>
          ${condition ? `<span class="pesticide-timeline-condition">${escapeHtml(condition)}</span>` : ''}
          <div class="pesticide-timeline-metrics">${renderMetricList(hour)}</div>
          ${alerts ? `<p class="pesticide-timeline-alert">${alerts}</p>` : ''}
          ${missing ? `<p class="pesticide-timeline-alert">Dados insuficientes: ${missing}</p>` : ''}
        </article>`;
    }).join('');
  }

  function renderDayDetails(date) {
    emptyPanel.hidden = true;
    detailPanel.hidden = false;
    const heading = byId('pesticideSelectedDate');
    const statusElement = byId('pesticideDayStatus');
    heading.textContent = dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    if (!resultData || !weatherData) {
      statusElement.className = 'pesticide-day-status is-insufficient';
      statusElement.textContent = 'Dados insuficientes';
      byId('pesticideDayOverview').textContent = sourceLine.textContent || 'Previsão indisponível para esta data.';
      byId('pesticideBestWindow').hidden = true;
      dailyContainer.innerHTML = '<p class="pesticide-empty">Resumo diário indisponível.</p>';
      windowsContainer.innerHTML = '<p class="pesticide-empty">Não há previsão meteorológica disponível para esta data.</p>';
      hoursContainer.innerHTML = '<p class="pesticide-empty">Atualize a previsão ou selecione outro dia com dados.</p>';
      return;
    }

    const summary = summarizeDay(resultData, date);
    const hours = hoursForDate(resultData, date);
    statusElement.className = `pesticide-day-status ${classifications[summary.classification].className}`;
    statusElement.textContent = classifications[summary.classification].label;
    byId('pesticideDayOverview').textContent = summary.overview;
    const best = summary.windows.find(window => window.classification === 'favorable');
    const bestElement = byId('pesticideBestWindow');
    if (best) {
      bestElement.hidden = false;
      bestElement.textContent = `Melhor período identificado: ${formatDate(best.start, timezone, { hour: '2-digit', minute: '2-digit' })}–${formatDate(best.end, timezone, { hour: '2-digit', minute: '2-digit' })}. Confirme as condições reais e a bula antes de decidir.`;
    } else {
      bestElement.hidden = false;
      bestElement.textContent = summary.classification === 'insufficient'
        ? 'Não foi possível identificar uma janela: faltam dados horários confiáveis.'
        : 'Nenhum período favorável com duração mínima foi identificado nesta data.';
    }
    renderDailyForecast(weatherData, date);
    renderWindows(date, summary.windows);
    renderHours(date, hours);
  }

  function showNoForecast(message, refreshable) {
    resultData = null;
    weatherData = null;
    sourceLine.textContent = message;
    retryButton.hidden = !refreshable;
    byId('pesticideCurrentCondition').textContent = 'Previsão indisponível';
    byId('pesticideUpdatedAt').textContent = '';
    ['pesticideTemperature', 'pesticideHumidity', 'pesticideWind', 'pesticideRain'].forEach(id => {
      byId(id).textContent = '—';
    });
    byId('pesticideFeelsLike').textContent = '';
    byId('pesticideRainDaily').textContent = '';
    renderCalendar();
    if (selectedDate) renderDayDetails(selectedDate);
    else {
      emptyPanel.hidden = false;
      detailPanel.hidden = true;
    }
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
    calendarGrid.setAttribute('aria-busy', 'true');
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
      if (result.weather && Array.isArray(result.hours) && result.hours.length) {
        resultData = result;
        weatherData = result.weather;
        timezone = result.timezone || result.weather?.location?.timezone || 'UTC';
        setSummary(result.weather, result);
        const quality = result.confidence === 'high' ? 'dados meteorológicos completos' : 'dados meteorológicos parciais';
        sourceLine.textContent = `${result.talhao} · ${result.source || 'Previsão meteorológica'} · ${byId('pesticideUpdatedAt').textContent.replace('Previsão atualizada em ', '')} · ${quality}`;
        retryButton.hidden = Boolean(result.weather_complete) || !result.weather_refreshable;
      } else {
        showNoForecast(
          result.message || 'Não há horários futuros válidos para analisar neste talhão.',
          result.weather_refreshable,
        );
      }
      renderCalendar();
      if (selectedDate) renderDayDetails(selectedDate);
    } catch (error) {
      if (id !== requestId || error.name === 'AbortError') return;
      console.error('Falha ao analisar a previsão fitossanitária:', error);
      showNoForecast(`${error.message || 'Não foi possível carregar a análise meteorológica.'} Tente novamente.`, true);
    } finally {
      if (id === requestId) calendarGrid.removeAttribute('aria-busy');
    }
  }

  window.openPesticideApplication = () => {
    if (typeof window.openRegistrar !== 'function') return;
    window.openRegistrar(Number(selector.value) || undefined);
    const type = byId('formTipo');
    const date = byId('formData');
    if (type) type.value = 'Defensivo';
    if (date && selectedDate) date.value = selectedDate;
  };

  selector.addEventListener('change', () => {
    selectedDate = null;
    showNoForecast('Carregando previsão do talhão selecionado...', false);
  });
  byId('pesticidePrev').addEventListener('click', () => {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
    selectedDate = null;
    renderCalendar();
    emptyPanel.hidden = false;
    detailPanel.hidden = true;
  });
  byId('pesticideNext').addEventListener('click', () => {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
    selectedDate = null;
    renderCalendar();
    emptyPanel.hidden = false;
    detailPanel.hidden = true;
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

  renderCalendar();
})();
