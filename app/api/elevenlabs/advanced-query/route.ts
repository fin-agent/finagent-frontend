import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { checkSymbolPresence } from '@/src/lib/symbol-lookup';

// Format date in PACIFIC TIMEZONE to match UI display
// The UI renders dates in the user's browser (typically Pacific time)
// Database stores dates as YYYY-MM-DD which JS interprets as UTC midnight
// UTC midnight = previous day evening in Pacific, so we need Pacific formatting
function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';

  // Extract YYYY-MM-DD part and interpret as UTC midnight
  const datePart = dateStr.split('T')[0];
  const date = new Date(datePart + 'T00:00:00Z');

  if (isNaN(date.getTime())) return dateStr;

  // Format in Pacific timezone to match browser display
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
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

// Demo date system - the latest trade date in demo database represents "today"
const DEMO_TODAY = '2025-11-20';

function getDemoToday(): Date {
  const [year, month, day] = DEMO_TODAY.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Parse relative dates like "tomorrow", "last month", "this year", and day-of-week references
// Uses demo date system so "last month" = October 2025 when DEMO_TODAY is Nov 20, 2025
function parseRelativeDate(input: string): { start?: string; end?: string } {
  // Use demo "today" instead of actual today for demo data alignment
  const demoToday = getDemoToday();
  const today = new Date(demoToday.getFullYear(), demoToday.getMonth(), demoToday.getDate());

  const lower = input.toLowerCase().trim();

  // Helper to format date as YYYY-MM-DD
  const formatDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Day-of-week mapping (Sunday = 0, Monday = 1, etc.)
  const dayMap: Record<string, number> = {
    'sunday': 0, 'sun': 0,
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2, 'tues': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
  };

  // Helper to get the most recent occurrence of a day of week (including today if it matches)
  const getMostRecentDay = (targetDay: number): Date => {
    const todayDay = today.getDay();
    const daysBack = todayDay >= targetDay ? todayDay - targetDay : 7 - (targetDay - todayDay);
    const result = new Date(today);
    result.setDate(today.getDate() - daysBack);
    return result;
  };

  // Helper to get the previous week's occurrence of a day
  const getLastWeekDay = (targetDay: number): Date => {
    const mostRecent = getMostRecentDay(targetDay);
    const result = new Date(mostRecent);
    result.setDate(mostRecent.getDate() - 7);
    return result;
  };

  // Helper to get this week's specific day (current calendar week, Sun-Sat)
  const getThisWeekDay = (targetDay: number): Date => {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const result = new Date(startOfWeek);
    result.setDate(startOfWeek.getDate() + targetDay);
    return result;
  };

  // Helper to get next week's specific day
  const getNextWeekDay = (targetDay: number): Date => {
    const startOfNextWeek = new Date(today);
    startOfNextWeek.setDate(today.getDate() - today.getDay() + 7);
    const result = new Date(startOfNextWeek);
    result.setDate(startOfNextWeek.getDate() + targetDay);
    return result;
  };

  // Check for "last <day>" pattern (e.g., "last monday", "last friday")
  const lastDayMatch = lower.match(/^last\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)$/);
  if (lastDayMatch) {
    const targetDay = dayMap[lastDayMatch[1]];
    const date = getLastWeekDay(targetDay);
    return { start: formatDate(date), end: formatDate(date) };
  }

  // Check for "this <day>" pattern (e.g., "this monday", "this friday")
  const thisDayMatch = lower.match(/^this\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)$/);
  if (thisDayMatch) {
    const targetDay = dayMap[thisDayMatch[1]];
    const date = getThisWeekDay(targetDay);
    return { start: formatDate(date), end: formatDate(date) };
  }

  // Check for "next <day>" pattern (e.g., "next monday", "next friday")
  const nextDayMatch = lower.match(/^next\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)$/);
  if (nextDayMatch) {
    const targetDay = dayMap[nextDayMatch[1]];
    const date = getNextWeekDay(targetDay);
    return { start: formatDate(date), end: formatDate(date) };
  }

  // Check for bare day name (e.g., "monday", "friday") - means the most recent occurrence
  const bareDayMatch = lower.match(/^(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)$/);
  if (bareDayMatch) {
    const targetDay = dayMap[bareDayMatch[1]];
    const date = getMostRecentDay(targetDay);
    return { start: formatDate(date), end: formatDate(date) };
  }

  if (lower === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { start: formatDate(tomorrow), end: formatDate(tomorrow) };
  }

  if (lower === 'today') {
    return { start: formatDate(today), end: formatDate(today) };
  }

  if (lower === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: formatDate(yesterday), end: formatDate(yesterday) };
  }

  if (lower === 'this week') {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    return { start: formatDate(startOfWeek), end: formatDate(today) };
  }

  if (lower === 'last week') {
    const startOfLastWeek = new Date(today);
    startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
    const endOfLastWeek = new Date(startOfLastWeek);
    endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
    return { start: formatDate(startOfLastWeek), end: formatDate(endOfLastWeek) };
  }

  if (lower === 'this month') {
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: formatDate(startOfMonth), end: formatDate(today) };
  }

  if (lower === 'last month') {
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: formatDate(startOfLastMonth), end: formatDate(endOfLastMonth) };
  }

  if (lower === 'this year' || lower === 'ytd') {
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    return { start: formatDate(startOfYear), end: formatDate(today) };
  }

  // "last year" = trailing 12 months (not calendar year) to match user expectations
  // and to work with demo data that only goes back to Jan 2025
  if (lower === 'last year') {
    const startDate = new Date(today.getFullYear(), today.getMonth() - 12, today.getDate());
    return { start: formatDate(startDate), end: formatDate(today) };
  }

  // Match "last N months" pattern
  const lastNMonthsMatch = lower.match(/last\s+(\d+)\s+months?/);
  if (lastNMonthsMatch) {
    const months = parseInt(lastNMonthsMatch[1]);
    const startDate = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
    return { start: formatDate(startDate), end: formatDate(today) };
  }

  // Match "last N days" pattern
  const lastNDaysMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (lastNDaysMatch) {
    const days = parseInt(lastNDaysMatch[1]);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    return { start: formatDate(startDate), end: formatDate(today) };
  }

  // If it looks like a date, return it as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(input) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(input)) {
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      return { start: date.toISOString().split('T')[0], end: date.toISOString().split('T')[0] };
    }
  }

  return {};
}

