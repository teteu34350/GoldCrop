const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const script = fs.readFileSync(path.resolve(__dirname, '../static/estoque.js'), 'utf8');
const elements = {
  modalRelatorio: { style: {} },
};
const timeouts = [];
const listeners = {};
let printed = false;
let reportElement;
const bodyClasses = new Set();
const context = {
  console,
  document: {
    addEventListener() {},
    getElementById: id => elements[id] || null,
    querySelector: selector => selector === '.estoque-page'
      ? { dataset: { reportLogo: '/static/favicon-goldcrop.jpg' } }
      : null,
    createElement: () => {
      reportElement = {
        className: '',
        innerHTML: '',
        querySelector: () => null,
        remove() { this.removed = true; },
      };
      return reportElement;
    },
    body: {
      classList: {
        add: name => bodyClasses.add(name),
        remove: name => bodyClasses.delete(name),
      },
      appendChild() {},
    },
  },
  window: {
    addEventListener: (name, callback) => { listeners[name] = callback; },
    setTimeout: callback => { timeouts.push(callback); },
    print: () => { printed = true; },
  },
  setTimeout,
  Date,
};
vm.runInNewContext(script, context);

vm.runInContext(`produtosGlobal = [
  { nome: 'Adubo Café', categoria: 'Fertilizante', unidade: 'kg', quantidade_atual: 12, estoque_minimo: 20, status: 'warning' },
  { nome: 'Produto normal', categoria: 'Outros', unidade: 'L', quantidade_atual: 40, estoque_minimo: 10, status: 'success' }
]; imprimirRelatorio('baixo')`, context);

assert(reportElement.innerHTML.includes('Adubo Café'), 'low-stock report should include low-stock products');
assert(!reportElement.innerHTML.includes('Produto normal'), 'low-stock report should omit products with normal stock');
assert(reportElement.innerHTML.includes('<table class="report-table">'), 'report should render a printable table');
assert(reportElement.innerHTML.includes('/static/favicon-goldcrop.jpg'), 'report should include the GoldCrop logo');
assert(bodyClasses.has('printing-report'), 'print mode should be enabled before printing');
timeouts[0]();
assert(printed, 'report should open the print dialog');
listeners.afterprint();
assert(!bodyClasses.has('printing-report'), 'print mode should be cleaned after printing');
assert(reportElement.removed, 'temporary report should be removed after printing');

console.log('Stock report tests passed');
