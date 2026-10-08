import fs from 'node:fs';

// Concatena V1App.jsx e todos os componentes: testes de "contrato" de interface leem o app inteiro.
export function readApp() {
  const dir = new URL('./src/components/', import.meta.url);
  const parts = [fs.readFileSync(new URL('./src/V1App.jsx', import.meta.url), 'utf8')];
  for (const f of fs.readdirSync(dir).sort()) {
    if (f.endsWith('.jsx')) parts.push(fs.readFileSync(new URL(f, dir), 'utf8'));
  }
  return parts.join('\n');
}
