import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { realDateToDemoDate, formatDateForDB } from '@/src/lib/date-utils';
import { calculateRealizedMatchesFIFO, filterProfitableTrades } from '@/src/lib/profitable-trades';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';

// LLM-resolved date filter
interface DateFilter {
  type: 'range' | 'discrete' | 'relative';
  startDate?: string;
  endDate?: string;
  dates?: string[];
  description: string;
}

// Format date in EASTERN TIMEZONE to match user's timezone and market hours
// Database stores dates as YYYY-MM-DD which JS interprets as UTC midnight
// We use Eastern timezone to align with NYSE/NASDAQ hours and user's local time
function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';

  // Extract YYYY-MM-DD part and interpret as UTC midnight
  const datePart = dateStr.split('T')[0];
  const date = new Date(datePart + 'T00:00:00Z');

  if (isNaN(date.getTime())) return dateStr;

  // Format in Eastern timezone to match user's timezone
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Tool: Get trade summary
async function getTradeSummary(symbol: string, timePeriod?: string, dateFilter?: DateFilter) {
  const normalizedSymbol = normalizeSymbol(symbol);

  // Resolve dates - prioritize LLM-resolved dateFilter, fall back to parsing timePeriod
  let startDate: string | undefined;
  let endDate: string | undefined;
  let dates: string[] | undefined;
  let description: string = timePeriod || '';
  let resolvedType: 'range' | 'discrete' = 'range';

  if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
    const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
    const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
    const realStart = new Date(sy, sm - 1, sd);
    const realEnd = new Date(ey, em - 1, ed);
    startDate = formatDateForDB(realDateToDemoDate(realStart));
    endDate = formatDateForDB(realDateToDemoDate(realEnd));
    description = dateFilter.description || timePeriod || 'selected period';
    console.log(`getTradeSummary: LLM dateFilter real ${dateFilter.startDate} to ${dateFilter.endDate} -> demo ${startDate} to ${endDate}`);
  } else if (dateFilter && dateFilter.type === 'discrete' && dateFilter.dates && dateFilter.dates.length > 0) {
    dates = dateFilter.dates.map(d => {
      const [y, m, day] = d.split('-').map(Number);
      const realDate = new Date(y, m - 1, day);
      return formatDateForDB(realDateToDemoDate(realDate));
    });
    resolvedType = 'discrete';
    description = dateFilter.description || timePeriod || 'selected dates';
    console.log(`getTradeSummary: LLM discrete dates -> demo ${dates.join(', ')}`);
  } else if (timePeriod) {
    const resolved = parseTimePeriodToResolvedDates(timePeriod);
    if (resolved) {
      if (resolved.type === 'discrete' && resolved.dates) {
        dates = resolved.dates;
        resolvedType = 'discrete';
      } else if (resolved.startDate && resolved.endDate) {
        startDate = resolved.startDate;
        endDate = resolved.endDate;
      }
      description = resolved.description || timePeriod;
      console.log(`getTradeSummary: Parsed timePeriod "${timePeriod}" -> ${resolved.type}, dates: ${dates || `${startDate} to ${endDate}`}`);
    }
  }

  let query = supabase
    .from('TradeData')
    .select('SecurityType, TradeType, Date')
    .eq('AccountCode', ACCOUNT_CODE)
    .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

  // Apply date filters
  if (resolvedType === 'discrete' && dates && dates.length > 0) {
    query = query.in('Date', dates);
  } else if (startDate && endDate) {
    query = query.gte('Date', startDate).lte('Date', endDate);
  }

  const { data, error } = await query;

  if (error) {
    return { error: error.message, symbol: normalizedSymbol };
  }

  const stockTrades = data?.filter(t => t.SecurityType === 'S').length || 0;
  const optionTrades = data?.filter(t => t.SecurityType === 'O').length || 0;
  const warrantTrades = data?.filter(t => t.SecurityType === 'W').length || 0;

  return {
    symbol: normalizedSymbol,
    stockTrades,
    optionTrades,
    warrantTrades,
    totalTrades: stockTrades + optionTrades + warrantTrades,
    timePeriod: description || undefined,
  };
}

