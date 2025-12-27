/**
 * Alpaca Market Data Service
 *
 * Provides real-time market data including:
 * - Stock quotes and trades
 * - Option quotes and snapshots
 * - Historical bars (OHLCV)
 * - News articles
 * - Trading halt status
 *
 * Uses Alpaca Data API: https://docs.alpaca.markets/docs/about-market-data-api
 */

const ALPACA_DATA_URL = 'https://data.alpaca.markets';

// Common headers for all Alpaca API requests
function getHeaders(): HeadersInit {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY || '',
    'Content-Type': 'application/json',
  };
}

// ============================================================================
// Types
// ============================================================================

export interface StockQuote {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  bidExchange: string;
  askPrice: number;
  askSize: number;
  askExchange: string;
  timestamp: string;
  conditions?: string[];
  tape?: string;
}

export interface StockTrade {
  symbol: string;
  price: number;
  size: number;
  exchange: string;
  timestamp: string;
  conditions?: string[];
  tradeId: number;
  tape?: string;
}

export interface StockSnapshot {
  symbol: string;
  latestTrade: StockTrade | null;
  latestQuote: StockQuote | null;
  minuteBar: Bar | null;
  dailyBar: Bar | null;
  prevDailyBar: Bar | null;
}

export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount?: number;
  vwap?: number;
}

export interface OptionQuote {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  bidExchange: string;
  askPrice: number;
  askSize: number;
  askExchange: string;
  timestamp: string;
  condition?: string;
}

export interface OptionTrade {
  symbol: string;
  price: number;
  size: number;
  exchange: string;
  timestamp: string;
  condition?: string;
}

export interface OptionSnapshot {
  symbol: string;
  latestTrade: OptionTrade | null;
  latestQuote: OptionQuote | null;
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    rho?: number;
  };
  impliedVolatility?: number;
}

export interface NewsArticle {
  id: number;
  headline: string;
  summary: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  content?: string;
  symbols: string[];
  source: string;
}

export interface TradingStatus {
  symbol: string;
  statusCode: string;
  statusMessage: string;
  reasonCode?: string;
  reasonMessage?: string;
  timestamp: string;
  tape?: string;
}

export interface MarketClock {
  timestamp: string;
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
}

// ============================================================================
// Stock Data Functions
// ============================================================================

/**
 * Get the latest quote (NBBO) for a stock symbol
 */
export async function getLatestStockQuote(symbol: string): Promise<StockQuote> {
  const response = await fetch(
    `${ALPACA_DATA_URL}/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest?feed=iex`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch stock quote for ${symbol}: ${error}`);
  }

  const data = await response.json();
  const quote = data.quote;

  return {
    symbol: data.symbol,
    bidPrice: quote.bp,
    bidSize: quote.bs,
    bidExchange: quote.bx,
    askPrice: quote.ap,
    askSize: quote.as,
    askExchange: quote.ax,
    timestamp: quote.t,
    conditions: quote.c,
    tape: quote.z,
  };
}

/**
 * Get the latest trade for a stock symbol
 */
export async function getLatestStockTrade(symbol: string): Promise<StockTrade> {
  const response = await fetch(
    `${ALPACA_DATA_URL}/v2/stocks/${encodeURIComponent(symbol)}/trades/latest?feed=iex`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch stock trade for ${symbol}: ${error}`);
  }

  const data = await response.json();
  const trade = data.trade;

  return {
    symbol: data.symbol,
    price: trade.p,
    size: trade.s,
    exchange: trade.x,
    timestamp: trade.t,
    conditions: trade.c,
    tradeId: trade.i,
    tape: trade.z,
  };
}

/**
 * Get a complete snapshot for a stock (quote + trade + bars)
 */
