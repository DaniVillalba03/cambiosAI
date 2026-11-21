// Prueba manual del intérprete (no escribe en la base de datos).
// Uso: npx tsx --env-file=.env.local scripts/test-parse.ts <imagen.jpg>
import fs from 'node:fs';
import { parseOperationWithAIOrFallback } from '../src/lib/agent-service.ts';

async function run(label: string, fn: () => Promise<any>) {
  const t = Date.now();
  const r = await fn();
  console.log(`${label.padEnd(34)} ${Date.now() - t}ms`, JSON.stringify(r.operation ?? r.error).slice(0, 160));
}

const img = process.argv[2] ? fs.readFileSync(process.argv[2]).toString('base64') : undefined;

await run('texto compra', () => parseOperationWithAIOrFallback('compre 500 dolares a 7750 con itau'));
await run('texto gasto sin banco', () => parseOperationWithAIOrFallback('pague 80 mil de almuerzo'));
if (img) {
  for (let i = 0; i < 3; i++) {
    await run(`comprobante #${i + 1}`, () => parseOperationWithAIOrFallback('', { imageBase64: img, imageMimeType: 'image/jpeg' }));
  }
  process.env.GEMINI_MODELS = 'modelo-que-no-existe,gemini-3.5-flash-lite';
  await run('comprobante con primer modelo roto', () =>
    parseOperationWithAIOrFallback('', { imageBase64: img, imageMimeType: 'image/jpeg' })
  );
}