// Tool: Get trade statistics (highest, lowest, average prices)
async function getTradeStats(symbol: string, tradeType?: string, year?: number, timePeriod?: string, dateFilter?: DateFilter) {
  const normalizedSymbol = normalizeSymbol(symbol);

  const userYear = year || new Date().getFullYear();

  let dateStart: string | undefined;
  let dateEnd: string | undefined;
  let timePeriodDescription: string | null = null;

  // Resolve dates - prioritize LLM-resolved dateFilter, fall back to parsing timePeriod
  if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
    // LLM has resolved the dates in real calendar time - convert to demo database dates
    const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
    const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
    const realStart = new Date(sy, sm - 1, sd);
    const realEnd = new Date(ey, em - 1, ed);
    dateStart = formatDateForDB(realDateToDemoDate(realStart));
    dateEnd = formatDateForDB(realDateToDemoDate(realEnd));
    timePeriodDescription = dateFilter.description || timePeriod || null;
  } else if (timePeriod) {
    // Fall back to parsing timePeriod string when dateFilter not provided
    const resolved = parseTimePeriodToResolvedDates(timePeriod);
    if (resolved && resolved.startDate && resolved.endDate) {
      dateStart = resolved.startDate;
      dateEnd = resolved.endDate;
      timePeriodDescription = resolved.description || timePeriod;
    } else {
      timePeriodDescription = timePeriod;
    }
  }

  let query = supabase
    .from('TradeData')
    .select('*')
    .eq('AccountCode', ACCOUNT_CODE)
    .eq('SecurityType', 'S') // Stock trades only for price analysis
    .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

  // Apply date filter only if dates were resolved
  if (dateStart && dateEnd) {
    query = query.gte('Date', dateStart).lte('Date', dateEnd);
  }

  // Filter by trade type if specified (B = Buy, S = Sell)
  if (tradeType) {
    const normalizedType = tradeType.toLowerCase().startsWith('s') ? 'S' : 'B';
    query = query.eq('TradeType', normalizedType);
  }

  const { data, error } = await query.order('Date', { ascending: false });

  if (error) {
    return { error: error.message, symbol: normalizedSymbol };
  }

  // Build period description for messages
  const periodDescription = timePeriodDescription || `${userYear}`;

  if (!data || data.length === 0) {
    const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy') : '';
    return {
      symbol: normalizedSymbol,
      year: userYear,
      timePeriod: timePeriodDescription,
      tradeType: typeLabel,
      message: `No ${typeLabel} trades found for ${normalizedSymbol} ${timePeriodDescription ? timePeriodDescription : `in ${userYear}`}.`,
      tradesFound: 0,
    };
  }

  // Calculate statistics - filter to valid trades only (both price and shares must be positive)
  const validTrades = data
    .map(t => ({
      price: parseFloat(t.StockTradePrice || '0'),
      shares: parseFloat(t.StockShareQty || '0'),
    }))
    .filter(t => t.price > 0 && t.shares > 0);

  const prices = validTrades.map(t => t.price);
  const totalShares = validTrades.reduce((sum, t) => sum + t.shares, 0);
  const totalNotional = validTrades.reduce((sum, t) => sum + t.price * t.shares, 0);
  const totalValue = totalNotional;

  const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const avgPrice = totalShares > 0 ? totalNotional / totalShares : 0;

  // Find the trades with highest and lowest prices
  const highestTrade = data.find(t => parseFloat(t.StockTradePrice || '0') === highestPrice);
  const lowestTrade = data.find(t => parseFloat(t.StockTradePrice || '0') === lowestPrice);

  const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy') : 'all';

  return {
    symbol: normalizedSymbol,
    year: userYear,
    timePeriod: timePeriodDescription,
    periodDescription,
    tradeType: typeLabel,
    tradesFound: data.length,
    totalShares,
    totalValue,
    highestPrice,
    highestPriceDate: highestTrade?.Date ? formatDateForVoice(highestTrade.Date) : undefined,
    highestPriceShares: highestTrade ? parseFloat(highestTrade.StockShareQty || '0') : 0,
    lowestPrice,
    lowestPriceDate: lowestTrade?.Date ? formatDateForVoice(lowestTrade.Date) : undefined,
    lowestPriceShares: lowestTrade ? parseFloat(lowestTrade.StockShareQty || '0') : 0,
    averagePrice: avgPrice,
  };
}