export async function getStockSnapshot(symbol: string): Promise<StockSnapshot> {
  const response = await fetch(
    `${ALPACA_DATA_URL}/v2/stocks/${encodeURIComponent(symbol)}/snapshot?feed=iex`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch stock snapshot for ${symbol}: ${error}`);
  }

  const data = await response.json();

  return {
    symbol,
    latestTrade: data.latestTrade ? {
      symbol,
      price: data.latestTrade.p,
      size: data.latestTrade.s,
      exchange: data.latestTrade.x,
      timestamp: data.latestTrade.t,
      conditions: data.latestTrade.c,
      tradeId: data.latestTrade.i,
      tape: data.latestTrade.z,
    } : null,
    latestQuote: data.latestQuote ? {
      symbol,
      bidPrice: data.latestQuote.bp,
      bidSize: data.latestQuote.bs,
      bidExchange: data.latestQuote.bx,
      askPrice: data.latestQuote.ap,
      askSize: data.latestQuote.as,
      askExchange: data.latestQuote.ax,
      timestamp: data.latestQuote.t,
      conditions: data.latestQuote.c,
      tape: data.latestQuote.z,
    } : null,
    minuteBar: data.minuteBar ? {
      timestamp: data.minuteBar.t,
      open: data.minuteBar.o,
      high: data.minuteBar.h,
      low: data.minuteBar.l,
      close: data.minuteBar.c,
      volume: data.minuteBar.v,
      tradeCount: data.minuteBar.n,
      vwap: data.minuteBar.vw,
    } : null,
    dailyBar: data.dailyBar ? {
      timestamp: data.dailyBar.t,
      open: data.dailyBar.o,
      high: data.dailyBar.h,
      low: data.dailyBar.l,
      close: data.dailyBar.c,
      volume: data.dailyBar.v,
      tradeCount: data.dailyBar.n,
      vwap: data.dailyBar.vw,
    } : null,
    prevDailyBar: data.prevDailyBar ? {
      timestamp: data.prevDailyBar.t,
      open: data.prevDailyBar.o,
      high: data.prevDailyBar.h,
      low: data.prevDailyBar.l,
      close: data.prevDailyBar.c,
      volume: data.prevDailyBar.v,
      tradeCount: data.prevDailyBar.n,
      vwap: data.prevDailyBar.vw,
    } : null,
  };
}

/**
 * Get multiple stock snapshots at once
 */
export async function getMultipleStockSnapshots(symbols: string[]): Promise<Map<string, StockSnapshot>> {
  const response = await fetch(
    `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${symbols.join(',')}&feed=iex`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch stock snapshots: ${error}`);
  }

  const data = await response.json();
  const results = new Map<string, StockSnapshot>();

  for (const [symbol, snapshot] of Object.entries(data)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = snapshot as Record<string, any>;
    results.set(symbol, {
      symbol,
      latestTrade: s.latestTrade ? {
        symbol,
        price: s.latestTrade.p,
        size: s.latestTrade.s,
        exchange: s.latestTrade.x,
        timestamp: s.latestTrade.t,
        conditions: s.latestTrade.c,
        tradeId: s.latestTrade.i,
        tape: s.latestTrade.z,
      } : null,
      latestQuote: s.latestQuote ? {
        symbol,
        bidPrice: s.latestQuote.bp,
        bidSize: s.latestQuote.bs,
        bidExchange: s.latestQuote.bx,
        askPrice: s.latestQuote.ap,
        askSize: s.latestQuote.as,
        askExchange: s.latestQuote.ax,
        timestamp: s.latestQuote.t,
        conditions: s.latestQuote.c,
        tape: s.latestQuote.z,
      } : null,
      minuteBar: s.minuteBar ? {
        timestamp: s.minuteBar.t,
        open: s.minuteBar.o,
        high: s.minuteBar.h,
        low: s.minuteBar.l,
        close: s.minuteBar.c,
        volume: s.minuteBar.v,
        tradeCount: s.minuteBar.n,
        vwap: s.minuteBar.vw,
      } : null,
      dailyBar: s.dailyBar ? {
        timestamp: s.dailyBar.t,
        open: s.dailyBar.o,
        high: s.dailyBar.h,
        low: s.dailyBar.l,
        close: s.dailyBar.c,
        volume: s.dailyBar.v,
        tradeCount: s.dailyBar.n,
        vwap: s.dailyBar.vw,
      } : null,
      prevDailyBar: s.prevDailyBar ? {
        timestamp: s.prevDailyBar.t,
        open: s.prevDailyBar.o,
        high: s.prevDailyBar.h,
        low: s.prevDailyBar.l,
        close: s.prevDailyBar.c,
        volume: s.prevDailyBar.v,
        tradeCount: s.prevDailyBar.n,
        vwap: s.prevDailyBar.vw,
      } : null,
    });
  }

  return results;
}

// ============================================================================
// Historical Bars Functions
// ============================================================================

export type Timeframe = '1Min' | '5Min' | '15Min' | '30Min' | '1Hour' | '4Hour' | '1Day' | '1Week' | '1Month';

export interface GetBarsParams {
  symbol: string;
  timeframe: Timeframe;
  start: Date;
  end?: Date;
  limit?: number;
}

/**
 * Get historical bars (OHLCV) for a stock
 */