// Extract parameter from various ElevenLabs body structures
function extractParam(body: Record<string, unknown>, key: string): unknown {
  return body[key] ||
         (body.parameters as Record<string, unknown>)?.[key] ||
         (body.body as Record<string, unknown>)?.[key] ||
         ((body.body as Record<string, unknown>)?.parameters as Record<string, unknown>)?.[key];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Advanced query request body:', JSON.stringify(body, null, 2));

    // Extract all parameters
    const symbol = extractParam(body, 'symbol') as string | undefined;
    const securityType = extractParam(body, 'security_type') as string | undefined;
    const tradeType = extractParam(body, 'trade_type') as string | undefined;
    const callPut = extractParam(body, 'call_put') as string | undefined;
    const fromDate = extractParam(body, 'from_date') as string | undefined;
    const toDate = extractParam(body, 'to_date') as string | undefined;
    const expiration = extractParam(body, 'expiration') as string | undefined;
    const strike = extractParam(body, 'strike') as number | undefined;
    const aggregation = extractParam(body, 'aggregation') as string | undefined;
    const limit = extractParam(body, 'limit') as number | undefined;
    const orderBy = extractParam(body, 'order_by') as string | undefined;

    // Build the query
    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE);

    // Apply symbol filter
    if (symbol) {
      const normalizedSymbol = normalizeSymbol(symbol);
      query = query.or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);
    }

    // Apply security type filter (stock/option)
    if (securityType) {
      const secType = securityType.toLowerCase() === 'stock' ? 'S' :
                      securityType.toLowerCase() === 'option' ? 'O' :
                      securityType.toUpperCase();
      if (secType === 'S' || secType === 'O') {
        query = query.eq('SecurityType', secType);
      }
    }

    // Apply trade type filter (buy/sell)
    if (tradeType) {
      const tType = tradeType.toLowerCase() === 'buy' ? 'B' :
                    tradeType.toLowerCase() === 'sell' ? 'S' :
                    tradeType.toUpperCase();
      if (tType === 'B' || tType === 'S') {
        query = query.eq('TradeType', tType);
      }
    }

    // Apply call/put filter (column name has slash, needs special handling)
    if (callPut) {
      const cp = callPut.toLowerCase() === 'call' ? 'C' :
                 callPut.toLowerCase() === 'put' ? 'P' :
                 callPut.toUpperCase();
      if (cp === 'C' || cp === 'P') {
        query = query.filter('"Call/Put"', 'eq', cp);
      }
    }

    // Apply date range filters
    // For time periods like "last month", fromDate parsing returns both start AND end
    // We need to apply both constraints to get the correct date range
    if (fromDate) {
      const parsed = parseRelativeDate(fromDate);
      if (parsed.start) {
        query = query.gte('Date', parsed.start);
      }
      // Also apply end date if the time period has one (e.g., "last month" = Oct 1-31)
      // Only apply if toDate wasn't explicitly provided
      if (parsed.end && !toDate) {
        query = query.lte('Date', parsed.end);
      }
    }

    if (toDate) {
      const parsed = parseRelativeDate(toDate);
      if (parsed.end) {
        query = query.lte('Date', parsed.end);
      }
    }

    // Apply expiration filter (for options)
    if (expiration) {
      const parsed = parseRelativeDate(expiration);
      if (parsed.start && parsed.end && parsed.start === parsed.end) {
        // Single date
        query = query.eq('Expiration', parsed.start);
      } else if (parsed.start) {
        query = query.gte('Expiration', parsed.start);
        if (parsed.end) {
          query = query.lte('Expiration', parsed.end);
        }
      }
    }

    // Apply strike filter
    if (strike !== undefined && strike !== null) {
      query = query.eq('Strike', strike);
    }

    // Determine ordering based on aggregation type
    if (aggregation === 'highest_strike') {
      query = query.order('Strike', { ascending: false }).limit(1);
    } else if (aggregation === 'lowest_strike') {
      query = query.order('Strike', { ascending: true }).limit(1);
    } else if (orderBy === 'strike') {
      query = query.order('Strike', { ascending: false });
    } else if (orderBy === 'premium') {
      query = query.order('OptionTradePremium', { ascending: false });
    } else {
      query = query.order('Date', { ascending: false });
    }

    // Apply limit if specified and not overridden by aggregation
    if (limit && aggregation !== 'highest_strike' && aggregation !== 'lowest_strike') {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({
        response: `Error executing query: ${error.message}`,
      });
    }

    const normalizedSymbol = symbol ? normalizeSymbol(symbol) : '';

    if (!data || data.length === 0) {
      let filterDesc = '';
      if (symbol) filterDesc += ` for ${normalizedSymbol}`;
      if (securityType) filterDesc += ` (${securityType}s)`;
      if (tradeType) filterDesc += ` ${tradeType} trades`;
      if (callPut) filterDesc += ` ${callPut} options`;
      if (expiration) filterDesc += ` expiring ${expiration}`;

      // Check if symbol exists elsewhere (e.g., in fees)
      let symbolContext: string | undefined;
      if (normalizedSymbol) {
        const presence = await checkSymbolPresence(normalizedSymbol, 'TradeData');
        if (presence.context) {
          symbolContext = presence.context;
        }
      }

      let responseText = `No trades found${filterDesc || ' matching your criteria'}.`;
      if (symbolContext) {
        const contextLower = symbolContext.charAt(0).toLowerCase() + symbolContext.slice(1);
        responseText += ` However, ${contextLower} Would you like to see those instead?`;
      }

      // Return empty uiData for UI card rendering - SINGLE SOURCE OF TRUTH
      const uiData = {
        filters: {
          symbol: normalizedSymbol || null,
          securityType: securityType || null,
          tradeType: tradeType || null,
          callPut: callPut || null,
          fromDate: fromDate || null,
          toDate: toDate || null,
          expiration: expiration || null,
          strike: strike || null,
          aggregation: aggregation || null,
        },
        trades: [],
        summary: null,
        symbolContext: symbolContext || undefined,
      };

      return NextResponse.json({
        response: responseText,
        uiData,
      });
    }

    // Calculate aggregations with correct option math
    // For options: 1 contract = 100 shares, premium is per-share price
    // Total premium received/paid = premium_per_contract * contracts * 100
    const tradeCount = data.length;

    // Sum contracts (for options) or shares (for stocks)
    const totalContracts = data.reduce((sum, t) => {
      return sum + (t.SecurityType === 'O' ? parseFloat(t.OptionContracts || '0') : 0);
    }, 0);
    const totalShares = data.reduce((sum, t) => {
      return sum + (t.SecurityType === 'S' ? parseFloat(t.StockShareQty || '0') : 0);
    }, 0);

    // For options: shares covered = contracts * 100
    const sharesCovered = totalContracts * 100;

    // Calculate total premium correctly
    // OptionTradePremium is per-share price, so total = premium * contracts * 100
    // NetAmount already includes this calculation (premium * contracts * 100 - fees)
    // Use NetAmount for accurate totals (what was actually received/paid)
    const totalNetAmount = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    // Calculate gross premium (premium * contracts * 100) for display
    const totalGrossPremium = data.reduce((sum, t) => {
      if (t.SecurityType === 'O') {
        const premium = parseFloat(t.OptionTradePremium || '0');
        const contracts = parseFloat(t.OptionContracts || '0');
        return sum + (premium * contracts * 100);
      }
      return sum + Math.abs(parseFloat(t.GrossAmount || '0'));
    }, 0);

    // Average premium per share (totalPremium / totalContracts / 100 shares per contract)
    const avgPremiumPerShare = totalContracts > 0
      ? totalGrossPremium / totalContracts / 100
      : 0;

    // Build response based on aggregation type
    let response = '';

    // Special handling for single-trade queries (limit: 1) - "last/most recent" queries
    if (limit === 1 && data.length === 1 && data[0].SecurityType === 'O') {
      const trade = data[0];
      const strikeVal = parseFloat(trade.Strike || '0');
      const qty = parseFloat(trade.OptionContracts || '0');
      const premium = Math.abs(parseFloat(trade.NetAmount || '0'));
      const perContract = qty > 0 ? premium / qty : 0;
      const callPutText = trade['Call/Put'] === 'C' ? 'call' : 'put';
      const tradeTypeText = trade.TradeType === 'B' ? 'bought' : 'sold';
      const premiumVerb = trade.TradeType === 'B' ? 'paying' : 'collecting';
      const underlyingSymbol = trade.UnderlyingSymbol || normalizedSymbol || 'the stock';

      const tradeDate = formatDateForVoice(trade.Date);
      const expirationDate = trade.Expiration ? formatDateForVoice(trade.Expiration) : 'N/A';

      response = `Your most recent ${callPutText} option on ${underlyingSymbol} was on ${tradeDate}. You ${tradeTypeText} ${qty} ${qty === 1 ? 'contract' : 'contracts'} of the $${strikeVal} strike, ${premiumVerb} $${premium.toFixed(2)} total premium ($${perContract.toFixed(2)} per contract). This option expires ${expirationDate}.`;
    } else if (aggregation === 'total_premium') {
      const action = tradeType === 'sell' ? 'collected' : 'paid';
      response = `You ${action} a total of $${totalNetAmount.toFixed(2)} in premium on ${tradeCount} ${normalizedSymbol || ''} ${callPut || ''} option trades (${totalContracts} contracts covering ${sharesCovered} shares)`;
      if (fromDate || toDate) {
        response += ` during the specified period`;
      }
      response += '.';
    } else if (aggregation === 'highest_strike' && data.length > 0) {
      const trade = data[0];
      const strikeVal = parseFloat(trade.Strike || '0');
      const qty = parseFloat(trade.OptionContracts || '0');
      const premium = Math.abs(parseFloat(trade.NetAmount || '0'));
      const callPutText = trade['Call/Put'] === 'C' ? 'call' : 'put';
      const tradeTypeText = trade.TradeType === 'B' ? 'bought' : 'sold';

      // Use formatDateForVoice to ensure dates match UI display
      const tradeDate = formatDateForVoice(trade.Date);
      const expirationDate = trade.Expiration ? formatDateForVoice(trade.Expiration) : 'N/A';
      response = `You ${tradeTypeText} ${qty} contracts of the $${strikeVal} strike ${callPutText} option on ${normalizedSymbol} on ${tradeDate} with expiration ${expirationDate} for a total premium of $${premium.toFixed(2)}.`;
    } else if (aggregation === 'count') {
      response = `Found ${tradeCount} trades`;
      if (normalizedSymbol) response += ` for ${normalizedSymbol}`;
      if (callPut) response += ` (${callPut} options)`;
      response += '.';
    } else {
      // Default: list trades summary with correct option math
      const stockTrades = data.filter(t => t.SecurityType === 'S');
      const optionTrades = data.filter(t => t.SecurityType === 'O');
      const buyTrades = data.filter(t => t.TradeType === 'B');
      const sellTrades = data.filter(t => t.TradeType === 'S');

      // Determine trade action based on filters or majority
      const isSellQuery = tradeType === 'sell' || (sellTrades.length > buyTrades.length);
      const action = isSellQuery ? 'sold' : 'bought';
      const premiumAction = isSellQuery ? 'collecting' : 'paying';

      if (optionTrades.length > 0 && stockTrades.length === 0) {
        // Pure option query - use precise language
        const optionType = callPut === 'call' ? 'call' : callPut === 'put' ? 'put' : '';

        response = `You ${action} ${totalContracts} ${optionType} option contracts`;
        if (normalizedSymbol) response += ` on ${normalizedSymbol}`;
        if (fromDate) response += ` ${fromDate}`;
        response += `, ${premiumAction} total premium of $${totalNetAmount.toFixed(2)}`;
        response += `. The average premium per share was $${avgPremiumPerShare.toFixed(2)}`;
        response += `, covering ${sharesCovered} shares across ${tradeCount} trades.`;
      } else {
        // Mixed or stock-only query
        response = `Found ${tradeCount} trades`;
        if (normalizedSymbol) response += ` for ${normalizedSymbol}`;
        response += ': ';

        if (stockTrades.length > 0 && optionTrades.length > 0) {
          response += `${stockTrades.length} stock trades and ${optionTrades.length} option trades`;
        } else if (optionTrades.length > 0) {
          const calls = optionTrades.filter(t => t['Call/Put'] === 'C');
          const puts = optionTrades.filter(t => t['Call/Put'] === 'P');
          response += `${optionTrades.length} option trades`;
          if (calls.length > 0 || puts.length > 0) {
            response += ` (${calls.length} calls, ${puts.length} puts)`;
          }
        } else {
          response += `${stockTrades.length} stock trades (${totalShares} shares)`;
        }

        response += `. ${buyTrades.length} buys, ${sellTrades.length} sells. Total value: $${totalNetAmount.toFixed(2)}.`;
      }
    }

    // Build uiData with all information needed for UI rendering - SINGLE SOURCE OF TRUTH
    const uiData = {
      filters: {
        symbol: normalizedSymbol || null,
        securityType: securityType || null,
        tradeType: tradeType || null,
        callPut: callPut || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        expiration: expiration || null,
        strike: strike || null,
        aggregation: aggregation || null,
      },
      trades: data.map(t => ({
        id: t.id,
        date: t.Date,
        symbol: t.Symbol,
        underlyingSymbol: t.UnderlyingSymbol,
        securityType: t.SecurityType,
        tradeType: t.TradeType,
        callPut: t['Call/Put'] || null,
        strike: t.Strike ? parseFloat(t.Strike) : null,
        expiration: t.Expiration || null,
        contracts: t.SecurityType === 'O' ? parseFloat(t.OptionContracts || '0') : null,
        shares: t.SecurityType === 'S' ? parseFloat(t.StockShareQty || '0') : null,
        premium: t.SecurityType === 'O' ? Math.abs(parseFloat(t.NetAmount || '0')) : null,
        premiumPerContract: t.SecurityType === 'O' && parseFloat(t.OptionContracts || '0') > 0
          ? Math.abs(parseFloat(t.NetAmount || '0')) / parseFloat(t.OptionContracts || '0')
          : null,
        stockPrice: t.SecurityType === 'S' ? parseFloat(t.StockTradePrice || '0') : null,
        netAmount: Math.abs(parseFloat(t.NetAmount || '0')),
      })),
      summary: {
        tradeCount,
        totalContracts,
        totalShares,
        sharesCovered,  // contracts * 100 for options
        totalNetAmount,  // Actual amount received/paid (after fees)
        totalGrossPremium,  // premium * contracts * 100
        avgPremiumPerShare,  // Average premium per share
        stockTradeCount: data.filter(t => t.SecurityType === 'S').length,
        optionTradeCount: data.filter(t => t.SecurityType === 'O').length,
        buyCount: data.filter(t => t.TradeType === 'B').length,
        sellCount: data.filter(t => t.TradeType === 'S').length,
        callCount: data.filter(t => t['Call/Put'] === 'C').length,
        putCount: data.filter(t => t['Call/Put'] === 'P').length,
      },
    };

    return NextResponse.json({ response, uiData });
  } catch (error) {
    console.error('Advanced query error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error processing your query.',
      uiData: null,
    });
  }
}
