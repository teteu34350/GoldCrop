/* ===================================================
   GoldCrop — Application Logic (Mock Data + UI)
   =================================================== */

'use strict';

// =====================================================
// MOCK DATA
// =====================================================

const FARM = {
  name: 'Fazenda Santa Clara',
  owner: 'João Oliveira',
  culture: 'Café',
  area: 84,
  talhoes: 8,
  lastUpdate: '10:42',
};

const TEAM_DATA = [
  { name: 'João Silva', role: 'Proprietário', permission: 'Acesso completo', status: 'online', activity: 'Agora', initials: 'JS' },
  { name: 'Carlos Souza', role: 'Gerente', permission: 'Planejamento e operação', status: 'online', activity: 'Há 8 min', initials: 'CS' },
  { name: 'Ana Oliveira', role: 'Técnica Agrícola', permission: 'Consulta técnica', status: 'online', activity: 'Há 2 h', initials: 'AO' },
  { name: 'Pedro Santos', role: 'Funcionário', permission: 'Execução', status: 'offline', activity: 'Há 3 h', initials: 'PS' },
];

const ACTIVITY_DATA = [
  { initials: 'CS', name: 'Carlos Souza', action: 'planejou aplicação no', target: 'Talhão 03 · NPK 20-05-20', time: 'Há 20 minutos' },
  { initials: 'PS', name: 'Pedro Santos', action: 'registrou aplicação no', target: 'Talhão 02 · Ureia', time: 'Há 1 hora' },
  { initials: 'AO', name: 'Ana Oliveira', action: 'analisou a recomendação do', target: 'Talhão 05 · IEA 82%', time: 'Há 2 horas' },
  { initials: 'PS', name: 'Pedro Santos', action: 'adicionou observação ao', target: 'Talhão 03', time: 'Há 3 horas' },
];

const TALHOES_DATA = [
  { id: 1, name: 'Talhão 01', area: 6.2, culture: 'Café Arábica', variety: 'Catuaí 144', age: '5 anos', soil: 'Franco-argiloso', sensor: 'S02', moisture: 22, temp: 22.5, lastReading: '10:38', iea: 84, status: 'favorable', window: '25/08 · 09:00–11:00', product: 'NPK 20-05-20', inputType: 'Adubo mineral', dose: '300 kg/ha', period: '25/08 — 30/08', rain: 9, futureMoisture: 29, mapX: 6, mapY: 10, mapW: 25, mapH: 27, shape: 'north' },
  { id: 2, name: 'Talhão 02', area: 9.1, culture: 'Café Arábica', variety: 'Mundo Novo', age: '8 anos', soil: 'Argiloso', sensor: 'S03', moisture: 35, temp: 22.1, lastReading: '10:40', iea: 76, status: 'moderate', window: '27/08 · 09:00–12:00', product: 'Ureia', inputType: 'Adubo nitrogenado', dose: '180 kg/ha', period: '25/08 — 30/08', rain: 12, futureMoisture: 38, mapX: 36, mapY: 7, mapW: 22, mapH: 30, shape: 'east' },
  { id: 3, name: 'Talhão 03', area: 8.4, culture: 'Café Arábica', variety: 'Catuaí 99', age: '6 anos', soil: 'Argiloso', sensor: 'S04', moisture: 28, temp: 22.8, lastReading: '10:42', iea: 91, status: 'favorable', window: '26/08 · 08:00–11:30', product: 'NPK 20-05-20', inputType: 'Adubo nitrogenado', dose: '320 kg/ha', period: '25/08 — 30/08', rain: 12, futureMoisture: 34, latitude: -20.896861, longitude: -46.088306, radius: 80, mapX: 64, mapY: 9, mapW: 28, mapH: 27, shape: 'south' },
  { id: 4, name: 'Talhão 04', area: 12.5, culture: 'Café Arábica', variety: 'Bourbon', age: '10 anos', soil: 'Arenoso', sensor: 'S05', moisture: 63, temp: 24.2, lastReading: '10:39', iea: 47, status: 'unfavorable', window: 'Reavaliar após chuva', product: 'Ureia', inputType: 'Adubo nitrogenado', dose: '200 kg/ha', period: '28/08 — 31/08', rain: 24, futureMoisture: 68, mapX: 9, mapY: 48, mapW: 29, mapH: 35, shape: 'west' },
  { id: 5, name: 'Talhão 05', area: 10.8, culture: 'Café Arábica', variety: 'Catucaí', age: '4 anos', soil: 'Franco-arenoso', sensor: 'S06', moisture: 26, temp: 21.8, lastReading: '10:41', iea: 82, status: 'favorable', window: '26/08 · 07:30–11:00', product: 'Foliar Ca/Mg', inputType: 'Fertilizante foliar', dose: '2 L/ha', period: '26/08 — 29/08', rain: 6, futureMoisture: 31, mapX: 43, mapY: 48, mapW: 22, mapH: 22, shape: 'center' },
  { id: 6, name: 'Talhão 06', area: 10, culture: 'Café Arábica', variety: 'Acaiá', age: '7 anos', soil: 'Argiloso', sensor: 'S07', moisture: 31, temp: 22.9, lastReading: '10:35', iea: 74, status: 'moderate', window: '27/08 · 09:30–12:30', product: 'Fungicida sistêmico', inputType: 'Defensivo', dose: '1.5 L/ha', period: '27/08 — 30/08', rain: 14, futureMoisture: 35, mapX: 70, mapY: 48, mapW: 20, mapH: 32, shape: 'long' },
  { id: 7, name: 'Talhão 07', area: 7.3, culture: 'Café Arábica', variety: 'Catuaí 144', age: '3 anos', soil: 'Franco-arenoso', sensor: 'S08', moisture: 19, temp: 25.1, lastReading: '10:37', iea: 58, status: 'unfavorable', window: 'Aguardar reposição hídrica', product: 'Micronutrientes', inputType: 'Fertilizante foliar', dose: '3 L/ha', period: '29/08 — 31/08', rain: 2, futureMoisture: 23, mapX: 10, mapY: 88, mapW: 31, mapH: 14, shape: 'north' },
  { id: 8, name: 'Talhão 08', area: 8.7, culture: 'Café Arábica', variety: 'Mundo Novo', age: '9 anos', soil: 'Argiloso', sensor: 'S09', moisture: 30, temp: 22.3, lastReading: '10:42', iea: 85, status: 'favorable', window: '26/08 · 08:00–10:30', product: 'NPK 04-14-08', inputType: 'Adubo mineral', dose: '280 kg/ha', period: '26/08 — 30/08', rain: 8, futureMoisture: 34, mapX: 50, mapY: 84, mapW: 39, mapH: 16, shape: 'east' },
];

