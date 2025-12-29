/**
 * Market Data Voice Webhook
 *
 * ElevenLabs tool endpoint for real-time market data queries:
 * - stock_quote: Latest stock quote (NBBO)
 * - option_quote: Option quote/NBBO
 * - historical: Historical bars/chart data
 * - news: News articles for symbols
 * - halt: Trading halt status
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { checkSymbolPresence } from '@/src/lib/symbol-lookup';
import {
  getStockSnapshot,
  getOptionSnapshot,
  getHistoricalBars,
  getNews,
  checkTradingHalt,
  getMarketClock,
  isFuturesSymbol,
  isHistoricalDate,
  calculateMidPrice,
  calculateSpread,
  formatPrice,
  calculateStartDate,
  getTimeframeForPeriod,
} from '@/src/services/alpacaMarketData';
import {
  buildOCCSymbol,
  formatOCCForDisplay,
  parseExpiration,
} from '@/src/lib/option-symbol-builder';

// ============================================================================
// Types
// ============================================================================

type QueryType = 'stock_quote' | 'option_quote' | 'historical' | 'news' | 'halt';

// Expected request structure (defensive parsing handles nested variants)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface MarketDataRequest {
  query_type: QueryType;
  symbol?: string;
  strike?: number;
  call_put?: 'call' | 'put';
  expiration?: string;
  chart_period?: string;
}

interface StockQuoteUIData {
  type: 'stock-quote';
  symbol: string;
  companyName?: string;
  price: number;
  change: number;
  changePercent: number;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  mid: number;
  spread: number;
  spreadPercent: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  prevClose: number;
  timestamp: string;
  isMarketOpen: boolean;
}

interface OptionQuoteUIData {
  type: 'option-quote';
  occSymbol: string;
  displayName: string;
  underlying: string;
  expiration: string;
  strike: number;
  optionType: 'call' | 'put';
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  mid: number;
  spread: number;
  last: number | null;
  lastSize: number | null;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
  timestamp: string;
}

interface ChartUIData {
  type: 'price-chart';
  symbol: string;
  period: string;
  timeframe: string;
  bars: {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
  periodHigh: number;
  periodLow: number;
  periodOpen: number;
  periodClose: number;
  periodChange: number;
  periodChangePercent: number;
}

interface NewsUIData {
  type: 'news';
  symbol?: string;
  articles: {
    id: number;
    headline: string;
    summary: string;
    author: string;
    source: string;
    url: string;
    createdAt: string;
    symbols: string[];
  }[];
}

interface HaltUIData {
  type: 'halt-status';
  symbol?: string;
  isHalted: boolean;
  statusMessage: string;
  reasonCode?: string;
  reasonMessage?: string;
  timestamp: string;
}

interface ErrorUIData {
  type: 'error';
  message: string;
  code?: string;
}

// ============================================================================
// Handler
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Defensive parameter extraction - ElevenLabs may nest params differently
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawBody = body as any;
    const query_type: QueryType = rawBody.query_type || rawBody.parameters?.query_type ||
                                   rawBody.body?.query_type || rawBody.body?.parameters?.query_type;
    const symbol: string | undefined = rawBody.symbol || rawBody.parameters?.symbol ||
                                        rawBody.body?.symbol || rawBody.body?.parameters?.symbol;
    const strike: number | undefined = rawBody.strike || rawBody.parameters?.strike ||
                                        rawBody.body?.strike || rawBody.body?.parameters?.strike;
    const call_put: 'call' | 'put' | undefined = rawBody.call_put || rawBody.parameters?.call_put ||
                                                  rawBody.body?.call_put || rawBody.body?.parameters?.call_put;
    const expiration: string | undefined = rawBody.expiration || rawBody.parameters?.expiration ||
                                            rawBody.body?.expiration || rawBody.body?.parameters?.expiration;
    const chart_period: string | undefined = rawBody.chart_period || rawBody.parameters?.chart_period ||
                                              rawBody.body?.chart_period || rawBody.body?.parameters?.chart_period;

    // Validate query type
    if (!query_type) {
      return NextResponse.json({
        response: 'I need to know what market data you\'re looking for. You can ask about stock quotes, option quotes, charts, news, or trading halts.',
        uiData: { type: 'error', message: 'Missing query_type parameter' } as ErrorUIData,
      });
    }

    // Normalize symbol if provided
    const normalizedSymbol = symbol ? normalizeSymbol(symbol) : undefined;

    // Check for futures symbols
    if (normalizedSymbol && isFuturesSymbol(normalizedSymbol)) {
      return NextResponse.json({
        response: `Futures trading for ${normalizedSymbol} is not currently supported. I can help you with stocks and equity options.`,
        uiData: { type: 'error', message: 'Futures not supported', code: 'FUTURES_NOT_SUPPORTED' } as ErrorUIData,
      });
    }

    // Check for historical dates in option queries
    if (expiration) {
      const { isHistorical, year } = isHistoricalDate(expiration);
      if (isHistorical) {
        return NextResponse.json({
          response: `Historical options data from ${year} is not available through real-time market data. I can help you with current or upcoming option expirations.`,
          uiData: { type: 'error', message: 'Historical data not available', code: 'HISTORICAL_NOT_AVAILABLE' } as ErrorUIData,
        });
      }
    }

    // Route to appropriate handler
    switch (query_type) {
      case 'stock_quote':
        return handleStockQuote(normalizedSymbol);

      case 'option_quote':
        return handleOptionQuote(normalizedSymbol, strike, call_put, expiration);

      case 'historical':
        return handleHistorical(normalizedSymbol, chart_period);

      case 'news':
        return handleNews(normalizedSymbol);

      case 'halt':
        return handleHaltStatus(normalizedSymbol);

      default:
        return NextResponse.json({
          response: `I don't recognize the query type "${query_type}". I can help with stock quotes, option quotes, charts, news, or halt status.`,
          uiData: { type: 'error', message: `Unknown query_type: ${query_type}` } as ErrorUIData,
        });
    }
  } catch (error) {
    console.error('Market data error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      response: 'I encountered an error while fetching market data. Please try again.',
      uiData: { type: 'error', message: errorMessage } as ErrorUIData,
    });
  }
}

// ============================================================================
// Stock Quote Handler
// ============================================================================

async function handleStockQuote(symbol?: string): Promise<NextResponse> {
  if (!symbol) {
    return NextResponse.json({
      response: 'Which stock would you like a quote for?',
      uiData: { type: 'error', message: 'Symbol required for stock quote' } as ErrorUIData,
    });
  }

  try {
    // Get snapshot (includes quote, trade, and daily bar)
    const [snapshot, clock] = await Promise.all([
      getStockSnapshot(symbol),
      getMarketClock(),
    ]);

    const quote = snapshot.latestQuote;
    const trade = snapshot.latestTrade;
    const dailyBar = snapshot.dailyBar;
    const prevBar = snapshot.prevDailyBar;

    if (!quote && !trade) {
      // Check if user has trading history with this symbol
      const presence = await checkSymbolPresence(symbol);
      let responseText = `I couldn't find quote data for ${symbol}. Please check the symbol and try again.`;
      if (presence.context) {
        const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
        responseText = `I couldn't find real-time quote data for ${symbol}. However, ${contextLower} Would you like to see those instead?`;
      }
      return NextResponse.json({
        response: responseText,
        uiData: { type: 'error', message: `No data found for ${symbol}`, code: 'SYMBOL_NOT_FOUND' } as ErrorUIData,
      });
    }

    // Calculate derived values
    const currentPrice = trade?.price || (quote ? (quote.bidPrice + quote.askPrice) / 2 : 0);
    const prevClose = prevBar?.close || currentPrice;
    const change = currentPrice - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    const bid = quote?.bidPrice || 0;
    const ask = quote?.askPrice || 0;
    const mid = calculateMidPrice(bid, ask);
    const spreadInfo = calculateSpread(bid, ask);

    const uiData: StockQuoteUIData = {
      type: 'stock-quote',
      symbol,
      price: currentPrice,
      change,
      changePercent,
      bid,
      bidSize: quote?.bidSize || 0,
      ask,
      askSize: quote?.askSize || 0,
      mid,
      spread: spreadInfo.absolute,
      spreadPercent: spreadInfo.percentage,
      volume: dailyBar?.volume || 0,
      dayHigh: dailyBar?.high || currentPrice,
      dayLow: dailyBar?.low || currentPrice,
      dayOpen: dailyBar?.open || currentPrice,
      prevClose,
      timestamp: quote?.timestamp || trade?.timestamp || new Date().toISOString(),
      isMarketOpen: clock.isOpen,
    };

    // Build voice response
    const direction = change >= 0 ? 'up' : 'down';
    const changeStr = `${direction} ${formatPrice(Math.abs(change))} or ${Math.abs(changePercent).toFixed(2)}%`;
    const marketStatus = clock.isOpen ? '' : ' The market is currently closed.';

    const response = `${symbol} is trading at ${formatPrice(currentPrice)}, ${changeStr} from the previous close. ` +
      `The bid is ${formatPrice(bid)} and the ask is ${formatPrice(ask)} with a spread of ${formatPrice(spreadInfo.absolute)}.${marketStatus}`;

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error(`Stock quote error for ${symbol}:`, error);
    // Check if user has trading history with this symbol
    const presence = await checkSymbolPresence(symbol);
    let responseText = `I couldn't fetch the quote for ${symbol}. The symbol may be invalid or the market data service may be unavailable.`;
    if (presence.context) {
      const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
      responseText = `I couldn't fetch the real-time quote for ${symbol}, but ${contextLower} Would you like to see those instead?`;
    }
    return NextResponse.json({
      response: responseText,
      uiData: { type: 'error', message: `Failed to fetch ${symbol}` } as ErrorUIData,
    });
  }
}

// ============================================================================
// Option Quote Handler
// ============================================================================

async function handleOptionQuote(
  symbol?: string,
  strike?: number,
  callPut?: 'call' | 'put',
  expiration?: string
): Promise<NextResponse> {
  if (!symbol) {
    return NextResponse.json({
      response: 'Which underlying stock is this option for?',
      uiData: { type: 'error', message: 'Symbol required for option quote' } as ErrorUIData,
    });
  }

  if (!strike) {
    return NextResponse.json({
      response: `What strike price for the ${symbol} option?`,
      uiData: { type: 'error', message: 'Strike price required for option quote' } as ErrorUIData,
    });
  }

  if (!callPut) {
    return NextResponse.json({
      response: `Is this a call or put option for ${symbol} at the ${strike} strike?`,
      uiData: { type: 'error', message: 'Call/put type required for option quote' } as ErrorUIData,
    });
  }

  // Default expiration to nearest monthly if not provided
  const expirationStr = expiration || 'this month';
  const expirationDate = parseExpiration(expirationStr);

  if (!expirationDate) {
    return NextResponse.json({
      response: `I couldn't parse the expiration "${expiration}". Please provide a date like "Dec 20" or "January 17 2025".`,
      uiData: { type: 'error', message: 'Invalid expiration format' } as ErrorUIData,
    });
  }

  // Build OCC symbol
  const occSymbol = buildOCCSymbol(symbol, expirationStr, strike, callPut);
  if (!occSymbol) {
    return NextResponse.json({
      response: `I couldn't build the option symbol for ${symbol} ${expirationStr} ${strike} ${callPut}.`,
      uiData: { type: 'error', message: 'Failed to build OCC symbol' } as ErrorUIData,
    });
  }

  try {
    const snapshot = await getOptionSnapshot(occSymbol);
    const quote = snapshot.latestQuote;
    const trade = snapshot.latestTrade;

    if (!quote && !trade) {
      // Check if user has trading history with this underlying symbol
      const presence = await checkSymbolPresence(symbol);
      let responseText = `I couldn't find quote data for the ${symbol} ${formatOCCForDisplay(occSymbol)}. This option contract may not exist or may have no active quotes.`;
      if (presence.context) {
        const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
        responseText = `I couldn't find quote data for the ${symbol} ${formatOCCForDisplay(occSymbol)}. However, ${contextLower} Would you like to see those instead?`;
      }
      return NextResponse.json({
        response: responseText,
        uiData: { type: 'error', message: `No data for ${occSymbol}`, code: 'OPTION_NOT_FOUND' } as ErrorUIData,
      });
    }

    const bid = quote?.bidPrice || 0;
    const ask = quote?.askPrice || 0;
    const mid = calculateMidPrice(bid, ask);
    const spreadInfo = calculateSpread(bid, ask);

    const displayName = formatOCCForDisplay(occSymbol);

    const uiData: OptionQuoteUIData = {
      type: 'option-quote',
      occSymbol,
      displayName,
      underlying: symbol,
      expiration: expirationDate.toISOString(),
      strike,
      optionType: callPut,
      bid,
      bidSize: quote?.bidSize || 0,
      ask,
      askSize: quote?.askSize || 0,
      mid,
      spread: spreadInfo.absolute,
      last: trade?.price || null,
      lastSize: trade?.size || null,
      impliedVolatility: snapshot.impliedVolatility,
      greeks: snapshot.greeks,
      timestamp: quote?.timestamp || trade?.timestamp || new Date().toISOString(),
    };

    // Build voice response
    const typeWord = callPut === 'call' ? 'call' : 'put';
    const expirationFormatted = expirationDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let response = `The ${symbol} ${strike} ${typeWord} expiring ${expirationFormatted} has a bid of ${formatPrice(bid)} and an ask of ${formatPrice(ask)}. `;
    response += `The mid price is ${formatPrice(mid)} with a spread of ${formatPrice(spreadInfo.absolute)}.`;

    if (trade?.price) {
      response += ` The last trade was at ${formatPrice(trade.price)}.`;
    }

    if (snapshot.impliedVolatility) {
      response += ` Implied volatility is ${(snapshot.impliedVolatility * 100).toFixed(1)}%.`;
    }

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error(`Option quote error for ${occSymbol}:`, error);
    // Check if user has trading history with this underlying symbol
    const presence = await checkSymbolPresence(symbol);
    let responseText = `I couldn't fetch the quote for the ${symbol} ${formatOCCForDisplay(occSymbol)}. The option contract may not exist or may have no active market.`;
    if (presence.context) {
      const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
      responseText = `I couldn't fetch the real-time quote for ${symbol} options, but ${contextLower} Would you like to see those instead?`;
    }
    return NextResponse.json({
      response: responseText,
      uiData: { type: 'error', message: `Failed to fetch ${occSymbol}` } as ErrorUIData,
    });
  }
}

// ============================================================================
// Historical/Chart Handler
// ============================================================================

async function handleHistorical(symbol?: string, period?: string): Promise<NextResponse> {
  if (!symbol) {
    return NextResponse.json({
      response: 'Which stock would you like to see the chart for?',
      uiData: { type: 'error', message: 'Symbol required for chart' } as ErrorUIData,
    });
  }

  const chartPeriod = period || '1 month';
  const start = calculateStartDate(chartPeriod);
  const end = new Date();
  const timeframe = getTimeframeForPeriod(chartPeriod);

  try {
    const bars = await getHistoricalBars({
      symbol,
      timeframe,
      start,
      end,
      limit: 500,
    });

    if (bars.length === 0) {
      // Check if user has trading history with this symbol
      const presence = await checkSymbolPresence(symbol);
      let responseText = `I couldn't find historical data for ${symbol} over the past ${chartPeriod}.`;
      if (presence.context) {
        const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
        responseText = `I couldn't find historical chart data for ${symbol}. However, ${contextLower} Would you like to see those instead?`;
      }
      return NextResponse.json({
        response: responseText,
        uiData: { type: 'error', message: `No historical data for ${symbol}` } as ErrorUIData,
      });
    }

    // Calculate period stats
    const periodOpen = bars[0].open;
    const periodClose = bars[bars.length - 1].close;
    const periodHigh = Math.max(...bars.map(b => b.high));
    const periodLow = Math.min(...bars.map(b => b.low));
    const periodChange = periodClose - periodOpen;
    const periodChangePercent = periodOpen > 0 ? (periodChange / periodOpen) * 100 : 0;

    const uiData: ChartUIData = {
      type: 'price-chart',
      symbol,
      period: chartPeriod,
      timeframe,
      bars: bars.map(b => ({
        timestamp: b.timestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      })),
      periodHigh,
      periodLow,
      periodOpen,
      periodClose,
      periodChange,
      periodChangePercent,
    };

    // Build voice response
    const direction = periodChange >= 0 ? 'up' : 'down';
    const response = `Here's the ${chartPeriod} chart for ${symbol}. The stock is ${direction} ${Math.abs(periodChangePercent).toFixed(1)}% over this period, ` +
      `with a high of ${formatPrice(periodHigh)} and a low of ${formatPrice(periodLow)}. It opened at ${formatPrice(periodOpen)} and is currently at ${formatPrice(periodClose)}.`;

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error(`Historical data error for ${symbol}:`, error);
    // Check if user has trading history with this symbol
    const presence = await checkSymbolPresence(symbol);
    let responseText = `I couldn't fetch the chart data for ${symbol}. Please try again.`;
    if (presence.context) {
      const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
      responseText = `I couldn't fetch the chart data for ${symbol}, but ${contextLower} Would you like to see those instead?`;
    }
    return NextResponse.json({
      response: responseText,
      uiData: { type: 'error', message: `Failed to fetch chart for ${symbol}` } as ErrorUIData,
    });
  }
}

// ============================================================================
// News Handler
// ============================================================================

async function handleNews(symbol?: string): Promise<NextResponse> {
  try {
    const articles = await getNews({
      symbols: symbol ? [symbol] : undefined,
      limit: 10,
    });

    if (articles.length === 0) {
      let noNewsMsg = symbol
        ? `I couldn't find any recent news for ${symbol}.`
        : 'I couldn\'t find any recent market news.';

      // Check if user has trading history with this symbol
      if (symbol) {
        const presence = await checkSymbolPresence(symbol);
        if (presence.context) {
          const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
          noNewsMsg = `I couldn't find any recent news for ${symbol}. However, ${contextLower} Would you like to see those instead?`;
        }
      }
      return NextResponse.json({
        response: noNewsMsg,
        uiData: { type: 'news', symbol, articles: [] } as NewsUIData,
      });
    }

    const uiData: NewsUIData = {
      type: 'news',
      symbol,
      articles: articles.map(a => ({
        id: a.id,
        headline: a.headline,
        summary: a.summary,
        author: a.author,
        source: a.source,
        url: a.url,
        createdAt: a.createdAt,
        symbols: a.symbols,
      })),
    };

    // Build voice response
    const topHeadlines = articles.slice(0, 3).map(a => a.headline);
    const newsIntro = symbol ? `Here's the latest news for ${symbol}.` : 'Here\'s the latest market news.';
    const response = `${newsIntro} ${topHeadlines[0]}${topHeadlines.length > 1 ? ` Also, ${topHeadlines[1]}` : ''}`;

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error('News fetch error:', error);
    return NextResponse.json({
      response: 'I couldn\'t fetch the latest news. Please try again.',
      uiData: { type: 'error', message: 'Failed to fetch news' } as ErrorUIData,
    });
  }
}

// ============================================================================
// Halt Status Handler
// ============================================================================

async function handleHaltStatus(symbol?: string): Promise<NextResponse> {
  try {
    if (symbol) {
      const status = await checkTradingHalt(symbol);

      if (!status) {
        // Check if user has trading history with this symbol
        const presence = await checkSymbolPresence(symbol);
        let responseText = `I couldn't find trading status for ${symbol}. Please check the symbol.`;
        if (presence.context) {
          const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
          responseText = `I couldn't find trading status for ${symbol}. However, ${contextLower} Would you like to see those instead?`;
        }
        return NextResponse.json({
          response: responseText,
          uiData: { type: 'error', message: `Status not found for ${symbol}` } as ErrorUIData,
        });
      }

      const isHalted = status.statusCode === 'H';
      const uiData: HaltUIData = {
        type: 'halt-status',
        symbol,
        isHalted,
        statusMessage: status.statusMessage,
        reasonCode: status.reasonCode,
        reasonMessage: status.reasonMessage,
        timestamp: status.timestamp,
      };

      const response = isHalted
        ? `${symbol} is currently halted. ${status.reasonMessage || ''}`
        : `${symbol} is trading normally with no halt in effect.`;

      return NextResponse.json({ response, uiData });

    } else {
      // General market status
      const clock = await getMarketClock();

      const uiData: HaltUIData = {
        type: 'halt-status',
        isHalted: !clock.isOpen,
        statusMessage: clock.isOpen ? 'Market is open' : 'Market is closed',
        timestamp: clock.timestamp,
      };

      const response = clock.isOpen
        ? `The market is currently open and will close at ${new Date(clock.nextClose).toLocaleTimeString('en-US', { timeZoneName: 'short' })}.`
        : `The market is currently closed and will open at ${new Date(clock.nextOpen).toLocaleTimeString('en-US', { timeZoneName: 'short' })}.`;

      return NextResponse.json({ response, uiData });
    }

  } catch (error) {
    console.error('Halt status error:', error);
    return NextResponse.json({
      response: 'I couldn\'t fetch the trading status. Please try again.',
      uiData: { type: 'error', message: 'Failed to fetch halt status' } as ErrorUIData,
    });
  }
}
