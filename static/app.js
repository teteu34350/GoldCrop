/* ===================================================
  GoldCrop — Application Logic (Django data + UI)
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

const TEAM_DATA = [];
const ACTIVITY_DATA = [];

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

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

async function apiRequest(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken(), ...(options.headers || {}) };
  return fetch(url, { credentials: 'same-origin', ...options, headers });
}

function clearCalendarData() {
  Object.keys(CAL_DATA).forEach(date => delete CAL_DATA[date]);
}

async function loadDatabaseState() {
  try {
    const response = await apiRequest('/api/state/');
    if (!response.ok) throw new Error(`Database state request failed: ${response.status}`);
    const state = await response.json();
    if (!state.farm) {
      Object.assign(FARM, { name: 'Fazenda Santa Clara', area: 84, talhoes: TALHOES_DATA.length, culture: 'Café' });
      window.GOLDCROP_RECOMMENDATIONS = window.GOLDCROP_RECOMMENDATIONS || { recommendations: [], bestRecommendation: null };
      return;
    }
    Object.assign(FARM, state.farm, { talhoes: state.talhoes.length });
    clearCalendarData();
    TALHOES_DATA.splice(0, TALHOES_DATA.length, ...state.talhoes.map(item => ({
      ...item, variety: item.variety || '', age: item.age ? `${item.age} anos` : '', soil: item.soil || 'Não informado',
      sensor: item.sensor || 'Não disponível', temp: 0, iea: 0, status: 'unfavorable', window: '—', product: '—',
      inputType: '', dose: '', period: '', rain: 0, futureMoisture: 0, mapX: 8, mapY: 8, mapW: 18, mapH: 22,
    })));
    HISTORICO_DATA.splice(0, HISTORICO_DATA.length, ...state.applications.map(item => ({
      ...item,
      resultClass: item.status === 'done' ? 'done' : 'skipped',
      cond: item.status === 'done' ? 'Favorável' : 'Pendente',
      condClass: 'favorable',
    })));
    state.recommendations.forEach(recommendation => {
      const existing = CAL_DATA[recommendation.date] || { app: false };
      CAL_DATA[recommendation.date] = { ...existing, ...recommendation, iea: recommendation.adequacyIndex };
    });
    window.GOLDCROP_RECOMMENDATIONS = {
      engine: 'GoldCropAnalysisEngine',
      recommendations: state.recommendations,
      bestRecommendation: state.recommendations.reduce((best, item) => !best || item.adequacyIndex > best.adequacyIndex ? item : best, null),
    };
    updateSystemFromAnalysis();
  } catch (error) {
    console.warn('Dados do banco indisponíveis:', error);
    Object.assign(FARM, { name: 'Fazenda Santa Clara', area: 84, talhoes: TALHOES_DATA.length, culture: 'Café' });
    window.GOLDCROP_RECOMMENDATIONS = window.GOLDCROP_RECOMMENDATIONS || { recommendations: [], bestRecommendation: null };
  }
}

// =====================================================
// APP STATE
// =====================================================

let currentPage = 'dashboard';
let selectedCalDay = null;
let calMonth = new Date(2026, 7, 1); // August 2026
let chartsInitialized = {};
let sidebarOpen = false;
let talhoesMap = null;
let selectedTalhaoRefId = null;

function getUsableTalhoes() {
  return TALHOES_DATA.filter(t => Number.isFinite(t.latitude) && Number.isFinite(t.longitude));
}

function getSelectedReferenceTalhao() {
  const fromState = TALHOES_DATA.find(t => t.id === selectedTalhaoRefId && Number.isFinite(t.latitude) && Number.isFinite(t.longitude));
  if (fromState) return fromState;
  const firstUsable = getUsableTalhoes()[0];
  if (firstUsable) {
    selectedTalhaoRefId = firstUsable.id;
    return firstUsable;
  }
  return null;
}

function syncCalendarTalhaoSelector() {
  const select = document.getElementById('calendarTalhaoSelect');
  if (!select) return;

  const usableTalhoes = getUsableTalhoes();
  if (!usableTalhoes.length) {
    select.disabled = true;
    select.innerHTML = '<option value="">Cadastre um talhão com latitude e longitude</option>';
    selectedTalhaoRefId = null;
    return;
  }

  const selected = getSelectedReferenceTalhao() || usableTalhoes[0];
  selectedTalhaoRefId = selected.id;
  select.disabled = false;
  select.innerHTML = usableTalhoes.map(t => `<option value="${t.id}" ${t.id === selected.id ? 'selected' : ''}>${t.name}</option>`).join('');
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

function applyWeatherToCalendar(weather) {
  const analysis = new GoldCropAnalysisEngine(weather).evaluate();
  window.GOLDCROP_RECOMMENDATIONS = analysis;
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
    if (!recommendation) return;
    const metrics = recommendation.metrics;
    recommendations.sort((a, b) => a.windowStart.localeCompare(b.windowStart));
    const rain = Number(values.precipitation_sum?.[index] || 0);
    const probability = Number(values.precipitation_probability_max?.[index] || 0);
    const gusts = Number(values.wind_gusts_10m_max?.[index] || 0);
    const temperature = Number(values.temperature_2m_mean?.[index] ?? values.temperature_2m_max?.[index] ?? 0);

    CAL_DATA[date] = {
      ...existing,
      iea: recommendation.adequacyIndex,
      type: date === today ? 'today' : date < today ? 'past' : 'future',
      rain,
      temp: temperature,
      precipitationProbability: probability,
      windSpeed: Number(values.wind_speed_10m_max?.[index] || 0),
      windGusts: gusts,
      applicationWindow: metrics,
      recommendation,
      recommendations,
      recommendationTime: formatRecommendationTime(recommendation),
      solarRadiation: Number(values.shortwave_radiation_sum?.[index] || 0),
      et0: Number(values.et0_fao_evapotranspiration?.[index] || 0),
    };
  });
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
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatMetricValue(value, suffix = '', decimals = 1) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const formatted = safeValue.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formatted}${suffix}`;
}

function updateSystemFromAnalysis() {
  const analysis = window.GOLDCROP_RECOMMENDATIONS;
  const best = analysis?.bestRecommendation;
  if (!best) return;

  const metrics = best.metrics || {};
  const confidence = `${Math.round(best.confidence * 100)}% confiança`;
  const date = formatRecommendationDate(best.date);
  const time = formatRecommendationTime(best);
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  const dashboardIeaValue = document.getElementById('dashboardIeaValue');
  if (dashboardIeaValue) dashboardIeaValue.innerHTML = `${best.adequacyIndex}<span class="kpi-unit">%</span>`;
  setText('dashboardRingValue', best.adequacyIndex);
  setText('dashboardNextDate', `${date} · ${time}`);
  setText('dashboardNextIea', `${best.adequacyIndex}%`);
  setText('dashboardNextDesc', `${confidence} · ${best.decision}`);
  setText('dashboardWindowDate', date);
  setText('dashboardWindowTime', time);
  setText('dashboardWindowRain', `${formatWeatherValue(metrics.rainVolume)} mm`);
  setText('dashboardWindowTemperature', `${formatWeatherValue(metrics.temperature)}°C`);
  setText('dashboardWindowWind', `${formatWeatherValue(metrics.windSpeed)} km/h`);
  setText('dashboardWindowInsight', `${best.explanation} Chuva ${formatWeatherValue(metrics.rainVolume)} mm, temperatura ${formatWeatherValue(metrics.temperature)}°C e vento ${formatWeatherValue(metrics.windSpeed)} km/h na janela analisada.`);

  TALHOES_DATA.forEach(t => {
    t.iea = best.adequacyIndex;
    t.status = best.adequacyIndex >= 80 ? 'favorable' : best.adequacyIndex >= 60 ? 'moderate' : 'unfavorable';
    t.window = `${date} · ${time}`;
    t.rain = metrics.rainVolume;
    t.temp = metrics.temperature;
  });
  if (document.getElementById('mapContainer')) renderTalhoes();
  if (document.getElementById('fazendaContent')) renderFazenda();
}

async function loadLocalWeather(referenceTalhaoId = selectedTalhaoRefId) {
  const reference = TALHOES_DATA.find(t => t.id === referenceTalhaoId && Number.isFinite(t.latitude) && Number.isFinite(t.longitude))
    || getSelectedReferenceTalhao();

  if (!reference) return;
  selectedTalhaoRefId = reference.id;

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
    const normalized = normalizeOpenMeteoWeather(data, reference);
    window.GOLDCROP_WEATHER = normalized;
    applyWeatherToCalendar(normalized);
    await apiRequest('/api/weather/ingest/', { method: 'POST', body: JSON.stringify(normalized) });
    await apiRequest('/api/recommendations/ingest/', { method: 'POST', body: JSON.stringify(window.GOLDCROP_RECOMMENDATIONS) });
    updateSystemFromAnalysis();
    const current = normalized.current.values;
    const rain = Number(normalized.daily.values.precipitation_sum?.[0] || 0);
    const probability = Math.max(...(normalized.hourly.values.precipitation_probability || []).slice(0, 24), 0);
    const condition = WEATHER_CODES[current.weather_code] || 'Condição não informada';
    const temperature = Number(current.temperature_2m).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const weatherSummary = document.getElementById('weatherSummary');
    const rainValue = document.getElementById('rainForecastValue');
    const rainDesc = document.getElementById('rainForecastDesc');

    if (weatherSummary) weatherSummary.textContent = `${reference.name} · ${temperature}°C · ${condition}`;
    if (rainValue) rainValue.innerHTML = `${rain.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}<span class="kpi-unit">mm</span>`;
    if (rainDesc) rainDesc.textContent = `${reference.name} · Probabilidade de ${probability}% · Open-Meteo`;

    reference.temp = current.temperature_2m;
    reference.moisture = current.relative_humidity_2m;
    reference.rain = rain;
    reference.wind = current.wind_speed_10m;
    if (document.getElementById('calGrid')) renderCalendar();
  } catch (error) {
    console.warn('Previsão local indisponível:', error);
    const weatherSummary = document.getElementById('weatherSummary');
    if (weatherSummary) weatherSummary.textContent = `${reference.name} · Clima local indisponível`;
  }
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
      ${data?.recommendationTime ? `<span class="cal-day-window">${data.recommendationTime}</span>` : ''}
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

  const selectedIea = recommendation?.adequacyIndex ?? data.iea;
  const ieaColor = selectedIea >= 80 ? '#3a8554' : selectedIea >= 60 ? '#d97706' : '#ef4444';
  const typeLabel = data.type === 'past' ? 'Dados reais' : data.type === 'today' ? 'Hoje — Dados reais + previsão' : 'Previsão estimada pela IA';

  const upFactors = [];
  const downFactors = [];

  if (data.rain < 10) upFactors.push('Baixo acúmulo de chuva → menor risco de lixiviação');
  if (data.temp >= 20 && data.temp <= 25) upFactors.push('Temperatura ideal para absorção foliar');
  if (selectedIea >= 80) upFactors.push('Alta probabilidade de absorção eficiente');

  if (data.rain > 15) downFactors.push('Chuva elevada → risco de lavagem do produto');
  if (data.rain > 25) downFactors.push('Alta precipitação → aplicação contraindicada');
  if (data.temp > 27) downFactors.push('Temperatura elevada → risco de volatilização');
  if (selectedIea < 60) downFactors.push('Condições desfavoráveis nesta janela');

  if (upFactors.length === 0) upFactors.push('Condições dentro do intervalo esperado');
  if (downFactors.length === 0) downFactors.push('Sem fatores significativos desfavoráveis');

  const confLabel = selectedIea >= 80 ? 'Alta' : selectedIea >= 60 ? 'Média' : 'Baixa';
  const confColor = selectedIea >= 80 ? '#3a8554' : selectedIea >= 60 ? '#d97706' : '#ef4444';

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const monthName = months[calMonth.getMonth()];

  const hasWindow = selectedIea >= 75;
  const windowTime = recommendation ? formatRecommendationTime(recommendation) : data.recommendationTime || (data.iea >= 85 ? '08:00 — 11:30' : data.iea >= 75 ? '09:00 — 12:00' : '—');
  const applicationWindow = data.applicationWindow || {};
  const selectedMetrics = recommendation?.metrics || applicationWindow;
  const windowOptions = (data.recommendations || []).map(item => `<option value="${item.windowStart}" ${item.windowStart === recommendation?.windowStart ? 'selected' : ''}>${formatRecommendationTime(item)} · IEA ${item.adequacyIndex}%</option>`).join('');

  const safeRain = formatMetricValue(data.rain, ' mm');
  const safeTemp = formatMetricValue(data.temp, '°C');
  const safeWind = formatMetricValue(selectedMetrics.windSpeed ?? data.windSpeed ?? 6, ' km/h');
  const safeGusts = formatMetricValue(selectedMetrics.windGusts ?? data.windGusts ?? 0, ' km/h');
  const safeProbability = formatMetricValue(
    selectedMetrics.rainProbability != null ? Math.round(selectedMetrics.rainProbability * 100) : data.precipitationProbability ?? 72,
    '%',
    0
  );
  const safeRainPlusShowers = formatMetricValue(((selectedMetrics.rain ?? 0) + (selectedMetrics.showers ?? 0)), ' mm');
  const safeSolar = formatMetricValue(data.solarRadiation ?? 0, ' MJ/m²');
  const safeEt0 = formatMetricValue(data.et0 ?? 0, ' mm');

  content.innerHTML = `
    <div class="dpanel-title">${day} de ${monthName === 'Ago' ? 'Agosto' : monthName} de ${calMonth.getFullYear()}</div>
    ${windowOptions ? `<label class="form-label" for="calendarWindowSelect">Pesquisar outra janela neste dia</label><select class="form-input" id="calendarWindowSelect" onchange="selectCalendarWindow('${selectedCalDay}', ${day}, this)">${windowOptions}</select>` : ''}
    <p style="font-size:.72rem;color:#9ca3af;margin-bottom:.875rem;font-style:italic">${typeLabel}</p>

    <div class="dpanel-iea-row">
      <div>
        <div style="font-size:.65rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">IEA</div>
        <div class="dpanel-iea-value" style="color:${ieaColor}">${selectedIea}%</div>
      </div>
      <div class="dpanel-iea-meta">
        <span style="font-size:.8rem;font-weight:700;color:${confColor}">${confLabel} confiança</span>
        ${hasWindow ? `<span style="font-size:.75rem;color:#4b5563">Janela: ${windowTime}</span>` : '<span style="font-size:.75rem;color:#9ca3af">Sem janela ideal</span>'}
      </div>
    </div>

    ${data.planned ? `<div class="calendar-plan"><b>Aplicação planejada</b><span>${data.planned}</span><small>Planejada por ${data.plannedBy || 'Carlos Souza'} · IEA ${recommendation?.adequacyIndex ?? data.iea}%</small></div>` : ''}
    ${data.app ? `<div class="calendar-done"><b>Aplicação realizada</b><span>${data.done || 'Registro operacional concluído'}</span><small>Realizada por ${data.doneBy || 'Pedro Santos'}${data.doneTime ? ' às ' + data.doneTime : ''}</small></div>` : ''}
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

function openEditarTalhaoModal(talhaoId) {
  const t = TALHOES_DATA.find(item => item.id === talhaoId);
  if (!t) return;
  document.getElementById('editarTalhaoId').value = t.id;
  document.getElementById('editarTalhaoNome').value = t.name;
  document.getElementById('editarTalhaoArea').value = t.area;
  document.getElementById('editarTalhaoCultura').value = t.culture || 'Café';
  document.getElementById('editarTalhaoLatitude').value = t.latitude ?? '';
  document.getElementById('editarTalhaoLongitude').value = t.longitude ?? '';
  document.getElementById('editarTalhaoRaio').value = t.radius || 80;
  document.getElementById('modalEditarTalhao').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeEditarTalhaoModal() {
  document.getElementById('modalEditarTalhao').style.display = 'none';
  document.body.style.overflow = '';
}

async function cadastrarTalhao(e) {
  e.preventDefault();
  try {
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

    const response = await apiRequest('/api/talhoes/', { method: 'POST', body: JSON.stringify({ nome: name, area, cultura: culture, latitude, longitude, raio: radius }) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      showToast(error.message || 'Não foi possível salvar o talhão no banco.', 'error');
      return;
    }
    const saved = (await response.json()).talhao;
    TALHOES_DATA.push({ ...saved, temp: 0, iea: 0, status: 'unfavorable', window: '—', product: '—', mapX: 8, mapY: 8, mapW: 18, mapH: 22 });
    renderTalhoes();
    closeCadastrarTalhaoModal();
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
      cultura: document.getElementById('editarTalhaoCultura').value.trim() || 'Café',
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

    renderTalhoes();
    closeEditarTalhaoModal();
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
    renderTalhoes();
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

  const safeName = t.name || 'Talhão';
  const safeArea = Number.isFinite(Number(t.area)) ? Number(t.area) : 0;
  const safeCulture = t.culture || 'Café';
  const safeAge = t.age || '—';
  const safeVariety = t.variety || '—';
  const safeSoil = t.soil || 'Não informado';
  const safeSensor = t.sensor || 'Não disponível';
  const safeLastReading = t.lastReading || '—';
  const safeProduct = t.product || '—';
  const safeInputType = t.inputType || '—';
  const safeDose = t.dose || '—';
  const safePeriod = t.period || '—';
  const safeIea = Number.isFinite(Number(t.iea)) ? Number(t.iea) : 0;
  const safeRain = Number.isFinite(Number(t.rain)) ? Number(t.rain) : 0;
  const safeFutureMoisture = Number.isFinite(Number(t.futureMoisture)) ? Number(t.futureMoisture) : 0;
  const safeTemp = Number.isFinite(Number(t.temp)) ? Number(t.temp) : 0;
  const safeLatitude = Number.isFinite(Number(t.latitude)) ? Number(t.latitude) : null;
  const safeLongitude = Number.isFinite(Number(t.longitude)) ? Number(t.longitude) : null;
  const safeRadius = Number.isFinite(Number(t.radius)) ? Number(t.radius) : 80;
  const statusColor = t.status === 'favorable' ? '#3a8554' : t.status === 'moderate' ? '#d97706' : '#ef4444';
  const previous = HISTORICO_DATA.filter(h => h.talhao === safeName).slice(0, 3);
  const coordsText = safeLatitude !== null && safeLongitude !== null
    ? `${safeLatitude.toFixed(6)}, ${safeLongitude.toFixed(6)}`
    : 'Coordenadas não cadastradas';
  const canManageTalhoes = true;

  title.textContent = safeName;
  body.innerHTML = `
    <div class="talhao-detail-head"><div><strong>${safeArea} ha · ${safeCulture} · ${safeAge}</strong><span>${safeVariety} · Solo ${safeSoil}</span></div><span class="monitoring-status">● Monitoramento ativo</span></div>
    <div class="detail-section-title">Condição atual <small>Dados do sensor ${safeSensor}</small></div>
    <div class="talhao-modal-grid">
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Umidade do sensor</div><div class="talhao-modal-metric-value sensor-locked-value">${SENSOR_HUMIDITY_LOCKED}</div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Temperatura do solo</div><div class="talhao-modal-metric-value">${formatMetricValue(safeTemp, '°C')}</div></div>
      <div class="talhao-modal-metric"><div class="talhao-modal-metric-label">Sensor</div><div class="talhao-modal-metric-value">${safeSensor} <small>Online</small></div></div>
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
    <div class="planned-application"><div><strong>${safeProduct}</strong><span>${safeInputType} · ${safeDose} · Período ${safePeriod}</span></div><button class="btn-ghost" type="button" onclick="openPlanejar(${t.id})">Planejar aplicação</button></div>
    <section class="gold-window-detail" style="--iea-color:${statusColor}"><div class="gold-window-heading"><div><span>Janela de Ouro</span><strong>${t.window || '—'}</strong><small>IEA de ${safeIea}% para aplicação de ${safeProduct} no ${safeName}</small></div><b>${safeIea}%<small>IEA</small></b></div><div class="window-factors"><span>Chuva prevista <b>${formatMetricValue(safeRain, ' mm')}</b></span><span>Umidade do sensor <b class="sensor-locked-value">${SENSOR_HUMIDITY_LOCKED}</b></span><span>Estimativa IA <b>${formatMetricValue(safeFutureMoisture, '%')}</b></span><span>Vento <b>6 km/h</b></span></div><p>O modelo usa a previsão meteorológica e os dados disponíveis para estimar condições de aplicação. A leitura de umidade do sensor está bloqueada.</p></section>
    <div class="detail-section-title">Evolução estimada da umidade <small>Disponível após disponibilizar um sensor</small></div>
    <div class="moisture-chart moisture-chart-locked"><div class="sensor-locked-message">Módulo de umidade bloqueado<br><small>Disponibilize um sensor para habilitar as leituras.</small></div></div>
    <div class="detail-section-title">Histórico do talhão</div>
    <div class="detail-history">${previous.length ? previous.map(h => `<div><span>${h.date}</span><strong>${h.product} · ${h.qty}</strong><em>IEA ${h.ieaPrev}% · ${h.result}</em></div>`).join('') : '<p>Nenhuma aplicação registrada neste talhão.</p>'}</div>
    <div class="detail-actions">
      <button class="btn-ghost" type="button" onclick="closeTalhaoModal()">Fechar</button>
      ${canManageTalhoes ? `
        <button class="btn-ghost" type="button" onclick="openEditarTalhaoModal(${t.id})">Editar</button>
        <button class="btn-ghost" type="button" onclick="excluirTalhao(${t.id})" style="border-color:#ef4444;color:#ef4444">Excluir</button>
      ` : ''}
      <button class="btn-primary" type="button" onclick="closeTalhaoModal();openRegistrar(${t.id})">Registrar aplicação</button>
    </div>
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
  const owner = FARM.owner || USER_DATA.name || 'Proprietário';
  const ownerInitials = owner.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase();
  const teamData = [{ name: owner, role: 'Proprietário', permission: 'Acesso completo', status: 'online', activity: 'Agora', initials: ownerInitials }, ...TEAM_DATA];
  const activityData = [...ACTIVITY_DATA, ...HISTORICO_DATA.slice(0, 4).map(item => ({
    initials: ownerInitials, name: owner,
    action: item.resultClass === 'done' ? 'registrou aplicação no' : 'planejou aplicação no',
    target: `${item.talhao} · ${item.product}`, time: item.date,
  }))];
  const best = window.GOLDCROP_RECOMMENDATIONS?.bestRecommendation;
  const nextDate = best ? formatRecommendationDate(best.date) : '25/08/2026';
  const nextTime = best ? formatRecommendationTime(best) : '08:00 — 11:30';
  const nextIea = best?.adequacyIndex ?? 91;
  const plannedCount = Object.values(CAL_DATA).filter(day => day.planned).length;
  const teamCards = teamData.map(person => `
    <article class="team-member-card">
      <div class="team-avatar">${person.initials}<i class="presence ${person.status}"></i></div>
      <div class="team-member-main"><strong>${person.name}</strong><span>${person.role}</span><small><i class="presence-dot ${person.status}"></i>${person.status === 'online' ? 'Online' : 'Offline'} · Atividade: ${person.activity}</small></div>
      <span class="permission-badge">${person.permission}</span>
    </article>`).join('');
  const activities = activityData.length ? activityData.map(item => `<div class="farm-activity"><div class="activity-avatar">${item.initials}</div><div><strong>${item.name}</strong> ${item.action} <b>${item.target}</b><span>${item.time}</span></div></div>`).join('') : '<p class="farm-section-sub">Nenhuma atividade registrada.</p>';
  const location = [FARM.city, FARM.state].filter(Boolean).join(', ') || 'Localização não informada';
  const sensors = FARM.sensors || 0;
  container.innerHTML = `
    <header class="farm-hero">
      <div class="farm-hero-mark">✦</div><div class="farm-hero-copy"><span>Ambiente colaborativo</span><h1>${FARM.name}</h1><p>${location} · ${FARM.culture || 'Cultivo não informado'}</p></div>
      <div class="farm-hero-stats"><div><b>${FARM.area}</b><span>hectares</span></div><div><b>${FARM.talhoes}</b><span>talhões</span></div><div><b>${sensors}</b><span>sensores ativos</span></div><div><b>${teamData.length}</b><span>pessoas</span></div></div>
      <button class="btn-primary" onclick="openPessoa()">+ Adicionar pessoa</button>
    </header>
    <div class="farm-shared-note"><span>◉</span><div><strong>Dados compartilhados da fazenda</strong><p>Todos os membros autorizados visualizam os mesmos dados da fazenda de acordo com suas permissões.</p></div></div>
    <div class="farm-data-grid"><div><span>Talhões monitorados</span><b>${FARM.talhoes}</b></div><div><span>Sensores ativos</span><b>${sensors}</b></div><div><span>Aplicações planejadas</span><b>${plannedCount}</b></div><div><span>Aplicações realizadas</span><b>${HISTORICO_DATA.filter(h => h.resultClass === 'done').length}</b></div><div class="next-window"><span>Próxima Janela de Ouro</span><b>${nextDate} · ${nextTime}</b><small>Recomendação do motor · IEA ${nextIea}%</small></div></div>
    <div class="farm-main-grid"><section class="farm-section card"><div class="card-header"><div><h2 class="farm-section-title">Pessoas da Fazenda</h2><p class="farm-section-sub">A equipe que opera no mesmo ambiente de dados.</p></div><span class="team-count">${teamData.length} membro${teamData.length === 1 ? '' : 's'}</span></div><div class="team-list">${teamCards}</div></section><section class="farm-section card"><div class="card-header"><div><h2 class="farm-section-title">Atividades recentes</h2><p class="farm-section-sub">Operações registradas pela equipe.</p></div></div><div class="activity-timeline">${activities}</div></section></div>
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
      document.getElementById('formTipo').value = (t.inputType || '').includes('Defensivo') ? 'Defensivo' : 'Fertilizante';
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

async function submitPlanejar() {
  const t = TALHOES_DATA.find(item => item.name === document.getElementById('planTalhao').value);
  const date = document.getElementById('planData').value;
  const plannedBy = document.getElementById('planResponsavel').value;
  if (t) {
    const product = document.getElementById('planProduto').value;
    const type = document.getElementById('planTipo').value;
    const dose = document.getElementById('planDose').value;
    const response = await apiRequest('/api/applications/', { method: 'POST', body: JSON.stringify({
      talhao: t.name, produto: product, tipo: type, dose, data: date, status: 'planned', observacoes: document.querySelector('#modalPlanejar textarea')?.value || '',
    }) });
    if (!response.ok) {
      showToast('Não foi possível salvar o planejamento no banco.', 'error');
      return;
    }
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

async function submitRegistrar() {
  const talhao = document.getElementById('formTalhao').value;
  const produto = document.getElementById('formProduto').value;
  const data = document.getElementById('formData').value;
  const horario = document.getElementById('formHorario').value;

  if (!produto.trim()) {
    showToast('Preencha o nome do produto.', 'error');
    return;
  }

  const response = await apiRequest('/api/applications/', { method: 'POST', body: JSON.stringify({
    talhao, produto, tipo: document.getElementById('formTipo').value,
    quantidade: document.getElementById('formQtd').value, data, horario,
    status: 'done', observacoes: document.getElementById('formObs').value,
  }) });
  if (!response.ok) {
    showToast('Não foi possível registrar a aplicação no banco.', 'error');
    return;
  }

  // Keep the current view synchronized with the persisted record.
  const savedApplication = (await response.json()).application;
  const dateFormatted = data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : '25/08/2026';
  HISTORICO_DATA.unshift({
    id: savedApplication.id,
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

const storedAuthUser = document.getElementById('auth-user-data');
const USER_DATA = storedAuthUser ? JSON.parse(storedAuthUser.textContent) : {
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

async function saveProfileChanges() {
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

  const response = await apiRequest('/api/profile/', { method: 'POST', body: JSON.stringify({ name, initials, email, phone, farm, role }) });
  if (!response.ok) {
    showToast('Não foi possível salvar o perfil no banco.', 'error');
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
  const dashboardFarmName = document.getElementById('dashboardFarmName');
  if (dashboardFarmName) dashboardFarmName.textContent = FARM.name;
  const dashboardFarmTalhoes = document.getElementById('dashboardFarmTalhoes');
  if (dashboardFarmTalhoes) dashboardFarmTalhoes.textContent = `${FARM.talhoes} talhões`;
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
  document.getElementById('calendarTalhaoSelect')?.addEventListener('change', async (event) => {
    const talhaoId = Number(event.target.value);
    if (!talhaoId) return;
    selectedTalhaoRefId = talhaoId;
    await loadLocalWeather(talhaoId);
  });

  updateProfileDOM();
  await loadDatabaseState();
  syncCalendarTalhaoSelector();
  await loadLocalWeather(getSelectedReferenceTalhao()?.id);

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
  if (document.getElementById('calGrid')) renderCalendar();
  if (document.getElementById('mapContainer')) renderTalhoes();
  if (document.getElementById('fazendaContent')) renderFazenda();
  if (document.getElementById('historicoTable')) renderHistorico();
  if (document.getElementById('aplicacoesContent')) renderAplicacoes();
  if (document.getElementById('settingsContent')) renderSettings();

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
