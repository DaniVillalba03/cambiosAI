// ─── Core Types for CambiosAI ───

export type Currency = 'USD' | 'BRL' | 'ARS' | 'EUR';
export type OperationType = 'COMPRA' | 'VENTA' | 'GASTO';

export type Account =
  | 'Efectivo PYG'
  | 'Efectivo USD'
  | 'Efectivo BRL'
  | 'Efectivo ARS'
  | 'Efectivo EUR'
  | 'Ueno Bank'
  | 'Itaú'
  | 'Banco Familiar'
  | 'BNF'
  | 'Continental';

export type BankAccount = 'Ueno Bank' | 'Itaú' | 'Banco Familiar' | 'BNF' | 'Continental';
export type CashAccount = 'Efectivo PYG' | 'Efectivo USD' | 'Efectivo BRL' | 'Efectivo ARS' | 'Efectivo EUR';

export interface Operation {
  id: string;
  timestamp: string; // ISO date string
  type: OperationType;
  currency?: Currency; // Not needed for GASTO
  amount?: number; // Amount in foreign currency
  rate?: number; // Exchange rate (PYG per 1 unit of foreign currency)
  totalPYG: number; // Total in Guaraníes
  account: Account; // PYG account used (bank or cash)
  description?: string;
  profit?: number; // Calculated profit for VENTA operations
  operationNumber: number;
}

export interface CurrencyStock {
  currency: Currency;
  amount: number; // Available stock
  totalCostPYG: number; // Total cost of buying this stock
  averageCost: number; // PPP (weighted average purchase price)
}

export interface AccountBalance {
  account: Account;
  balance: number;
}

export interface AppState {
  operations: Operation[];
  currencyStocks: Record<Currency, CurrencyStock>;
  accountBalances: Record<Account, number>;
  nextOperationNumber: number;
}

export interface ChatMessage {
  id: string;
  timestamp: string;
  sender: 'user' | 'bot';
  text: string;
  imageBase64?: string;
  audioBase64?: string;
  operation?: Operation;
  isProcessing?: boolean;
}

export interface AgentRequest {
  text?: string;
  imageBase64?: string;
  audioBase64?: string;
  currentRates?: Record<Currency, { buy: number; sell: number }>;
}

export interface AgentResponse {
  type: OperationType;
  currency?: Currency;
  amount?: number;
  rate?: number;
  totalPYG?: number;
  account?: Account;
  description?: string;
  isCommand?: boolean;
  command?: string;
  reply?: string;
}

export interface DailyReport {
  date: string;
  totalProfit: number;
  totalOperations: number;
  totalVolumePYG: number;
  buysByurrency: Record<Currency, { amount: number; totalPYG: number }>;
  sellsByCurrency: Record<Currency, { amount: number; totalPYG: number }>;
  expenses: number;
}

export const CURRENCIES: Currency[] = ['USD', 'BRL', 'ARS', 'EUR'];

export const CURRENCY_LABELS: Record<Currency, string> = {
  USD: 'Dólar',
  BRL: 'Real',
  ARS: 'Peso Arg.',
  EUR: 'Euro',
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: 'US$',
  BRL: 'R$',
  ARS: 'AR$',
  EUR: '€',
};

export const CURRENCY_FLAGS: Record<Currency, string> = {
  USD: '🇺🇸',
  BRL: '🇧🇷',
  ARS: '🇦🇷',
  EUR: '🇪🇺',
};

export const BANK_ACCOUNTS: BankAccount[] = ['Ueno Bank', 'Itaú', 'Banco Familiar', 'BNF', 'Continental'];

export const ALL_ACCOUNTS: Account[] = [
  'Efectivo PYG',
  'Efectivo USD',
  'Efectivo BRL',
  'Efectivo ARS',
  'Efectivo EUR',
  'Ueno Bank',
  'Itaú',
  'Banco Familiar',
  'BNF',
  'Continental',
];

export const BANK_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  'Efectivo PYG': { bg: 'from-green-600/20 to-green-800/20', text: 'text-green-400', accent: 'border-green-500/30' },
  'Ueno Bank': { bg: 'from-violet-600/20 to-violet-800/20', text: 'text-violet-400', accent: 'border-violet-500/30' },
  'Itaú': { bg: 'from-orange-600/20 to-orange-800/20', text: 'text-orange-400', accent: 'border-orange-500/30' },
  'Banco Familiar': { bg: 'from-blue-600/20 to-blue-800/20', text: 'text-blue-400', accent: 'border-blue-500/30' },
  'BNF': { bg: 'from-red-600/20 to-red-800/20', text: 'text-red-400', accent: 'border-red-500/30' },
  'Continental': { bg: 'from-yellow-600/20 to-yellow-800/20', text: 'text-yellow-400', accent: 'border-yellow-500/30' },
};
