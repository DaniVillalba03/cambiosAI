import { AgentResponse, Account, Currency, OperationType } from '@/types';

/**
 * Normaliza texto eliminando acentos, espacios extra y pasando a minúsculas
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Detecta si el texto es un comando de sistema (resumen o anular)
 */
export function detectCommand(text: string): { isCommand: boolean; command?: 'resumen' | 'anular' } {
  const norm = normalizeText(text);

  // Comandos de resumen / balance / cierre
  if (
    /^(resumen|cierre|arqueo|balance|reporte|estado)(\s|$)/.test(norm) ||
    /\b(cierre de caja|arqueo de caja|resumen del dia|resumen de hoy|ver resumen|dame un resumen)\b/.test(norm)
  ) {
    return { isCommand: true, command: 'resumen' };
  }

  // Comandos de anulación / rollback
  if (
    /^(anular|deshacer|borrar|cancelar)(\s|$)/.test(norm) ||
    /\b(anular ultimo|borrar ultimo|deshacer ultimo|cancelar ultimo)\b/.test(norm)
  ) {
    return { isCommand: true, command: 'anular' };
  }

  return { isCommand: false };
}

/**
 * Parser local robusto para lenguaje y jerga cambiaria en Paraguay.
 * Procesa mensajes comunes como:
 * - "Compré 500 dólares a 7750 por Ueno"
 * - "Vendí 200 USD a 7820 en efectivo"
 * - "Compre 1000 reales a 1520 familiar"
 * - "500 usd a 7750 ueno"
 * - "Gasté 50 mil en combustible con Itaú"
 * - "resumen"
 */
export function parseLocalFallback(text: string): AgentResponse | null {
  if (!text || !text.trim()) return null;

  const norm = normalizeText(text);

  // ─── 1. Comandos de control ───
  const cmd = detectCommand(text);
  if (cmd.isCommand) {
    return {
      type: 'COMPRA', // placeholder requerido por tipo
      isCommand: true,
      command: cmd.command,
    };
  }

  // ─── 2. Detectar Divisa Extranjera ───
  const currency = extractCurrency(norm);

  // ─── 3. Detectar si es GASTO ───
  // Si no hay divisa y hay palabras de gasto, o si dice explícitamente "gasté / pago" sin divisa extranjera
  const isGastoKeyword = /\b(gast[a-z]*|combustible|nafta|almuerzo|comida|cena|alquiler|expensa[a-z]*|viatico[a-z]*|limpieza|internet|luz|ande|agua|merienda|desayuno)\b/.test(norm) ||
    (/\b(pag[a-z]*)\b/.test(norm) && !currency);

  if (isGastoKeyword && !currency) {
    const amount = extractAmountPYG(norm);
    const account = extractAccount(norm);
    const desc = extractGastoDescription(norm);
    if (amount && amount > 0) {
      return {
        type: 'GASTO',
        totalPYG: amount,
        account,
        description: desc || 'Gasto operativo',
      };
    }
  }

  // ─── 4. Operación Cambiaria (COMPRA o VENTA) ───
  // Moneda: si no se detectó explícitamente pero hay cotización tipo 7750 o mención de dólares, asumir USD
  const finalCurrency: Currency = currency || 'USD';

  // Tipo de operación
  let type: OperationType = 'COMPRA';
  if (/\b(vend[a-z]*|vent[a-z]*|salid[a-z]*)\b/.test(norm)) {
    type = 'VENTA';
  } else if (/\b(compr[a-z]*|ingres[a-z]*|entrad[a-z]*)\b/.test(norm)) {
    type = 'COMPRA';
  } else {
    // Por defecto en la jerga cambista, registrar divisa recibida es COMPRA
    type = 'COMPRA';
  }

  // Cuenta
  const account = extractAccount(norm);

  // Monto y Cotización
  const amount = extractForeignAmount(norm, finalCurrency);
  const rate = extractRate(norm, finalCurrency);

  // Si encontramos monto o cotización, construir respuesta
  if (amount !== null || rate !== null) {
    // Fallback de cotización por si solo envió monto
    const defaultRates: Record<Currency, number> = {
      USD: 7750,
      BRL: 1520,
      ARS: 8.2,
      EUR: 8400,
    };

    const finalAmount = amount && amount > 0 ? amount : 500;
    const finalRate = rate && rate > 0 ? rate : defaultRates[finalCurrency];
    const totalPYG = Math.round(finalAmount * finalRate);

    return {
      type,
      currency: finalCurrency,
      amount: finalAmount,
      rate: finalRate,
      totalPYG,
      account,
    };
  }

  return null;
}

/**
 * Extrae la divisa mencionada en el texto
 */
