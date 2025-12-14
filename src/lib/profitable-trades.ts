import { formatCalendarDate } from '@/src/lib/date-utils';

export interface RealizedMatchedTrade {
  securityType: 'Stock' | 'Option';
  buyDate: string;
  sellDate: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  profitLoss: number;
  realizedDate: string;
}

const safeParseFloat = (val: unknown): number => {
  if (val === null || val === undefined || val === '') return 0;
  const parsed = parseFloat(String(val).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTradePrice = (trade: Record<string, unknown>): number => {
  return String(trade.SecurityType || '').toUpperCase() === 'O'
    ? safeParseFloat(trade.OptionTradePremium)
    : safeParseFloat(trade.StockTradePrice);
};

const getTradeQty = (trade: Record<string, unknown>): number => {
  return String(trade.SecurityType || '').toUpperCase() === 'O'
    ? safeParseFloat(trade.OptionContracts)
    : safeParseFloat(trade.StockShareQty);
};

const getMultiplier = (trade: Record<string, unknown>): number => {
  return String(trade.SecurityType || '').toUpperCase() === 'O' ? 100 : 1;
};

const getISODate = (dateStr: string): string => {
  return dateStr.slice(0, 10);
};

interface Lot {
  remaining: number;
  price: number;
  date: string;
}

function instrumentKeyForTrade(trade: Record<string, unknown>, normalizedSymbol: string): string {
  const securityType = String(trade.SecurityType || '').toUpperCase();
  if (securityType === 'O') return String(trade.Symbol || '');
  return normalizedSymbol;
}

export function calculateRealizedMatchesFIFO(
  trades: Array<Record<string, unknown>>,
  normalizedSymbol: string,
): RealizedMatchedTrade[] {
  const sorted = [...trades].sort((a, b) => {
    const aDate = String(a.Date || '');
    const bDate = String(b.Date || '');
    if (aDate < bDate) return -1;
    if (aDate > bDate) return 1;
    const aId = safeParseFloat(a.TradeID);
    const bId = safeParseFloat(b.TradeID);
    return aId - bId;
  });

  const byInstrument = new Map<string, Array<Record<string, unknown>>>();
  for (const trade of sorted) {
    const key = instrumentKeyForTrade(trade, normalizedSymbol);
    const list = byInstrument.get(key) || [];
    list.push(trade);
    byInstrument.set(key, list);
  }

  const matchedTrades: RealizedMatchedTrade[] = [];

  for (const [, instrumentTrades] of byInstrument) {
    const longLots: Lot[] = [];
    const shortLots: Lot[] = [];

    for (const trade of instrumentTrades) {
      const side = String(trade.TradeType || '').toUpperCase();
      if (side !== 'B' && side !== 'S') continue;

      const qty = getTradeQty(trade);
      const price = getTradePrice(trade);
      if (qty <= 0 || price <= 0) continue;

      const multiplier = getMultiplier(trade);
      const tradeDate = String(trade.Date || '');
      const realizedDate = getISODate(tradeDate);

      if (side === 'B') {
        let remaining = qty;
        while (remaining > 0 && shortLots.length > 0) {
          const lot = shortLots[0];
          const matchedQty = Math.min(remaining, lot.remaining);
          const profitLoss = (lot.price - price) * matchedQty * multiplier;

          matchedTrades.push({
            securityType: String(trade.SecurityType || '').toUpperCase() === 'O' ? 'Option' : 'Stock',
            buyDate: formatCalendarDate(tradeDate),
            sellDate: formatCalendarDate(lot.date),
            quantity: matchedQty,
            buyPrice: price,
            sellPrice: lot.price,
            profitLoss,
            realizedDate,
          });

          lot.remaining -= matchedQty;
          remaining -= matchedQty;
          if (lot.remaining <= 0) shortLots.shift();
        }

        if (remaining > 0) {
          longLots.push({ remaining, price, date: tradeDate });
        }
      } else {
        let remaining = qty;
        while (remaining > 0 && longLots.length > 0) {
          const lot = longLots[0];
          const matchedQty = Math.min(remaining, lot.remaining);
          const profitLoss = (price - lot.price) * matchedQty * multiplier;

          matchedTrades.push({
            securityType: String(trade.SecurityType || '').toUpperCase() === 'O' ? 'Option' : 'Stock',
            buyDate: formatCalendarDate(lot.date),
            sellDate: formatCalendarDate(tradeDate),
            quantity: matchedQty,
            buyPrice: lot.price,
            sellPrice: price,
            profitLoss,
            realizedDate,
          });

          lot.remaining -= matchedQty;
          remaining -= matchedQty;
          if (lot.remaining <= 0) longLots.shift();
        }

        if (remaining > 0) {
          shortLots.push({ remaining, price, date: tradeDate });
        }
      }
    }
  }

  return matchedTrades;
}

export function filterProfitableTrades(
  matchedTrades: RealizedMatchedTrade[],
  dateStart?: string,
  dateEnd?: string,
): { profitableTrades: RealizedMatchedTrade[]; totalProfit: number } {
  const withinPeriod = (trade: RealizedMatchedTrade): boolean => {
    if (!dateStart || !dateEnd) return true;
    return trade.realizedDate >= dateStart && trade.realizedDate <= dateEnd;
  };

  const profitableTrades = matchedTrades
    .filter(t => t.profitLoss > 0)
    .filter(withinPeriod)
    .sort((a, b) => b.profitLoss - a.profitLoss);

  const totalProfit = profitableTrades.reduce((sum, t) => sum + t.profitLoss, 0);
  return { profitableTrades, totalProfit };
}