const HISTORICO_DATA = [
  { date: '25/08/2026', talhao: 'Talhão 03', product: 'NPK 20-05-20', qty: '320 kg/ha', ieaPrev: 91, cond: 'Favorável', result: 'Realizado', condClass: 'favorable', resultClass: 'done' },
  { date: '20/08/2026', talhao: 'Talhão 02', product: 'Ureia 45%', qty: '180 kg/ha', ieaPrev: 78, cond: 'Favorável', result: 'Realizado', condClass: 'favorable', resultClass: 'done' },
  { date: '15/08/2026', talhao: 'Talhão 04', product: 'Nitrogenado Líq.', qty: '95 L/ha', ieaPrev: 32, cond: 'Desfavorável', result: 'Não realizado', condClass: 'unfavorable', resultClass: 'skipped' },
  { date: '10/08/2026', talhao: 'Talhão 01', product: 'Foliar Ca/Mg', qty: '2 L/ha', ieaPrev: 85, cond: 'Favorável', result: 'Realizado', condClass: 'favorable', resultClass: 'done' },
  { date: '05/08/2026', talhao: 'Talhão 05', product: 'Fungicida sistêmico', qty: '1.5 L/ha', ieaPrev: 88, cond: 'Favorável', result: 'Realizado', condClass: 'favorable', resultClass: 'done' },
  { date: '28/07/2026', talhao: 'Talhão 06', product: 'NPK 04-14-08', qty: '280 kg/ha', ieaPrev: 71, cond: 'Moderada', result: 'Realizado', condClass: 'favorable', resultClass: 'done' },
  { date: '22/07/2026', talhao: 'Talhão 07', product: 'Calcário', qty: '2 t/ha', ieaPrev: 18, cond: 'Desfavorável', result: 'Não realizado', condClass: 'unfavorable', resultClass: 'skipped' },
  { date: '15/07/2026', talhao: 'Talhão 08', product: 'Micronutrientes', qty: '3 L/ha', ieaPrev: 93, cond: 'Favorável', result: 'Realizado', condClass: 'favorable', resultClass: 'done' },
];

// Calendar day data for August 2026
const CAL_DATA = {
  '2026-08-01': { iea: 72, type: 'past', rain: 5, temp: 21, app: false },
  '2026-08-02': { iea: 68, type: 'past', rain: 0, temp: 23, app: false },
  '2026-08-03': { iea: 55, type: 'past', rain: 18, temp: 19, app: false },
  '2026-08-04': { iea: 42, type: 'past', rain: 24, temp: 18, app: false },
  '2026-08-05': { iea: 88, type: 'past', rain: 2, temp: 24, app: true },
  '2026-08-06': { iea: 81, type: 'past', rain: 0, temp: 25, app: false },
  '2026-08-07': { iea: 76, type: 'past', rain: 3, temp: 23, app: false },
  '2026-08-08': { iea: 79, type: 'past', rain: 1, temp: 22, app: false },
  '2026-08-09': { iea: 84, type: 'past', rain: 0, temp: 24, app: false },
  '2026-08-10': { iea: 85, type: 'past', rain: 0, temp: 25, app: true },
  '2026-08-11': { iea: 62, type: 'past', rain: 8, temp: 21, app: false },
  '2026-08-12': { iea: 47, type: 'past', rain: 20, temp: 19, app: false },
  '2026-08-13': { iea: 33, type: 'past', rain: 30, temp: 18, app: false },
  '2026-08-14': { iea: 58, type: 'past', rain: 10, temp: 20, app: false },
  '2026-08-15': { iea: 32, type: 'past', rain: 35, temp: 17, app: false },
  '2026-08-16': { iea: 61, type: 'past', rain: 6, temp: 21, app: false },
  '2026-08-17': { iea: 74, type: 'past', rain: 2, temp: 22, app: false },
  '2026-08-18': { iea: 83, type: 'past', rain: 0, temp: 24, app: false },
  '2026-08-19': { iea: 80, type: 'past', rain: 1, temp: 23, app: false },
  '2026-08-20': { iea: 78, type: 'past', rain: 2, temp: 22, app: true },
  '2026-08-21': { iea: 87, type: 'today', rain: 4, temp: 22.8, app: false },
  '2026-08-22': { iea: 78, type: 'future', rain: 8, temp: 22, app: false },
  '2026-08-23': { iea: 64, type: 'future', rain: 15, temp: 21, app: false },
  '2026-08-24': { iea: 82, type: 'future', rain: 6, temp: 23, app: false },
  '2026-08-25': { iea: 82, type: 'future', rain: 12, temp: 23, app: false, planned: 'Talhão 03 · NPK 20-05-20' },
  '2026-08-26': { iea: 91, type: 'future', rain: 5, temp: 24, app: false, planned: 'Talhão 03 · NPK 20-05-20' },
  '2026-08-27': { iea: 73, type: 'future', rain: 9, temp: 22, app: false, planned: 'Talhão 03 · NPK 20-05-20' },
  '2026-08-28': { iea: 65, type: 'future', rain: 14, temp: 21, app: false },
  '2026-08-29': { iea: 58, type: 'future', rain: 20, temp: 20, app: false },
  '2026-08-30': { iea: 77, type: 'future', rain: 7, temp: 22, app: false },
  '2026-08-31': { iea: 80, type: 'future', rain: 4, temp: 23, app: false },
};