// Tool: Get profitable trades (FIFO matching)
async function getProfitableTrades(symbol: string, onlyProfitable: boolean = true, timePeriod?: string, dateFilter?: DateFilter) {
  const normalizedSymbol = normalizeSymbol(symbol);

  let dateStart: string | undefined;
  let dateEnd: string | undefined;
  let description: string | undefined = timePeriod;

  // Resolve dates - prioritize LLM-resolved dateFilter, fall back to parsing timePeriod
  if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
    // LLM has resolved the dates in real calendar time - convert to demo database dates
    const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
    const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
    const realStart = new Date(sy, sm - 1, sd);
    const realEnd = new Date(ey, em - 1, ed);
    dateStart = formatDateForDB(realDateToDemoDate(realStart));
    dateEnd = formatDateForDB(realDateToDemoDate(realEnd));
    description = dateFilter.description || timePeriod;
  } else if (timePeriod) {
    // Fall back to parsing timePeriod string when dateFilter not provided
    const resolved = parseTimePeriodToResolvedDates(timePeriod);
    if (resolved && resolved.startDate && resolved.endDate) {
      dateStart = resolved.startDate;
      dateEnd = resolved.endDate;
      description = resolved.description || timePeriod;
    }
  }

  let query = supabase
    .from('TradeData')
    .select('*')
    .eq('AccountCode', ACCOUNT_CODE)
    .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
    .order('Date', { ascending: true })
    .order('TradeID', { ascending: true });

  if (dateEnd) {
    query = query.lte('Date', dateEnd);
  }

  const { data: trades, error } = await query;

  if (error) {
    return { error: error.message, symbol: normalizedSymbol };
  }

  const allTrades = trades || [];
  if (allTrades.length === 0) {
    return {
      symbol: normalizedSymbol,
      timePeriod: description || null,
      message: `No trades found for ${normalizedSymbol}.`,
      totalMatchedTrades: 0,
      totalProfitableTrades: 0,
      totalProfit: 0,
      trades: [],
    };
  }

  const matchedTrades = calculateRealizedMatchesFIFO(allTrades, normalizedSymbol);
  if (matchedTrades.length === 0) {
    return {
      symbol: normalizedSymbol,
      timePeriod: description || null,
      message: `No completed round-trip trades found for ${normalizedSymbol}.`,
      totalMatchedTrades: 0,
      totalProfitableTrades: 0,
      totalProfit: 0,
      trades: [],
    };
  }

  if (onlyProfitable) {
    const { profitableTrades, totalProfit } = filterProfitableTrades(matchedTrades, dateStart, dateEnd);
    return {
      symbol: normalizedSymbol,
      timePeriod: description || null,
      totalMatchedTrades: matchedTrades.length,
      totalProfitableTrades: profitableTrades.length,
      totalProfit,
      trades: profitableTrades,
    };
  }

  const allTotal = matchedTrades.reduce((sum, t) => sum + t.profitLoss, 0);
  return {
    symbol: normalizedSymbol,
    timePeriod: description || null,
    totalMatchedTrades: matchedTrades.length,
    totalProfitableTrades: matchedTrades.filter(t => t.profitLoss > 0).length,
    totalProfit: allTotal,
    trades: matchedTrades.sort((a, b) => b.profitLoss - a.profitLoss),
  };
}

