const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appPath = path.resolve(__dirname, '../static/app.js');
const code = fs.readFileSync(appPath, 'utf8');
const context = {
  console,
  window: {},
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => ({ className: '', innerHTML: '', style: {}, dataset: {}, appendChild: () => {}, addEventListener: () => {}, querySelector: () => null }),
  },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  URLSearchParams,
  setTimeout,
  clearTimeout,
  Date,
};
context.window = context;
vm.runInNewContext(code, context);

assert.strictEqual(vm.runInContext('TALHOES_DATA.length', context), 0, 'Talhão records must come from the authenticated API');
assert.strictEqual(vm.runInContext('HISTORICO_DATA.length', context), 0, 'History must not contain bundled demo records');
assert.strictEqual(vm.runInContext('Object.keys(CAL_DATA).length', context), 0, 'Calendar data must be populated from real forecast and saved operations');
assert.strictEqual(typeof context.formatMetricValue, 'function', 'formatMetricValue should exist');
assert.strictEqual(context.formatMetricValue(undefined, ' mm'), '—');
assert.strictEqual(context.formatMetricValue(0, ' mm'), '0,0 mm');
assert.strictEqual(context.formatMetricValue(12.5, '°C'), '12,5°C');
assert.strictEqual(vm.runInContext('calMonth.getFullYear()', context), new Date().getFullYear(), 'calendar should open in the current year');
assert.strictEqual(vm.runInContext('calMonth.getMonth()', context), new Date().getMonth(), 'calendar should open in the current month');

const elements = {};
const maps = [];
context.document.getElementById = id => elements[id] || null;
context.AbortController = AbortController;
context.L = {
  map: () => {
    const instance = {
      events: {},
      setView() { return this; },
      on(name, callback) { this.events[name] = callback; return this; },
      panTo() { return this; },
      invalidateSize() {},
      remove() {},
    };
    maps.push(instance);
    return instance;
  },
  tileLayer: () => ({ addTo() { return this; } }),
  circleMarker: () => ({ bindTooltip() { return this; }, addTo() { return this; } }),
  marker: initialPosition => ({
    position: initialPosition,
    handlers: {},
    addTo() { return this; },
    setLatLng(position) { this.position = position; return this; },
    getLatLng() { return { lat: this.position[0], lng: this.position[1] }; },
    off(name) { delete this.handlers[name]; return this; },
    on(name, callback) { this.handlers[name] = callback; return this; },
  }),
};
for (const id of ['novoTalhaoLatitude', 'novoTalhaoLongitude', 'novoTalhaoMap', 'novoTalhaoMapStatus',
  'editarTalhaoLatitude', 'editarTalhaoLongitude', 'editarTalhaoMap', 'editarTalhaoMapStatus']) {
  elements[id] = {
    value: '',
    textContent: '',
    innerHTML: '',
    addEventListener() {},
  };
}
vm.runInContext("renderTalhaoLocationPicker('novoTalhaoMap', 'novoTalhaoLatitude', 'novoTalhaoLongitude')", context);
maps[0].events.click({ latlng: { lat: -20.8, lng: -46.2 } });
assert.strictEqual(elements.novoTalhaoLatitude.value, '-20.800000');
assert.strictEqual(elements.novoTalhaoLongitude.value, '-46.200000');

elements.editarTalhaoLatitude.value = '-20.896861';
elements.editarTalhaoLongitude.value = '-46.088306';
vm.runInContext("renderTalhaoLocationPicker('editarTalhaoMap', 'editarTalhaoLatitude', 'editarTalhaoLongitude', 3)", context);
maps[1].events.click({ latlng: { lat: -20.9, lng: -46.1 } });
assert.strictEqual(elements.editarTalhaoLatitude.value, '-20.900000');
assert.strictEqual(elements.editarTalhaoLongitude.value, '-46.100000');
assert.strictEqual(elements.novoTalhaoLatitude.value, '-20.800000', 'Selecting one field location must not change another talhão');

elements.selectedTalhaoMapInfo = { innerHTML: '' };
elements.selectedTalhaoSummary = { innerHTML: '' };
vm.runInContext(`TALHOES_DATA.push({
  id: 3,
  name: 'Talhão 03',
  culture: 'Café Arábica',
  area: 8.4,
  latitude: -20.896861,
  longitude: -46.088306,
  radius: 80,
  iea: 91,
  status: 'favorable',
  window: '26/08 · 08:00–11:30',
  analysis: { bestRecommendation: { adequacyIndex: 91 } }
})`, context);
vm.runInContext('FARM.permissions = { manage: true, plan: true, record: true }', context);
let focusedLocation = null;
let openedPopup = false;
context.mapFocusMock = {
  getZoom: () => 12,
  flyTo: (...args) => { focusedLocation = args; },
};
context.markerPopupMock = { openPopup: () => { openedPopup = true; } };
vm.runInContext(
  'talhoesMap = mapFocusMock; talhaoMapLayers = new Map([[3, { marker: markerPopupMock }]]); focusTalhaoOnMap(3)',
  context,
);
assert.strictEqual(Array.from(focusedLocation[0]).join(','), '-20.896861,-46.088306', 'Selecting a field card should focus its map location');
assert.strictEqual(focusedLocation[1], 16, 'Field focus should zoom in to show the selected map point');
assert(openedPopup, 'Field focus should open the marker popup');
assert(elements.selectedTalhaoSummary.innerHTML.includes('Ver detalhes'), 'The compact selected-field summary should provide a details link');
assert(elements.selectedTalhaoSummary.innerHTML.includes('Café Arábica'), 'The compact summary should show the selected field culture');
assert(elements.selectedTalhaoSummary.innerHTML.includes('Favorável'), 'The compact summary should show the selected field status');
assert(elements.selectedTalhaoSummary.innerHTML.includes('26/08 · 08:00–11:30'), 'The compact summary should show the selected field window');
assert(elements.selectedTalhaoSummary.innerHTML.includes('91%'), 'The compact summary should show the selected field IEA');
assert(elements.selectedTalhaoMapInfo.innerHTML.includes('Talhão 03'), 'Selected field details should render below the map');
assert(elements.selectedTalhaoMapInfo.innerHTML.includes('-20.896861, -46.088306'), 'Selected field coordinates should appear in the map details');
assert(elements.selectedTalhaoMapInfo.innerHTML.includes('Condição e telemetria'), 'Map details should preserve the sensor section');
assert(elements.selectedTalhaoMapInfo.innerHTML.includes('Localização do talhão'), 'Map details should preserve location attributes');
assert(elements.selectedTalhaoMapInfo.innerHTML.includes('Próxima aplicação planejada'), 'Map details should preserve the planning section');
assert(elements.selectedTalhaoMapInfo.innerHTML.includes('Histórico do talhão'), 'Map details should preserve the application history');
assert(elements.selectedTalhaoMapInfo.innerHTML.includes('Excluir talhão'), 'Map details should keep the field management actions');

console.log('Calendar formatting tests passed');
