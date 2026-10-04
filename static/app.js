/* ===================================================
  GoldCrop — Application Logic (Django data + UI)
   =================================================== */

'use strict';

// =====================================================
const FARM = { name: '', owner: '', culture: '', area: 0, talhoes: 0, sensors: 0 };
const TEAM_DATA = [];
const ACTIVITY_DATA = [];
const INVITATIONS_DATA = [];
const TALHOES_DATA = [];
const HISTORICO_DATA = [];
const CAL_DATA = {};

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

async function apiRequest(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken(), ...(options.headers || {}) };
  return fetch(url, { credentials: 'same-origin', ...options, headers });
}

async function loadFarmTeamData() {
  const response = await apiRequest('/api/farms/team/');
  if (!response.ok) throw new Error(`Team request failed: ${response.status}`);
  const data = await response.json();
  TEAM_DATA.splice(0, TEAM_DATA.length, ...(data.members || []));
  INVITATIONS_DATA.splice(0, INVITATIONS_DATA.length, ...(data.invitations || []));
}

async function loadNotifications() {
  const response = await apiRequest('/api/notifications/');
  if (!response.ok) throw new Error(`Notifications request failed: ${response.status}`);
  const data = await response.json();
  ACTIVITY_DATA.splice(0, ACTIVITY_DATA.length, ...(data.notifications || []));
  renderNotifications(data.notifications || [], data.unread_count || 0);
}

function renderNotifications(notifications, unreadCount) {
  const badge = document.getElementById('notifBadge');
  const count = document.getElementById('notificationCount');
  const list = document.getElementById('notificationList');
  if (badge) {
    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    badge.hidden = unreadCount === 0;
  }
  const dashboardCount = document.getElementById('dashboardNotifCount');
  if (dashboardCount) dashboardCount.textContent = String(unreadCount);
  if (count) count.textContent = `${unreadCount} não lida${unreadCount === 1 ? '' : 's'}`;
  if (!list) return;
  list.innerHTML = notifications.length
    ? notifications.map(item => `
      <article class="notification-item${item.read ? '' : ' unread'}">
        <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p>
        <small>${escapeHtml(item.actor || '')} · ${new Date(item.created_at).toLocaleString('pt-BR')}</small></div>
        ${item.read ? '' : `<button type="button" aria-label="Marcar ${escapeHtml(item.title)} como lida" onclick="markNotificationRead(${Number(item.id)})">Marcar como lida</button>`}
      </article>`).join('')
    : '<p class="notification-empty">Nenhuma notificação registrada para esta fazenda.</p>';
}

async function toggleNotifications(event) {
  event?.stopPropagation();
  const panel = document.getElementById('notificationPanel');
  const button = document.getElementById('notifBtn');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  button?.setAttribute('aria-expanded', String(!panel.hidden));
  if (panel.hidden) return;
  try {
    await loadNotifications();
  } catch (error) {
    console.error('Falha ao atualizar notificações:', error);
    const list = document.getElementById('notificationList');
    if (list) list.innerHTML = '<p class="notification-empty">Não foi possível carregar as notificações. Tente novamente.</p>';
  }
}

async function refreshLiveData() {
  try {
    await Promise.all([loadFarmTeamData(), loadNotifications()]);
  } catch (error) {
    console.error('Falha ao carregar equipe e notificações:', error);
    const list = document.getElementById('notificationList');
    if (list) list.innerHTML = '<p class="notification-empty">Não foi possível carregar as informações. Tente novamente.</p>';
    showToast('Não foi possível carregar equipe e notificações do servidor.', 'error');
  }
}

async function markNotificationRead(notificationId) {
  try {
    const response = await apiRequest(`/api/notifications/${notificationId}/read/`, { method: 'POST', body: '{}' });
    if (!response.ok) throw new Error(`Notification update failed: ${response.status}`);
    await loadNotifications();
  } catch (error) {
    console.error('Falha ao marcar notificação como lida:', error);
    showToast('Não foi possível atualizar a notificação.', 'error');
  }
}

let DATA_SOURCE = 'empty';
let APPLICATIONS_FROM_DB = [];
let PLANNINGS_FROM_DB = [];
const talhaoLocationPickers = new Map();
let weatherRequestId = 0;

function clearCalendarData() {
  Object.keys(CAL_DATA).forEach(date => delete CAL_DATA[date]);
}

async function loadDatabaseState() {
  try {
    const response = await apiRequest('/api/state/');
    if (!response.ok) throw new Error(`Database state request failed: ${response.status}`);
    const state = await response.json();
    if (!state.farm) {
      DATA_SOURCE = 'empty';
      Object.assign(FARM, { name: '', owner: '', area: 0, talhoes: 0, culture: '', sensors: 0 });
      FARM.permissions = {};
      USER_DATA.farm = 'Sem fazenda cadastrada';
      USER_DATA.role = '';
      TALHOES_DATA.splice(0, TALHOES_DATA.length);
      HISTORICO_DATA.splice(0, HISTORICO_DATA.length);
      APPLICATIONS_FROM_DB = [];
      PLANNINGS_FROM_DB = [];
      clearCalendarData();
      selectedTalhaoRefId = null;
      localStorage.removeItem('goldcrop.selectedTalhaoId');
      window.GOLDCROP_WEATHER = null;
      window.GOLDCROP_RECOMMENDATIONS = { recommendations: [], bestRecommendation: null };
      return;
    }
    if (!Array.isArray(state.talhoes) || !Array.isArray(state.applications) || !Array.isArray(state.planejamentos)) {
      throw new Error('The database state response is incomplete.');
    }
    DATA_SOURCE = 'database';
    Object.assign(FARM, state.farm, { talhoes: state.talhoes.length });
    USER_DATA.farm = FARM.name;
    USER_DATA.role = state.farm.role_label || '';
    clearCalendarData();
    TALHOES_DATA.splice(0, TALHOES_DATA.length, ...state.talhoes.map(item => {
      const recommendations = (item.recommendations || [])
        .filter(recommendation => recommendation.decision !== 'INSUFFICIENT_DATA');
      const bestRecommendation = recommendations.reduce(
        (best, recommendation) => !best || recommendation.adequacyIndex > best.adequacyIndex ? recommendation : best,
        null
      );
      return {
        ...item,
        variety: item.variety || '',
        age: item.age ? `${item.age} anos` : '',
        soil: item.soil || 'Não informado',
        sensor: item.sensor || 'Não disponível',
        temp: bestRecommendation?.metrics?.temperature ?? null,
        iea: bestRecommendation?.adequacyIndex ?? null,
        status: bestRecommendation ? (bestRecommendation.adequacyIndex >= 80 ? 'favorable' : bestRecommendation.adequacyIndex >= 60 ? 'moderate' : 'unfavorable') : 'insufficient',
        window: bestRecommendation ? `${formatRecommendationDate(bestRecommendation.date)} · ${formatRecommendationTime(bestRecommendation)}` : '',
        recommendations,
        analysis: { recommendations, bestRecommendation },
        weather: item.weather || null,
        product: '',
        inputType: '',
        dose: '',
        period: '',
        rain: bestRecommendation?.metrics?.rainVolume ?? null,
        futureMoisture: null,
        mapX: 8,
        mapY: 8,
        mapW: 18,
        mapH: 22,
      };
    }));
    const storedTalhaoId = Number(localStorage.getItem('goldcrop.selectedTalhaoId'));
    if (!TALHOES_DATA.some(item => item.id === Number(selectedTalhaoRefId))) {
      selectedTalhaoRefId = TALHOES_DATA.some(item => item.id === storedTalhaoId)
        ? storedTalhaoId
        : TALHOES_DATA[0]?.id ?? null;
    }
    if (selectedTalhaoRefId === null) localStorage.removeItem('goldcrop.selectedTalhaoId');
    else localStorage.setItem('goldcrop.selectedTalhaoId', String(selectedTalhaoRefId));
    APPLICATIONS_FROM_DB = state.applications;
    PLANNINGS_FROM_DB = state.planejamentos;
    HISTORICO_DATA.splice(0, HISTORICO_DATA.length, ...state.applications.map(item => ({
      ...item,
      resultClass: item.status === 'done' ? 'done' : 'skipped',
      cond: item.status === 'done' ? 'Favorável' : 'Pendente',
      condClass: 'favorable',
    })));
    seedSelectedCalendarOperations();
    const selectedTalhao = TALHOES_DATA.find(item => item.id === selectedTalhaoRefId);
    const recommendations = selectedTalhao?.recommendations || [];
    window.GOLDCROP_RECOMMENDATIONS = {
      engine: 'GoldCropAnalysisEngine',
      recommendations,
      bestRecommendation: recommendations.reduce((best, item) => !best || item.adequacyIndex > best.adequacyIndex ? item : best, null),
    };
    if (selectedTalhao) {
      selectedTalhao.analysis = window.GOLDCROP_RECOMMENDATIONS;
    }
    syncCalendarTalhaoSelector();
    updateSystemFromAnalysis();
  } catch (error) {
    console.warn('Dados do banco indisponíveis:', error);
    DATA_SOURCE = 'error';
    Object.assign(FARM, { name: '', owner: '', area: 0, talhoes: 0, culture: '', sensors: 0 });
    FARM.permissions = {};
    USER_DATA.farm = 'Sem fazenda cadastrada';
    USER_DATA.role = '';
    TALHOES_DATA.splice(0, TALHOES_DATA.length);
    HISTORICO_DATA.splice(0, HISTORICO_DATA.length);
    APPLICATIONS_FROM_DB = [];
    PLANNINGS_FROM_DB = [];
    clearCalendarData();
    selectedTalhaoRefId = null;
    localStorage.removeItem('goldcrop.selectedTalhaoId');
    window.GOLDCROP_WEATHER = null;
    window.GOLDCROP_RECOMMENDATIONS = { recommendations: [], bestRecommendation: null };
    syncCalendarTalhaoSelector();
    showToast('Não foi possível carregar os dados da fazenda. Atualize a página ou tente novamente.', 'error');
  }
}

async function renderDashboard() {
  const firstName = USER_DATA.name.split(' ')[0];
  document.getElementById('dashboardGreeting').innerHTML = `Bom dia, ${firstName} <span class="wave">👋</span>`;

  // Current date
  const today = new Date();
  const dateStr = today.toLocaleDateString('pt-BR', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('dashboardCurrentDate').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  // Farm info
  document.getElementById('dashboardFarmName').textContent = FARM.name || '—';
  const selectedTalhao = getSelectedReferenceTalhao();
  const subtitle = document.getElementById('dashboardSubtitle');
  if (subtitle) {
    subtitle.textContent = DATA_SOURCE === 'error'
      ? 'Não foi possível carregar os dados da fazenda'
      : selectedTalhao
        ? `Análise individual do ${selectedTalhao.name}`
        : 'Cadastre um talhão para iniciar a análise';
  }

  // KPIs
  document.getElementById('kpiAreaValue').textContent = FARM.area ? FARM.area.toFixed(1) : '—';
  document.getElementById('kpiTalhoesValue').textContent = FARM.talhoes || '—';
  document.getElementById('kpiApplicationsValue').textContent = HISTORICO_DATA.length || '—';

  // Get analytics data
  try {
    const analyticsResponse = await apiRequest('/api/analytics/');
    if (analyticsResponse.ok) {
      const analytics = await analyticsResponse.json();
      const avgIea = analytics.iea?.average || 0;
      document.getElementById('kpiIEAAvgValue').textContent = avgIea > 0 ? avgIea.toFixed(0) : '—';
    }
  } catch (e) {
    console.warn('Analytics unavailable', e);
  }

  // Golden Window
  const bestRec = window.GOLDCROP_RECOMMENDATIONS?.bestRecommendation;
  if (bestRec) {
    const [year, month, day] = bestRec.date.split('-');
    const dateDisplay = `${day}/${month}/${year}`;
    document.getElementById('gwDateBig').textContent = dateDisplay;

    const startTime = bestRec.windowStart.slice(11, 16);
    const endTime = bestRec.windowEnd.slice(11, 16);
    document.getElementById('gwTimeBig').textContent = `${startTime} — ${endTime}`;
    document.getElementById('gwIEAValue').textContent = bestRec.adequacyIndex || '—';

    // Update ring circle stroke
    const iea = bestRec.adequacyIndex || 0;
    const circumference = Math.PI * 80; // 2 * PI * r (r=40)
    const offset = circumference * (1 - iea / 100);
    const ringCircle = document.getElementById('ringCircle');
    if (ringCircle) {
      ringCircle.style.strokeDashoffset = offset;
    }

    // Metrics
    const metrics = bestRec.metricas || bestRec.metrics || {};
    document.getElementById('gwRainValue').textContent = metrics.rainVolume ? `${metrics.rainVolume.toFixed(1)} mm` : '—';
    document.getElementById('gwTempValue').textContent = metrics.temperature ? `${metrics.temperature.toFixed(1)}°C` : '—';
    document.getElementById('gwWindValue').textContent = metrics.windSpeed ? `${metrics.windSpeed.toFixed(1)} km/h` : '—';

    // Insight
    const insight = bestRec.explanation || `Condições favoráveis com adequação de ${bestRec.adequacyIndex}%.`;
    document.getElementById('gwInsightText').textContent = insight;
  } else {
    document.getElementById('gwDateBig').textContent = 'Sem janela';
    document.getElementById('gwTimeBig').textContent = '—';
    document.getElementById('gwIEAValue').textContent = '—';
    document.getElementById('gwRainValue').textContent = '—';
    document.getElementById('gwTempValue').textContent = '—';
    document.getElementById('gwWindValue').textContent = '—';
    document.getElementById('gwInsightText').textContent = 'Aguardando dados meteorológicos para análise.';
  }

  // Talhões
  renderDashboardTalhoes();

  // Weather
  if (window.GOLDCROP_WEATHER) {
    const current = window.GOLDCROP_WEATHER.current.values;
    const temp = current.temperature_2m?.toFixed(1) || '—';
    document.getElementById('weatherTemp').textContent = `${temp}°C`;

    const condition = WEATHER_CODES[current.weather_code] || 'Condição desconhecida';
    document.getElementById('weatherCondition').textContent = condition;
  }

  // Applications stats
  document.getElementById('appTotal').textContent = HISTORICO_DATA.length;
  const executed = HISTORICO_DATA.filter(a => a.resultClass === 'done').length;
  document.getElementById('appExecuted').textContent = executed;
  document.getElementById('appInWindow').textContent = '—';
  const successRate = HISTORICO_DATA.length > 0 ? ((executed / HISTORICO_DATA.length) * 100).toFixed(0) : '—';
  document.getElementById('appSuccessRate').textContent = successRate + '%';

}

function renderDashboardTalhoes() {
  const grid = document.getElementById('talhoesGrid');
  if (!grid) return;

  if (TALHOES_DATA.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum talhão cadastrado</div>';
    return;
  }

  grid.innerHTML = TALHOES_DATA.slice(0, 6).map(talhao => `
    <div class="talhao-card talhao-status-${talhao.status || 'insufficient'}" role="button" tabindex="0" data-talhao-id="${talhao.id}">
      <div class="talhao-card-header">
        <div>
          <div class="talhao-card-title">${talhao.name || '—'}</div>
          <div class="talhao-card-meta">${talhao.culture || '—'}</div>
        </div>
        <span class="talhao-status-badge ${talhao.status || 'insufficient'}">
          <span class="status-dot"></span>
          ${talhaoStatusPresentation(talhao).label}
        </span>
      </div>
      <div class="talhao-card-body">
        <div class="talhao-metric">
          <span class="talhao-metric-label">IEA</span>
          <span class="talhao-metric-value">${Number.isFinite(talhao.iea) ? `${talhao.iea}%` : '—'}</span>
        </div>
        <div class="talhao-metric">
          <span class="talhao-metric-label">Área</span>
          <span class="talhao-metric-value">${talhao.area ? talhao.area.toFixed(1) : '—'} ha</span>
        </div>
      </div>
    </div>
  `).join('');
  grid.querySelectorAll('[data-talhao-id]').forEach(card => {
    const chooseTalhao = () => selectTalhao(card.dataset.talhaoId);
    card.addEventListener('click', chooseTalhao);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        chooseTalhao();
      }
    });
  });
}

