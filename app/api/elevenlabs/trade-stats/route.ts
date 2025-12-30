import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatDateForDB } from '@/src/lib/date-utils';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';
import { checkSymbolPresence } from '@/src/lib/symbol-lookup';
import { findNearestMonthWithTrades } from '@/src/lib/data-availability';

// LLM-resolved date filter
interface DateFilter {
  type: 'range' | 'discrete' | 'relative';
  startDate?: string;
  endDate?: string;
  dates?: string[];
  description: string;
}

// Format date for voice - shows raw database dates (no offset)
// For "this year" queries, database dates are already 2025 dates
function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';

  // Extract YYYY-MM-DD part
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (isNaN(date.getTime())) return dateStr;

  // Format as "August 12, 2025" for TTS
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Format price as currency - keep in numeric form
function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

// Format number without commas (TTS requires no commas - commas break speech synthesis)
function formatNumber(num: number): string {
  return Math.round(num).toString();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Trade stats request:', JSON.stringify(body, null, 2));

    const symbol = body.symbol || body.parameters?.symbol;
    const tradeType = body.trade_type || body.parameters?.trade_type;
    const timePeriod = body.time_period || body.parameters?.time_period;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
      });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const userYear = new Date().getFullYear();

    let dateStart: string | undefined;
    let dateEnd: string | undefined;
    let periodDescription: string;

    // Resolve dates - prioritize LLM-resolved dateFilter, fall back to parsing timePeriod
    if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      // Use LLM-resolved dates directly
      const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
      const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
      const realStart = new Date(sy, sm - 1, sd);
      const realEnd = new Date(ey, em - 1, ed);
      dateStart = formatDateForDB(realStart);
      dateEnd = formatDateForDB(realEnd);
      periodDescription = dateFilter.description || timePeriod || 'selected period';
      console.log(`Using LLM dateFilter: ${dateFilter.startDate} to ${dateFilter.endDate} -> ${dateStart} to ${dateEnd} (${periodDescription})`);
    } else if (timePeriod) {
      // Fall back to parsing timePeriod string when dateFilter not provided
      const resolved = parseTimePeriodToResolvedDates(timePeriod);
      if (resolved && resolved.startDate && resolved.endDate) {
        dateStart = resolved.startDate;
        dateEnd = resolved.endDate;
        periodDescription = resolved.description || timePeriod;
        console.log(`Parsed timePeriod "${timePeriod}": ${dateStart} to ${dateEnd} (${periodDescription})`);
      } else {
        periodDescription = timePeriod;
        console.log(`Could not parse timePeriod "${timePeriod}", querying all data`);
      }
    } else {
      periodDescription = `${userYear}`;
      console.log('No dateFilter or timePeriod provided, querying all data');
    }

    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .eq('SecurityType', 'S')
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

    // Apply date filter only if dates were resolved
    if (dateStart && dateEnd) {
      query = query.gte('Date', dateStart).lte('Date', dateEnd);
    }

    if (tradeType) {
      const normalizedType = tradeType.toLowerCase().startsWith('s') ? 'S' : 'B';
      query = query.eq('TradeType', normalizedType);
    }

    const { data, error } = await query.order('Date', { ascending: false });

    if (error) {
      return NextResponse.json({
        response: `Error getting trade stats: ${error.message}`,
        uiData: null,
      });
    }

    if (!data || data.length === 0) {
      const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy') : '';
      const normalizedType = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'S' : 'B') as 'B' | 'S' : undefined;

      // First, try to find the nearest month with matching trades
      const nearestMonth = await findNearestMonthWithTrades(periodDescription, {
        symbol: normalizedSymbol,
        tradeType: normalizedType,
        securityType: 'S', // Stock trades for trade-stats
      });

      if (nearestMonth) {
        // Found trades in a different month - suggest that period
        const responseText = `No ${typeLabel} trades found for ${normalizedSymbol} in ${periodDescription}, but I found ${nearestMonth.count} ${typeLabel} trades in ${nearestMonth.suggestedPeriod}. Would you like to see those instead?`;

        return NextResponse.json({
          response: responseText,
          uiData: {
            symbol: normalizedSymbol,
            timePeriod: periodDescription,
            tradeType: tradeType || null,
            stockStats: null,
            suggestion: {
              period: nearestMonth.suggestedPeriod,
              count: nearestMonth.count,
              startDate: nearestMonth.startDate,
              endDate: nearestMonth.endDate,
            },
          },
        });
      }

      // No trades found for this symbol at all - check if symbol exists elsewhere (e.g., in fees)
      const presence = await checkSymbolPresence(normalizedSymbol, 'TradeData');
      let responseText = `No ${typeLabel} trades found for ${normalizedSymbol} ${periodDescription}.`;
      if (presence.context) {
        const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
        responseText += ` However, ${contextLower} Would you like to see those instead?`;
      }

      return NextResponse.json({
        response: responseText,
        uiData: {
          symbol: normalizedSymbol,
          timePeriod: periodDescription,
          tradeType: tradeType || null,
          stockStats: null,
          symbolContext: presence.context || undefined,
        },
      });
    }

    // Filter to valid trades only (both price and shares must be positive)
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

    const highestTrade = data.find(t => parseFloat(t.StockTradePrice || '0') === highestPrice);
    const lowestTrade = data.find(t => parseFloat(t.StockTradePrice || '0') === lowestPrice);

    const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sold' : 'bought') : 'traded';

    // Format response with numeric values (not spelled out)
    const highShareQty = parseFloat(highestTrade?.StockShareQty || '0');
    const lowShareQty = parseFloat(lowestTrade?.StockShareQty || '0');

    // Format dates WITHOUT offset - must match UI display
    const highDate = highestTrade?.Date ? formatDateForVoice(highestTrade.Date) : 'N/A';
    const lowDate = lowestTrade?.Date ? formatDateForVoice(lowestTrade.Date) : 'N/A';

    let response = `${normalizedSymbol} trade statistics for ${periodDescription}: `;
    response += `Highest price ${typeLabel}: ${formatPrice(highestPrice)} on ${highDate} for ${formatNumber(highShareQty)} shares. `;
    response += `Lowest price ${typeLabel}: ${formatPrice(lowestPrice)} on ${lowDate} for ${formatNumber(lowShareQty)} shares. `;
    response += `Average price: ${formatPrice(avgPrice)}. `;
    response += `Total: ${formatNumber(data.length)} trades, ${formatNumber(totalShares)} shares, ${formatPrice(totalValue)} total value.`;

    // Build uiData for UI card rendering - SINGLE SOURCE OF TRUTH
    const uiData = {
      symbol: normalizedSymbol,
      timePeriod: periodDescription,
      tradeType: tradeType || null,
      stockStats: {
        highestPrice,
        lowestPrice,
        avgPrice,
        highestDate: highestTrade?.Date || null,
        lowestDate: lowestTrade?.Date || null,
        highestShares: highShareQty,
        lowestShares: lowShareQty,
        tradeCount: data.length,
        totalShares,
        totalValue,
      },
    };

    return NextResponse.json({ response, uiData });
  } catch (error) {
    console.error('Trade stats error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error getting the trade statistics.',
      uiData: null,
    });
  }
}