// =====================================================
// APP STATE
// =====================================================

let currentPage = 'dashboard';
let selectedCalDay = null;
let calMonth = new Date(2026, 7, 1); // August 2026
let chartsInitialized = {};
let sidebarOpen = false;
let talhoesMap = null;

const WEATHER_CODES = {
  0: 'Céu limpo', 1: 'Pouco nublado', 2: 'Parcialmente nublado', 3: 'Nublado',
  45: 'Neblina', 48: 'Neblina', 51: 'Garoa', 53: 'Garoa', 55: 'Garoa forte',
  61: 'Chuva fraca', 63: 'Chuva moderada', 65: 'Chuva forte', 80: 'Pancadas de chuva',
  81: 'Pancadas de chuva', 82: 'Pancadas fortes', 95: 'Trovoada', 96: 'Trovoada com granizo', 99: 'Trovoada com granizo',
};

const SENSOR_HUMIDITY_LOCKED = 'Bloqueado';

async function loadLocalWeather() {
  const reference = TALHOES_DATA.find(t => Number.isFinite(t.latitude) && Number.isFinite(t.longitude));
  if (!reference) return;

  const params = new URLSearchParams({
    latitude: reference.latitude,
    longitude: reference.longitude,
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    hourly: 'precipitation_probability',
    daily: 'precipitation_sum',
    forecast_days: '2',
    timezone: 'America/Sao_Paulo',
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error('Weather API unavailable');
    const data = await response.json();
    const current = data.current;
    const rain = Number(data.daily?.precipitation_sum?.[0] || 0);
    const probability = Math.max(...(data.hourly?.precipitation_probability || []).slice(0, 24), 0);
    const condition = WEATHER_CODES[current.weather_code] || 'Condição não informada';
    const temperature = Number(current.temperature_2m).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const weatherSummary = document.getElementById('weatherSummary');
    const rainValue = document.getElementById('rainForecastValue');
    const rainDesc = document.getElementById('rainForecastDesc');

    if (weatherSummary) weatherSummary.textContent = `${temperature}°C · ${condition}`;
    if (rainValue) rainValue.innerHTML = `${rain.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}<span class="kpi-unit">mm</span>`;
    if (rainDesc) rainDesc.textContent = `Probabilidade de ${probability}% · Open-Meteo`;

    reference.temp = current.temperature_2m;
    reference.moisture = current.relative_humidity_2m;
    reference.rain = rain;
    reference.wind = current.wind_speed_10m;
  } catch (error) {
    console.warn('Previsão local indisponível:', error);
    const weatherSummary = document.getElementById('weatherSummary');
    if (weatherSummary) weatherSummary.textContent = 'Clima local indisponível';
  }
}

// =====================================================
// NAVIGATION
// =====================================================

function navigateTo(page) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');

  // Update pages
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  // Update breadcrumb
  const breadcrumbs = {
    dashboard: 'Visão Geral',
    calendar: 'Calendário',
    talhoes: 'Talhões',
    fazenda: 'Minha Fazenda',
    aplicacoes: 'Aplicações',
    historico: 'Histórico',
    settings: 'Configurações',
  };
  document.getElementById('breadcrumb').textContent = breadcrumbs[page] || '';

  currentPage = page;

  // Initialize page-specific content
  if (page === 'calendar') {
    renderCalendar();
    chartsInitialized.calendar = true;
  }
  if (page === 'talhoes') renderTalhoes();
  if (page === 'fazenda') renderFazenda();
  if (page === 'historico') renderHistorico();
  if (page === 'aplicacoes') renderAplicacoes();
  if (page === 'settings') renderSettings();

  // Close sidebar on mobile
  if (window.innerWidth < 768) closeSidebar();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =====================================================
// SIDEBAR
// =====================================================

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('show');
  sidebarOpen = true;
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
  sidebarOpen = false;
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

    if (data) {
      if (data.iea >= 80) colorClass = 'green-day';
      else if (data.iea >= 60) colorClass = 'yellow-day';
      else colorClass = 'red-day';

      if (data.type === 'past') tagText = 'Real';
      else if (data.type === 'today') tagText = 'Hoje';
      else tagText = 'Est.';
    } else {
      colorClass = 'no-data';
    }

    let typeClass = data ? data.type : 'no-data';
    el.className = `cal-day ${colorClass} ${typeClass === 'today' ? 'today' : ''} ${typeClass === 'past' ? 'past' : ''}`;
    el.dataset.date = dateStr;

    el.innerHTML = `
      <span class="cal-day-num">${d}</span>
      ${data ? `<span class="cal-day-iea">${data.iea}%</span>` : '<span class="cal-day-iea" style="opacity:.3">—</span>'}
      ${data ? `<span class="cal-day-tag">${tagText}</span>` : ''}
      ${data && (data.app || data.planned) ? `<div class="cal-day-markers">${data.planned ? '<span class="cal-plan-marker" title="Aplicação planejada">P</span>' : ''}${data.app ? '<span class="cal-done-marker" title="Aplicação realizada">R</span>' : ''}</div>` : ''}
    `;

    if (data && colorClass !== 'no-data') {
      el.addEventListener('click', () => selectCalDay(dateStr, d, data, el));
    }

    grid.appendChild(el);
  }
}

function selectCalDay(dateStr, day, data, el) {
  document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  selectedCalDay = dateStr;
  renderDayPanel(day, data);
}