async function syncAllViewsFromServer() {
  await loadDatabaseState();
  syncCalendarTalhaoSelector();
  const reference = getSelectedReferenceTalhao();
  if (reference) {
    await loadLocalWeather(reference.id);
  }
  await refreshLiveData();
  syncCalendarTalhaoSelector();
  if (document.getElementById('calGrid')) renderCalendar();
  if (document.getElementById('mapContainer')) renderTalhoes();
  if (document.getElementById('fazendaContent')) renderFazenda();
  if (document.getElementById('historicoTable')) renderHistorico();
  if (document.getElementById('aplicacoesContent')) renderAplicacoes();
  if (document.getElementById('page-dashboard')) await renderDashboard();
  if (document.getElementById('settingsContent')) renderSettings();
  updateProfileDOM();
}

// =====================================================
// APP STATE
// =====================================================

let currentPage = 'dashboard';
let selectedCalDay = null;
let calMonth = new Date();
calMonth.setDate(1);
let chartsInitialized = {};
let sidebarOpen = false;
let talhoesMap = null;
let talhaoMapLayers = new Map();
let focusedTalhaoMapId = null;
let selectedTalhaoRefId = null;
let activeTalhaoFilter = 'all';

function getUsableTalhoes() {
  return TALHOES_DATA.filter(t => Number.isFinite(t.latitude) && Number.isFinite(t.longitude));
}

function getSelectedReferenceTalhao() {
  const fromState = TALHOES_DATA.find(t => t.id === selectedTalhaoRefId);
  if (fromState) return fromState;
  const storedId = Number(localStorage.getItem('goldcrop.selectedTalhaoId'));
  const storedTalhao = TALHOES_DATA.find(t => t.id === storedId);
  if (storedTalhao) {
    selectedTalhaoRefId = storedTalhao.id;
    return storedTalhao;
  }
  const firstTalhao = TALHOES_DATA[0] || null;
  selectedTalhaoRefId = firstTalhao?.id ?? null;
  return firstTalhao;
}

function syncCalendarTalhaoSelector() {
  const selected = getSelectedReferenceTalhao();
  ['calendarTalhaoSelect', 'dashboardTalhaoSelect', 'talhaoSelect'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    if (!TALHOES_DATA.length) {
      select.disabled = true;
      select.innerHTML = '<option value="">Nenhum talhão cadastrado</option>';
      return;
    }
    select.disabled = false;
    select.innerHTML = TALHOES_DATA.map(t => {
      const location = Number.isFinite(t.latitude) && Number.isFinite(t.longitude) ? '' : ' · aguardando coordenadas';
      return `<option value="${t.id}" ${t.id === selected?.id ? 'selected' : ''}>${t.name}${location}</option>`;
    }).join('');
  });
  const summary = document.getElementById('talhoesFarmSummary');
  if (summary) {
    const sourceLabel = DATA_SOURCE === 'database'
      ? 'Dados cadastrados'
      : DATA_SOURCE === 'error'
        ? 'Falha ao carregar dados'
        : 'Nenhum dado cadastrado';
    const fullSummary = document.createElement('span');
    fullSummary.className = 'talhoes-summary-desktop';
    fullSummary.textContent = `${FARM.name || 'Sem fazenda'} · ${FARM.area ? `${FARM.area} ha` : 'área não informada'} · ${TALHOES_DATA.length} talhões · ${sourceLabel}`;
    const compactSummary = document.createElement('span');
    compactSummary.className = 'talhoes-summary-mobile';
    compactSummary.textContent = `${TALHOES_DATA.length} ${TALHOES_DATA.length === 1 ? 'talhão' : 'talhões'} na fazenda`;
    summary.replaceChildren(fullSummary, compactSummary);
  }
  const state = document.getElementById('talhaoAnalysisState');
  if (state) {
    const hasCoordinates = selected && Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude);
    state.textContent = !selected
      ? 'Cadastre um talhão para iniciar'
      : !hasCoordinates
        ? 'Dados insuficientes para análise: cadastre latitude e longitude'
        : selected.analysis?.bestRecommendation
          ? `Análise de ${selected.name} · IEA ${selected.analysis.bestRecommendation.adequacyIndex}%`
          : selected.weather
            ? `Dados insuficientes para análise individual de ${selected.name}`
            : `Aguardando análise individual de ${selected.name}`;
  }
}

const WEATHER_CODES = {
  0: 'Céu limpo', 1: 'Pouco nublado', 2: 'Parcialmente nublado', 3: 'Nublado',
  45: 'Neblina', 48: 'Neblina', 51: 'Garoa', 53: 'Garoa', 55: 'Garoa forte',
  61: 'Chuva fraca', 63: 'Chuva moderada', 65: 'Chuva forte', 80: 'Pancadas de chuva',
  81: 'Pancadas de chuva', 82: 'Pancadas fortes', 95: 'Trovoada', 96: 'Trovoada com granizo', 99: 'Trovoada com granizo',
};

const SENSOR_HUMIDITY_LOCKED = 'Bloqueado';

// Open-Meteo Forecast API data dictionary. These names and units are stable
// storage candidates for future weather_observations and weather_forecasts tables.
const OPEN_METEO_DATA_DICTIONARY = {
  temperature_2m: { unit: '°C', purpose: 'Temperature stress and product absorption.' },
  relative_humidity_2m: { unit: '%', purpose: 'Humidity conditions and evaporation risk.' },
  precipitation: { unit: 'mm', purpose: 'Total water volume in the preceding interval.' },
  precipitation_probability: { unit: '%', purpose: 'Probability of precipitation during the application window.' },
  rain: { unit: 'mm', purpose: 'Large-scale rain risk during application.' },
  showers: { unit: 'mm', purpose: 'Convective shower risk during application.' },
  wind_speed_10m: { unit: 'km/h', purpose: 'Wind suitability and spray drift risk.' },
  wind_gusts_10m: { unit: 'km/h', purpose: 'Peak wind and short-term drift risk.' },
  dew_point_2m: { unit: '°C', purpose: 'Leaf wetness and condensation risk.' },
  cloud_cover: { unit: '%', purpose: 'Cloudiness and radiation attenuation.' },
  shortwave_radiation: { unit: 'W/m²', purpose: 'Solar energy and foliar drying conditions.' },
  et0_fao_evapotranspiration: { unit: 'mm', purpose: 'Reference water demand and drying rate.' },
  weather_code: { unit: 'WMO code', purpose: 'Standardized weather condition classification.' },
  temperature_2m_max: { unit: '°C', purpose: 'Daily maximum heat stress.' },
  temperature_2m_mean: { unit: '°C', purpose: 'Daily thermal baseline for the analysis window.' },
  temperature_2m_min: { unit: '°C', purpose: 'Daily minimum temperature and condensation context.' },
  precipitation_sum: { unit: 'mm', purpose: 'Daily accumulated water volume.' },
  rain_sum: { unit: 'mm', purpose: 'Daily accumulated large-scale rain.' },
  showers_sum: { unit: 'mm', purpose: 'Daily accumulated convective showers.' },
  precipitation_probability_max: { unit: '%', purpose: 'Daily maximum precipitation risk.' },
  wind_speed_10m_max: { unit: 'km/h', purpose: 'Daily maximum wind exposure.' },
  wind_gusts_10m_max: { unit: 'km/h', purpose: 'Daily maximum gust exposure.' },
  shortwave_radiation_sum: { unit: 'MJ/m²', purpose: 'Daily solar energy available for drying and plant response.' },
  soil_moisture_0_to_1cm: { unit: 'm³/m³', purpose: 'Surface soil water context, separate from IoT sensors.' },
  soil_moisture_1_to_3cm: { unit: 'm³/m³', purpose: 'Shallow soil water context, separate from IoT sensors.' },
  soil_moisture_3_to_9cm: { unit: 'm³/m³', purpose: 'Root-zone entry soil water context, separate from IoT sensors.' },
  soil_moisture_9_to_27cm: { unit: 'm³/m³', purpose: 'Root-zone soil water context, separate from IoT sensors.' },
  soil_moisture_27_to_81cm: { unit: 'm³/m³', purpose: 'Deep soil water context, separate from IoT sensors.' },
};

const OPEN_METEO_VARIABLES = {
  current: [
    'temperature_2m', 'relative_humidity_2m', 'precipitation', 'rain', 'showers',
    'wind_speed_10m', 'wind_gusts_10m', 'dew_point_2m', 'cloud_cover',
    'shortwave_radiation', 'et0_fao_evapotranspiration', 'weather_code',
    'soil_moisture_0_to_1cm', 'soil_moisture_1_to_3cm', 'soil_moisture_3_to_9cm',
    'soil_moisture_9_to_27cm', 'soil_moisture_27_to_81cm',
  ],
  hourly: [
    'temperature_2m', 'relative_humidity_2m', 'precipitation_probability',
    'precipitation', 'rain', 'showers', 'wind_speed_10m', 'wind_gusts_10m',
    'dew_point_2m', 'cloud_cover', 'shortwave_radiation',
    'et0_fao_evapotranspiration', 'weather_code', 'soil_moisture_0_to_1cm',
    'soil_moisture_1_to_3cm', 'soil_moisture_3_to_9cm', 'soil_moisture_9_to_27cm',
    'soil_moisture_27_to_81cm',
  ],
  daily: [
    'temperature_2m_max', 'temperature_2m_mean', 'temperature_2m_min',
    'precipitation_sum', 'rain_sum', 'showers_sum', 'precipitation_probability_max',
    'wind_speed_10m_max', 'wind_gusts_10m_max', 'shortwave_radiation_sum',
    'et0_fao_evapotranspiration', 'weather_code',
  ],
};

function normalizeOpenMeteoSeries(section, variables) {
  const source = section || {};
  const values = {};
  variables.forEach(variable => {
    if (Array.isArray(source[variable])) values[variable] = source[variable];
  });
  return { timestamps: Array.isArray(source.time) ? source.time : [], values };
}

function normalizeOpenMeteoWeather(data, reference) {
  const hourly = normalizeOpenMeteoSeries(data.hourly, OPEN_METEO_VARIABLES.hourly);
  const daily = normalizeOpenMeteoSeries(data.daily, OPEN_METEO_VARIABLES.daily);
  const soilVariables = OPEN_METEO_VARIABLES.hourly.filter(variable => variable.startsWith('soil_'));

  return {
    source: 'open-meteo',
    fetchedAt: new Date().toISOString(),
    location: { latitude: data.latitude, longitude: data.longitude, timezone: data.timezone },
    current: { observedAt: data.current?.time || null, values: data.current || {} },
    hourly,
    daily,
    forecast: {
      forecastDays: daily.timestamps.length,
      hourlyStart: hourly.timestamps[0] || null,
      hourlyEnd: hourly.timestamps[hourly.timestamps.length - 1] || null,
      dailyStart: daily.timestamps[0] || null,
      dailyEnd: daily.timestamps[daily.timestamps.length - 1] || null,
    },
    soil: {
      source: 'open-meteo-model',
      sensorType: 'weather-model-estimate',
      timestamps: hourly.timestamps,
      values: Object.fromEntries(soilVariables
        .filter(variable => hourly.values[variable])
        .map(variable => [variable, hourly.values[variable]])),
    },
    schema: OPEN_METEO_DATA_DICTIONARY,
    referenceTalhaoId: reference.id,
  };
}

function seedSelectedCalendarOperations() {
  PLANNINGS_FROM_DB
    .filter(item => item.talhao_id === selectedTalhaoRefId && ['PLANEJADA', 'CONFIRMADA'].includes(item.status))
    .forEach(planejamento => {
      const entry = CAL_DATA[planejamento.data_planejada] || { type: 'future' };
      CAL_DATA[planejamento.data_planejada] = {
        ...entry,
        planned: `${planejamento.talhao} · ${planejamento.produto}`,
        planejamentoId: planejamento.id,
        plannedBy: planejamento.responsavel,
      };
    });
  APPLICATIONS_FROM_DB
    .filter(item => item.talhao_id === selectedTalhaoRefId)
    .forEach(application => {
      const [day, month, year] = application.date.split('/');
      const date = `${year}-${month}-${day}`;
      const entry = CAL_DATA[date] || { type: 'past' };
      CAL_DATA[date] = {
        ...entry,
        app: application.status === 'done',
        done: application.product,
        iea: application.ieaPrev ?? entry.iea,
      };
    });
}