export function extractCurrency(text: string): Currency | null {
  // USD
  if (/\b(dolar[a-z]*|usd|dol|verdes)\b/.test(text) || /(?:u\$s|\$us|us\$)/.test(text)) {
    return 'USD';
  }
  // BRL
  if (/\b(real[a-z]*|reais|brl)\b/.test(text) || /\br\$/.test(text)) {
    return 'BRL';
  }
  // ARS
  if (/\b(peso[a-z]*|ars|arg|argentinos)\b/.test(text)) {
    return 'ARS';
  }
  // EUR
  if (/\b(euro[a-z]*|eur)\b/.test(text) || /€/.test(text)) {
    return 'EUR';
  }
  // Símbolo de dólar suelto
  if (/\$/.test(text)) {
    return 'USD';
  }
  return null;
}

/**
 * Extrae la cuenta bancaria o de efectivo
 */
export function extractAccount(text: string): Account {
  if (/\bueno\b|\buenobank\b/.test(text)) return 'Ueno Bank';
  if (/\bitau\b/.test(text)) return 'Itaú';
  if (/\bfamiliar\b/.test(text)) return 'Banco Familiar';
  if (/\bbnf\b|\bfomento\b/.test(text)) return 'BNF';
  if (/\bcontinental\b|\bconti\b/.test(text)) return 'Continental';
  if (/\befectivo\b|\bcash\b|\ben mano\b|\bmano\b|\bbillete[s]?\b/.test(text)) return 'Efectivo PYG';

  // Por defecto en Paraguay: Efectivo PYG
  return 'Efectivo PYG';
}

/**
 * Extrae montos en Guaraníes (para gastos o totales)
 */
function extractAmountPYG(text: string): number | null {
  // Palos (millones): "1 palo", "2.5 palos"
  const paloMatch = text.match(/(\d+(?:[.,]\d+)?)\s*palo[s]?/);
  if (paloMatch) {
    return parseFloat(paloMatch[1].replace(',', '.')) * 1_000_000;
  }

  // Mil / Lucas: "50 mil", "80 lucas"
  const milMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(mil|lucas)/);
  if (milMatch) {
    return parseFloat(milMatch[1].replace(',', '.')) * 1_000;
  }

  // Formato con punto de miles: "50.000", "1.500.000"
  const dotNumMatch = text.match(/\b(\d{1,3}(?:\.\d{3})+)\b/);
  if (dotNumMatch) {
    return parseFloat(dotNumMatch[1].replace(/\./g, ''));
  }

  // Número directo
  const directMatch = text.match(/\b(\d{4,9})\b/);
  if (directMatch) {
    return parseFloat(directMatch[1]);
  }

  return null;
}

/**
 * Convierte un string numérico teniendo en cuenta formatos de punto/coma y contexto de divisa
 */
export function parseNumberFormatted(raw: string, isRate: boolean, currency?: Currency | null): number {
  let clean = raw.trim();

  // "100 mil"
  if (/mil/i.test(clean)) {
    const val = parseFloat(clean.replace(/mil/i, '').trim().replace(',', '.')) || 1;
    return val * 1000;
  }

  // "1 palo"
  if (/palo/i.test(clean)) {
    const val = parseFloat(clean.replace(/palo[s]?/i, '').trim().replace(',', '.')) || 1;
    return val * 1_000_000;
  }

  // Formatos con separadores de miles de 3 dígitos (ej: 7.750 o 1.000 o 7,750)
  if (/^\d{1,3}[.]\d{3}$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, ''));
  }
  if (/^\d{1,3}[,]\d{3}$/.test(clean)) {
    return parseFloat(clean.replace(/,/g, ''));
  }

  // Formatos con múltiples separadores de miles (ej: 100.000 o 1.500.000)
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(clean)) {
    return parseFloat(clean.replace(/[.,]/g, ''));
  }

  // Formato decimal con coma o punto (ej: 8,2 o 8.2 o 7.75)
  if (/^\d+[.,]\d{1,2}$/.test(clean)) {
    const val = parseFloat(clean.replace(',', '.'));
    // Si la cotización de USD/EUR/BRL se escribe abreviada como 7.75 o 7.8
    if (isRate && (currency === 'USD' || currency === 'EUR' || currency === 'BRL') && val < 50) {
      return Math.round(val * 1000);
    }
    return val;
  }

  const val = parseFloat(clean.replace(/\./g, '').replace(',', '.'));
  if (isRate && (currency === 'USD' || currency === 'EUR' || currency === 'BRL') && val > 0 && val < 50) {
    return Math.round(val * 1000);
  }
  return val;
}

/**
 * Extrae la cantidad en moneda extranjera
 */