// Tool: Get detailed trades
async function getDetailedTrades(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);

  const { data, error } = await supabase
    .from('TradeData')
    .select('*')
    .eq('AccountCode', ACCOUNT_CODE)
    .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
    .order('Date', { ascending: false });

  if (error) {
    return { error: error.message, symbol: normalizedSymbol };
  }

  // Calculate totals for stock trades
  const stockTrades = data?.filter(t => t.SecurityType === 'S') || [];
  const optionTrades = data?.filter(t => t.SecurityType === 'O') || [];
  const buyTrades = stockTrades.filter(t => t.TradeType === 'B');

  const totalSharesPurchased = buyTrades.reduce((sum, t) =>
    sum + parseFloat(t.StockShareQty || '0'), 0);
  const totalCost = buyTrades.reduce((sum, t) =>
    sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

  // Estimate current value using last trade price
  const lastPrice = stockTrades[0]?.StockTradePrice
    ? parseFloat(stockTrades[0].StockTradePrice)
    : 0;
  const currentValue = totalSharesPurchased * lastPrice;

  // Format trades for display
  const formattedStockTrades = stockTrades.map(t => ({
    tradeId: t.TradeID,
    date: t.Date,
    type: t.TradeType === 'B' ? 'Buy' : 'Sell',
    shares: parseFloat(t.StockShareQty || '0'),
    price: parseFloat(t.StockTradePrice || '0'),
    netAmount: parseFloat(t.NetAmount || '0'),
  }));

  const formattedOptionTrades = optionTrades.map(t => ({
    tradeId: t.TradeID,
    date: t.Date,
    type: t.TradeType === 'B' ? 'Buy' : 'Sell',
    callPut: t['Call/Put'] === 'C' ? 'Call' : 'Put',
    strike: parseFloat(t.Strike || '0'),
    expiration: t.Expiration,
    contracts: parseFloat(t.OptionContracts || '0'),
    premium: parseFloat(t.OptionTradePremium || '0'),
    netAmount: parseFloat(t.NetAmount || '0'),
  }));

  return {
    symbol: normalizedSymbol,
    summary: {
      totalSharesPurchased,
      totalCost,
      currentValue,
      lastTradePrice: lastPrice,
      profitLoss: currentValue - totalCost,
      profitLossPercent: totalCost > 0 ? ((currentValue - totalCost) / totalCost) * 100 : 0,
    },
    stockTrades: formattedStockTrades,
    optionTrades: formattedOptionTrades,
    stockTradeCount: stockTrades.length,
    optionTradeCount: optionTrades.length,
  };
}