function applyWeatherToCalendar(weather) {
  const evaluated = new GoldCropAnalysisEngine(weather).evaluate();
  const recommendations = evaluated.recommendations.filter(item => item.decision !== 'INSUFFICIENT_DATA');
  const analysis = {
    ...evaluated,
    recommendations,
    bestRecommendation: recommendations.reduce(
      (best, item) => !best || item.adequacyIndex > best.adequacyIndex ? item : best,
      null
    ),
  };
  const talhao = TALHOES_DATA.find(item => item.id === selectedTalhaoRefId);
  if (!talhao) return;
  talhao.weather = weather;
  talhao.analysis = analysis;
  talhao.recommendations = analysis.recommendations;
  talhao.iea = analysis.bestRecommendation?.adequacyIndex ?? null;
  talhao.status = analysis.bestRecommendation
    ? (analysis.bestRecommendation.adequacyIndex >= 80 ? 'favorable' : analysis.bestRecommendation.adequacyIndex >= 60 ? 'moderate' : 'unfavorable')
    : 'insufficient';
  talhao.window = analysis.bestRecommendation
    ? `${formatRecommendationDate(analysis.bestRecommendation.date)} · ${formatRecommendationTime(analysis.bestRecommendation)}`
    : '';
  window.GOLDCROP_RECOMMENDATIONS = analysis;
  clearCalendarData();
  seedSelectedCalendarOperations();
  const recommendationsByDate = {};
  analysis.recommendations.forEach(recommendation => {
    if (!recommendationsByDate[recommendation.date]) recommendationsByDate[recommendation.date] = [];
    recommendationsByDate[recommendation.date].push(recommendation);
  });
  const values = weather.daily.values;
  const today = weather.daily.timestamps[0] || new Date().toISOString().slice(0, 10);

  weather.daily.timestamps.forEach((date, index) => {
    const existing = CAL_DATA[date] || { app: false };
    const recommendations = recommendationsByDate[date] || [];
    const recommendation = recommendations.reduce((best, item) => !best || item.adequacyIndex > best.adequacyIndex ? item : best, null);
    const metrics = recommendation?.metrics || {};
    recommendations.sort((a, b) => a.windowStart.localeCompare(b.windowStart));
    const rain = finiteWeatherValue(values.precipitation_sum?.[index]);
    const probability = finiteWeatherValue(values.precipitation_probability_max?.[index]);
    const gusts = finiteWeatherValue(values.wind_gusts_10m_max?.[index]);
    const temperature = finiteWeatherValue(values.temperature_2m_mean?.[index])
      ?? finiteWeatherValue(values.temperature_2m_max?.[index]);

    CAL_DATA[date] = {
      ...existing,
      iea: recommendation?.adequacyIndex ?? null,
      type: date === today ? 'today' : date < today ? 'past' : 'future',
      rain,
      temp: temperature,
      precipitationProbability: probability,
      windSpeed: finiteWeatherValue(values.wind_speed_10m_max?.[index]),
      windGusts: gusts,
      applicationWindow: metrics,
      recommendation,
      recommendations,
      recommendationTime: recommendation ? formatRecommendationTime(recommendation) : '',
      solarRadiation: finiteWeatherValue(values.shortwave_radiation_sum?.[index]),
      et0: finiteWeatherValue(values.et0_fao_evapotranspiration?.[index]),
    };
  });
  return analysis;
}

function formatRecommendationDate(date) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function formatRecommendationTime(recommendation) {
  const start = recommendation.windowStart.slice(11, 16);
  const end = recommendation.windowEnd.slice(11, 16);
  return `${start} — ${end}`;
}

