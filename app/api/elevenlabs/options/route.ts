import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol, getCompanyName } from '@/src/lib/symbol-utils';
import { parseTimePeriodToResolvedDates, type ResolvedDates } from '@/src/lib/date-parser';

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
    const companyName = normalizedSymbol ? getCompanyName(normalizedSymbol) : undefined;  // For voice output
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

    // Apply date range for trade date using centralized parser
    let resolvedTime: ResolvedDates | null = null;
    if (timePeriod) {
      resolvedTime = parseTimePeriodToResolvedDates(timePeriod);
      if (resolvedTime) {
        if (resolvedTime.type === 'discrete' && resolvedTime.dates && resolvedTime.dates.length > 0) {
          query = query.in('Date', resolvedTime.dates);
        } else if (resolvedTime.startDate && resolvedTime.endDate) {
          query = query.gte('Date', resolvedTime.startDate).lte('Date', resolvedTime.endDate);
        }
      }
    }

    // Apply expiration filter using centralized parser
    if (expiration) {
      const resolvedExp = parseTimePeriodToResolvedDates(expiration);
      if (resolvedExp) {
        if (resolvedExp.type === 'discrete' && resolvedExp.dates && resolvedExp.dates.length > 0) {
          query = query.in('Expiration', resolvedExp.dates);
        } else if (resolvedExp.startDate === resolvedExp.endDate && resolvedExp.startDate) {
          query = query.eq('Expiration', resolvedExp.startDate);
        } else if (resolvedExp.startDate) {
          query = query.gte('Expiration', resolvedExp.startDate);
          if (resolvedExp.endDate) query = query.lte('Expiration', resolvedExp.endDate);
        }
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
        uiData: null,
      });
    }

    if (!data || data.length === 0) {
      let filterDesc = companyName ? ` for ${companyName}` : '';
      if (callPut) filterDesc += ` ${callPut}`;
      filterDesc += ' options';
      if (timePeriod) filterDesc += ` ${timePeriod}`;
      if (expiration) filterDesc += ` expiring ${expiration}`;

      return NextResponse.json({
        response: `No${filterDesc} found.`,
        uiData: {
          queryType,
          symbol: normalizedSymbol || null,
          timePeriod: resolvedTime?.description || timePeriod || null,
          expiration: expiration || null,
          tradeType: tradeType || null,
          callPut: callPut || null,
          trades: [],
          summary: null,
        },
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
        const underlyingTicker = trade.UnderlyingSymbol || normalizedSymbol || 'the stock';
        const underlyingName = getCompanyName(underlyingTicker);  // Use company name for voice
        const tradeDate = formatDateForVoice(trade.Date);
        const expirationDate = trade.Expiration ? formatDateForVoice(trade.Expiration) : 'N/A';

        response = `Your most recent ${cp} option on ${underlyingName} was on ${tradeDate}. You ${action} ${qty} ${qty === 1 ? 'contract' : 'contracts'} of the $${strike} strike, ${pVerb} $${premium.toFixed(2)} total premium ($${perContract.toFixed(2)} per contract). This option expires ${expirationDate}.`;
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
        const underlyingTicker = trade.UnderlyingSymbol || normalizedSymbol || 'the stock';
        const underlyingName = getCompanyName(underlyingTicker);  // Use company name for voice
        const tradeDate = formatDateForVoice(trade.Date);
        const expirationDate = trade.Expiration ? formatDateForVoice(trade.Expiration) : 'N/A';

        response = `Your highest strike ${cp} option on ${underlyingName} was the $${strike} strike. You ${action} ${qty} ${qty === 1 ? 'contract' : 'contracts'} on ${tradeDate} for $${premium.toFixed(2)} total premium, expiring ${expirationDate}.`;
        break;
      }

      case 'total_premium': {
        // Aggregated premium
        const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
        const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
        const sharesCovered = totalContracts * 100;
        const avgPremium = totalContracts > 0 ? totalPremium / totalContracts / 100 : 0;
        const symbolLabel = companyName || '';

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
        const symbolLabel = companyName || '';

        response = `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${symbolLabel ? ` on ${symbolLabel}` : ''}${timePeriod ? ` ${timePeriod}` : ''}, ${premiumVerb} total premium of $${totalPremium.toFixed(2)}. The average premium per share was $${avgPremium.toFixed(2)}, covering ${sharesCovered} shares across ${data.length} trades.`;
        break;
      }
    }

    // Calculate metadata for UI - SINGLE SOURCE OF TRUTH
    const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
    const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
    const callCount = data.filter(t => t['Call/Put'] === 'C').length;
    const putCount = data.filter(t => t['Call/Put'] === 'P').length;

    // Build uiData with all information needed for UI rendering
    const uiData = {
      queryType,
      symbol: normalizedSymbol || null,
      timePeriod: resolvedTime?.description || timePeriod || null,
      expiration: expiration || null,
      tradeType: tradeType || null,
      callPut: callPut || null,
      trades: data.map(t => ({
        id: t.id,
        date: t.Date,
        symbol: t.Symbol,
        underlyingSymbol: t.UnderlyingSymbol,
        tradeType: t.TradeType,
        callPut: t['Call/Put'],
        strike: parseFloat(t.Strike || '0'),
        expiration: t.Expiration,
        contracts: parseFloat(t.OptionContracts || '0'),
        premium: Math.abs(parseFloat(t.NetAmount || '0')),
        premiumPerContract: parseFloat(t.OptionContracts || '0') > 0
          ? Math.abs(parseFloat(t.NetAmount || '0')) / parseFloat(t.OptionContracts || '0')
          : 0,
      })),
      summary: {
        tradeCount: data.length,
        totalContracts,
        totalPremium,
        avgPremiumPerShare: totalContracts > 0 ? totalPremium / totalContracts / 100 : 0,
        sharesCovered: totalContracts * 100,
        callCount,
        putCount,
      },
    };

    return NextResponse.json({
      response,
      uiData,
    });
  } catch (error) {
    console.error('Options webhook error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error processing your options query.',
      uiData: null,
    });
  }
}