export async function getHistoricalBars(params: GetBarsParams): Promise<Bar[]> {
  const { symbol, timeframe, start, end, limit = 1000 } = params;

  const searchParams = new URLSearchParams({
    timeframe,
    start: start.toISOString(),
    limit: limit.toString(),
    feed: 'iex',
  });

  if (end) {
    searchParams.set('end', end.toISOString());
  }

  const response = await fetch(
    `${ALPACA_DATA_URL}/v2/stocks/${encodeURIComponent(symbol)}/bars?${searchParams}`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch historical bars for ${symbol}: ${error}`);
  }

  const data = await response.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bars: Bar[] = (data.bars || []).map((bar: Record<string, any>) => ({
    timestamp: bar.t,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v,
    tradeCount: bar.n,
    vwap: bar.vw,
  }));

  return bars;
}

/**
 * Calculate the start date for a given chart period
 */
export function calculateStartDate(period: string): Date {
  const now = new Date();
  const lower = period.toLowerCase();

  // Parse patterns like "3 weeks", "1 month", "5 days"
  const match = lower.match(/(\d+)\s*(day|week|month|year)s?/);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'day':
        now.setDate(now.getDate() - num);
        break;
      case 'week':
        now.setDate(now.getDate() - (num * 7));
        break;
      case 'month':
        now.setMonth(now.getMonth() - num);
        break;
      case 'year':
        now.setFullYear(now.getFullYear() - num);
        break;
    }
    return now;
  }

  // Handle simple keywords
  if (lower.includes('today') || lower === '1d') {
    now.setHours(0, 0, 0, 0);
    return now;
  }
  if (lower.includes('week') || lower === '1w') {
    now.setDate(now.getDate() - 7);
    return now;
  }
  if (lower.includes('month') || lower === '1m') {
    now.setMonth(now.getMonth() - 1);
    return now;
  }
  if (lower.includes('quarter') || lower === '3m') {
    now.setMonth(now.getMonth() - 3);
    return now;
  }
  if (lower.includes('year') || lower === '1y') {
    now.setFullYear(now.getFullYear() - 1);
    return now;
  }

  // Default to 1 month
  now.setMonth(now.getMonth() - 1);
  return now;
}

/**
 * Determine appropriate timeframe for a given period
 */
export function getTimeframeForPeriod(period: string): Timeframe {
  const lower = period.toLowerCase();

  // Parse the number of days/weeks/months
  const match = lower.match(/(\d+)\s*(day|week|month|year)s?/);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];

    if (unit === 'day' && num <= 2) return '5Min';
    if (unit === 'day' && num <= 5) return '15Min';
    if (unit === 'week' && num <= 2) return '1Hour';
    if (unit === 'week') return '1Hour';
    if (unit === 'month' && num <= 3) return '1Day';
    if (unit === 'month') return '1Day';
    if (unit === 'year') return '1Week';
  }

  // Keyword-based
  if (lower.includes('today') || lower === '1d') return '5Min';
  if (lower.includes('week') || lower === '1w') return '1Hour';
  if (lower.includes('month') || lower === '1m') return '1Day';
  if (lower.includes('quarter') || lower === '3m') return '1Day';
  if (lower.includes('year') || lower === '1y') return '1Week';

  return '1Day'; // Default
}

// ============================================================================
// Option Data Functions
// ============================================================================

/**
 * Get the latest quote for an option (OCC symbol format)
 */
export async function getLatestOptionQuote(occSymbol: string): Promise<OptionQuote> {
  const response = await fetch(
    `${ALPACA_DATA_URL}/v1beta1/options/quotes/latest?symbols=${encodeURIComponent(occSymbol)}&feed=indicative`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch option quote for ${occSymbol}: ${error}`);
  }

  const data = await response.json();
  const quote = data.quotes?.[occSymbol];

  if (!quote) {
    throw new Error(`No quote data found for ${occSymbol}`);
  }

  return {
    symbol: occSymbol,
    bidPrice: quote.bp,
    bidSize: quote.bs,
    bidExchange: quote.bx,
    askPrice: quote.ap,
    askSize: quote.as,
    askExchange: quote.ax,
    timestamp: quote.t,
    condition: quote.c,
  };
}

/**
 * Get the latest trade for an option
 */