function formatWeatherValue(value, decimals = 1) {
  const number = finiteWeatherValue(value);
  if (number == null) return '—';
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatMetricValue(value, suffix = '', decimals = 1) {
  const number = finiteWeatherValue(value);
  if (number == null) return '—';
  const formatted = number.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formatted}${suffix}`;
}

function finiteWeatherValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function updateSystemFromAnalysis() {
  const analysis = window.GOLDCROP_RECOMMENDATIONS;
  const best = analysis?.bestRecommendation;
  const selected = getSelectedReferenceTalhao();
  const state = document.getElementById('talhaoAnalysisState');
  if (state) {
    state.textContent = !selected
      ? 'Cadastre um talhão para iniciar'
      : !Number.isFinite(selected.latitude) || !Number.isFinite(selected.longitude)
        ? `Dados insuficientes para análise de ${selected.name}: cadastre latitude e longitude`
        : best
          ? `Análise individual de ${selected.name} · IEA ${best.adequacyIndex}%`
          : selected.weather
            ? `Dados insuficientes para análise de ${selected.name}`
            : `Aguardando dados para análise de ${selected.name}`;
  }
  const talhaoBadge = document.getElementById('gwTalhaoBadge');
  if (talhaoBadge) talhaoBadge.textContent = selected?.name || 'Nenhum talhão selecionado';
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  if (!best) {
    setText('gwDateBig', selected ? 'Aguardando dados' : 'Sem talhão');
    setText('gwTimeBig', '—');
    setText('gwIEAValue', '—');
    setText('gwRainValue', '—');
    setText('gwTempValue', '—');
    setText('gwWindValue', '—');
    setText('gwInsightText', selected && (!Number.isFinite(selected.latitude) || !Number.isFinite(selected.longitude))
      ? 'Dados insuficientes para analisar este talhão. Cadastre suas coordenadas.'
      : selected?.weather
        ? 'Dados meteorológicos insuficientes para gerar uma recomendação confiável para este talhão.'
        : 'Aguardando dados meteorológicos deste talhão.');
    setText('dashboardIeaValue', '—');
    setText('dashboardRingValue', '—');
    setText('dashboardNextDate', 'Aguardando análise');
    setText('dashboardNextIea', '—');
    setText('dashboardNextDesc', 'Sem recomendação');
    setText('dashboardWindowDate', 'Aguardando análise');
    setText('dashboardWindowTime', '—');
    setText('dashboardWindowRain', '—');
    setText('dashboardWindowTemperature', '—');
    setText('dashboardWindowWind', '—');
    setText('dashboardWindowInsight', 'Sem recomendação: aguardando dados deste talhão.');
    syncCalendarTalhaoSelector();
    if (document.getElementById('calGrid')) renderCalendar();
    if (document.getElementById('mapContainer')) renderTalhoes();
    if (document.getElementById('talhoesGrid')) renderDashboardTalhoes();
    return;
  }

  const metrics = best.metrics || {};
  const confidence = `${Math.round(best.confidence * 100)}% confiança`;
  const date = formatRecommendationDate(best.date);
  const time = formatRecommendationTime(best);

  const dashboardIeaValue = document.getElementById('dashboardIeaValue');
  if (dashboardIeaValue) dashboardIeaValue.innerHTML = `${best.adequacyIndex}<span class="kpi-unit">%</span>`;
  setText('gwIEAValue', best.adequacyIndex);
  setText('dashboardRingValue', best.adequacyIndex);
  setText('dashboardNextDate', `${date} · ${time}`);
  setText('dashboardNextIea', `${best.adequacyIndex}%`);
  setText('dashboardNextDesc', `${confidence} · ${best.decision}`);
  setText('dashboardWindowDate', date);
  setText('dashboardWindowTime', time);
  setText('dashboardWindowRain', `${formatWeatherValue(metrics.rainVolume)} mm`);
  setText('dashboardWindowTemperature', `${formatWeatherValue(metrics.temperature)}°C`);
  setText('dashboardWindowWind', `${formatWeatherValue(metrics.windSpeed)} km/h`);
  const explanation = best.explanation || 'Janela estimada com base na previsão meteorológica deste talhão.';
  setText('dashboardWindowInsight', `${explanation} Chuva ${formatWeatherValue(metrics.rainVolume)} mm, temperatura ${formatWeatherValue(metrics.temperature)}°C e vento ${formatWeatherValue(metrics.windSpeed)} km/h na janela analisada.`);
  setText('gwDateBig', date);
  setText('gwTimeBig', time);
  setText('gwRainValue', `${formatWeatherValue(metrics.rainVolume)} mm`);
  setText('gwTempValue', `${formatWeatherValue(metrics.temperature)}°C`);
  setText('gwWindValue', `${formatWeatherValue(metrics.windSpeed)} km/h`);
  setText('gwInsightText', explanation);
  if (selected) {
    selected.iea = best.adequacyIndex;
    selected.status = best.adequacyIndex >= 80 ? 'favorable' : best.adequacyIndex >= 60 ? 'moderate' : 'unfavorable';
    selected.window = `${date} · ${time}`;
    selected.rain = metrics.rainVolume;
    selected.temp = metrics.temperature;
  }
  syncCalendarTalhaoSelector();
  if (document.getElementById('mapContainer')) renderTalhoes();
  if (document.getElementById('talhoesGrid')) renderDashboardTalhoes();
  if (document.getElementById('fazendaContent')) renderFazenda();
}

async function loadLocalWeather(referenceTalhaoId = selectedTalhaoRefId) {
  const requestId = ++weatherRequestId;
  const reference = TALHOES_DATA.find(t => t.id === Number(referenceTalhaoId)) || getSelectedReferenceTalhao();
  if (!reference) {
    window.GOLDCROP_RECOMMENDATIONS = { recommendations: [], bestRecommendation: null };
    window.GOLDCROP_WEATHER = null;
    clearCalendarData();
    updateSystemFromAnalysis();
    return;
  }
  selectedTalhaoRefId = reference.id;
  localStorage.setItem('goldcrop.selectedTalhaoId', String(reference.id));
  syncCalendarTalhaoSelector();
  window.GOLDCROP_WEATHER = null;
  window.GOLDCROP_RECOMMENDATIONS = reference.analysis || { recommendations: [], bestRecommendation: null };
  clearCalendarData();
  seedSelectedCalendarOperations();
  if (!Number.isFinite(reference.latitude) || !Number.isFinite(reference.longitude)) {
    reference.analysis = { recommendations: [], bestRecommendation: null };
    reference.recommendations = [];
    reference.iea = null;
    reference.status = 'insufficient';
    window.GOLDCROP_RECOMMENDATIONS = reference.analysis;
    window.GOLDCROP_WEATHER = null;
    clearCalendarData();
    seedSelectedCalendarOperations();
    updateSystemFromAnalysis();
    if (document.getElementById('weatherSummary')) {
      document.getElementById('weatherSummary').textContent = `${reference.name} · Dados insuficientes: cadastre as coordenadas`;
    }
    if (document.getElementById('calGrid')) renderCalendar();
    if (document.getElementById('mapContainer')) renderTalhoes();
    if (document.getElementById('talhoesGrid')) renderDashboardTalhoes();
    return;
  }

  const params = new URLSearchParams({
    latitude: reference.latitude,
    longitude: reference.longitude,
    current: OPEN_METEO_VARIABLES.current.join(','),
    hourly: OPEN_METEO_VARIABLES.hourly.join(','),
    daily: OPEN_METEO_VARIABLES.daily.join(','),
    forecast_days: '7',
    timezone: 'America/Sao_Paulo',
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error('Weather API unavailable');
    const data = await response.json();
    if (requestId !== weatherRequestId || selectedTalhaoRefId !== reference.id) return;
    const normalized = normalizeOpenMeteoWeather(data, reference);
    window.GOLDCROP_WEATHER = normalized;
    const analysis = applyWeatherToCalendar(normalized);
    const collectionResponse = await apiRequest('/api/weather/ingest/', {
      method: 'POST',
      body: JSON.stringify({ ...normalized, talhao_id: reference.id }),
    });
    if (!collectionResponse.ok) throw new Error(`Weather persistence failed: ${collectionResponse.status}`);
    const recommendationResponse = await apiRequest('/api/recommendations/ingest/', {
      method: 'POST',
      body: JSON.stringify({ ...analysis, talhao_id: reference.id }),
    });
    if (!recommendationResponse.ok) throw new Error(`Recommendation persistence failed: ${recommendationResponse.status}`);
    const savedRecommendations = await recommendationResponse.json();
    reference.recommendations = savedRecommendations.recommendations || [];
    reference.analysis = {
      ...analysis,
      recommendations: reference.recommendations,
      bestRecommendation: reference.recommendations.reduce(
        (best, item) => !best || item.adequacyIndex > best.adequacyIndex ? item : best,
        null
      ),
    };
    if (requestId !== weatherRequestId || selectedTalhaoRefId !== reference.id) return;
    window.GOLDCROP_RECOMMENDATIONS = reference.analysis;
    updateSystemFromAnalysis();
    const current = normalized.current.values;
    const rain = finiteWeatherValue(normalized.daily.values.precipitation_sum?.[0]);
    const probabilities = (normalized.hourly.values.precipitation_probability || [])
      .slice(0, 24)
      .map(finiteWeatherValue)
      .filter(value => value != null);
    const probability = probabilities.length ? Math.max(...probabilities) : null;
    const condition = WEATHER_CODES[current.weather_code] || 'Condição não informada';
    const temperatureValue = finiteWeatherValue(current.temperature_2m);
    const temperature = temperatureValue == null
      ? '—'
      : temperatureValue.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const weatherSummary = document.getElementById('weatherSummary');
    const rainValue = document.getElementById('rainForecastValue');
    const rainDesc = document.getElementById('rainForecastDesc');

    if (weatherSummary) weatherSummary.textContent = `${reference.name} · ${temperature}°C · ${condition}`;
    if (rainValue) rainValue.innerHTML = `${formatWeatherValue(rain)}<span class="kpi-unit">mm</span>`;
    if (rainDesc) rainDesc.textContent = `${reference.name} · Probabilidade de ${formatWeatherValue(probability, 0)}% · Open-Meteo`;
    const dashboardWeatherTemp = document.getElementById('weatherTemp');
    const dashboardWeatherCondition = document.getElementById('weatherCondition');
    if (dashboardWeatherTemp) dashboardWeatherTemp.textContent = `${temperature}°C`;
    if (dashboardWeatherCondition) dashboardWeatherCondition.textContent = condition;

    reference.temp = current.temperature_2m;
    reference.moisture = current.relative_humidity_2m;
    reference.rain = rain;
    reference.wind = current.wind_speed_10m;
    if (document.getElementById('calGrid')) renderCalendar();
    if (document.getElementById('mapContainer')) renderTalhoes();
    if (document.getElementById('talhoesGrid')) renderDashboardTalhoes();
  } catch (error) {
    if (requestId !== weatherRequestId || selectedTalhaoRefId !== reference.id) return;
    console.warn('Previsão local indisponível:', error);
    const weatherSummary = document.getElementById('weatherSummary');
    if (reference.weather?.hourly?.timestamps?.length) {
      window.GOLDCROP_WEATHER = reference.weather;
      applyWeatherToCalendar(reference.weather);
      updateSystemFromAnalysis();
      if (weatherSummary) weatherSummary.textContent = `${reference.name} · usando última previsão salva`;
      if (document.getElementById('calGrid')) renderCalendar();
      if (document.getElementById('mapContainer')) renderTalhoes();
    } else if (weatherSummary) weatherSummary.textContent = `${reference.name} · Clima local indisponível`;
    const dashboardWeatherTemp = document.getElementById('weatherTemp');
    const dashboardWeatherCondition = document.getElementById('weatherCondition');
    const currentWeather = reference.weather?.current?.values;
    if (dashboardWeatherTemp) dashboardWeatherTemp.textContent = currentWeather?.temperature_2m != null ? `${currentWeather.temperature_2m}°C` : '—';
    if (dashboardWeatherCondition) dashboardWeatherCondition.textContent = currentWeather?.weather_code != null
      ? WEATHER_CODES[currentWeather.weather_code] || 'Condição não informada'
      : 'Clima indisponível';
    const state = document.getElementById('talhaoAnalysisState');
    if (state) state.textContent = reference.weather?.hourly?.timestamps?.length
      ? `${reference.name} · exibindo última análise salva; atualização indisponível`
      : `${reference.name} · Falha ao obter clima/análise`;
  }
}

async function selectTalhao(talhaoId) {
  const selected = TALHOES_DATA.find(item => item.id === Number(talhaoId));
  if (!selected) return;
  selectedTalhaoRefId = selected.id;
  localStorage.setItem('goldcrop.selectedTalhaoId', String(selected.id));
  syncCalendarTalhaoSelector();
  window.GOLDCROP_RECOMMENDATIONS = selected.analysis || { recommendations: [], bestRecommendation: null };
  clearCalendarData();
  seedSelectedCalendarOperations();
  updateSystemFromAnalysis();
  await loadLocalWeather(selected.id);
}

// =====================================================
// NAVIGATION
// =====================================================

function navigateTo(page) {
  const urlMap = {
    'dashboard': '/dashboard/',
    'calendar': '/calendario/',
    'talhoes': '/talhoes/',
    'fazenda': '/fazenda/',
    'sensores': '/sensores/',
    'aplicacoes': '/aplicacoes/',
    'historico': '/historico/',
    'settings': '/configuracoes/'
  };

  if (urlMap[page]) {
    window.location.href = urlMap[page];
  }
}

// =====================================================
// SIDEBAR
// =====================================================

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('show');
  document.body.classList.add('sidebar-open');
  sidebarOpen = true;
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
  document.body.classList.remove('sidebar-open');
  sidebarOpen = false;
}

function toggleSidebar() {
  if (sidebarOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// =====================================================
// CALENDAR
// =====================================================

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');
  if (!grid) return;

  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  label.textContent = `${months[calMonth.getMonth()]} ${calMonth.getFullYear()}`;

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  grid.innerHTML = '';

  // Empty cells
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    el.innerHTML = '<span></span>';
    grid.appendChild(el);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const data = CAL_DATA[dateStr];
    const el = document.createElement('div');

    let colorClass = '';
    let tagText = '';

    const hasIea = Number.isFinite(data?.iea);
    if (hasIea) {
      if (data.iea >= 80) colorClass = 'green-day';
      else if (data.iea >= 60) colorClass = 'yellow-day';
      else colorClass = 'red-day';
      if (data.type === 'past') tagText = 'Real';
      else if (data.type === 'today') tagText = 'Hoje';
      else tagText = 'Est.';
    } else colorClass = 'no-data';

    let typeClass = data ? data.type : 'no-data';
    el.className = `cal-day ${colorClass} ${typeClass === 'today' ? 'today' : ''} ${typeClass === 'past' ? 'past' : ''}`;
    el.dataset.date = dateStr;

    el.innerHTML = `
      <span class="cal-day-num">${d}</span>
      ${hasIea ? `<span class="cal-day-iea">${data.iea}%</span>` : '<span class="cal-day-iea" style="opacity:.3">—</span>'}
      ${tagText ? `<span class="cal-day-tag">${tagText}</span>` : ''}
      ${data?.recommendationTime ? `<span class="cal-day-window">${data.recommendationTime}</span>` : ''}
      ${data && (data.app || data.planned) ? `<div class="cal-day-markers">${data.planned ? '<span class="cal-plan-marker" title="Aplicação planejada">P</span>' : ''}${data.app ? '<span class="cal-done-marker" title="Aplicação realizada">R</span>' : ''}</div>` : ''}
    `;

    if (data && (hasIea || data.app || data.planned)) {
      el.addEventListener('click', () => selectCalDay(dateStr, d, data, el));
    }

    grid.appendChild(el);
  }
}

function selectCalDay(dateStr, day, data, el) {
  document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  selectedCalDay = dateStr;
  renderDayPanel(day, data, data.recommendation);
}

function selectCalendarWindow(date, day, select) {
  const data = CAL_DATA[date];
  const recommendation = data?.recommendations?.find(item => item.windowStart === select.value);
  if (data && recommendation) renderDayPanel(day, data, recommendation);
}

function renderDayPanel(day, data, recommendation = data.recommendation) {
  const empty = document.getElementById('dayPanelEmpty');
  const content = document.getElementById('dayPanelContent');
  if (!empty || !content) return;

  empty.style.display = 'none';
  content.style.display = 'block';

  const selectedIeaValue = recommendation?.adequacyIndex ?? data.iea;
  const selectedIea = Number.isFinite(selectedIeaValue) ? selectedIeaValue : null;
  const ieaColor = selectedIea === null ? '#6b7280' : selectedIea >= 80 ? '#3a8554' : selectedIea >= 60 ? '#d97706' : '#ef4444';
  const selectedTalhao = getSelectedReferenceTalhao();
  const typeLabel = selectedIea === null
    ? `Dados insuficientes para ${selectedTalhao?.name || 'este talhão'}`
    : data.type === 'past' ? 'Dados reais' : data.type === 'today' ? 'Hoje — Dados reais + previsão' : 'Previsão estimada pela IA';

  const upFactors = [];
  const downFactors = [];

  if (Number.isFinite(data.rain) && data.rain < 10) upFactors.push('Baixo acúmulo de chuva → menor risco de lixiviação');
  if (Number.isFinite(data.temp) && data.temp >= 20 && data.temp <= 25) upFactors.push('Temperatura dentro da faixa analisada');
  if (selectedIea !== null && selectedIea >= 80) upFactors.push('Alta adequação calculada para este talhão');

  if (Number.isFinite(data.rain) && data.rain > 15) downFactors.push('Chuva elevada → risco de lavagem do produto');
  if (Number.isFinite(data.rain) && data.rain > 25) downFactors.push('Alta precipitação → aplicação contraindicada');
  if (Number.isFinite(data.temp) && data.temp > 27) downFactors.push('Temperatura elevada → risco de volatilização');
  if (selectedIea !== null && selectedIea < 60) downFactors.push('Condições desfavoráveis nesta janela');

  if (upFactors.length === 0) upFactors.push(selectedIea === null ? 'Sem dados suficientes para identificar fatores favoráveis' : 'Condições dentro do intervalo esperado');
  if (downFactors.length === 0) downFactors.push(selectedIea === null ? 'Sem dados suficientes para avaliar riscos' : 'Sem fatores significativos desfavoráveis');

  const confLabel = selectedIea === null ? 'Indisponível' : selectedIea >= 80 ? 'Alta' : selectedIea >= 60 ? 'Média' : 'Baixa';
  const confColor = selectedIea === null ? '#6b7280' : selectedIea >= 80 ? '#3a8554' : selectedIea >= 60 ? '#d97706' : '#ef4444';

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const monthName = months[calMonth.getMonth()];

  const hasWindow = selectedIea !== null && selectedIea >= 75;
  const windowTime = recommendation ? formatRecommendationTime(recommendation) : data.recommendationTime || '—';
  const applicationWindow = data.applicationWindow || {};
  const selectedMetrics = recommendation?.metrics || applicationWindow;
  const windowOptions = (data.recommendations || []).map(item => `<option value="${item.windowStart}" ${item.windowStart === recommendation?.windowStart ? 'selected' : ''}>${formatRecommendationTime(item)} · IEA ${item.adequacyIndex}%</option>`).join('');

  const safeRain = Number.isFinite(data.rain) ? formatMetricValue(data.rain, ' mm') : '—';
  const safeTemp = Number.isFinite(data.temp) ? formatMetricValue(data.temp, '°C') : '—';
  const safeWind = Number.isFinite(selectedMetrics.windSpeed ?? data.windSpeed) ? formatMetricValue(selectedMetrics.windSpeed ?? data.windSpeed, ' km/h') : '—';
  const safeGusts = Number.isFinite(selectedMetrics.windGusts ?? data.windGusts) ? formatMetricValue(selectedMetrics.windGusts ?? data.windGusts, ' km/h') : '—';
  const probability = selectedMetrics.rainProbability != null
    ? Math.round(selectedMetrics.rainProbability * 100)
    : data.precipitationProbability;
  const safeProbability = Number.isFinite(probability) ? formatMetricValue(probability, '%', 0) : '—';
  const safeRainPlusShowers = Number.isFinite(selectedMetrics.rain) && Number.isFinite(selectedMetrics.showers)
    ? formatMetricValue(selectedMetrics.rain + selectedMetrics.showers, ' mm')
    : '—';
  const safeSolar = Number.isFinite(data.solarRadiation) ? formatMetricValue(data.solarRadiation, ' MJ/m²') : '—';
  const safeEt0 = Number.isFinite(data.et0) ? formatMetricValue(data.et0, ' mm') : '—';

  content.innerHTML = `
    <div class="dpanel-title">${day} de ${monthName === 'Ago' ? 'Agosto' : monthName} de ${calMonth.getFullYear()}</div>
    ${windowOptions ? `<label class="form-label" for="calendarWindowSelect">Pesquisar outra janela neste dia</label><select class="form-input" id="calendarWindowSelect" onchange="selectCalendarWindow('${selectedCalDay}', ${day}, this)">${windowOptions}</select>` : ''}
    <p style="font-size:.72rem;color:#9ca3af;margin-bottom:.875rem;font-style:italic">${typeLabel}</p>

    <div class="dpanel-iea-row">
      <div>
        <div style="font-size:.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">IEA</div>
        <div class="dpanel-iea-value" style="color:${ieaColor}">${selectedIea === null ? '—' : `${selectedIea}%`}</div>
      </div>
      <div class="dpanel-iea-meta">
        <span style="font-size:.8rem;font-weight:700;color:${confColor}">${confLabel}${selectedIea === null ? '' : ' confiança'}</span>
        ${hasWindow ? `<span style="font-size:.75rem;color:#4b5563">Janela: ${windowTime}</span>` : '<span style="font-size:.75rem;color:#9ca3af">Sem janela ideal</span>'}
      </div>
    </div>

    ${data.planned ? `<div class="calendar-plan"><b>Aplicação planejada</b><span>${data.planned}</span><small>${data.plannedBy ? `Planejada por ${data.plannedBy}` : 'Planejamento salvo'}</small></div>` : ''}
    ${data.app ? `<div class="calendar-done"><b>Aplicação realizada</b><span>${data.done || 'Registro operacional concluído'}</span><small>${data.doneTime ? `Realizada às ${data.doneTime}` : 'Registro salvo no histórico'}</small></div>` : ''}
    <div class="dpanel-section-title">Previsão Meteorológica</div>
    <div class="dpanel-row"><span class="dpanel-row-label">Chuva</span><span class="dpanel-row-value">${safeRain}</span></div>
    <div class="dpanel-row"><span class="dpanel-row-label">Temperatura</span><span class="dpanel-row-value">${safeTemp}</span></div>
    <div class="dpanel-row"><span class="dpanel-row-label">Vento na janela</span><span class="dpanel-row-value">${safeWind}</span></div>
    <div class="dpanel-row"><span class="dpanel-row-label">Rajadas na janela</span><span class="dpanel-row-value">${safeGusts}</span></div>
    <div class="dpanel-row"><span class="dpanel-row-label">Prob. na janela</span><span class="dpanel-row-value">${safeProbability}</span></div>
    <div class="dpanel-row"><span class="dpanel-row-label">Chuva + pancadas</span><span class="dpanel-row-value">${safeRainPlusShowers}</span></div>
    <div class="dpanel-row"><span class="dpanel-row-label">Radiação solar</span><span class="dpanel-row-value">${safeSolar}</span></div>
    <div class="dpanel-row"><span class="dpanel-row-label">ET0</span><span class="dpanel-row-value">${safeEt0}</span></div>

    ${hasWindow ? `
    <div class="dpanel-rec">
      🌿 <strong>Janela favorável</strong> para aplicação entre <strong>${windowTime}</strong>.<br>
      <span style="font-size:.75rem;opacity:.8;margin-top:4px;display:block">Análise do ${selectedTalhao?.name || 'talhão selecionado'}</span>
    </div>` : `
    <div class="dpanel-rec" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">
      ${selectedIea === null
        ? selectedTalhao?.weather
          ? '<strong>Dados insuficientes.</strong> Não há recomendação calculada para este talhão neste dia.'
          : '<strong>Aguardando dados.</strong> Ainda não há previsão meteorológica para este talhão.'
        : '⚠️ <strong>Condições desfavoráveis.</strong> Não recomendado para aplicação neste dia.'}
    </div>`}
    ${data.planned && data.planejamentoId && !data.app ? `<button class="btn-primary" style="width:100%;margin-top:.75rem;justify-content:center" onclick="openRegistrar(${selectedTalhao?.id}, ${data.planejamentoId})">Registrar execução planejada</button>` : ''}
    ${selectedTalhao ? `<button class="btn-ghost" style="width:100%;margin-top:.5rem;justify-content:center" onclick="openPlanejar(${selectedTalhao.id}, '${selectedCalDay}')">Planejar para ${selectedTalhao.name}</button>` : ''}

    <div class="dpanel-why">
      <div class="dpanel-why-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Por que essa janela?
      </div>
      ${upFactors.map(f => `<div class="why-factor-up">${f}</div>`).join('')}
      ${downFactors.map(f => `<div class="why-factor-down">${f}</div>`).join('')}
    </div>

    <button class="btn-primary" style="width:100%;margin-top:1rem;justify-content:center" onclick="openRegistrar()">
      Registrar aplicação neste dia
    </button>
  `;
}

// =====================================================
// TALHÕES MAP
// =====================================================

function addBaseMapTiles(map) {
  return L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
}

function talhaoStatusPresentation(talhao) {
  if (!talhao.analysis?.bestRecommendation) {
    const hasCoordinates = Number.isFinite(talhao.latitude) && Number.isFinite(talhao.longitude);
    return {
      label: !hasCoordinates || talhao.weather ? 'Dados insuficientes' : 'Aguardando dados',
      color: '#6b7280',
      chip: 'gray',
    };
  }
  if (talhao.status === 'favorable') return { label: 'Favorável', color: '#3a8554', chip: 'green' };
  if (talhao.status === 'moderate') return { label: 'Atenção', color: '#d97706', chip: 'yellow' };
  return { label: 'Desfavorável', color: '#ef4444', chip: 'red' };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function renderSelectedTalhaoMapInfo(talhao) {
  const container = document.getElementById('selectedTalhaoMapInfo');
  const summary = document.getElementById('selectedTalhaoSummary');
  if (!talhao) {
    if (container) container.innerHTML = '';
    if (summary) summary.innerHTML = '';
    return;
  }

  if (summary) {
    const status = talhaoStatusPresentation(talhao);
    const area = finiteWeatherValue(talhao.area);
    const iea = Number.isFinite(talhao.iea) ? `${talhao.iea}%` : '—';
    summary.innerHTML = `
      <div class="selected-talhao-summary-main">
        <div class="selected-talhao-summary-copy">
          <h2>${escapeHtml(talhao.name || `Talhão ${String(talhao.id).padStart(2, '0')}`)}</h2>
          <p>${escapeHtml(talhao.culture || 'Cultura não informada')} · ${area === null ? 'Área não informada' : `${formatMetricValue(area, ' ha')}`}</p>
        </div>
        <span class="talhao-status-label ${status.chip}">${escapeHtml(status.label)}</span>
      </div>
      <div class="selected-talhao-summary-metrics">
        <div><span>Janela</span><strong>${escapeHtml(talhao.window || 'Sem janela recomendada')}</strong></div>
        <div><span>IEA</span><strong>${iea}</strong></div>
      </div>
      <button class="selected-talhao-details-link" type="button" aria-controls="selectedTalhaoMapInfo" onclick="scrollToTalhaoDetails()">
        Ver detalhes <span aria-hidden="true">↓</span>
      </button>
    `;
  }

  if (container) {
    container.innerHTML = `
      <h2 class="selected-talhao-details-title">Detalhes completos <span>${escapeHtml(talhao.name || '')}</span></h2>
      <div class="selected-talhao-details">${getTalhaoDetailsMarkup(talhao, { inline: true })}</div>
    `;
  }
}

function scrollToTalhaoDetails() {
  document.getElementById('selectedTalhaoMapInfo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function focusTalhaoOnMap(talhaoId) {
  const talhao = TALHOES_DATA.find(item => Number(item.id) === Number(talhaoId));
  const layers = talhaoMapLayers.get(Number(talhaoId));
  renderSelectedTalhaoMapInfo(talhao);
  if (!talhao || !layers || !talhoesMap) return;

  focusedTalhaoMapId = Number(talhaoId);
  talhoesMap.flyTo([talhao.latitude, talhao.longitude], Math.max(talhoesMap.getZoom(), 16), {
    animate: true,
    duration: 0.6,
  });
  layers.marker.openPopup();
}

function renderTalhoes() {
  const container = document.getElementById('mapContainer');
  const list = document.getElementById('talhoesList');
  if (!container || !list) return;
  const createButton = document.getElementById('btnCadastrarTalhao');
  if (createButton) createButton.hidden = !FARM.permissions?.manage;
  const visibleTalhoes = TALHOES_DATA.filter(t => activeTalhaoFilter === 'all'
    || (activeTalhaoFilter === 'favorable' && t.status === 'favorable')
    || (activeTalhaoFilter === 'alert' && ['moderate', 'unfavorable', 'insufficient'].includes(t.status)));

  if (talhoesMap) {
    talhoesMap.remove();
    talhoesMap = null;
  }
  talhaoMapLayers = new Map();
  container.innerHTML = '';
  container.classList.add('leaflet-map-container');

  const locatedTalhoes = visibleTalhoes.filter(t => Number.isFinite(t.latitude) && Number.isFinite(t.longitude));
  if (typeof L === 'undefined') {
    container.innerHTML = '<div class="map-loading-message">Mapa indisponível. Verifique sua conexão.</div>';
  } else if (!visibleTalhoes.length) {
    container.innerHTML = '<div class="map-loading-message">Nenhum talhão corresponde a este filtro.</div>';
  } else if (!locatedTalhoes.length) {
    container.innerHTML = '<div class="map-loading-message">Adicione coordenadas para visualizar os talhões no mapa.</div>';
  } else {
    const firstTalhao = locatedTalhoes[0];
    talhoesMap = L.map(container).setView([firstTalhao.latitude, firstTalhao.longitude], 16);
    addBaseMapTiles(talhoesMap);

    locatedTalhoes.forEach(t => {
      const status = talhaoStatusPresentation(t);
      const color = status.color;
      const iea = Number.isFinite(t.iea) ? `${t.iea}%` : 'Indisponível';
      const popup = `
        <div class="talhao-map-popup">
          <strong>${escapeHtml(t.name)}</strong>
          <span>${escapeHtml(t.culture || 'Cultura não informada')} · ${finiteWeatherValue(t.area) == null ? 'Área não informada' : `${formatMetricValue(t.area, ' ha')}`}</span>
          <span>Status: ${escapeHtml(status.label)} · IEA: ${escapeHtml(iea)}</span>
          <span>Localização: ${t.latitude.toFixed(6)}, ${t.longitude.toFixed(6)}</span>
          <span>Janela: ${escapeHtml(t.window || 'Sem recomendação')}</span>
        </div>`;
      const marker = L.circleMarker([t.latitude, t.longitude], {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(talhoesMap);
      const perimeter = L.circle([t.latitude, t.longitude], {
        radius: t.radius || 80,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.18,
      }).addTo(talhoesMap);

      marker.bindPopup(popup);
      perimeter.bindPopup(popup);
      marker.on('click', () => {
        selectTalhao(t.id);
        focusTalhaoOnMap(t.id);
      });
      perimeter.on('click', () => {
        selectTalhao(t.id);
        focusTalhaoOnMap(t.id);
      });
      talhaoMapLayers.set(Number(t.id), { marker, perimeter });
    });

    const focusedTalhao = locatedTalhoes.find(item => Number(item.id) === Number(focusedTalhaoMapId));
    if (focusedTalhao) {
      talhoesMap.setView([focusedTalhao.latitude, focusedTalhao.longitude], 16);
      talhaoMapLayers.get(Number(focusedTalhao.id))?.marker.openPopup();
    } else if (locatedTalhoes.length > 1) {
      const bounds = L.latLngBounds(locatedTalhoes.map(t => [t.latitude, t.longitude]));
      talhoesMap.fitBounds(bounds.pad(0.15), { maxZoom: 16 });
    }
  }

  const legend = document.createElement('div');
  legend.className = 'map-legend map-legend-leaflet';
  legend.innerHTML = `
    <div class="map-legend-item"><span style="width:10px;height:10px;border-radius:50%;background:#3a8554;display:inline-block"></span>Favorável (≥80%)</div>
    <div class="map-legend-item"><span style="width:10px;height:10px;border-radius:50%;background:#d97706;display:inline-block"></span>Moderado (60–79%)</div>
    <div class="map-legend-item"><span style="width:10px;height:10px;border-radius:50%;background:#ef4444;display:inline-block"></span>Desfavorável (&lt;60%)</div>
  `;
  container.appendChild(legend);

  // List
  list.innerHTML = '';
  visibleTalhoes.forEach(t => {
    const status = talhaoStatusPresentation(t);
    const el = document.createElement('div');
    el.className = `talhao-list-card talhao-status-${t.status} ${t.id === selectedTalhaoRefId ? 'selected' : ''}`;
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-pressed', String(t.id === selectedTalhaoRefId));
    el.innerHTML = `
      <div class="talhao-card-top">
        <div class="talhao-card-identity">
          <div class="talhao-num">${String(t.id).padStart(2,'0')}</div>
          <div class="talhao-info">
            <div class="talhao-name">${escapeHtml(t.name || 'Talhão')}</div>
            <div class="talhao-meta">${escapeHtml(t.culture || 'Cultura não informada')} · ${Number(t.area) ? `${Number(t.area).toFixed(1)} ha` : 'Área não informada'}</div>
          </div>
        </div>
        <span class="talhao-status-label ${status.chip}">${status.label}</span>
      </div>
      <div class="talhao-card-bottom">
        <span class="talhao-card-window">${escapeHtml(t.window || 'Sem janela recomendada')}</span>
        <strong class="talhao-iea-chip ${status.chip}">IEA ${Number.isFinite(t.iea) ? `${t.iea}%` : '—'}</strong>
      </div>
    `;
    el.addEventListener('click', () => {
      selectTalhao(t.id);
      focusTalhaoOnMap(t.id);
    });
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.click();
      }
    });
    list.appendChild(el);
  });
  renderSelectedTalhaoMapInfo(TALHOES_DATA.find(item => item.id === selectedTalhaoRefId));
}

function openCadastrarTalhaoModal() {
  if (!FARM.permissions?.manage) {
    showToast('Seu perfil não pode cadastrar talhões nesta fazenda.', 'error');
    return;
  }
  document.getElementById('cadastroTalhaoForm')?.reset();
  document.getElementById('novoTalhaoCultura').value = FARM.culture || '';
  document.getElementById('modalCadastrarTalhao').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => {
    renderTalhaoLocationPicker('novoTalhaoMap', 'novoTalhaoLatitude', 'novoTalhaoLongitude');
  }, 0);
}

function closeCadastrarTalhaoModal() {
  destroyTalhaoLocationPicker('novoTalhaoMap');
  document.getElementById('modalCadastrarTalhao').style.display = 'none';
  document.body.style.overflow = '';
}

function openEditarTalhaoModal(talhaoId) {
  if (!FARM.permissions?.manage) {
    showToast('Seu perfil não pode alterar talhões nesta fazenda.', 'error');
    return;
  }
  const t = TALHOES_DATA.find(item => item.id === talhaoId);
  if (!t) return;
  document.getElementById('editarTalhaoId').value = t.id;
  document.getElementById('editarTalhaoNome').value = t.name;
  document.getElementById('editarTalhaoArea').value = t.area ?? '';
  document.getElementById('editarTalhaoCultura').value = t.culture || '';
  document.getElementById('editarTalhaoLatitude').value = t.latitude ?? '';
  document.getElementById('editarTalhaoLongitude').value = t.longitude ?? '';
  document.getElementById('editarTalhaoRaio').value = t.radius || 80;
  document.getElementById('modalEditarTalhao').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => {
    renderTalhaoLocationPicker('editarTalhaoMap', 'editarTalhaoLatitude', 'editarTalhaoLongitude', t.id);
  }, 0);
}

function destroyTalhaoLocationPicker(mapId) {
  const picker = talhaoLocationPickers.get(mapId);
  if (!picker) return;
  picker.controller.abort();
  picker.map.remove();
  talhaoLocationPickers.delete(mapId);
}

function renderTalhaoLocationPicker(mapId, latitudeInputId, longitudeInputId, selectedTalhaoId = null) {
  const container = document.getElementById(mapId);
  const latitudeInput = document.getElementById(latitudeInputId);
  const longitudeInput = document.getElementById(longitudeInputId);
  const status = document.getElementById(`${mapId}Status`);
  if (!container || !latitudeInput || !longitudeInput) return;
  if (typeof L === 'undefined') {
    container.innerHTML = '<div class="map-loading-message">Mapa indisponível. Informe latitude e longitude nos campos.</div>';
    return;
  }

  destroyTalhaoLocationPicker(mapId);
  const selectedLatitude = finiteWeatherValue(latitudeInput.value);
  const selectedLongitude = finiteWeatherValue(longitudeInput.value);
  const otherTalhoes = TALHOES_DATA.filter(item =>
    item.id !== selectedTalhaoId
    && Number.isFinite(item.latitude)
    && Number.isFinite(item.longitude)
  );
  const center = selectedLatitude != null && selectedLongitude != null
    ? [selectedLatitude, selectedLongitude]
    : otherTalhoes.length
      ? [otherTalhoes[0].latitude, otherTalhoes[0].longitude]
      : [-14.235, -51.9253];
  const zoom = selectedLatitude != null && selectedLongitude != null ? 16 : otherTalhoes.length ? 14 : 4;
  const map = L.map(container).setView(center, zoom);
  const controller = new AbortController();
  addBaseMapTiles(map);

  otherTalhoes.forEach(item => {
    L.circleMarker([item.latitude, item.longitude], {
      radius: 6,
      color: '#fff',
      weight: 2,
      fillColor: '#64748b',
      fillOpacity: 0.9,
    }).bindTooltip(`${item.name} · localização cadastrada`).addTo(map);
  });

  let marker = null;
  const updateStatus = () => {
    if (!status) return;
    const latitude = finiteWeatherValue(latitudeInput.value);
    const longitude = finiteWeatherValue(longitudeInput.value);
    if (latitude == null || longitude == null) {
      status.textContent = 'Selecione o ponto deste talhão no mapa ou informe as coordenadas.';
      return;
    }
    if (marker) marker.setLatLng([latitude, longitude]);
    else marker = L.marker([latitude, longitude], { draggable: true }).addTo(map);
    map.panTo([latitude, longitude]);
    marker.off('dragend');
    marker.on('dragend', event => {
      const point = event.target.getLatLng();
      setPoint(point.lat, point.lng);
    });
    const duplicate = otherTalhoes.find(item =>
      Math.abs(item.latitude - latitude) < 0.000001
      && Math.abs(item.longitude - longitude) < 0.000001
    );
    status.textContent = duplicate
      ? `Ponto igual ao ${duplicate.name}. Escolha o centro específico deste talhão se as áreas forem diferentes.`
      : `Localização deste talhão: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  };
  const setPoint = (latitude, longitude) => {
    latitudeInput.value = latitude.toFixed(6);
    longitudeInput.value = longitude.toFixed(6);
    updateStatus();
  };
  map.on('click', event => setPoint(event.latlng.lat, event.latlng.lng));
  latitudeInput.addEventListener('input', updateStatus, { signal: controller.signal });
  longitudeInput.addEventListener('input', updateStatus, { signal: controller.signal });
  talhaoLocationPickers.set(mapId, { map, controller });
  updateStatus();
  window.setTimeout(() => map.invalidateSize(), 50);
}

