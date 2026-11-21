// Prueba manual del intérprete (no escribe en la base de datos).
// Uso: npx tsx --env-file=.env.local scripts/test-parse.mts [imagen.jpg]
import fs from 'node:fs';
import { parseOperationWithAIOrFallback } from '../src/lib/agent-service.ts';
import { validateParsedOperation } from '../src/lib/operations-server.ts';

async function run(label: string, text: string, image?: string) {
  const t = Date.now();
  const r = await parseOperationWithAIOrFallback(text, image ? { imageBase64: image, imageMimeType: 'image/jpeg' } : undefined);
  const v = r.operation ? validateParsedOperation(r.operation) : null;
  const shown = v ? (v.ok ? v.op : `NO VÁLIDA: ${v.reason}`) : r.command ? `comando ${r.command}` : r.error;
  console.log(`${label.padEnd(28)} ${String(Date.now() - t).padStart(5)}ms`, JSON.stringify(shown));
}

const img = process.argv[2] ? fs.readFileSync(process.argv[2]).toString('base64') : undefined;

await run('compra', 'compre 500 dolares a 7750 con itau');
await run('gasto sin banco', 'pague 80 mil de almuerzo');
await run('ingreso', 'me depositaron 2 palos en el familiar, pago de Juan');
await run('transferencia', 'pase 5 palos de itau a efectivo');
await run('retiro del banco', 'saque 3 millones del BNF');
await run('deposito propio', 'deposite 1 palo y medio de efectivo en continental');
if (img) await run('comprobante', '', img);