export async function getLatestOptionTrade(occSymbol: string): Promise<OptionTrade> {
  const response = await fetch(
    `${ALPACA_DATA_URL}/v1beta1/options/trades/latest?symbols=${encodeURIComponent(occSymbol)}&feed=indicative`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch option trade for ${occSymbol}: ${error}`);
  }

  const data = await response.json();
  const trade = data.trades?.[occSymbol];

  if (!trade) {
    throw new Error(`No trade data found for ${occSymbol}`);
  }

  return {
    symbol: occSymbol,
    price: trade.p,
    size: trade.s,
    exchange: trade.x,
    timestamp: trade.t,
    condition: trade.c,
  };
}

/**
 * Get option snapshot (quote + trade)
 */
export async function getOptionSnapshot(occSymbol: string): Promise<OptionSnapshot> {
  const response = await fetch(
    `${ALPACA_DATA_URL}/v1beta1/options/snapshots?symbols=${encodeURIComponent(occSymbol)}&feed=indicative`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch option snapshot for ${occSymbol}: ${error}`);
  }

  const data = await response.json();
  const snapshot = data.snapshots?.[occSymbol];

  if (!snapshot) {
    throw new Error(`No snapshot data found for ${occSymbol}`);
  }

  return {
    symbol: occSymbol,
    latestTrade: snapshot.latestTrade ? {
      symbol: occSymbol,
      price: snapshot.latestTrade.p,
      size: snapshot.latestTrade.s,
      exchange: snapshot.latestTrade.x,
      timestamp: snapshot.latestTrade.t,
      condition: snapshot.latestTrade.c,
    } : null,
    latestQuote: snapshot.latestQuote ? {
      symbol: occSymbol,
      bidPrice: snapshot.latestQuote.bp,
      bidSize: snapshot.latestQuote.bs,
      bidExchange: snapshot.latestQuote.bx,
      askPrice: snapshot.latestQuote.ap,
      askSize: snapshot.latestQuote.as,
      askExchange: snapshot.latestQuote.ax,
      timestamp: snapshot.latestQuote.t,
      condition: snapshot.latestQuote.c,
    } : null,
    greeks: snapshot.greeks,
    impliedVolatility: snapshot.impliedVolatility,
  };
}

/**
 * Get option chain for an underlying symbol
 */
export interface OptionChainParams {
  underlyingSymbol: string;
  expirationDate?: string;  // YYYY-MM-DD
  type?: 'call' | 'put';
  strikePrice?: number;
  minStrike?: number;
  maxStrike?: number;
}

export async function getOptionChain(params: OptionChainParams): Promise<OptionSnapshot[]> {
  const searchParams = new URLSearchParams({
    underlying_symbols: params.underlyingSymbol,
    feed: 'indicative',
  });

  if (params.expirationDate) {
    searchParams.set('expiration_date', params.expirationDate);
  }
  if (params.type) {
    searchParams.set('type', params.type);
  }
  if (params.strikePrice) {
    searchParams.set('strike_price_gte', params.strikePrice.toString());
    searchParams.set('strike_price_lte', params.strikePrice.toString());
  }
  if (params.minStrike) {
    searchParams.set('strike_price_gte', params.minStrike.toString());
  }
  if (params.maxStrike) {
    searchParams.set('strike_price_lte', params.maxStrike.toString());
  }

  const response = await fetch(
    `${ALPACA_DATA_URL}/v1beta1/options/snapshots?${searchParams}`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch option chain for ${params.underlyingSymbol}: ${error}`);
  }

  const data = await response.json();
  const snapshots: OptionSnapshot[] = [];

  for (const [symbol, snapshot] of Object.entries(data.snapshots || {})) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = snapshot as Record<string, any>;
    snapshots.push({
      symbol,
      latestTrade: s.latestTrade ? {
        symbol,
        price: s.latestTrade.p,
        size: s.latestTrade.s,
        exchange: s.latestTrade.x,
        timestamp: s.latestTrade.t,
        condition: s.latestTrade.c,
      } : null,
      latestQuote: s.latestQuote ? {
        symbol,
        bidPrice: s.latestQuote.bp,
        bidSize: s.latestQuote.bs,
        bidExchange: s.latestQuote.bx,
        askPrice: s.latestQuote.ap,
        askSize: s.latestQuote.as,
        askExchange: s.latestQuote.ax,
        timestamp: s.latestQuote.t,
        condition: s.latestQuote.c,
      } : null,
      greeks: s.greeks,
      impliedVolatility: s.impliedVolatility,
    });
  }

  return snapshots;
}

// ============================================================================
// News Functions
// ============================================================================

export interface GetNewsParams {
  symbols?: string[];
  start?: Date;
  end?: Date;
  limit?: number;
  includeContent?: boolean;
}

/**
 * Get news articles
 */
export async function getNews(params: GetNewsParams = {}): Promise<NewsArticle[]> {
  const searchParams = new URLSearchParams({
    limit: (params.limit || 10).toString(),
  });

  if (params.symbols && params.symbols.length > 0) {
    searchParams.set('symbols', params.symbols.join(','));
  }
  if (params.start) {
    searchParams.set('start', params.start.toISOString());
  }
  if (params.end) {
    searchParams.set('end', params.end.toISOString());
  }
  if (params.includeContent) {
    searchParams.set('include_content', 'true');
  }

  const response = await fetch(
    `${ALPACA_DATA_URL}/v1beta1/news?${searchParams}`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch news: ${error}`);
  }

  const data = await response.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const articles: NewsArticle[] = (data.news || []).map((article: Record<string, any>) => ({
    id: article.id,
    headline: article.headline,
    summary: article.summary,
    author: article.author,
    createdAt: article.created_at,
    updatedAt: article.updated_at,
    url: article.url,
    content: article.content,
    symbols: article.symbols || [],
    source: article.source,
  }));

  return articles;
}