function extractForeignAmount(text: string, currency: Currency): number | null {
  // Patrón 1: Número pegado a la divisa ("500 dolares", "200 usd", "100 mil pesos", "1.000 reales")
  const curPatterns = [
    /(\d+(?:[.,]\d+)*(?:\s*mil)?)\s*(?:dolar[a-z]*|usd|dol|verdes)/i,
    /(\d+(?:[.,]\d+)*(?:\s*mil)?)\s*(?:real[a-z]*|reais|brl)/i,
    /(\d+(?:[.,]\d+)*(?:\s*mil)?)\s*(?:peso[a-z]*|ars|arg)/i,
    /(\d+(?:[.,]\d+)*(?:\s*mil)?)\s*(?:euro[a-z]*|eur)/i,
    /(?:dolar[a-z]*|usd|dol|verdes)\s*(\d+(?:[.,]\d+)*(?:\s*mil)?)/i,
    /(?:real[a-z]*|reais|brl)\s*(\d+(?:[.,]\d+)*(?:\s*mil)?)/i,
    /(?:peso[a-z]*|ars|arg)\s*(\d+(?:[.,]\d+)*(?:\s*mil)?)/i,
    /(?:euro[a-z]*|eur)\s*(\d+(?:[.,]\d+)*(?:\s*mil)?)/i,
  ];

  for (const p of curPatterns) {
    const m = text.match(p);
    if (m && m[1]) {
      return parseNumberFormatted(m[1], false, currency);
    }
  }

  // Patrón 2: Primer número que NO sea la tasa ("Compré 500 a 7750")
  const allNumbers = text.match(/\b\d+(?:[.,]\d+)*(?:\s*mil)?\b/g);
  if (allNumbers && allNumbers.length >= 1) {
    // Si hay un número precedido por "a" o "cotiz", ese es la tasa
    const rateMatch = text.match(/\b(?:a|@|cotiz[a-z]*|tasa|precio)\s+(\d+(?:[.,]\d+)*)\b/i);
    const rateRaw = rateMatch ? rateMatch[1] : null;

    for (const numStr of allNumbers) {
      if (rateRaw && numStr.includes(rateRaw)) continue;
      const parsed = parseNumberFormatted(numStr, false, currency);
      // Descartar si el número es obviamente la cotización (ej: 7750 para USD)
      if (currency === 'USD' && parsed >= 5000 && parsed <= 12000 && allNumbers.length > 1) {
        continue;
      }
      return parsed;
    }

    return parseNumberFormatted(allNumbers[0], false, currency);
  }

  return null;
}

/**
 * Extrae la cotización o tasa de cambio
 */
function extractRate(text: string, currency: Currency): number | null {
  // Patrón 1: Explícito con "a 7750", "@ 7750", "cotiz 7750", "tasa 7750", "en 7750"
  const rateMatch = text.match(/\b(?:a|@|cotiz[a-z]*|tasa|precio|en)\s+(\d+(?:[.,]\d+)*)\b/i);
  if (rateMatch && rateMatch[1]) {
    return parseNumberFormatted(rateMatch[1], true, currency);
  }

  // Patrón 2: El segundo número del texto suele ser la cotización ("500 usd 7750 ueno")
  const allNumbers = text.match(/\b\d+(?:[.,]\d+)*\b/g);
  if (allNumbers && allNumbers.length >= 2) {
    // Tomar el que coincide con rangos típicos de cotización
    for (const n of allNumbers) {
      const parsed = parseNumberFormatted(n, true, currency);
      if (currency === 'USD' && parsed >= 5000 && parsed <= 12000) return parsed;
      if (currency === 'BRL' && parsed >= 1000 && parsed <= 3000) return parsed;
      if (currency === 'EUR' && parsed >= 6000 && parsed <= 15000) return parsed;
      if (currency === 'ARS' && parsed >= 3 && parsed <= 50) return parsed;
    }

    // Por descarte, el segundo número
    return parseNumberFormatted(allNumbers[1], true, currency);
  }

  return null;
}

/**
 * Extrae concepto de un gasto
 */
function extractGastoDescription(text: string): string | null {
  const commonConcepts = [
    'combustible',
    'nafta',
    'almuerzo',
    'comida',
    'cena',
    'desayuno',
    'merienda',
    'alquiler',
    'expensa',
    'expensas',
    'viatico',
    'viaticos',
    'limpieza',
    'internet',
    'luz',
    'ande',
    'agua',
  ];

  for (const c of commonConcepts) {
    if (text.includes(c)) {
      return c.charAt(0).toUpperCase() + c.slice(1);
    }
  }

  const pMatch = text.match(/(?:en|de|por)\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)/i);
  if (pMatch && pMatch[1]) {
    const desc = pMatch[1].trim();
    if (!/(ueno|itau|bnf|familiar|continental|efectivo|palo|mil|\d)/i.test(desc)) {
      return desc.charAt(0).toUpperCase() + desc.slice(1);
    }
  }

  return 'Gasto operativo';
}
