const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const app = fs.readFileSync(require('node:path').join(__dirname, '../site/app.js'), 'utf8');
const start = app.indexOf('document.getElementById("cf-copy").addEventListener("click", function () {');
const bodyStart = app.indexOf('var b = this;', start);
const bodyEnd = app.indexOf('\n    });', bodyStart);
const body = app.slice(bodyStart, bodyEnd);
(async () => {
  for (const mode of ['success', 'refused', 'missing']) {
    const button = { textContent: "Copier l'adresse" };
    const navigator = mode === 'missing' ? {} : { clipboard: { writeText: () => mode === 'success' ? Promise.resolve() : Promise.reject(new Error('denied')) } };
    vm.runInNewContext('(function () {' + body + '}).call(button)', { button, navigator, mail: 'test@example.com', setTimeout: () => {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.textContent, mode === 'success' ? 'Adresse copiée ✓' : "Sélectionnez et copiez l'adresse ci-dessus");
  }
  console.log('Clipboard: success, refused and unavailable passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
