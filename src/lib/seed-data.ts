import { AppState, Currency, Operation, ALL_ACCOUNTS, CURRENCIES } from '@/types';
import { generateId } from '@/lib/utils';

// Estado limpio/vacío para arranque sin datos falsos
export function createEmptyState(): AppState {
  const initialBalances = {} as Record<string, number>;
  ALL_ACCOUNTS.forEach((acc) => {
    initialBalances[acc] = 0;
  });

  const currencyStocks: Record<Currency, AppState['currencyStocks'][Currency]> = {} as Record<Currency, AppState['currencyStocks'][Currency]>;
  CURRENCIES.forEach((cur) => {
    currencyStocks[cur] = {
      currency: cur,
      amount: 0,
      totalCostPYG: 0,
      averageCost: 0,
    };
  });

  return {
    operations: [],
    currencyStocks,
    accountBalances: initialBalances as AppState['accountBalances'],
    nextOperationNumber: 1,
  };
}

// Realistic seed data for a cambista's workday in Paraguay
export function createSeedData(): AppState {
  const today = new Date();
  const makeTime = (h: number, m: number) => {
    const d = new Date(today);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const initialBalances = {
    'Efectivo PYG': 45_000_000,
    'Efectivo USD': 0,
    'Efectivo BRL': 0,
    'Efectivo ARS': 0,
    'Efectivo EUR': 0,
    'Ueno Bank': 120_000_000,
    'Itaú': 85_000_000,
    'Banco Familiar': 30_000_000,
    'BNF': 15_000_000,
    'Continental': 10_000_000,
  } as Record<string, number>;

  const operations: Operation[] = [];
  let opNum = 1;

  const currencyStocks: Record<Currency, { amount: number; totalCostPYG: number }> = {
    USD: { amount: 0, totalCostPYG: 0 },
    BRL: { amount: 0, totalCostPYG: 0 },
    ARS: { amount: 0, totalCostPYG: 0 },
    EUR: { amount: 0, totalCostPYG: 0 },
  };

  // Helper to process an operation on the seed balances
  const addOp = (
    type: 'COMPRA' | 'VENTA' | 'GASTO',
    currency: Currency | undefined,
    amount: number | undefined,
    rate: number | undefined,
    totalPYG: number,
    account: string,
    time: string,
    desc?: string
  ) => {
    let profit: number | undefined;

    if (type === 'COMPRA' && currency && amount && rate) {
      // Cash comes out, foreign currency comes in
      initialBalances[account] -= totalPYG;
      initialBalances[`Efectivo ${currency}`] += amount;
      currencyStocks[currency].amount += amount;
      currencyStocks[currency].totalCostPYG += totalPYG;
    } else if (type === 'VENTA' && currency && amount && rate) {
      const avgCost = currencyStocks[currency].totalCostPYG / currencyStocks[currency].amount;
      profit = Math.round((rate - avgCost) * amount);
      // Foreign currency comes out, PYG comes in
      initialBalances[`Efectivo ${currency}`] -= amount;
      initialBalances[account] += totalPYG;
      // Reduce stock proportionally
      const costOfSold = avgCost * amount;
      currencyStocks[currency].amount -= amount;
      currencyStocks[currency].totalCostPYG -= costOfSold;
    } else if (type === 'GASTO') {
      initialBalances[account] -= totalPYG;
    }

    operations.push({
      id: generateId() + '_seed_' + opNum,
      timestamp: time,
      type,
      currency,
      amount,
      rate,
      totalPYG,
      account: account as Operation['account'],
      description: desc,
      profit,
      operationNumber: opNum,
    });
    opNum++;
  };

  // ── Seed Operations ──
  // Op1: Bought 1000 USD at 7,750 via Ueno
  addOp('COMPRA', 'USD', 1000, 7750, 7_750_000, 'Ueno Bank', makeTime(8, 15));

  // Op2: Bought 500 USD at 7,730 cash
  addOp('COMPRA', 'USD', 500, 7730, 3_865_000, 'Efectivo PYG', makeTime(8, 45));

  // Op3: Sold 300 USD at 7,820 cash
  addOp('VENTA', 'USD', 300, 7820, 2_346_000, 'Efectivo PYG', makeTime(9, 30));

  // Op4: Bought 2000 BRL at 1,520 via Itaú
  addOp('COMPRA', 'BRL', 2000, 1520, 3_040_000, 'Itaú', makeTime(10, 0));

  // Op5: Sold 1000 BRL at 1,560 cash
  addOp('VENTA', 'BRL', 1000, 1560, 1_560_000, 'Efectivo PYG', makeTime(10, 30));

  // Op6: Bought 50000 ARS at 8.2 via Ueno
  addOp('COMPRA', 'ARS', 50000, 8.2, 410_000, 'Ueno Bank', makeTime(11, 0));

  // Op7: Sold 200 USD at 7,830 via Itaú
  addOp('VENTA', 'USD', 200, 7830, 1_566_000, 'Itaú', makeTime(11, 30));

  // Op8: Gasto - Combustible
  addOp('GASTO', undefined, undefined, undefined, 150_000, 'Efectivo PYG', makeTime(12, 0), 'Combustible');

  // Build final state
  const finalStocks: Record<Currency, AppState['currencyStocks'][Currency]> = {} as Record<Currency, AppState['currencyStocks'][Currency]>;
  for (const cur of ['USD', 'BRL', 'ARS', 'EUR'] as Currency[]) {
    const s = currencyStocks[cur];
    finalStocks[cur] = {
      currency: cur,
      amount: s.amount,
      totalCostPYG: s.totalCostPYG,
      averageCost: s.amount > 0 ? s.totalCostPYG / s.amount : 0,
    };
  }

  return {
    operations,
    currencyStocks: finalStocks,
    accountBalances: initialBalances as AppState['accountBalances'],
    nextOperationNumber: opNum,
  };
}
