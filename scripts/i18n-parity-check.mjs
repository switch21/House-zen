/** Compare les clés des locales via regex (sans exécution de module). */
import { readFileSync } from 'node:fs';

const ROOT = new URL('../src/lib/i18n/locales/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const keys = (src) => {
  const out = new Set();
  const re = /'([a-zA-Z0-9_.]+)':\s/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
};

const fr = keys(read('fr.ts'));
console.log('fr:', fr.size);
for (const loc of ['en', 'es', 'de', 'ar', 'it', 'sw']) {
  const k = keys(read(`${loc}.ts`));
  const missing = [...fr].filter((x) => !k.has(x));
  const extra = [...k].filter((x) => !fr.has(x));
  console.log(`${loc}: ${k.size} clés | manquants: ${missing.length}${missing.length ? ' -> ' + missing.slice(0, 8).join(',') : ''} | extra: ${extra.length}${extra.length ? ' -> ' + extra.slice(0, 5).join(',') : ''}`);
}