function renderDayPanel(day, data) {
  const empty = document.getElementById('dayPanelEmpty');
  const content = document.getElementById('dayPanelContent');
  if (!empty || !content) return;

  empty.style.display = 'none';
  content.style.display = 'block';

  const ieaColor = data.iea >= 80 ? '#3a8554' : data.iea >= 60 ? '#d97706' : '#ef4444';
  const typeLabel = data.type === 'past' ? 'Dados reais' : data.type === 'today' ? 'Hoje — Dados reais + previsão' : 'Previsão estimada pela IA';

  const upFactors = [];
  const downFactors = [];

  if (data.rain < 10) upFactors.push('Baixo acúmulo de chuva → menor risco de lixiviação');
  if (data.temp >= 20 && data.temp <= 25) upFactors.push('Temperatura ideal para absorção foliar');
  if (data.iea >= 80) upFactors.push('Alta probabilidade de absorção eficiente');

  if (data.rain > 15) downFactors.push('Chuva elevada → risco de lavagem do produto');
  if (data.rain > 25) downFactors.push('Alta precipitação → aplicação contraindicada');
  if (data.temp > 27) downFactors.push('Temperatura elevada → risco de volatilização');
  if (data.iea < 60) downFactors.push('Condições desfavoráveis no período da manhã');

  if (upFactors.length === 0) upFactors.push('Condições dentro do intervalo esperado');
  if (downFactors.length === 0) downFactors.push('Sem fatores significativos desfavoráveis');

  const confLabel = data.iea >= 80 ? 'Alta' : data.iea >= 60 ? 'Média' : 'Baixa';
  const confColor = data.iea >= 80 ? '#3a8554' : data.iea >= 60 ? '#d97706' : '#ef4444';

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const monthName = months[calMonth.getMonth()];

  const hasWindow = data.iea >= 75;
  const windowTime = data.iea >= 85 ? '08:00 — 11:30' : data.iea >= 75 ? '09:00 — 12:00' : '—';

  content.innerHTML = `
    <div class="dpanel-title">${day} de ${monthName === 'Ago' ? 'Agosto' : monthName} de ${calMonth.getFullYear()}</div>
    <p style="font-size:.72rem;color:#9ca3af;margin-bottom:.875rem;font-style:italic">${typeLabel}</p>

    <div class="dpanel-iea-row">
      <div>
        <div style="font-size:.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">IEA</div>
        <div class="dpanel-iea-value" style="color:${ieaColor}">${data.iea}%</div>
      </div>
      <div class="dpanel-iea-meta">
        <span style="font-size:.8rem;font-weight:700;color:${confColor}">${confLabel} confiança</span>
        ${hasWindow ? `<span style="font-size:.75rem;color:#4b5563">Janela: ${windowTime}</span>` : '<span style="font-size:.75rem;color:#9ca3af">Sem janela ideal</span>'}
      </div>
    </div>

    ${data.planned ? `<div class="calendar-plan"><b>Aplicação planejada</b><span>${data.planned}</span><small>Planejada por ${data.plannedBy || 'Carlos Souza'} · IEA ${data.iea}%</small></div>` : ''}
    ${data.app ? `<div class="calendar-done"><b>Aplicação realizada</b><span>${data.done || 'Registro operacional concluído'}</span><small>Realizada por ${data.doneBy || 'Pedro Santos'}${data.doneTime ? ' às ' + data.doneTime : ''}</small></div>` : ''}
    <div class="dpanel-section-title">Previsão Meteorológica</div>
    <div class="dpanel-row"><span class="dpanel-row-label">Chuva</span><span class="dpanel-row-value">${data.rain} mm</span></div>
    <div class="dpanel-row"><span class="dpanel-row-label">Temperatura</span><span class="dpanel-row-value">${data.temp}°C</span></div>
    <div class="dpanel-row"><span class="dpanel-row-label">Vento estimado</span><span class="dpanel-row-value">6 km/h</span></div>
    <div class="dpanel-row"><span class="dpanel-row-label">Prob. chuva</span><span class="dpanel-row-value">72%</span></div>

    ${hasWindow ? `
    <div class="dpanel-rec">
      🌿 <strong>Janela favorável</strong> para aplicação entre <strong>${windowTime}</strong>.<br>
      <span style="font-size:.75rem;opacity:.8;margin-top:4px;display:block">Recomendado para: Talhão 03 · NPK 20-05-20</span>
    </div>` : `
    <div class="dpanel-rec" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">
      ⚠️ <strong>Condições desfavoráveis.</strong> Não recomendado para aplicação neste dia.
    </div>`}

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

function renderTalhoes() {
  const container = document.getElementById('mapContainer');
  const list = document.getElementById('talhoesList');
  if (!container || !list) return;

  if (talhoesMap) {
    talhoesMap.remove();
    talhoesMap = null;
  }
  container.innerHTML = '';
  container.classList.add('leaflet-map-container');

  const colors = {
    favorable: { bg: '#3a8554', opacity: 0.75 },
    moderate: { bg: '#d97706', opacity: 0.7 },
    unfavorable: { bg: '#ef4444', opacity: 0.65 },
  };

  const locatedTalhoes = TALHOES_DATA.filter(t => Number.isFinite(t.latitude) && Number.isFinite(t.longitude));
  if (typeof L === 'undefined') {
    container.innerHTML = '<div class="map-loading-message">Mapa indisponível. Verifique sua conexão.</div>';
  } else if (!locatedTalhoes.length) {
    container.innerHTML = '<div class="map-loading-message">Adicione coordenadas para visualizar os talhões no mapa.</div>';
  } else {
    const firstTalhao = locatedTalhoes[0];
    talhoesMap = L.map(container).setView([firstTalhao.latitude, firstTalhao.longitude], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(talhoesMap);

    locatedTalhoes.forEach(t => {
      const color = colors[t.status].bg;
      const popup = `<strong>${t.name}</strong><br>IEA ${t.iea}%<br>Umidade do sensor: ${SENSOR_HUMIDITY_LOCKED}<br>${t.product} programado`;
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
      marker.on('click', () => openTalhaoModal(t));
      perimeter.on('click', () => openTalhaoModal(t));
    });

    if (locatedTalhoes.length > 1) {
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
  TALHOES_DATA.forEach(t => {
    const chipClass = t.status === 'favorable' ? 'green' : t.status === 'moderate' ? 'yellow' : 'red';
    const statusLabel = t.status === 'favorable' ? 'Favorável' : t.status === 'moderate' ? 'Atenção' : 'Desfavorável';
    const el = document.createElement('div');
    el.className = `talhao-list-card talhao-status-${t.status}`;
    el.innerHTML = `
      <div class="talhao-card-top">
        <div class="talhao-num">${String(t.id).padStart(2,'0')}</div>
        <span class="talhao-status-label ${chipClass}">${statusLabel}</span>
      </div>
      <div class="talhao-info">
        <div class="talhao-name">${t.name}</div>
        <div class="talhao-meta">${t.area} ha · ${t.culture} · Sensor ${t.sensor}</div>
      </div>
      <div class="talhao-card-bottom">
        <span>${t.product} · ${t.dose}</span>
        <strong class="talhao-iea-chip ${chipClass}">${t.iea}%</strong>
      </div>
    `;
    el.addEventListener('click', () => openTalhaoModal(t));
    list.appendChild(el);
  });
}

function openCadastrarTalhaoModal() {
  document.getElementById('cadastroTalhaoForm')?.reset();
  document.getElementById('novoTalhaoCultura').value = 'Café';
  document.getElementById('modalCadastrarTalhao').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeCadastrarTalhaoModal() {
  document.getElementById('modalCadastrarTalhao').style.display = 'none';
  document.body.style.overflow = '';
}

function cadastrarTalhao(e) {
  e.preventDefault();
  const name = document.getElementById('novoTalhaoNome').value.trim();
  const area = Number(document.getElementById('novoTalhaoArea').value);
  const culture = document.getElementById('novoTalhaoCultura').value.trim() || 'Café';
  const latitude = Number(document.getElementById('novoTalhaoLatitude').value);
  const longitude = Number(document.getElementById('novoTalhaoLongitude').value);
  const radius = Number(document.getElementById('novoTalhaoRaio').value) || 80;
  if (!name || !area || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    showToast('Informe a localização do talhão.', 'error');
    return;
  }

  const id = TALHOES_DATA.length + 1;
  TALHOES_DATA.push({
    id, name, area, culture, temp: 0, iea: 0, status: 'unfavorable', window: '—', product: '—',
    latitude, longitude, radius,
    mapX: 8 + ((id - 1) % 4) * 23, mapY: 8 + (Math.floor((id - 1) / 4) % 3) * 28, mapW: 18, mapH: 22,
  });
  renderTalhoes();
  closeCadastrarTalhaoModal();
  showToast(`${name} cadastrado. Aguardando dados para calcular a necessidade.`);
}

function openTalhaoModal(t) {
  document.getElementById('talhaoModalTitle').textContent = t.name;
  const body = document.getElementById('talhaoModalBody');
  const statusColor = t.status === 'favorable' ? '#3a8554' : t.status === 'moderate' ? '#d97706' : '#ef4444';
  const previous = HISTORICO_DATA.filter(h => h.talhao === t.name).slice(0, 3);

  body.innerHTML = `
    <div class="talhao-detail-head"><div><strong>${t.area} ha · ${t.culture} · ${t.age}</strong><span>${t.variety} · Solo ${t.soil}</span></div><span class="monitoring-status">● Monitoramento ativo</span></div>
    <div class="detail-section-title">Condição atual <small>Dados do sensor ${t.sensor}</small></div>
    <div class="talhao-modal-grid">
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Umidade do sensor</div><div class="talhao-modal-metric-value sensor-locked-value">${SENSOR_HUMIDITY_LOCKED}</div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Temperatura do solo</div><div class="talhao-modal-metric-value">${t.temp}°C</div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Sensor</div><div class="talhao-modal-metric-value">${t.sensor} <small>Online</small></div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Última leitura</div><div class="talhao-modal-metric-value">${t.lastReading}</div></div>
    </div>
    <div class="detail-section-title">Próxima aplicação planejada</div>
    <div class="planned-application"><div><strong>${t.product}</strong><span>${t.inputType} · ${t.dose} · Período ${t.period}</span></div><button class="btn-ghost" onclick="openPlanejar(${t.id})">Planejar aplicação</button></div>
    <section class="gold-window-detail" style="--iea-color:${statusColor}"><div class="gold-window-heading"><div><span>Janela de Ouro</span><strong>${t.window}</strong><small>IEA de ${t.iea}% para aplicação de ${t.product} no ${t.name}</small></div><b>${t.iea}%<small>IEA</small></b></div><div class="window-factors"><span>Chuva prevista <b>${t.rain} mm</b></span><span>Umidade do sensor <b class="sensor-locked-value">${SENSOR_HUMIDITY_LOCKED}</b></span><span>Estimativa IA <b>${t.futureMoisture}%</b></span><span>Vento <b>6 km/h</b></span></div><p>O modelo usa a previsão meteorológica e os dados disponíveis para estimar condições de aplicação. A leitura de umidade do sensor está bloqueada.</p></section>
    <div class="detail-section-title">Evolução estimada da umidade <small>Disponível após disponibilizar um sensor</small></div>
    <div class="moisture-chart moisture-chart-locked"><div class="sensor-locked-message">Módulo de umidade bloqueado<br><small>Disponibilize um sensor para habilitar as leituras.</small></div></div>
    <div class="detail-section-title">Histórico do talhão</div>
    <div class="detail-history">${previous.length ? previous.map(h => `<div><span>${h.date}</span><strong>${h.product} · ${h.qty}</strong><em>IEA ${h.ieaPrev}% · ${h.result}</em></div>`).join('') : '<p>Nenhuma aplicação registrada neste talhão.</p>'}</div>
    <div class="detail-actions"><button class="btn-ghost" onclick="closeTalhaoModal()">Fechar</button><button class="btn-primary" onclick="closeTalhaoModal();openRegistrar(${t.id})">Registrar aplicação</button></div>
  `;

  document.getElementById('modalTalhao').style.display = 'flex';
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
  const plannedCount = Object.values(CAL_DATA).filter(day => day.planned).length;
  const teamCards = TEAM_DATA.map(person => `
    <article class="team-member-card">
      <div class="team-avatar">${person.initials}<i class="presence ${person.status}"></i></div>
      <div class="team-member-main"><strong>${person.name}</strong><span>${person.role}</span><small><i class="presence-dot ${person.status}"></i>${person.status === 'online' ? 'Online' : 'Offline'} · Atividade: ${person.activity}</small></div>
      <span class="permission-badge">${person.permission}</span>
    </article>`).join('');
  const activities = ACTIVITY_DATA.map(item => `<div class="farm-activity"><div class="activity-avatar">${item.initials}</div><div><strong>${item.name}</strong> ${item.action} <b>${item.target}</b><span>${item.time}</span></div></div>`).join('');
  container.innerHTML = `
    <header class="farm-hero">
      <div class="farm-hero-mark">✦</div><div class="farm-hero-copy"><span>Ambiente colaborativo</span><h1>Fazenda Santa Clara</h1><p>Varginha, Minas Gerais · Café Arábica</p></div>
      <div class="farm-hero-stats"><div><b>84</b><span>hectares</span></div><div><b>8</b><span>talhões</span></div><div><b>12</b><span>sensores ativos</span></div><div><b>${TEAM_DATA.length}</b><span>pessoas</span></div></div>
      <button class="btn-primary" onclick="openPessoa()">+ Adicionar pessoa</button>
    </header>
    <div class="farm-shared-note"><span>◉</span><div><strong>Dados compartilhados da fazenda</strong><p>Todos os membros autorizados visualizam os mesmos dados da fazenda de acordo com suas permissões.</p></div></div>
    <div class="farm-data-grid"><div><span>Talhões monitorados</span><b>8</b></div><div><span>Sensores ativos</span><b>12</b></div><div><span>Aplicações planejadas</span><b>${plannedCount}</b></div><div><span>Aplicações realizadas</span><b>${HISTORICO_DATA.filter(h => h.resultClass === 'done').length}</b></div><div class="next-window"><span>Próxima Janela de Ouro</span><b>Talhão 03 · 26/08</b><small>NPK 20-05-20 · IEA 91%</small></div></div>
    <div class="farm-main-grid"><section class="farm-section card"><div class="card-header"><div><h2 class="farm-section-title">Pessoas da Fazenda</h2><p class="farm-section-sub">A equipe que opera no mesmo ambiente de dados.</p></div><span class="team-count">${TEAM_DATA.length} membros</span></div><div class="team-list">${teamCards}</div></section><section class="farm-section card"><div class="card-header"><div><h2 class="farm-section-title">Atividades recentes</h2><p class="farm-section-sub">Operações registradas pela equipe.</p></div></div><div class="activity-timeline">${activities}</div></section></div>
    <section class="farm-section card permissions-section"><div class="card-header"><div><h2 class="farm-section-title">Permissões da equipe</h2><p class="farm-section-sub">Cada perfil vê e opera a fazenda dentro da sua responsabilidade.</p></div></div><div class="permission-table-wrap"><table class="permission-table"><thead><tr><th>Perfil</th><th>Visualizar</th><th>Planejar</th><th>Registrar</th><th>Gerenciar equipe</th></tr></thead><tbody><tr><td><b>Proprietário</b></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr><tr><td><b>Gerente</b></td><td>✓</td><td>✓</td><td>✓</td><td>—</td></tr><tr><td><b>Técnico / Agrônomo</b></td><td>✓</td><td>✓</td><td>✓</td><td>—</td></tr><tr><td><b>Funcionário</b></td><td>✓</td><td>—</td><td>✓</td><td>—</td></tr></tbody></table></div></section>
    <section class="farm-section farm-notifications"><div><span>Notificações internas</span><p>Nova aplicação planejada no Talhão 03 · Janela de Ouro identificada para amanhã · Pedro registrou uma aplicação realizada.</p></div><button class="btn-ghost" onclick="navigateTo('calendar')">Ver calendário compartilhado</button></section>`;
}

function openPessoa() { document.getElementById('pessoaNome').value = ''; document.getElementById('pessoaEmail').value = ''; document.getElementById('pessoaTelefone').value = ''; document.getElementById('modalPessoa').style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closePessoa() { document.getElementById('modalPessoa').style.display = 'none'; document.body.style.overflow = ''; }
function submitPessoa() {
  const name = document.getElementById('pessoaNome').value.trim();
  const email = document.getElementById('pessoaEmail').value.trim();
  if (!name || !email) { showToast('Informe nome e e-mail da pessoa.', 'error'); return; }
  const role = document.getElementById('pessoaFuncao').value;
  TEAM_DATA.push({ name, role, permission: document.getElementById('pessoaAcesso').value, status: 'offline', activity: 'Convite enviado agora', initials: name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase() });
  ACTIVITY_DATA.unshift({ initials: 'JS', name: 'João Silva', action: 'enviou convite para', target: name, time: 'Agora' });
  closePessoa(); renderFazenda(); showToast('Convite enviado com sucesso.', 'success');
}

// =====================================================
// HISTÓRICO
// =====================================================

function renderHistorico() {
  const container = document.getElementById('historicoTable');
  if (!container) return;

  const ieaClass = iea => iea >= 80 ? 'high' : iea >= 60 ? 'medium' : 'low';

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
            <td><span class="hist-iea-badge ${ieaClass(h.ieaPrev)}">${h.ieaPrev}%</span></td>
            <td><span class="hist-cond-badge ${h.condClass}">${h.cond}</span></td>
            <td style="font-size:.72rem"><strong>${h.plannedBy || 'Carlos Souza'}</strong><br><span style="color:#9ca3af">Realizada: ${h.doneBy || 'Pedro Santos'}</span></td>
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
        <div class="aplic-stat-value" style="color:#c9a227">${Math.round(done/total*100)}%</div>
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
  const ieaClass = iea => iea >= 80 ? 'high' : iea >= 60 ? 'medium' : 'low';
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
            <td><span class="hist-iea-badge ${ieaClass(h.ieaPrev)}">${h.ieaPrev}%</span></td>
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

  container.innerHTML = `
    <div class="settings-grid">
      <div class="settings-card">
        <div class="settings-card-title">Propriedade</div>
        <div class="form-group" style="margin-bottom:.75rem">
          <label class="form-label">Nome da fazenda</label>
          <input class="form-input" value="Fazenda Santa Clara" />
        </div>
        <div class="form-group" style="margin-bottom:.75rem">
          <label class="form-label">Cultura principal</label>
          <input class="form-input" value="Café Arábica" />
        </div>
        <div class="form-group">
          <label class="form-label">Área total (ha)</label>
          <input class="form-input" type="number" value="84" />
        </div>
        <button class="btn-primary" style="margin-top:1rem;width:100%;justify-content:center">Salvar alterações</button>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">Notificações</div>
        <div class="settings-row"><span class="settings-label">Janela identificada</span><button class="toggle on"></button></div>
        <div class="settings-row"><span class="settings-label">Resumo diário (7h)</span><button class="toggle on"></button></div>
        <div class="settings-row"><span class="settings-label">Relatório semanal</span><button class="toggle"></button></div>
        <div class="settings-row"><span class="settings-label">Notificações por e-mail</span><button class="toggle on"></button></div>
      </div>

      <div class="settings-card sensor-module-card">
        <div class="settings-card-title">Módulo de sensor de umidade <span class="locked-badge">Bloqueado</span></div>
        <div class="sensor-module-icon">[ bloqueado ]</div>
        <p class="sensor-module-message">Disponibilize um sensor de umidade para habilitar as leituras de umidade do solo e o histórico por talhão.</p>
        <button class="btn-primary sensor-module-button" disabled>Sensor não disponível</button>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">Modelo de IA</div>
        <div class="settings-row"><span class="settings-label">Modelo ativo</span><span style="font-weight:600;font-size:.875rem;color:#3a8554">GoldCrop AI v2.1</span></div>
        <div class="settings-row"><span class="settings-label">Horizonte de previsão</span><span style="font-weight:600;font-size:.875rem">7 dias</span></div>
        <div class="settings-row"><span class="settings-label">Fonte meteorológica</span><span style="font-weight:600;font-size:.875rem">INMET + MAPA</span></div>
        <div class="settings-row"><span class="settings-label">Atualização automática</span><button class="toggle on"></button></div>
        <div style="margin-top:1rem;background:#f0f8f3;border:1px solid #b8d9c4;border-radius:8px;padding:.75rem;font-size:.78rem;color:#245537">
          ✅ Modelo atualizado em 21/08/2026 às 06:00
        </div>
      </div>
    </div>
  `;

  // Toggle functionality
  container.querySelectorAll('.toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('on');
    });
  });
}

// =====================================================
// MODAL: REGISTRAR APLICAÇÃO
// =====================================================

function openRegistrar(talhaoId) {
  if (talhaoId) {
    const t = TALHOES_DATA.find(item => item.id === talhaoId);
    if (t) {
      document.getElementById('formTalhao').value = t.name;
      document.getElementById('formProduto').value = t.product;
      document.getElementById('formQtd').value = parseFloat(t.dose) || '';
      document.getElementById('formTipo').value = t.inputType.includes('Defensivo') ? 'Defensivo' : 'Fertilizante';
    }
  }
  document.getElementById('modalRegistrar').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function openPlanejar(talhaoId) {
  const t = TALHOES_DATA.find(item => item.id === talhaoId);
  if (!t) return;
  document.getElementById('planTalhao').value = t.name;
  document.getElementById('planProduto').value = t.product;
  document.getElementById('planTipo').value = t.inputType;
  document.getElementById('planDose').value = t.dose;
  document.getElementById('planPeriodo').value = t.period;
  document.getElementById('modalPlanejar').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePlanejar() {
  document.getElementById('modalPlanejar').style.display = 'none';
  document.body.style.overflow = '';
}

function submitPlanejar() {
  const t = TALHOES_DATA.find(item => item.name === document.getElementById('planTalhao').value);
  const date = document.getElementById('planData').value;
  const plannedBy = document.getElementById('planResponsavel').value;
  if (t) {
    t.product = document.getElementById('planProduto').value;
    t.inputType = document.getElementById('planTipo').value;
    t.dose = document.getElementById('planDose').value;
    t.period = document.getElementById('planPeriodo').value;
    if (date) {
      const calendarData = CAL_DATA[date] || { iea: t.iea, type: 'future', rain: t.rain, temp: t.temp, app: false };
      CAL_DATA[date] = { ...calendarData, planned: `${t.name} · ${t.product}`, plannedBy };
    }
    const initials = plannedBy.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
    ACTIVITY_DATA.unshift({ initials, name: plannedBy, action: 'planejou aplicação no', target: `${t.name} · ${t.product} · ${t.dose}`, time: 'Agora' });
  }
  closePlanejar();
  if (currentPage === 'talhoes') renderTalhoes();
  if (currentPage === 'calendar') renderCalendar();
  if (currentPage === 'fazenda') renderFazenda();
  showToast('Aplicação planejada e integrada ao calendário.', 'success');
}

function closeRegistrar() {
  document.getElementById('modalRegistrar').style.display = 'none';
  document.body.style.overflow = '';
}

function submitRegistrar() {
  const talhao = document.getElementById('formTalhao').value;
  const produto = document.getElementById('formProduto').value;
  const data = document.getElementById('formData').value;
  const horario = document.getElementById('formHorario').value;

  if (!produto.trim()) {
    showToast('Preencha o nome do produto.', 'error');
    return;
  }

  // Add to mock data
  const dateFormatted = data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : '25/08/2026';
  HISTORICO_DATA.unshift({
    date: dateFormatted,
    talhao,
    product: produto,
    qty: document.getElementById('formQtd').value + ' kg/ha',
    ieaPrev: 91,
    cond: 'Favorável',
    result: 'Realizado',
    condClass: 'favorable',
    resultClass: 'done',
    plannedBy: 'Carlos Souza',
    doneBy: 'Pedro Santos',
  });

  ACTIVITY_DATA.unshift({ initials: 'PS', name: 'Pedro Santos', action: 'registrou aplicação realizada no', target: `${talhao} · ${produto} · ${horario || '08:35'}`, time: 'Agora' });

  closeRegistrar();
  showToast(`✅ Aplicação registrada: ${talhao} · ${produto}`, 'success');

  // Mark calendar day
  if (data) {
    const calendarData = CAL_DATA[data] || { iea: 91, type: 'future', rain: 0, temp: 23 };
    CAL_DATA[data] = { ...calendarData, app: true, done: `${talhao} · ${produto}`, doneBy: 'Pedro Santos', doneTime: horario || '08:35' };
    if (currentPage === 'calendar') renderCalendar();
  }

  if (currentPage === 'historico') renderHistorico();
  if (currentPage === 'aplicacoes') renderAplicacoes();
  if (currentPage === 'fazenda') renderFazenda();
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

const USER_DATA = {
  name: 'João Oliveira',
  initials: 'JO',
  email: 'joao.oliveira@santaclara.com.br',
  phone: '(35) 99876-5432',
  role: 'Produtor / Administrador',
  farm: 'Fazenda Santa Clara',
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
  document.getElementById('profileModalInitials').value = USER_DATA.initials;
  document.getElementById('profileModalEmail').value = USER_DATA.email;
  document.getElementById('profileModalPhone').value = USER_DATA.phone;
  document.getElementById('profileModalFarm').value = USER_DATA.farm;
  document.getElementById('profileModalRole').value = USER_DATA.role;
  document.getElementById('modalAvatarPreview').textContent = USER_DATA.initials;

  document.getElementById('modalPerfil').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePerfilModal() {
  document.getElementById('modalPerfil').style.display = 'none';
  document.body.style.overflow = '';
}

function triggerAvatarUpload() {
  const newInitials = prompt('Digite as novas iniciais do avatar (ex: JO):', USER_DATA.initials);
  if (newInitials && newInitials.trim()) {
    const cleanInitials = newInitials.trim().substring(0, 3).toUpperCase();
    document.getElementById('profileModalInitials').value = cleanInitials;
    document.getElementById('modalAvatarPreview').textContent = cleanInitials;
  }
}

function saveProfileChanges() {
  const name = document.getElementById('profileModalName').value.trim();
  const initials = document.getElementById('profileModalInitials').value.trim().toUpperCase() || 'JO';
  const email = document.getElementById('profileModalEmail').value.trim();
  const phone = document.getElementById('profileModalPhone').value.trim();
  const farm = document.getElementById('profileModalFarm').value.trim();
  const role = document.getElementById('profileModalRole').value;

  if (!name || !email) {
    showToast('Preencha os campos obrigatórios (Nome e E-mail).', 'error');
    return;
  }

  USER_DATA.name = name;
  USER_DATA.initials = initials;
  USER_DATA.email = email;
  USER_DATA.phone = phone;
  USER_DATA.farm = farm;
  USER_DATA.role = role;
  FARM.owner = name;
  FARM.name = farm;

  updateProfileDOM();
  closePerfilModal();
  showToast('✅ Perfil atualizado com sucesso!');
}

function updateProfileDOM() {
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
}

function openTrocarFazendaModal() {
  closeAllDropdowns();
  document.getElementById('modalTrocarFazenda').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeTrocarFazendaModal() {
  document.getElementById('modalTrocarFazenda').style.display = 'none';
  document.body.style.overflow = '';
}

function selectFarm(farmName, area, talhoes, cardEl) {
  USER_DATA.farm = farmName;
  FARM.name = farmName;
  FARM.area = area;
  FARM.talhoes = talhoes;

  document.querySelectorAll('.farm-select-card').forEach(card => {
    card.classList.remove('active');
    const badge = card.querySelector('.farm-card-badge');
    if (badge) {
      badge.textContent = 'Selecionar';
      badge.classList.add('outline');
    }
  });

  if (cardEl) {
    cardEl.classList.add('active');
    const badge = cardEl.querySelector('.farm-card-badge');
    if (badge) {
      badge.textContent = 'Ativa';
      badge.classList.remove('outline');
    }
  }

  updateProfileDOM();
  closeTrocarFazendaModal();
  showToast(`🚜 Fazenda alterada para: ${farmName}`);
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

document.addEventListener('DOMContentLoaded', () => {
  loadLocalWeather();
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

  // Filter pills (non-functional, just visual)
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.closest('.filter-pills').querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  // Notification button
  document.getElementById('notifBtn')?.addEventListener('click', () => {
    showToast('📋 1 notificação: Janela identificada para amanhã');
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
