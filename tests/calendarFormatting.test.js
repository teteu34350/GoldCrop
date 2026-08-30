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

assert.strictEqual(typeof context.formatMetricValue, 'function', 'formatMetricValue should exist');
assert.strictEqual(context.formatMetricValue(undefined, ' mm'), '0,0 mm');
assert.strictEqual(context.formatMetricValue(12.5, '°C'), '12,5°C');

console.log('Calendar formatting tests passed');
