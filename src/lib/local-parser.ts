import { AgentResponse, Account, Currency } from '@/types';

/**
 * Local fallback parser for Paraguayan exchange jargon.
 * Processes natural language input into structured operations
 * when the Gemini API key is not configured.
 */
export function parseLocalFallback(text: string): AgentResponse | null {
  const lower = text.toLowerCase().trim();

  // ─── Detect operation type ───
  let type: 'COMPRA' | 'VENTA' | 'GASTO' | null = null;
  if (/\b(compr[éeao]|comprar)\b/.test(lower)) type = 'COMPRA';
  else if (/\b(vend[íiao]|vender)\b/.test(lower)) type = 'VENTA';
  else if (/\b(gast[éeao]|gastar|gasté|pagu[éeao])\b/.test(lower)) type = 'GASTO';

  if (!type) return null;

  // ─── Handle GASTO ───
  if (type === 'GASTO') {
    const amount = extractAmount(lower);
    const account = extractAccount(lower);
    const desc = extractGastoDescription(lower);
    if (amount) {
      return {
        type: 'GASTO',
        totalPYG: amount,
        account: account || 'Efectivo PYG',
        description: desc || 'Gasto operativo',
      };
    }
    return null;
  }

  // ─── Detect currency ───
  const currency = extractCurrency(lower);
  if (!currency) return null;

  // ─── Extract amount and rate ───
  const amount = extractForeignAmount(lower, currency);
  const rate = extractRate(lower, currency);
  const account = extractAccount(lower);

  if (amount && rate) {
    return {
      type,
      currency,
      amount,
      rate,
      totalPYG: Math.round(amount * rate),
      account: account || 'Efectivo PYG',
    };
  }

  return null;
}

function extractCurrency(text: string): Currency | null {
  if (/\b(d[oó]lar(es)?|usd|dolares|dolar)\b/.test(text)) return 'USD';
  if (/\b(real(es)?|brl|reales|reais)\b/.test(text)) return 'BRL';
  if (/\b(peso(s)?(\s+arg(entino)?s?)?|ars)\b/.test(text)) return 'ARS';
  if (/\b(euro(s)?|eur)\b/.test(text)) return 'EUR';
  return null;
}

function extractAccount(text: string): Account | null {
  if (/\bueno\b/.test(text)) return 'Ueno Bank';
  if (/\bita[uú]\b/.test(text)) return 'Itaú';
  if (/\bfamiliar\b/.test(text)) return 'Banco Familiar';
  if (/\bbnf\b/.test(text)) return 'BNF';
  if (/\bcontinental\b/.test(text)) return 'Continental';
  if (/\befectivo\b|\bcash\b|\ben mano\b/.test(text)) return 'Efectivo PYG';
  return null;
}

function extractAmount(text: string): number | null {
  // "50 mil", "50.000", "1 palo", "2 palos"
  const paloMatch = text.match(/(\d+(?:[.,]\d+)?)\s*palos?/);
  if (paloMatch) return parseFloat(paloMatch[1].replace(',', '.')) * 1_000_000;

  const milMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(mil|lucas)/);
  if (milMatch) return parseFloat(milMatch[1].replace(',', '.')) * 1_000;

  const numMatch = text.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)/);
  if (numMatch) {
    const num = numMatch[1].replace(/\./g, '').replace(',', '.');
    return parseFloat(num);
  }

  return null;
}

function parseNumberWithFormat(raw: string, isARS: boolean = false): number {
  const clean = raw.trim();
  // If format is like 7.750 or 7,750
  if (/^\d{1,3}[.]\d{3}$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, ''));
  }
  if (/^\d{1,3}[,]\d{3}$/.test(clean)) {
    return parseFloat(clean.replace(/,/g, ''));
  }
  // If format has comma decimal e.g. 8,2 or 7,5
  if (/^\d+,\d+$/.test(clean)) {
    return parseFloat(clean.replace(',', '.'));
  }
  const val = parseFloat(clean);
  // Sanity check: if USD/BRL/EUR rate was entered as 7.75 or 7.8, it means 7750 or 7800
  if (!isARS && val > 0 && val < 50) {
    return Math.round(val * 1000);
  }
  return val;
}

function extractForeignAmount(text: string, currency?: Currency | null): number | null {
  const isARS = currency === 'ARS';
  // Match number before currency
  const patterns = [
    /(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(?:d[oó]lar(es)?|usd)/i,
    /(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(?:real(es)?|brl|reais)/i,
    /(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(?:peso(s)?|ars)/i,
    /(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(?:euro(s)?|eur)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const raw = m[1].replace(/\./g, '').replace(',', '.');
      return parseFloat(raw);
    }
  }

  // Fallback: first number found
  const numbers = text.match(/\b\d{1,3}(?:[.,]\d{3})*\b|\b\d+(?:[.,]\d+)?\b/g);
  if (numbers && numbers.length >= 1) {
    const raw = numbers[0].replace(/\./g, '').replace(',', '.');
    return parseFloat(raw);
  }

  return null;
}

function extractRate(text: string, currency?: Currency | null): number | null {
  const isARS = currency === 'ARS';

  // Pattern: "a 7750", "a 7.750", "a 7,750", "a 8.2", "a 8,2", "cotiz 7750"
  const rateMatch = text.match(/\b(?:a|cotiz(?:aci[oó]n)?|tasa)\s+(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\b/i);
  if (rateMatch) {
    return parseNumberWithFormat(rateMatch[1], isARS);
  }

  // Fallback: second number in the text
  const numbers = text.match(/\b\d{1,3}(?:[.,]\d{3})*\b|\b\d+(?:[.,]\d+)?\b/g);
  if (numbers && numbers.length >= 2) {
    return parseNumberWithFormat(numbers[1], isARS);
  }

  return null;
}

function extractGastoDescription(text: string): string | null {
  const patterns = [
    /(?:en|de|por)\s+(\w+(?:\s+\w+)?)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const desc = m[1].trim();
      // Don't return bank names or amounts as descriptions
      if (!/(ueno|itau|bnf|familiar|continental|efectivo|\d)/.test(desc.toLowerCase())) {
        return desc.charAt(0).toUpperCase() + desc.slice(1);
      }
    }
  }
  return null;
}
