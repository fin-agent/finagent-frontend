import type { Stock, Portfolio, Position, ChartData, Trade, TradeActivity } from '../types';
import { supabase } from './supabaseClient';
import { getDateOffset, demoDateToRealDate } from '../lib/date-utils';

const ACCOUNT_CODE = 'C40421';

interface AccountBalanceRow {
  Date: string;
  CashBalance: number | string | null;
  'Account Equity': number | string | null;
  'Stock LMV': number | string | null;
  'Options LMV': number | string | null;
  'Stock SMV': number | string | null;
  'Optons SMV': number | string | null;
}

interface TradeRow {
  TradeID: number | string | null;
  Symbol: string | null;
  TradeType: string | null;
  StockTradePrice: number | string | null;
  StockShareQty: number | string | null;
  Date: string | null;
  TradeTimeStamp: string | null;
  GrossAmount?: number | string | null;
  Commission?: number | string | null;
  NetAmount?: number | string | null;
}

interface PositionComputation {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  previousPrice?: number;
  totalVolume: number;
}

const PERIOD_LOOKUP: Record<'1D' | '1W' | '1M' | '3M' | '1Y', number> = {
  '1D': 2,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDateForQuery = (date: Date): string => date.toISOString().slice(0, 10);

const buildTimestamp = (date: string | null, time: string | null): Date => {
  if (!date) {
    return new Date();
  }
  if (!time) {
    return new Date(date);
  }
  return new Date(`${date}T${time}`);
};

class PortfolioDataService {
  async getPortfolio(): Promise<Portfolio> {
    const { data, error } = await supabase
      .from('AccountBalance')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .order('Date', { ascending: false })
      .limit(2);

    if (error) {
      throw new Error(`Failed to fetch portfolio data: ${error.message}`);
    }

    const rows = (data ?? []) as AccountBalanceRow[];
    const [latest, previous] = rows;

    if (!latest) {
      throw new Error('No account balance data found for the specified account.');
    }

    const totalValue = toNumber(latest['Account Equity']);
    const previousValue = previous ? toNumber(previous['Account Equity']) : totalValue;
    const dayChange = totalValue - previousValue;
    const dayChangePercent = previousValue !== 0 ? (dayChange / previousValue) * 100 : 0;
    const totalCash = toNumber(latest.CashBalance);
    const totalInvested = toNumber(latest['Stock LMV']) + toNumber(latest['Options LMV']);

    const positions = await this.getPositions();

    return {
      totalValue,
      dayChange,
      dayChangePercent,
      totalCash,
      totalInvested,
      positions,
    };
  }

  async getPositions(): Promise<Position[]> {
    const computations = await this.computePositions();

    return computations
      .filter((position) => position.shares > 0)
      .map((position) => {
        const totalValue = position.currentPrice * position.shares;
        const totalCost = position.avgCost * position.shares;
        const gainLoss = totalValue - totalCost;
        const gainLossPercent = totalCost !== 0 ? (gainLoss / totalCost) * 100 : 0;

        return {
          symbol: position.symbol,
          name: position.name,
          shares: position.shares,
          avgCost: position.avgCost,
          currentPrice: position.currentPrice,
          totalValue,
          totalCost,
          gainLoss,
          gainLossPercent,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue);
  }

  async getStocks(symbols?: string[]): Promise<Stock[]> {
    const computations = await this.computePositions();
    const filtered = symbols
      ? computations.filter((position) => symbols.includes(position.symbol))
      : computations;

    return filtered
      .filter((position) => position.shares > 0)
      .map((position) => {
        const referencePrice = position.previousPrice ?? position.avgCost;
        const change = position.currentPrice - referencePrice;
        const changePercent = referencePrice !== 0 ? (change / referencePrice) * 100 : 0;

        return {
          symbol: position.symbol,
          name: position.name,
          price: position.currentPrice,
          change,
          changePercent,
          volume: Math.round(position.totalVolume),
        };
      })
      .sort((a, b) => b.price - a.price);
  }

  async getStock(symbol: string): Promise<Stock | null> {
    const stocks = await this.getStocks([symbol]);
    return stocks[0] ?? null;
  }

  async getChartData(_symbol: string, period: '1D' | '1W' | '1M' | '3M' | '1Y' = '1M'): Promise<ChartData[]> {
    const days = PERIOD_LOOKUP[period] ?? 30;

    // Apply date offset to convert real dates to demo database dates
    // Demo data is from July-Nov 2025, but we query as if "today" is DEMO_TODAY
    const offset = getDateOffset();

    // Calculate the "from" date in real terms, then convert to demo date
    const realFromDate = new Date();
    realFromDate.setDate(realFromDate.getDate() - days);

    // Convert to demo date by adding offset
    const demoFromDate = new Date(realFromDate);
    demoFromDate.setDate(demoFromDate.getDate() + offset);

    const { data, error } = await supabase
      .from('AccountBalance')
      .select('Date, "Account Equity"')
      .eq('AccountCode', ACCOUNT_CODE)
      .gte('Date', formatDateForQuery(demoFromDate))
      .order('Date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch chart data: ${error.message}`);
    }

    const rows = (data ?? []) as AccountBalanceRow[];

    // Convert demo dates back to display dates for the chart
    return rows.map((row) => ({
      timestamp: demoDateToRealDate(row.Date).getTime(),
      price: toNumber(row['Account Equity']),
    }));
  }

  async searchStocks(query: string): Promise<Stock[]> {
    const stocks = await this.getStocks();
    const normalizedQuery = query.trim().toLowerCase();

    return stocks.filter((stock) =>
      stock.symbol.toLowerCase().includes(normalizedQuery) ||
      stock.name.toLowerCase().includes(normalizedQuery)
    );
  }

  async getRecentTrades(limit = 10): Promise<Trade[]> {
    const { data, error } = await supabase
      .from('TradeData')
      .select('TradeID, Symbol, TradeType, StockTradePrice, StockShareQty, Date, TradeTimeStamp')
      .eq('AccountCode', ACCOUNT_CODE)
      .order('Date', { ascending: false })
      .order('TradeTimeStamp', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch recent trades: ${error.message}`);
    }

    const rows = (data ?? []) as TradeRow[];

    return rows.map((trade) => {
      const qty = Math.abs(toNumber(trade.StockShareQty));
      const price = toNumber(trade.StockTradePrice);
      const side = (trade.TradeType ?? '').toUpperCase().startsWith('S') ? 'sell' : 'buy';
      const timestamp = buildTimestamp(trade.Date, trade.TradeTimeStamp);

      return {
        id: trade.TradeID !== null ? String(trade.TradeID) : `${trade.Symbol ?? 'UNKNOWN'}-${timestamp.getTime()}`,
        symbol: (trade.Symbol ?? 'UNKNOWN').trim(),
        side,
        qty,
        price,
        timestamp,
        status: 'executed',
      };
    });
  }

  async getTradeHistory(): Promise<TradeActivity[]> {
    const { data, error } = await supabase
      .from('TradeData')
      .select('TradeID, Symbol, TradeType, StockShareQty, StockTradePrice, Date, TradeTimeStamp, GrossAmount, Commission, NetAmount')
      .eq('AccountCode', ACCOUNT_CODE)
      .order('Date', { ascending: false })
      .order('TradeTimeStamp', { ascending: false, nullsFirst: false });

    if (error) {
      throw new Error(`Failed to fetch trade history: ${error.message}`);
    }

    const rows = (data ?? []) as TradeRow[];

    return rows.map((trade) => {
      const side = (trade.TradeType ?? '').toUpperCase().startsWith('S') ? 'sell' : 'buy';
      const timestamp = buildTimestamp(trade.Date, trade.TradeTimeStamp);
      const shareQty = toNullableNumber(trade.StockShareQty);

      return {
        id: trade.TradeID !== null ? String(trade.TradeID) : `${trade.Symbol ?? 'UNKNOWN'}-${timestamp.getTime()}`,
        symbol: (trade.Symbol ?? 'UNKNOWN').trim(),
        side,
        shares: shareQty !== null ? Math.abs(shareQty) : null,
        price: toNullableNumber(trade.StockTradePrice),
        grossAmount: toNullableNumber(trade.GrossAmount ?? null),
        commission: toNullableNumber(trade.Commission ?? null),
        netAmount: toNullableNumber(trade.NetAmount ?? null),
        timestamp,
        date: trade.Date ?? null,
        time: trade.TradeTimeStamp ?? null,
      };
    });
  }

  private async computePositions(): Promise<PositionComputation[]> {
    const { data, error } = await supabase
      .from('TradeData')
      .select('Symbol, TradeType, StockTradePrice, StockShareQty, Date, TradeTimeStamp')
      .eq('AccountCode', ACCOUNT_CODE)
      .not('Symbol', 'is', null)
      .order('Date', { ascending: true })
      .order('TradeTimeStamp', { ascending: true, nullsFirst: true });

    if (error) {
      throw new Error(`Failed to fetch positions: ${error.message}`);
    }

    const rows = (data ?? []) as TradeRow[];

    const positions = new Map<string, {
      shares: number;
      costBasis: number;
      avgCost: number;
      lastPrice: number;
      previousPrice?: number;
      totalVolume: number;
    }>();

    rows.forEach((trade) => {
      const symbol = trade.Symbol?.trim();
      if (!symbol) {
        return;
      }

      const qty = Math.abs(toNumber(trade.StockShareQty));
      const price = toNumber(trade.StockTradePrice);
      if (!qty || !price) {
        return;
      }

      const tradeType = (trade.TradeType ?? '').toUpperCase();
      const isSell = tradeType.startsWith('S');

      const record = positions.get(symbol) ?? {
        shares: 0,
        costBasis: 0,
        avgCost: 0,
        lastPrice: 0,
        previousPrice: undefined as number | undefined,
        totalVolume: 0,
      };

      record.totalVolume += qty;
      record.previousPrice = record.lastPrice || record.previousPrice;
      record.lastPrice = price;

      if (isSell) {
        const reductionQty = Math.min(qty, record.shares);
        const costReduction = reductionQty * record.avgCost;
        record.shares -= qty;
        record.costBasis = Math.max(0, record.costBasis - costReduction);
      } else {
        record.shares += qty;
        record.costBasis += price * qty;
      }

      if (record.shares > 0) {
        record.avgCost = record.costBasis / record.shares;
        positions.set(symbol, record);
      } else {
        positions.delete(symbol);
      }
    });

    return Array.from(positions.entries()).map(([symbol, record]) => ({
      symbol,
      name: symbol,
      shares: record.shares,
      avgCost: record.avgCost,
      currentPrice: record.lastPrice,
      previousPrice: record.previousPrice,
      totalVolume: record.totalVolume,
    }));
  }
}

export default new PortfolioDataService();