// ============================================================================
// Market Status Functions
// ============================================================================

/**
 * Get current market clock status
 */
export async function getMarketClock(): Promise<MarketClock> {
  const response = await fetch(
    `${process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'}/v2/clock`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch market clock: ${error}`);
  }

  const data = await response.json();

  return {
    timestamp: data.timestamp,
    isOpen: data.is_open,
    nextOpen: data.next_open,
    nextClose: data.next_close,
  };
}

/**
 * Check if a symbol is currently halted
 * Note: This requires subscribing to real-time status updates
 * For now, we'll check via the assets endpoint
 */
export async function checkTradingHalt(symbol: string): Promise<TradingStatus | null> {
  const response = await fetch(
    `${process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'}/v2/assets/${encodeURIComponent(symbol)}`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  // Assets endpoint provides basic halt info
  if (data.status === 'inactive') {
    return {
      symbol,
      statusCode: 'H',
      statusMessage: 'Trading Halted',
      timestamp: new Date().toISOString(),
    };
  }

  return {
    symbol,
    statusCode: 'T',
    statusMessage: 'Trading',
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a symbol is likely a futures symbol
 */
export function isFuturesSymbol(symbol: string): boolean {
  const futuresPatterns = [
    /^ES[FGHJKMNQUVXZ]\d{2}$/i,  // E-mini S&P 500 (ESH25)
    /^NQ[FGHJKMNQUVXZ]\d{2}$/i,  // E-mini Nasdaq (NQH25)
    /^YM[FGHJKMNQUVXZ]\d{2}$/i,  // E-mini Dow (YMH25)
    /^CL[FGHJKMNQUVXZ]\d{2}$/i,  // Crude Oil
    /^GC[FGHJKMNQUVXZ]\d{2}$/i,  // Gold
    /^SI[FGHJKMNQUVXZ]\d{2}$/i,  // Silver
    /^\/ES$/i,                    // /ES format
    /^\/NQ$/i,
    /^\/YM$/i,
    /^\/CL$/i,
    /^\/GC$/i,
  ];

  // Also check for plain futures root symbols
  const futuresRoots = ['ES', 'NQ', 'YM', 'CL', 'GC', 'SI', 'ZB', 'ZN', 'ZC', 'ZS', 'ZW'];
  if (futuresRoots.includes(symbol.toUpperCase())) {
    return true;
  }

  return futuresPatterns.some(pattern => pattern.test(symbol));
}

/**
 * Check if a date/expiration string refers to historical data (before 2020)
 */
export function isHistoricalDate(dateStr: string): { isHistorical: boolean; year?: number } {
  // Look for year patterns like '16, 2016, Dec'16, Dec 2016
  const patterns = [
    /['"]\s*(\d{2})\s*$/,           // '16 or "16 at end
    /\b(19\d{2}|200\d|201[0-9])\b/, // Full year 1900s-2019
    /\b(\d{2})\b(?!\d)/,            // Two digit year not followed by more digits
  ];

  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      let year = parseInt(match[1], 10);
      // Convert 2-digit year
      if (year < 100) {
        year = year > 50 ? 1900 + year : 2000 + year;
      }
      // Consider anything before 2020 as historical
      if (year < 2020) {
        return { isHistorical: true, year };
      }
    }
  }

  return { isHistorical: false };
}

/**
 * Calculate mid price from bid/ask
 */
export function calculateMidPrice(bid: number, ask: number): number {
  return (bid + ask) / 2;
}

/**
 * Calculate spread from bid/ask
 */
export function calculateSpread(bid: number, ask: number): { absolute: number; percentage: number } {
  const absolute = ask - bid;
  const mid = (bid + ask) / 2;
  const percentage = mid > 0 ? (absolute / mid) * 100 : 0;
  return { absolute, percentage };
}

/**
 * Format price for display
 */
export function formatPrice(price: number, decimals: number = 2): string {
  return price.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format large numbers (volume, market cap) with suffixes
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toString();
}
