import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate } from '@/src/lib/date-utils';

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

const SYMBOL_MAP: Record<string, string> = {
  'apple': 'AAPL', 'google': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'microsoft': 'MSFT', 'tesla': 'TSLA',
  'nvidia': 'NVDA', 'meta': 'META', 'facebook': 'META',
  'netflix': 'NFLX', 'amd': 'AMD', 'intel': 'INTC',
  'bank of america': 'BAC', 'citigroup': 'C', 'gamestop': 'GME',
  'lucid': 'LCID', 'spy': 'SPY', 'qualcomm': 'QCOM',
};

function normalizeSymbol(input: string): string {
  const lower = input.toLowerCase().trim();
  return SYMBOL_MAP[lower] || input.toUpperCase();
}

// Parse relative dates
function parseRelativeDate(input: string): { start?: string; end?: string } {
  const demoToday = getDemoToday();
  const today = new Date(demoToday.getFullYear(), demoToday.getMonth(), demoToday.getDate());
  const lower = input.toLowerCase().trim();

  const formatDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    return { start: formatDate(startOfWeek), end: formatDate(endOfWeek) };
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

  // "last N months" pattern
  const lastNMonthsMatch = lower.match(/last\s+(\d+)\s+months?/);
  if (lastNMonthsMatch) {
    const months = parseInt(lastNMonthsMatch[1]);
    const startDate = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
    return { start: formatDate(startDate), end: formatDate(today) };
  }

  // "last N days" pattern
  const lastNDaysMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (lastNDaysMatch) {
    const days = parseInt(lastNDaysMatch[1]);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    return { start: formatDate(startDate), end: formatDate(today) };
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

/**
 * Dedicated Options Webhook for ElevenLabs
 *
 * Query Types:
 * - bulk: Multiple option trades (e.g., "Show all short calls on TSLA last month")
 * - last: Single most recent trade (e.g., "Show the last call option I bought on AAPL")
 * - expiring: Options expiring on a date (e.g., "Show me all options expiring tomorrow")
 * - highest_strike: Single trade with highest strike (e.g., "Highest strike call I sold on AAPL this year")
 * - total_premium: Aggregated premium sum (e.g., "Total premium paid for SPY options last 12 months")
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Options webhook request:', JSON.stringify(body, null, 2));

    // Extract parameters
    const queryType = extractParam(body, 'query_type') as string;
    const symbol = extractParam(body, 'symbol') as string | undefined;
    const tradeType = extractParam(body, 'trade_type') as string | undefined; // buy/sell
    const callPut = extractParam(body, 'call_put') as string | undefined; // call/put
    const timePeriod = extractParam(body, 'time_period') as string | undefined;
    const expiration = extractParam(body, 'expiration') as string | undefined;

    if (!queryType) {
      return NextResponse.json({
        response: 'Please specify a query type: bulk, last, expiring, highest_strike, or total_premium.',
      });
    }

    // Build base query
    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .eq('SecurityType', 'O'); // Options only

    // Apply symbol filter
    const normalizedSymbol = symbol ? normalizeSymbol(symbol) : undefined;
    if (normalizedSymbol) {
      query = query.or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);
    }

    // Apply trade type filter
    if (tradeType) {
      const tType = tradeType.toLowerCase() === 'buy' ? 'B' : 'S';
      query = query.eq('TradeType', tType);
    }

    // Apply call/put filter
    if (callPut) {
      const cp = callPut.toLowerCase() === 'call' ? 'C' : 'P';
      query = query.filter('"Call/Put"', 'eq', cp);
    }

    // Apply date range for trade date
    if (timePeriod) {
      const parsed = parseRelativeDate(timePeriod);
      if (parsed.start) query = query.gte('Date', parsed.start);
      if (parsed.end) query = query.lte('Date', parsed.end);
    }

    // Apply expiration filter
    if (expiration) {
      const parsed = parseRelativeDate(expiration);
      if (parsed.start === parsed.end && parsed.start) {
        query = query.eq('Expiration', parsed.start);
      } else if (parsed.start) {
        query = query.gte('Expiration', parsed.start);
        if (parsed.end) query = query.lte('Expiration', parsed.end);
      }
    }

    // Query type specific ordering and limits
    switch (queryType) {
      case 'last':
        query = query.order('Date', { ascending: false }).limit(1);
        break;
      case 'highest_strike':
        query = query.order('Strike', { ascending: false }).limit(1);
        break;
      case 'expiring':
      case 'bulk':
      case 'total_premium':
      default:
        query = query.order('Date', { ascending: false });
        break;
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({
        response: `Error executing query: ${error.message}`,
      });
    }

    if (!data || data.length === 0) {
      let filterDesc = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
      if (callPut) filterDesc += ` ${callPut}`;
      filterDesc += ' options';
      if (timePeriod) filterDesc += ` ${timePeriod}`;
      if (expiration) filterDesc += ` expiring ${expiration}`;

      return NextResponse.json({
        response: `No${filterDesc} found.`,
        query_type: queryType,
      });
    }

    // Build response based on query type
    let response = '';
    const callPutLabel = callPut === 'call' ? 'call' : callPut === 'put' ? 'put' : '';
    const actionVerb = tradeType === 'buy' ? 'bought' : tradeType === 'sell' ? 'sold' : 'traded';
    const premiumVerb = tradeType === 'sell' ? 'collecting' : 'paying';

    switch (queryType) {
      case 'last': {
        // Single most recent trade
        const trade = data[0];
        const qty = parseFloat(trade.OptionContracts || '0');
        const strike = parseFloat(trade.Strike || '0');
        const premium = Math.abs(parseFloat(trade.NetAmount || '0'));
        const perContract = qty > 0 ? premium / qty : 0;
        const cp = trade['Call/Put'] === 'C' ? 'call' : 'put';
        const action = trade.TradeType === 'B' ? 'bought' : 'sold';
        const pVerb = trade.TradeType === 'B' ? 'paying' : 'collecting';
        const underlying = trade.UnderlyingSymbol || normalizedSymbol || 'the stock';
        const tradeDate = formatCalendarDate(trade.Date);
        const expirationDate = trade.Expiration ? formatCalendarDate(trade.Expiration) : 'N/A';

        response = `Your most recent ${cp} option on ${underlying} was on ${tradeDate}. You ${action} ${qty} ${qty === 1 ? 'contract' : 'contracts'} of the $${strike} strike, ${pVerb} $${premium.toFixed(2)} total premium ($${perContract.toFixed(2)} per contract). This option expires ${expirationDate}.`;
        break;
      }

      case 'highest_strike': {
        // Single highest strike trade
        const trade = data[0];
        const qty = parseFloat(trade.OptionContracts || '0');
        const strike = parseFloat(trade.Strike || '0');
        const premium = Math.abs(parseFloat(trade.NetAmount || '0'));
        const cp = trade['Call/Put'] === 'C' ? 'call' : 'put';
        const action = trade.TradeType === 'B' ? 'bought' : 'sold';
        const underlying = trade.UnderlyingSymbol || normalizedSymbol || 'the stock';
        const tradeDate = formatCalendarDate(trade.Date);
        const expirationDate = trade.Expiration ? formatCalendarDate(trade.Expiration) : 'N/A';

        response = `Your highest strike ${cp} option on ${underlying} was the $${strike} strike. You ${action} ${qty} ${qty === 1 ? 'contract' : 'contracts'} on ${tradeDate} for $${premium.toFixed(2)} total premium, expiring ${expirationDate}.`;
        break;
      }

      case 'total_premium': {
        // Aggregated premium
        const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
        const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
        const sharesCovered = totalContracts * 100;
        const avgPremium = totalContracts > 0 ? totalPremium / totalContracts / 100 : 0;
        const symbolLabel = normalizedSymbol || '';

        response = `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${symbolLabel ? ` on ${symbolLabel}` : ''}${timePeriod ? ` ${timePeriod}` : ''}, ${premiumVerb} total premium of $${totalPremium.toFixed(2)}. The average premium per share was $${avgPremium.toFixed(2)}, covering ${sharesCovered} shares across ${data.length} trades.`;
        break;
      }

      case 'expiring': {
        // Options expiring on a date
        const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
        const callCount = data.filter(t => t['Call/Put'] === 'C').length;
        const putCount = data.filter(t => t['Call/Put'] === 'P').length;

        response = `You have ${data.length} option${data.length === 1 ? '' : 's'} expiring ${expiration || 'soon'} totaling ${totalContracts} contracts. That's ${callCount} call${callCount === 1 ? '' : 's'} and ${putCount} put${putCount === 1 ? '' : 's'}.`;
        break;
      }

      case 'bulk':
      default: {
        // Multiple trades summary
        const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
        const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
        const sharesCovered = totalContracts * 100;
        const avgPremium = totalContracts > 0 ? totalPremium / totalContracts / 100 : 0;
        const symbolLabel = normalizedSymbol || '';

        response = `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${symbolLabel ? ` on ${symbolLabel}` : ''}${timePeriod ? ` ${timePeriod}` : ''}, ${premiumVerb} total premium of $${totalPremium.toFixed(2)}. The average premium per share was $${avgPremium.toFixed(2)}, covering ${sharesCovered} shares across ${data.length} trades.`;
        break;
      }
    }

    // Calculate metadata for UI
    const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
    const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
    const callCount = data.filter(t => t['Call/Put'] === 'C').length;
    const putCount = data.filter(t => t['Call/Put'] === 'P').length;

    return NextResponse.json({
      response,
      query_type: queryType,
      trades: data,
      _meta: {
        tradeCount: data.length,
        totalContracts,
        totalPremium,
        avgPremium: totalContracts > 0 ? totalPremium / totalContracts / 100 : 0,
        sharesCovered: totalContracts * 100,
        callCount,
        putCount,
        filters: {
          symbol: normalizedSymbol,
          tradeType,
          callPut,
          timePeriod,
          expiration,
        },
      },
    });
  } catch (error) {
    console.error('Options webhook error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error processing your options query.',
    });
  }
}