function closeEditarTalhaoModal() {
  destroyTalhaoLocationPicker('editarTalhaoMap');
  document.getElementById('modalEditarTalhao').style.display = 'none';
  document.body.style.overflow = '';
}

async function cadastrarTalhao(e) {
  e.preventDefault();
  try {
    const name = document.getElementById('novoTalhaoNome').value.trim();
    const area = Number(document.getElementById('novoTalhaoArea').value);
    const culture = document.getElementById('novoTalhaoCultura').value.trim();
    const latitude = Number(document.getElementById('novoTalhaoLatitude').value);
    const longitude = Number(document.getElementById('novoTalhaoLongitude').value);
    const radius = Number(document.getElementById('novoTalhaoRaio').value) || 80;
    if (!name || !area || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      showToast('Informe a localização do talhão.', 'error');
      return;
    }

    const response = await apiRequest('/api/talhoes/', { method: 'POST', body: JSON.stringify({ nome: name, area, cultura: culture, latitude, longitude, raio: radius }) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      showToast(error.message || 'Não foi possível salvar o talhão no banco.', 'error');
      return;
    }
    const saved = (await response.json()).talhao;
    TALHOES_DATA.push({ ...saved, temp: null, iea: null, status: 'insufficient', window: '', product: '', mapX: 8, mapY: 8, mapW: 18, mapH: 22 });
    selectedTalhaoRefId = saved.id;
    localStorage.setItem('goldcrop.selectedTalhaoId', String(saved.id));
    closeCadastrarTalhaoModal();
    await syncAllViewsFromServer();
    showToast(`${name} cadastrado. Aguardando dados para calcular a necessidade.`);
  } catch (error) {
    console.error('Erro ao cadastrar talhão:', error);
    showToast('Não foi possível conectar ao servidor.', 'error');
  }
}

async function atualizarTalhao(e) {
  e.preventDefault();
  const id = Number(document.getElementById('editarTalhaoId').value);
  const talhao = TALHOES_DATA.find(item => item.id === id);
  if (!talhao) return;

  try {
    const payload = {
      nome: document.getElementById('editarTalhaoNome').value.trim(),
      area: Number(document.getElementById('editarTalhaoArea').value),
      cultura: document.getElementById('editarTalhaoCultura').value.trim(),
      latitude: Number(document.getElementById('editarTalhaoLatitude').value),
      longitude: Number(document.getElementById('editarTalhaoLongitude').value),
      raio: Number(document.getElementById('editarTalhaoRaio').value) || 80,
    };

    const response = await apiRequest(`/api/talhoes/${id}/`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      showToast(error.message || 'Não foi possível atualizar o talhão.', 'error');
      return;
    }

    const updated = (await response.json()).talhao;
    Object.assign(talhao, {
      ...talhao,
      ...updated,
      id: talhao.id,
      name: updated.name || talhao.name,
      area: Number(updated.area ?? talhao.area),
      culture: updated.culture || talhao.culture,
      latitude: updated.latitude ?? talhao.latitude,
      longitude: updated.longitude ?? talhao.longitude,
      radius: updated.radius ?? talhao.radius,
    });

    selectedTalhaoRefId = id;
    localStorage.setItem('goldcrop.selectedTalhaoId', String(id));
    closeEditarTalhaoModal();
    await syncAllViewsFromServer();
    showToast(`Talhão atualizado: ${payload.nome}`, 'success');
  } catch (error) {
    console.error('Erro ao atualizar talhão:', error);
    showToast('Não foi possível conectar ao servidor.', 'error');
  }
}

async function excluirTalhao(talhaoId) {
  const talhao = TALHOES_DATA.find(item => item.id === talhaoId);
  if (!talhao) return;

  const confirmed = window.confirm(`Deseja excluir ${talhao.name}?`);
  if (!confirmed) return;

  try {
    const response = await apiRequest(`/api/talhoes/${talhaoId}/delete/`, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      showToast(error.message || 'Não foi possível excluir o talhão.', 'error');
      return;
    }

    const index = TALHOES_DATA.findIndex(item => item.id === talhaoId);
    if (index >= 0) TALHOES_DATA.splice(index, 1);
    closeTalhaoModal();
    await syncAllViewsFromServer();
    showToast(`Talhão removido: ${talhao.name}`, 'success');
  } catch (error) {
    console.error('Erro ao excluir talhão:', error);
    showToast('Não foi possível conectar ao servidor.', 'error');
  }
}

function openTalhaoModal(t) {
  const body = document.getElementById('talhaoModalBody');
  const title = document.getElementById('talhaoModalTitle');
  if (!body || !title) return;

  title.textContent = t.name || 'Talhão';
  body.innerHTML = getTalhaoDetailsMarkup(t);
  document.getElementById('modalTalhao').style.display = 'flex';
}

function getTalhaoDetailsMarkup(t, { inline = false } = {}) {
  const safeName = t.name || 'Talhão';
  const safeArea = finiteWeatherValue(t.area);
  const safeCulture = t.culture || 'Não informada';
  const safeAge = t.age || '—';
  const safeVariety = t.variety || '—';
  const safeSoil = t.soil || 'Não informado';
  const safeSensor = t.sensor || 'Não disponível';
  const safeLastReading = t.lastReading || 'Sem leitura disponível';
  const nextPlanning = PLANNINGS_FROM_DB
    .filter(item => item.talhao_id === t.id && item.status === 'PLANEJADA')
    .sort((a, b) => a.data_planejada.localeCompare(b.data_planejada))[0];
  const safeProduct = nextPlanning?.produto || 'Nenhum planejamento cadastrado';
  const safeInputType = nextPlanning?.tipo_aplicacao || '';
  const safeDose = nextPlanning ? `${nextPlanning.dose || ''} ${nextPlanning.unidade_dose || ''}`.trim() : '';
  const safePeriod = nextPlanning?.data_planejada || '';
  const safeIea = Number.isFinite(t.iea) ? t.iea : null;
  const safeRain = Number.isFinite(t.rain) ? t.rain : null;
  const safeTemp = Number.isFinite(t.temp) ? t.temp : null;
  const bestMetrics = t.analysis?.bestRecommendation?.metrics || {};
  const safeWind = Number.isFinite(bestMetrics.windSpeed) ? bestMetrics.windSpeed : null;
  const safeLatitude = finiteWeatherValue(t.latitude);
  const safeLongitude = finiteWeatherValue(t.longitude);
  const safeRadius = finiteWeatherValue(t.radius) ?? 80;
  const statusColor = t.status === 'favorable' ? '#3a8554' : t.status === 'moderate' ? '#d97706' : t.status === 'unfavorable' ? '#ef4444' : '#6b7280';
  const previous = HISTORICO_DATA.filter(h =>
    h.talhao_id != null && Number(h.talhao_id) === Number(t.id)
  ).slice(0, 3);
  const coordsText = safeLatitude !== null && safeLongitude !== null
    ? `${safeLatitude.toFixed(6)}, ${safeLongitude.toFixed(6)}`
    : 'Coordenadas não cadastradas';
  const status = talhaoStatusPresentation(t);
  const canManageFarm = Boolean(FARM.permissions?.manage);
  const canRecordApplication = Boolean(FARM.permissions?.record);
  const actions = [
    inline ? '' : '<button class="btn-ghost" type="button" onclick="closeTalhaoModal()">Fechar</button>',
    canManageFarm ? `<button class="btn-ghost" type="button" onclick="openEditarTalhaoModal(${Number(t.id)})">Editar localização</button>` : '',
    canManageFarm ? `<button class="btn-ghost" type="button" onclick="excluirTalhao(${Number(t.id)})" style="border-color:#ef4444;color:#ef4444">Excluir talhão</button>` : '',
    canRecordApplication ? `<button class="btn-primary" type="button" onclick="${inline ? '' : 'closeTalhaoModal();'}openRegistrar(${Number(t.id)})">Registrar aplicação</button>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="talhao-detail-head"><div><strong>${safeArea === null ? 'Área não informada' : `${formatMetricValue(safeArea, ' ha')}`} · ${safeCulture} · ${safeAge}</strong><span>${safeVariety} · Solo ${safeSoil}</span></div><span class="monitoring-status">${status.label}</span></div>
    <div class="detail-section-title">Condição e telemetria <small>Sensor: ${safeSensor}</small></div>
    <div class="talhao-modal-grid">
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Umidade do sensor</div><div class="talhao-modal-metric-value sensor-locked-value">${SENSOR_HUMIDITY_LOCKED}</div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Temperatura do ar prevista</div><div class="talhao-modal-metric-value">${safeTemp === null ? '—' : formatMetricValue(safeTemp, '°C')}</div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Status do sensor</div><div class="talhao-modal-metric-value">${safeSensor} <small>Sem telemetria confirmada</small></div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Última leitura</div><div class="talhao-modal-metric-value">${safeLastReading}</div></div>
    </div>

    <div class="detail-section-title">Localização do talhão</div>
    <div class="talhao-modal-grid">
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Latitude</div><div class="talhao-modal-metric-value">${safeLatitude !== null ? safeLatitude.toFixed(6) : '—'}</div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Longitude</div><div class="talhao-modal-metric-value">${safeLongitude !== null ? safeLongitude.toFixed(6) : '—'}</div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Raio</div><div class="talhao-modal-metric-value">${safeRadius} m</div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Coordenadas</div><div class="talhao-modal-metric-value">${coordsText}</div></div>
    </div>

    <div class="detail-section-title">Próxima aplicação planejada</div>
    <div class="planned-application"><div><strong>${safeProduct}</strong><span>${[safeInputType, safeDose, safePeriod].filter(Boolean).join(' · ')}</span></div>${FARM.permissions?.plan ? `<button class="btn-ghost" type="button" onclick="openPlanejar(${t.id})">Planejar aplicação</button>` : ''}</div>
    <section class="gold-window-detail" style="--iea-color:${statusColor}"><div class="gold-window-heading"><div><span>Janela de Ouro · ${safeName}</span><strong>${t.window || 'Aguardando dados'}</strong><small>${safeIea === null ? 'Sem recomendação calculada para este talhão' : `IEA de ${safeIea}% para análise deste talhão`}</small></div><b>${safeIea === null ? '—' : `${safeIea}%`}<small>IEA</small></b></div><div class="window-factors"><span>Chuva prevista <b>${safeRain === null ? '—' : formatMetricValue(safeRain, ' mm')}</b></span><span>Umidade do sensor <b class="sensor-locked-value">${SENSOR_HUMIDITY_LOCKED}</b></span><span>Vento previsto <b>${safeWind === null ? '—' : formatMetricValue(safeWind, ' km/h')}</b></span><span>IEA <b>${safeIea === null ? '—' : `${safeIea}%`}</b></span></div><p>A análise meteorológica é calculada para este talhão quando há coordenadas. Leituras de sensor não estão disponíveis e não são estimadas como telemetria real.</p></section>
    <div class="detail-section-title">Evolução estimada da umidade <small>Disponível após disponibilizar um sensor</small></div>
    <div class="moisture-chart moisture-chart-locked"><div class="sensor-locked-message">Módulo de umidade bloqueado<br><small>Disponibilize um sensor para habilitar as leituras.</small></div></div>
    <div class="detail-section-title">Histórico do talhão</div>
    <div class="detail-history">${previous.length ? previous.map(h => `<div><span>${escapeHtml(h.date)}</span><strong>Produto: ${escapeHtml(h.product)} · Quantidade: ${escapeHtml(h.qty)}</strong><em>${h.ieaPrev == null ? 'IEA indisponível' : `IEA ${escapeHtml(h.ieaPrev)}%`} · Resultado: ${escapeHtml(h.result)}</em></div>`).join('') : '<p>Nenhuma aplicação registrada neste talhão.</p>'}</div>
    <div class="detail-actions">${actions}</div>
  `;
}

function closeTalhaoModal() {
  document.getElementById('modalTalhao').style.display = 'none';
}

// =====================================================
// MINHA FAZENDA — SHARED COLLABORATION SPACE
// =====================================================

function renderFazenda() {
  const container = document.getElementById('fazendaContent');
  if (!container) return;
  if (!FARM.name) {
    container.innerHTML = '<p class="farm-section-sub">Nenhuma fazenda cadastrada ou compartilhada com esta conta.</p>';
    return;
  }
  const teamData = TEAM_DATA;
  const activityData = ACTIVITY_DATA;
  const best = getSelectedReferenceTalhao()?.analysis?.bestRecommendation;
  const selected = getSelectedReferenceTalhao();
  const nextDate = best ? formatRecommendationDate(best.date) : 'Aguardando análise';
  const nextTime = best ? formatRecommendationTime(best) : '—';
  const nextIea = best?.adequacyIndex;
  const plannedCount = Object.values(CAL_DATA).filter(day => day.planned).length;
  const teamCards = teamData.map(person => `
    <article class="team-member-card">
      <div class="team-avatar">${escapeHtml(initialsFromName(person.name))}</div>
      <div class="team-member-main"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.role_label)}</span><small>${escapeHtml(person.email)}</small></div>
      ${FARM.permissions?.team && person.role !== 'OWNER' ? `<button type="button" class="btn-ghost-sm" onclick="removeFarmMember(${Number(person.id)})">Remover</button>` : ''}
    </article>`).join('');
  const invitations = INVITATIONS_DATA.map(invitation => `
    <article class="team-member-card pending-invitation">
      <div class="team-avatar">${escapeHtml(invitation.email.slice(0, 1).toUpperCase())}</div>
      <div class="team-member-main"><strong>${escapeHtml(invitation.email)}</strong><span>Convite pendente · ${escapeHtml(invitation.role_label)}</span><small>Expira em ${new Date(invitation.expires_at).toLocaleDateString('pt-BR')}</small></div>
      ${FARM.permissions?.team ? `<button type="button" class="btn-ghost-sm" onclick="revokeInvitation(${Number(invitation.id)})">Revogar</button>` : ''}
    </article>`).join('');
  const activities = activityData.length ? activityData.slice(0, 8).map(item => `
    <div class="farm-activity"><div class="activity-avatar">${escapeHtml(initialsFromName(item.actor || ''))}</div>
      <div><strong>${escapeHtml(item.actor || 'GoldCrop')}</strong> · ${escapeHtml(item.title)}<b>${escapeHtml(item.message)}</b>
        <span>${new Date(item.created_at).toLocaleString('pt-BR')}</span></div></div>`).join('') : '<p class="farm-section-sub">Nenhuma atividade registrada.</p>';
  const location = [FARM.city, FARM.state].filter(Boolean).join(', ') || 'Localização não informada';
  const sensors = FARM.sensors || 0;
  container.innerHTML = `
    <header class="farm-hero">
      <div class="farm-hero-mark">✦</div><div class="farm-hero-copy"><span>Dados compartilhados</span><h1>${escapeHtml(FARM.name)}</h1><p>${escapeHtml(location)} · ${escapeHtml(FARM.culture || 'Cultivo não informado')}</p></div>
      <div class="farm-hero-stats"><div><b>${FARM.area || '—'}</b><span>hectares</span></div><div><b>${FARM.talhoes}</b><span>talhões</span></div><div><b>${sensors}</b><span>sensores ativos</span></div><div><b>${teamData.length}</b><span>pessoas</span></div></div>
      ${FARM.permissions?.team ? '<button class="btn-primary" onclick="openPessoa()">+ Convidar pessoa</button>' : ''}
    </header>
    <div class="farm-shared-note"><span>◉</span><div><strong>Equipe com acesso a esta fazenda</strong><p>Talhões e operações são carregados do banco e compartilhados conforme a função de cada membro.</p></div></div>
    <div class="farm-data-grid"><div><span>Talhões monitorados</span><b>${FARM.talhoes}</b></div><div><span>Sensores ativos</span><b>${sensors}</b></div><div><span>Aplicações planejadas</span><b>${plannedCount}</b></div><div><span>Aplicações realizadas</span><b>${HISTORICO_DATA.filter(h => h.resultClass === 'done').length}</b></div><div class="next-window"><span>Próxima Janela de Ouro · ${escapeHtml(selected?.name || 'Sem talhão')}</span><b>${nextDate} · ${nextTime}</b><small>${nextIea == null ? 'Sem recomendação disponível' : `Recomendação do motor · IEA ${nextIea}%`}</small></div></div>
    <div class="farm-main-grid"><section class="farm-section card"><div class="card-header"><div><h2 class="farm-section-title">Pessoas da Fazenda</h2><p class="farm-section-sub">Membros e convites persistidos.</p></div><span class="team-count">${teamData.length} membro${teamData.length === 1 ? '' : 's'}</span></div><div class="team-list">${teamCards}${invitations}</div></section><section class="farm-section card"><div class="card-header"><div><h2 class="farm-section-title">Atividades recentes</h2><p class="farm-section-sub">Eventos operacionais registrados no sistema.</p></div></div><div class="activity-timeline">${activities}</div></section></div>
    <section class="farm-section card permissions-section"><div class="card-header"><div><h2 class="farm-section-title">Permissões da equipe</h2><p class="farm-section-sub">Permissões aplicadas no servidor em todas as operações.</p></div></div><div class="permission-table-wrap"><table class="permission-table"><thead><tr><th>Perfil</th><th>Visualizar</th><th>Planejar</th><th>Registrar</th><th>Gerenciar talhões/equipe</th></tr></thead><tbody><tr><td><b>Proprietário</b></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr><tr><td><b>Gerente</b></td><td>✓</td><td>✓</td><td>✓</td><td>Talhões</td></tr><tr><td><b>Técnico / Agrônomo</b></td><td>✓</td><td>✓</td><td>✓</td><td>—</td></tr><tr><td><b>Funcionário</b></td><td>✓</td><td>—</td><td>✓</td><td>—</td></tr></tbody></table></div></section>`;
}

function initialsFromName(name) { return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—'; }

function openPessoa() {
  document.getElementById('pessoaEmail').value = '';
  document.getElementById('invitationError').hidden = true;
  document.getElementById('modalPessoa').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closePessoa() { document.getElementById('modalPessoa').style.display = 'none'; document.body.style.overflow = ''; }
async function submitPessoa() {
  const email = document.getElementById('pessoaEmail').value.trim();
  const errorElement = document.getElementById('invitationError');
  const button = document.getElementById('sendInvitationButton');
  if (!email) { errorElement.textContent = 'Informe o e-mail da pessoa.'; errorElement.hidden = false; return; }
  button.disabled = true;
  try {
    const response = await apiRequest('/api/farms/invitations/', {
      method: 'POST',
      body: JSON.stringify({ email, role: document.getElementById('pessoaFuncao').value }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível enviar o convite.');
    await loadFarmTeamData();
    closePessoa();
    renderFazenda();
    showToast('Convite enviado por e-mail e registrado no sistema.', 'success');
  } catch (error) {
    errorElement.textContent = error.message || 'Falha ao enviar o convite.';
    errorElement.hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function revokeInvitation(invitationId) {
  try {
    const response = await apiRequest(`/api/farms/invitations/${invitationId}/`, { method: 'DELETE', body: '{}' });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível revogar o convite.');
    await loadFarmTeamData();
    renderFazenda();
    showToast('Convite revogado.', 'success');
  } catch (error) {
    showToast(error.message || 'Não foi possível revogar o convite.', 'error');
  }
}

async function removeFarmMember(userId) {
  if (!window.confirm('Remover este membro da fazenda? O acesso será encerrado imediatamente.')) return;
  try {
    const response = await apiRequest(`/api/farms/team/${userId}/`, { method: 'DELETE', body: '{}' });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível remover o membro.');
    await loadFarmTeamData();
    renderFazenda();
    showToast('Acesso do membro removido.', 'success');
  } catch (error) {
    showToast(error.message || 'Não foi possível remover o membro.', 'error');
  }
}

// =====================================================
// HISTÓRICO
// =====================================================

function renderHistorico() {
  const container = document.getElementById('historicoTable');
  if (!container) return;

  const ieaClass = iea => iea == null || !Number.isFinite(Number(iea)) ? 'unavailable' : Number(iea) >= 80 ? 'high' : Number(iea) >= 60 ? 'medium' : 'low';

  container.innerHTML = `
    <div style="overflow-x:auto">
    <table class="hist-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Talhão</th>
          <th>Produto</th>
          <th>Quantidade</th>
          <th>IEA Previsto</th>
          <th>Condição Real</th>
          <th>Equipe</th>
          <th>Resultado</th>
        </tr>
      </thead>
      <tbody>
        ${HISTORICO_DATA.map(h => `
          <tr>
            <td class="hist-date">${h.date}</td>
            <td class="hist-talhao">${h.talhao}</td>
            <td class="hist-product">${h.product}</td>
            <td style="color:#6b7280">${h.qty}</td>
            <td><span class="hist-iea-badge ${ieaClass(h.ieaPrev)}">${h.ieaPrev == null ? '—' : `${h.ieaPrev}%`}</span></td>
            <td><span class="hist-cond-badge ${h.condClass}">${h.cond}</span></td>
            <td style="font-size:.72rem"><strong>${h.plannedBy || '—'}</strong><br><span style="color:#9ca3af">Realizada: ${h.doneBy || '—'}</span></td>
            <td><span class="hist-result-badge ${h.resultClass}">
              ${h.resultClass === 'done' ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '—'}
              ${h.result}
            </span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
}

// =====================================================
// APLICAÇÕES
// =====================================================

function renderAplicacoes() {
  const container = document.getElementById('aplicacoesContent');
  if (!container) return;

  const done = HISTORICO_DATA.filter(h => h.resultClass === 'done').length;
  const total = HISTORICO_DATA.length;
  const successRate = total ? Math.round(done / total * 100) : 0;

  container.innerHTML = `
    <div class="aplicacoes-stats">
      <div class="aplic-stat-card">
        <div class="aplic-stat-value" style="color:#3a8554">${done}</div>
        <div class="aplic-stat-label">Aplicações realizadas</div>
      </div>
      <div class="aplic-stat-card">
        <div class="aplic-stat-value" style="color:#ef4444">${total - done}</div>
        <div class="aplic-stat-label">Não realizadas</div>
      </div>
      <div class="aplic-stat-card">
        <div class="aplic-stat-value" style="color:#c9a227">${total ? `${successRate}%` : '—'}</div>
        <div class="aplic-stat-label">Taxa de aproveitamento</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Últimas Aplicações</h3>
        <button class="btn-primary" onclick="openRegistrar()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova
        </button>
      </div>
      <div id="aplicacoesTableInner"></div>
    </div>
  `;

  // Reuse historico table
  const tableContainer = document.getElementById('aplicacoesTableInner');
  const ieaClass = iea => iea == null || !Number.isFinite(Number(iea)) ? 'unavailable' : Number(iea) >= 80 ? 'high' : Number(iea) >= 60 ? 'medium' : 'low';
  tableContainer.innerHTML = `
    <div style="overflow-x:auto">
    <table class="hist-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Talhão</th>
          <th>Produto</th>
          <th>IEA</th>
          <th>Resultado</th>
        </tr>
      </thead>
      <tbody>
        ${HISTORICO_DATA.slice(0, 5).map(h => `
          <tr>
            <td class="hist-date">${h.date}</td>
            <td class="hist-talhao">${h.talhao}</td>
            <td class="hist-product">${h.product}</td>
            <td><span class="hist-iea-badge ${ieaClass(h.ieaPrev)}">${h.ieaPrev == null ? '—' : `${h.ieaPrev}%`}</span></td>
            <td><span class="hist-result-badge ${h.resultClass}">${h.result}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
}

// =====================================================
// SETTINGS
// =====================================================

function renderSettings() {
  const container = document.getElementById('settingsContent');
  if (!container) return;
  const canManage = Boolean(FARM.permissions?.manage);
  const talhao = getSelectedReferenceTalhao();
  const weather = talhao?.weather;
  const forecastDays = weather?.daily?.time?.length;
  const fetchedAt = weather?.fetchedAt ? new Date(weather.fetchedAt).toLocaleString('pt-BR') : 'Nenhuma coleta salva';
  container.innerHTML = `
    <div class="settings-grid">
      <div class="settings-card">
        <div class="settings-card-title">Propriedade</div>
        <form id="farmSettingsForm" onsubmit="event.preventDefault(); saveFarmSettings()">
          <div class="form-group" style="margin-bottom:.75rem">
            <label class="form-label" for="farmSettingName">Nome da fazenda</label>
            <input class="form-input" id="farmSettingName" maxlength="150" value="${escapeHtml(FARM.name)}" required ${canManage ? '' : 'readonly'} />
          </div>
          <div class="form-group" style="margin-bottom:.75rem">
            <label class="form-label" for="farmSettingCulture">Cultura principal</label>
            <input class="form-input" id="farmSettingCulture" value="${escapeHtml(FARM.culture || '')}" ${canManage ? '' : 'readonly'} />
          </div>
          <div class="form-group">
            <label class="form-label" for="farmSettingArea">Área total (ha)</label>
            <input class="form-input" id="farmSettingArea" type="number" min="0.01" step="0.01" value="${FARM.area || ''}" required ${canManage ? '' : 'readonly'} />
          </div>
          ${canManage ? '<button class="btn-primary" style="margin-top:1rem;width:100%;justify-content:center" type="submit">Salvar dados da fazenda</button>' : '<p class="settings-label">Somente proprietário ou gerente pode alterar esses dados.</p>'}
        </form>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">Notificações</div>
        <p class="sensor-module-message">Alertas no sino são gerados e salvos quando o sistema registra uma nova recomendação, um planejamento ou uma aplicação. O estado de leitura é individual por usuário.</p>
      </div>

      <div class="settings-card sensor-module-card">
        <div class="settings-card-title">Sensores IoT</div>
        <div class="settings-row"><span class="settings-label">Sensores ativos cadastrados</span><strong>${Number(FARM.sensors || 0)}</strong></div>
        <p class="sensor-module-message">${FARM.sensors ? 'A telemetria depende das leituras recebidas e salvas para cada sensor.' : 'Nenhum sensor IoT ativo está cadastrado nesta fazenda; leituras de umidade não serão estimadas.'}</p>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">Dados de análise</div>
        <div class="settings-row"><span class="settings-label">Motor</span><strong>${escapeHtml(window.GOLDCROP_RECOMMENDATIONS?.engine || 'GoldCropAnalysisEngine')}</strong></div>
        <div class="settings-row"><span class="settings-label">Dias de previsão retornados</span><strong>${Number.isInteger(forecastDays) ? forecastDays : '—'}</strong></div>
        <div class="settings-row"><span class="settings-label">Fonte meteorológica</span><strong>${weather ? 'Open-Meteo' : 'Sem coleta disponível'}</strong></div>
        <div class="settings-row"><span class="settings-label">Última coleta salva</span><strong>${escapeHtml(fetchedAt)}</strong></div>
      </div>
    </div>
  `;
}

async function saveFarmSettings() {
  try {
    const response = await apiRequest('/api/farms/settings/', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('farmSettingName').value.trim(),
        culture: document.getElementById('farmSettingCulture').value.trim(),
        area: document.getElementById('farmSettingArea').value,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível salvar a fazenda.');
    Object.assign(FARM, result.farm);
    USER_DATA.farm = FARM.name;
    updateProfileDOM();
    showToast('Dados da fazenda atualizados no banco.', 'success');
  } catch (error) {
    showToast(error.message || 'Falha ao salvar os dados da fazenda.', 'error');
  }
}

// =====================================================
// MODAL: REGISTRAR APLICAÇÃO
// =====================================================

function openRegistrar(talhaoId, planejamentoId = null) {
  if (!FARM.permissions?.record) {
    showToast('Seu perfil não pode registrar aplicações nesta fazenda.', 'error');
    return;
  }
  const select = document.getElementById('formTalhao');
  const selectedId = Number(talhaoId || selectedTalhaoRefId);
  select.innerHTML = TALHOES_DATA.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${t.name}</option>`).join('');
  document.getElementById('formPlanejamentoId').value = planejamentoId || '';
  const t = TALHOES_DATA.find(item => item.id === selectedId);
  const planejamento = PLANNINGS_FROM_DB.find(item => item.id === Number(planejamentoId));
  document.getElementById('formProduto').value = planejamento?.produto || '';
  document.getElementById('formQtd').value = planejamento?.dose || '';
  document.getElementById('formTipo').value = planejamento?.tipo_aplicacao || 'Fertilizante';
  document.getElementById('formData').value = new Date().toISOString().slice(0, 10);
  const preview = document.getElementById('applicationIeaPreview');
  const description = document.getElementById('applicationIeaDescription');
  const recommendation = t?.analysis?.bestRecommendation;
  if (preview) preview.textContent = recommendation ? `IEA para ${t.name}: ${recommendation.adequacyIndex}%` : 'IEA indisponível para este talhão';
  if (description) description.textContent = recommendation ? `${recommendation.decision} · ${formatRecommendationDate(recommendation.date)}` : 'Aguardando análise individual';
  document.getElementById('modalRegistrar').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function openPlanejar(talhaoId, plannedDate = null) {
  if (!FARM.permissions?.plan) {
    showToast('Seu perfil não pode planejar aplicações nesta fazenda.', 'error');
    return;
  }
  const t = TALHOES_DATA.find(item => item.id === talhaoId);
  if (!t) return;
  document.getElementById('planTalhao').value = t.name;
  document.getElementById('planTalhaoId').value = t.id;
  document.getElementById('planProduto').value = '';
  document.getElementById('planTipo').value = '';
  document.getElementById('planDose').value = '';
  document.getElementById('planPeriodo').value = '';
  const best = t.analysis?.bestRecommendation;
  document.getElementById('planData').value = plannedDate || best?.date || new Date().toISOString().slice(0, 10);
  document.getElementById('planResponsavel').value = USER_DATA.name;
  document.getElementById('modalPlanejar').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePlanejar() {
  document.getElementById('modalPlanejar').style.display = 'none';
  document.body.style.overflow = '';
}

async function submitPlanejar() {
  const t = TALHOES_DATA.find(item => item.id === Number(document.getElementById('planTalhaoId').value));
  const date = document.getElementById('planData').value;
  const plannedBy = document.getElementById('planResponsavel').value.trim() || USER_DATA.name;
  if (!t) {
    showToast('Talhão não encontrado para o planejamento.', 'error');
    return;
  }

  const product = document.getElementById('planProduto').value.trim();
  const type = document.getElementById('planTipo').value.trim();
  const doseRaw = document.getElementById('planDose').value.trim();
  const doseValue = doseRaw.match(/\d+(?:[.,]\d+)?/) ? doseRaw.match(/\d+(?:[.,]\d+)?/)[0].replace(',', '.') : doseRaw;
  const unidadeDose = doseRaw.includes('/') ? doseRaw.split(/\s+/).slice(-1)[0] : 'kg/ha';
  const observacoes = document.querySelector('#modalPlanejar textarea')?.value || '';

  if (!product || !date) {
    showToast('Preencha o produto e a data recomendada.', 'error');
    return;
  }

  try {
    const recommendation = (t.recommendations || []).find(item => item.date === date);
    const response = await apiRequest('/api/planejamentos/', {
      method: 'POST',
      body: JSON.stringify({
        talhao_id: t.id,
        recomendacao_id: recommendation?.id || null,
        produto: product,
        tipo_aplicacao: type,
        dose: doseValue,
        unidade_dose: unidadeDose,
        data_planejada: date,
        horario_inicial: '08:00',
        horario_final: '11:00',
        responsavel: plannedBy,
        observacoes,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      showToast(error.message || 'Não foi possível salvar o planejamento no banco.', 'error');
      return;
    }

    const planejamento = (await response.json()).planejamento;
    PLANNINGS_FROM_DB.push(planejamento);
    const calendarData = CAL_DATA[date] || { iea: recommendation?.adequacyIndex, type: 'future', rain: t.rain, temp: t.temp, app: false };
    CAL_DATA[date] = { ...calendarData, planned: `${t.name} · ${product}`, plannedBy, planejamentoId: planejamento?.id };

    closePlanejar();
    await syncAllViewsFromServer();
    showToast('Aplicação planejada e integrada ao calendário.', 'success');
  } catch (error) {
    console.error('Erro ao criar planejamento:', error);
    showToast('Não foi possível conectar ao servidor.', 'error');
  }
}

function closeRegistrar() {
  document.getElementById('modalRegistrar').style.display = 'none';
  document.body.style.overflow = '';
}

async function submitRegistrar() {
  const talhaoSelect = document.getElementById('formTalhao');
  const talhaoId = Number(talhaoSelect?.value);
  const produto = document.getElementById('formProduto').value.trim();
  const data = document.getElementById('formData').value;
  const horario = document.getElementById('formHorario').value;

  if (!produto.trim()) {
    showToast('Preencha o nome do produto.', 'error');
    return;
  }

  const talhaoEntity = TALHOES_DATA.find(item => item.id === talhaoId);
  if (!talhaoEntity) {
    showToast('Cadastre pelo menos um talhão antes de registrar.', 'error');
    return;
  }

  try {
    const response = await apiRequest('/api/applications/', {
      method: 'POST',
      body: JSON.stringify({
        talhao_id: talhaoEntity.id,
        planejamento_id: Number(document.getElementById('formPlanejamentoId').value) || null,
        produto,
        tipo: document.getElementById('formTipo').value,
        quantidade: document.getElementById('formQtd').value,
        data,
        horario,
        status: 'done',
        observacoes: document.getElementById('formObs').value,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      showToast(error.message || 'Não foi possível registrar a aplicação no banco.', 'error');
      return;
    }

    const savedApplication = (await response.json()).application;
    const savedIea = Number.isFinite(savedApplication.ieaPrev) ? savedApplication.ieaPrev : null;
    const dateFormatted = savedApplication.date;
    HISTORICO_DATA.unshift({
      id: savedApplication.id,
      date: dateFormatted,
      talhao: talhaoEntity.name,
      product: produto,
      qty: document.getElementById('formQtd').value || '',
      ieaPrev: savedIea,
      cond: savedIea === null ? 'Sem análise' : savedIea >= 80 ? 'Favorável' : savedIea >= 60 ? 'Moderada' : 'Desfavorável',
      result: 'Realizado',
      condClass: savedIea === null ? 'unavailable' : savedIea >= 80 ? 'favorable' : savedIea >= 60 ? 'moderate' : 'unfavorable',
      resultClass: 'done',
      plannedBy: '',
      doneBy: savedApplication.created_by || USER_DATA.name,
    });

    closeRegistrar();
    await syncAllViewsFromServer();
    showToast(`✅ Aplicação registrada: ${talhaoEntity.name} · ${produto}`, 'success');
  } catch (error) {
    console.error('Erro ao registrar aplicação:', error);
    showToast('Não foi possível conectar ao servidor.', 'error');
  }
}

// =====================================================
// TOAST
// =====================================================

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3500);
}

// =====================================================
// USER PROFILE STATE & MENU LOGIC
// =====================================================

const storedAuthUser = document.getElementById('auth-user-data');
const USER_DATA = storedAuthUser ? JSON.parse(storedAuthUser.textContent) : {
  name: 'Usuário',
  initials: '',
  email: '',
  phone: '',
  role: '',
  farm: '',
};

function toggleProfileDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('profileDropdown');
  const topbarBtn = document.getElementById('topbarUserBtn');
  const sidebarProfile = document.getElementById('sidebarUserProfile');
  if (!dropdown) return;

  const isShowing = dropdown.classList.contains('show');
  closeAllDropdowns();

  if (!isShowing) {
    const isSidebarTrigger = e?.currentTarget === sidebarProfile;
    dropdown.classList.toggle('sidebar-anchor', isSidebarTrigger);
    dropdown.classList.add('show');
    topbarBtn?.classList.add('active');
  }
}

function closeAllDropdowns() {
  const dropdown = document.getElementById('profileDropdown');
  const topbarBtn = document.getElementById('topbarUserBtn');
  dropdown?.classList.remove('show');
  dropdown?.classList.remove('sidebar-anchor');
  topbarBtn?.classList.remove('active');
}

function openPerfilModal() {
  closeAllDropdowns();
  
  document.getElementById('profileModalName').value = USER_DATA.name;
  document.getElementById('profileModalEmail').value = USER_DATA.email;
  document.getElementById('profileModalPhone').value = USER_DATA.phone;
  document.getElementById('profileModalRole').value = USER_DATA.role;
  document.getElementById('modalAvatarPreview').textContent = USER_DATA.initials;

  document.getElementById('modalPerfil').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePerfilModal() {
  document.getElementById('modalPerfil').style.display = 'none';
  document.body.style.overflow = '';
}

async function saveProfileChanges() {
  const name = document.getElementById('profileModalName').value.trim();
  const email = document.getElementById('profileModalEmail').value.trim();
  const phone = document.getElementById('profileModalPhone').value.trim();

  if (!name || !email) {
    showToast('Preencha os campos obrigatórios (Nome e E-mail).', 'error');
    return;
  }

  try {
    const response = await apiRequest('/api/profile/', { method: 'POST', body: JSON.stringify({ name, email, phone }) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível salvar o perfil no banco.');
    USER_DATA.name = result.name;
    USER_DATA.initials = initialsFromName(result.name);
    USER_DATA.email = result.email;
    USER_DATA.phone = result.phone;
    updateProfileDOM();
    closePerfilModal();
    showToast('Perfil atualizado no banco.', 'success');
  } catch (error) {
    showToast(error.message || 'Não foi possível salvar o perfil no banco.', 'error');
  }
}

function updateProfileDOM() {
  USER_DATA.initials = initialsFromName(USER_DATA.name);
  // Sidebar elements
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserFarm = document.getElementById('sidebarUserFarm');
  if (sidebarAvatar) sidebarAvatar.textContent = USER_DATA.initials;
  if (sidebarUserName) sidebarUserName.textContent = USER_DATA.name;
  if (sidebarUserFarm) sidebarUserFarm.textContent = USER_DATA.farm;

  // Topbar elements
  const topbarAvatar = document.getElementById('topbarAvatar');
  const topbarUserName = document.getElementById('topbarUserName');
  if (topbarAvatar) topbarAvatar.textContent = USER_DATA.initials;
  if (topbarUserName) topbarUserName.textContent = USER_DATA.name;

  // Dropdown elements
  const dropdownAvatar = document.getElementById('dropdownAvatar');
  const dropdownUserName = document.getElementById('dropdownUserName');
  const dropdownUserEmail = document.getElementById('dropdownUserEmail');
  const dropdownUserRole = document.getElementById('dropdownUserRole');
  if (dropdownAvatar) dropdownAvatar.textContent = USER_DATA.initials;
  if (dropdownUserName) dropdownUserName.textContent = USER_DATA.name;
  if (dropdownUserEmail) dropdownUserEmail.textContent = USER_DATA.email;
  if (dropdownUserRole) dropdownUserRole.textContent = USER_DATA.role;

  // Greeting title
  const firstName = USER_DATA.name.split(' ')[0];
  const greetingTitle = document.querySelector('.greeting-title');
  if (greetingTitle) {
    greetingTitle.innerHTML = `Bom dia, ${firstName} <span class="wave">👋</span>`;
  }
  const dashboardFarmName = document.getElementById('dashboardFarmName');
  if (dashboardFarmName) dashboardFarmName.textContent = FARM.name;
  const dashboardFarmTalhoes = document.getElementById('dashboardFarmTalhoes');
  if (dashboardFarmTalhoes) dashboardFarmTalhoes.textContent = `${FARM.talhoes} talhões`;
}

function openTrocarFazendaModal() {
  closeAllDropdowns();
  const list = document.getElementById('farmsSelectionList');
  list.innerHTML = '<p>Carregando fazendas acessíveis…</p>';
  document.getElementById('modalTrocarFazenda').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  apiRequest('/api/farms/').then(async response => {
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível carregar as fazendas.');
    list.innerHTML = result.farms.length ? result.farms.map(farm => `
      <button type="button" class="farm-select-card${farm.id === result.selected_farm_id ? ' active' : ''}" onclick="selectFarm(${Number(farm.id)})">
        <span class="farm-card-icon" aria-hidden="true">⌂</span>
        <span class="farm-card-info"><span class="farm-card-name">${escapeHtml(farm.name)}</span>
          <span class="farm-card-meta">${escapeHtml(farm.culture || 'Cultura não informada')} · ${Number(farm.area).toLocaleString('pt-BR')} ha · ${Number(farm.talhoes)} talhões · ${escapeHtml(farm.role)}</span></span>
        <span class="farm-card-badge">${farm.id === result.selected_farm_id ? 'Ativa' : 'Selecionar'}</span>
      </button>`).join('') : '<p>Nenhuma fazenda está vinculada a esta conta.</p>';
  }).catch(error => {
    list.innerHTML = `<p role="alert">${escapeHtml(error.message || 'Falha ao carregar fazendas.')}</p>`;
  });
}

function closeTrocarFazendaModal() {
  document.getElementById('modalTrocarFazenda').style.display = 'none';
  document.body.style.overflow = '';
}

async function selectFarm(farmId) {
  try {
    const response = await apiRequest('/api/farms/', {
      method: 'POST',
      body: JSON.stringify({ farm_id: Number(farmId) }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível selecionar a fazenda.');
    window.location.reload();
  } catch (error) {
    showToast(error.message || 'Não foi possível selecionar a fazenda.', 'error');
  }
}

function openSuporteModal() {
  closeAllDropdowns();
  document.getElementById('modalSuporte').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeSuporteModal() {
  document.getElementById('modalSuporte').style.display = 'none';
  document.body.style.overflow = '';
}

// =====================================================
// CALENDAR & GLOBAL NAV INITS
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });

  // Profile dropdown & menu events
  document.getElementById('topbarUserBtn')?.addEventListener('click', toggleProfileDropdown);
  document.getElementById('sidebarUserProfile')?.addEventListener('click', toggleProfileDropdown);

  document.getElementById('btnOpenPerfilModal')?.addEventListener('click', openPerfilModal);
  document.getElementById('btnProfileSettings')?.addEventListener('click', () => {
    closeAllDropdowns();
    navigateTo('settings');
  });
  document.getElementById('btnSwitchFarm')?.addEventListener('click', openTrocarFazendaModal);
  document.getElementById('btnSupport')?.addEventListener('click', openSuporteModal);
  document.getElementById('btnCadastrarTalhao')?.addEventListener('click', openCadastrarTalhaoModal);
  document.getElementById('cadastroTalhaoForm')?.addEventListener('submit', cadastrarTalhao);
  document.getElementById('edicaoTalhaoForm')?.addEventListener('submit', atualizarTalhao);
  ['calendarTalhaoSelect', 'dashboardTalhaoSelect', 'talhaoSelect'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', async event => {
      await selectTalhao(event.target.value);
    });
  });

  updateProfileDOM();
  await loadDatabaseState();
  syncCalendarTalhaoSelector();
  await loadLocalWeather(getSelectedReferenceTalhao()?.id);
  updateProfileDOM();
  await refreshLiveData();

  // Close dropdown on outside click or ESC
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profileDropdown');
    const topbarBtn = document.getElementById('topbarUserBtn');
    const sidebarProfile = document.getElementById('sidebarUserProfile');

    if (dropdown && dropdown.classList.contains('show')) {
      if (!dropdown.contains(e.target) && !topbarBtn?.contains(e.target) && !sidebarProfile?.contains(e.target)) {
        closeAllDropdowns();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllDropdowns();
      closePerfilModal();
      closeTrocarFazendaModal();
      closeSuporteModal();
    }
  });

  // Overlay click listeners for profile modals
  document.getElementById('modalPerfil')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePerfilModal();
  });
  document.getElementById('modalTrocarFazenda')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTrocarFazendaModal();
  });
  document.getElementById('modalCadastrarTalhao')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCadastrarTalhaoModal();
  });
  document.getElementById('modalEditarTalhao')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditarTalhaoModal();
  });
  document.getElementById('modalSuporte')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSuporteModal();
  });

  // Sidebar toggle
  document.getElementById('menuToggle').addEventListener('click', openSidebar);
  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

  // Calendar nav
  document.getElementById('calPrev')?.addEventListener('click', () => {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
    renderCalendar();
    document.getElementById('dayPanelEmpty').style.display = 'flex';
    document.getElementById('dayPanelContent').style.display = 'none';
  });

  document.getElementById('calNext')?.addEventListener('click', () => {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
    renderCalendar();
    document.getElementById('dayPanelEmpty').style.display = 'flex';
    document.getElementById('dayPanelContent').style.display = 'none';
  });

  // Modal close on overlay click
  document.getElementById('modalRegistrar').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeRegistrar();
  });

  document.getElementById('modalPlanejar')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePlanejar();
  });

  document.getElementById('modalPessoa')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePessoa();
  });

  document.getElementById('modalTalhao').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTalhaoModal();
  });

  // Render the page-specific content after each template is loaded.
  if (document.getElementById('page-dashboard')) renderDashboard();
  if (document.getElementById('calGrid')) renderCalendar();
  if (document.getElementById('mapContainer')) renderTalhoes();
  if (document.getElementById('fazendaContent')) renderFazenda();
  if (document.getElementById('historicoTable')) renderHistorico();
  if (document.getElementById('aplicacoesContent')) renderAplicacoes();
  if (document.getElementById('settingsContent')) renderSettings();

  // Filter pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.closest('.filter-pills').querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      if (pill.dataset.talhaoFilter) {
        activeTalhaoFilter = pill.dataset.talhaoFilter;
        renderTalhoes();
      }
    });
  });

  document.getElementById('notifBtn')?.addEventListener('click', toggleNotifications);
  document.getElementById('dashboardNotifBtn')?.addEventListener('click', toggleNotifications);
  document.addEventListener('click', event => {
    const panel = document.getElementById('notificationPanel');
    const wrapper = document.querySelector('.notification-wrapper');
    if (panel && !panel.hidden && !wrapper?.contains(event.target)) {
      panel.hidden = true;
      document.getElementById('notifBtn')?.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const panel = document.getElementById('notificationPanel');
      if (panel) panel.hidden = true;
      document.getElementById('notifBtn')?.setAttribute('aria-expanded', 'false');
    }
  });

  // Init charts
  // Animate KPI cards on load
  document.querySelectorAll('.kpi-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    setTimeout(() => {
      card.style.transition = 'opacity .4s ease, transform .4s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 100 + i * 80);
  });

  // Animate golden window card
  setTimeout(() => {
    const gw = document.querySelector('.golden-window-card');
    if (gw) {
      gw.style.opacity = '0';
      gw.style.transform = 'translateY(16px)';
      setTimeout(() => {
        gw.style.transition = 'opacity .5s ease, transform .5s ease';
        gw.style.opacity = '1';
        gw.style.transform = 'translateY(0)';
      }, 500);
    }
  }, 0);

  console.log('%c🌿 GoldCrop v1.0 — Protótipo Visual', 'color:#3a8554;font-weight:bold;font-size:14px');
  console.log('%c   Inteligência para a Cafeicultura', 'color:#c9a227;font-size:12px');
});

// =====================================================
// MOBILE KPI VISIBILITY
// =====================================================

function setupKpiVisibility() {
  const toggleBtn = document.getElementById('kpiMoreBtn');
  const otherCards = document.querySelectorAll('.kpi-card:not(.priority)');

  function hideOthers() {
    otherCards.forEach(c => c.style.display = 'none');
  }
  function showOthers() {
    otherCards.forEach(c => c.style.display = 'flex');
  }

  if (toggleBtn && window.innerWidth <= 640) {
    if (otherCards.length > 0) {
      hideOthers();
      toggleBtn.style.display = 'block';
      toggleBtn.addEventListener('click', () => {
        const hidden = otherCards[0].style.display === 'none';
        if (hidden) {
          showOthers();
          toggleBtn.textContent = '- less';
        } else {
          hideOthers();
          toggleBtn.textContent = '+ more';
        }
      });
    } else {
      toggleBtn.style.display = 'none';
    }
  }
}

document.addEventListener('DOMContentLoaded', setupKpiVisibility);