// ElevenLabs webhook endpoint for tool calls
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ElevenLabs sends tool calls - parameters can be nested or flat
    const tool_name = body.tool_name;
    const parameters = body.parameters || body; // Support both nested and flat params

    console.log('ElevenLabs tool call:', { tool_name, parameters });

    let result;

    switch (tool_name) {
      case 'getTradeSummary':
      case 'get_trade_summary':
        result = await getTradeSummary(
          parameters.symbol,
          parameters.time_period || parameters.timePeriod,
          parameters.date_filter || parameters.dateFilter
        );
        break;

      case 'getDetailedTrades':
      case 'get_detailed_trades':
        result = await getDetailedTrades(parameters.symbol);
        break;

      case 'getTradeStats':
      case 'get_trade_stats':
        result = await getTradeStats(
          parameters.symbol,
          parameters.trade_type || parameters.tradeType,
          parameters.year,
          parameters.time_period || parameters.timePeriod,
          parameters.date_filter || parameters.dateFilter
        );
        break;

      case 'getProfitableTrades':
      case 'get_profitable_trades':
        result = await getProfitableTrades(
          parameters.symbol,
          parameters.only_profitable ?? parameters.onlyProfitable ?? true,
          parameters.time_period || parameters.timePeriod,
          parameters.date_filter || parameters.dateFilter
        );
        break;

      default:
        return NextResponse.json(
          { error: `Unknown tool: ${tool_name}` },
          { status: 400 }
        );
    }

    // Format response for ElevenLabs
    // ElevenLabs expects a response that the agent can use
    let responseText = '';

    if (tool_name === 'getTradeSummary' || tool_name === 'get_trade_summary') {
      if ('error' in result && result.error) {
        responseText = `Error looking up trades: ${result.error}`;
      } else if ('totalTrades' in result) {
        const periodText = result.timePeriod ? ` for ${result.timePeriod}` : '';
        responseText = `For ${result.symbol}${periodText}: Found ${result.stockTrades} stock trades and ${result.optionTrades} option trades. Total: ${result.totalTrades} trades.`;
      }
    } else if (tool_name === 'getDetailedTrades' || tool_name === 'get_detailed_trades') {
      if ('error' in result && result.error) {
        responseText = `Error getting trade details: ${result.error}`;
      } else if ('summary' in result && result.summary) {
        const summary = result.summary;
        const sharesText = Math.round(summary.totalSharesPurchased).toString();
        responseText = `For ${result.symbol}, you bought ${sharesText} shares for a total cost of $${summary.totalCost.toFixed(2)} with an estimated current value of $${summary.currentValue.toFixed(2)}, for a profit or loss of $${summary.profitLoss.toFixed(2)} or ${summary.profitLossPercent.toFixed(2)} percent. You have ${result.stockTradeCount} stock trades and ${result.optionTradeCount} option trades.`;
      }
    } else if (tool_name === 'getTradeStats' || tool_name === 'get_trade_stats') {
      if ('error' in result && result.error) {
        responseText = `Error getting trade statistics: ${result.error}`;
      } else if ('message' in result && 'tradesFound' in result && result.tradesFound === 0) {
        responseText = result.message as string;
      } else if ('highestPrice' in result && result.highestPrice !== undefined) {
        const typeLabel = result.tradeType === 'sell' ? 'sold' : result.tradeType === 'buy' ? 'bought' : 'traded';
        const periodText = result.periodDescription || result.year;
        responseText = `For ${result.symbol} ${periodText}, the highest price you ${typeLabel} at was $${result.highestPrice.toFixed(2)} on ${result.highestPriceDate} for ${Math.round(result.highestPriceShares)} shares. The lowest was $${(result.lowestPrice ?? 0).toFixed(2)} on ${result.lowestPriceDate} for ${Math.round(result.lowestPriceShares)} shares. The average price was $${(result.averagePrice ?? 0).toFixed(2)} across ${result.tradesFound} trades.`;
      }
    } else if (tool_name === 'getProfitableTrades' || tool_name === 'get_profitable_trades') {
      if ('error' in result && result.error) {
        responseText = `Error getting profitable trades: ${result.error}`;
      } else if ('message' in result && 'totalMatchedTrades' in result && result.totalMatchedTrades === 0) {
        responseText = result.message as string;
      } else if ('totalProfit' in result && result.totalProfit !== undefined) {
        const topTrade = result.trades?.[0];
        const periodText = result.timePeriod ? ` ${result.timePeriod}` : '';
        responseText = `For ${result.symbol}${periodText}, you have ${result.totalProfitableTrades} profitable trades with total realized profit $${result.totalProfit.toFixed(2)}.`;
        if (topTrade) {
          responseText += ` Your top profit was $${topTrade.profitLoss.toFixed(2)} from ${topTrade.buyDate} to ${topTrade.sellDate}.`;
        }
      }
    }

    return NextResponse.json({
      response: responseText,
      data: result,
    });
  } catch (error) {
    console.error('ElevenLabs tool error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
