import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { getDateOffset } from '@/src/lib/date-utils';

// LLM-resolved date filter
interface DateFilter {
  type: 'range' | 'discrete' | 'relative';
  startDate?: string;
  endDate?: string;
  dates?: string[];
  description: string;
}

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
    const dateFilter = extractParam(body, 'date_filter') as DateFilter | undefined;

    // Get date offset for demo database
    const offset = getDateOffset();
    const offsetYears = Math.round(offset / 365);
    const userYear = new Date().getFullYear();
    const dbYear = userYear + offsetYears;

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

    // Apply date range for trade date - prioritize LLM-resolved dateFilter
    let startDate: string | undefined;
    let endDate: string | undefined;
    let dates: string[] | undefined;
    let description: string = timePeriod || '';
    let resolvedType: 'range' | 'discrete' = 'range';

    if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      // LLM has already resolved the dates - apply year offset
      const startParts = dateFilter.startDate.split('-').map(Number);
      const endParts = dateFilter.endDate.split('-').map(Number);
      startDate = `${startParts[0] + offsetYears}-${String(startParts[1]).padStart(2, '0')}-${String(startParts[2]).padStart(2, '0')}`;
      endDate = `${endParts[0] + offsetYears}-${String(endParts[1]).padStart(2, '0')}-${String(endParts[2]).padStart(2, '0')}`;
      description = dateFilter.description || timePeriod || 'selected period';
      console.log(`Using LLM-resolved dateFilter: ${startDate} to ${endDate} (${description})`);
    } else if (dateFilter && dateFilter.type === 'discrete' && dateFilter.dates && dateFilter.dates.length > 0) {
      // LLM provided discrete dates - apply year offset
      dates = dateFilter.dates.map(d => {
        const parts = d.split('-').map(Number);
        return `${parts[0] + offsetYears}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
      });
      resolvedType = 'discrete';
      description = dateFilter.description || timePeriod || 'selected dates';
      console.log(`Using LLM-resolved discrete dates: ${dates.join(', ')} (${description})`);
    } else if (timePeriod) {
      // Default to full year when timePeriod is provided but no dateFilter
      startDate = `${dbYear}-01-01`;
      endDate = `${dbYear}-12-31`;
      description = timePeriod;
      console.log(`Using default year range for timePeriod "${timePeriod}": ${startDate} to ${endDate}`);
    }

    // Apply date filters to query
    if (resolvedType === 'discrete' && dates && dates.length > 0) {
      query = query.in('Date', dates);
    } else if (startDate && endDate) {
      query = query.gte('Date', startDate).lte('Date', endDate);
    }

    // Apply expiration filter - use LLM dateFilter for expiration if provided
    if (expiration) {
      // For expiration, we need to handle it separately
      // The expiration should match dates in the database
      // Apply the same year offset for consistency
      const expDateFilter = extractParam(body, 'expiration_date_filter') as DateFilter | undefined;

      if (expDateFilter && expDateFilter.type === 'range' && expDateFilter.startDate && expDateFilter.endDate) {
        const expStartParts = expDateFilter.startDate.split('-').map(Number);
        const expEndParts = expDateFilter.endDate.split('-').map(Number);
        const expStartDate = `${expStartParts[0] + offsetYears}-${String(expStartParts[1]).padStart(2, '0')}-${String(expStartParts[2]).padStart(2, '0')}`;
        const expEndDate = `${expEndParts[0] + offsetYears}-${String(expEndParts[1]).padStart(2, '0')}-${String(expEndParts[2]).padStart(2, '0')}`;
        query = query.gte('Expiration', expStartDate).lte('Expiration', expEndDate);
      } else if (expDateFilter && expDateFilter.type === 'discrete' && expDateFilter.dates && expDateFilter.dates.length > 0) {
        const expDates = expDateFilter.dates.map(d => {
          const parts = d.split('-').map(Number);
          return `${parts[0] + offsetYears}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
        });
        query = query.in('Expiration', expDates);
      } else {
        // Default: just use the expiration string as-is for simple cases like "tomorrow"
        // For demo database, apply offset to simple date references
        console.log(`Expiration filter without dateFilter: "${expiration}" - using simple match`);
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
      let filterDesc = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
      if (callPut) filterDesc += ` ${callPut}`;
      filterDesc += ' options';
      if (timePeriod) filterDesc += ` ${timePeriod}`;
      if (expiration) filterDesc += ` expiring ${expiration}`;

      return NextResponse.json({
        response: `No${filterDesc} found.`,
        uiData: {
          queryType,
          symbol: normalizedSymbol || null,
          timePeriod: description || timePeriod || null,
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
        const tradeDate = formatDateForVoice(trade.Date);
        const expirationDate = trade.Expiration ? formatDateForVoice(trade.Expiration) : 'N/A';

        response = `Your most recent ${cp} option on ${underlyingTicker} was on ${tradeDate}. You ${action} ${qty} ${qty === 1 ? 'contract' : 'contracts'} of the $${strike} strike, ${pVerb} $${premium.toFixed(2)} total premium ($${perContract.toFixed(2)} per contract). This option expires ${expirationDate}.`;
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
        const tradeDate = formatDateForVoice(trade.Date);
        const expirationDate = trade.Expiration ? formatDateForVoice(trade.Expiration) : 'N/A';

        response = `Your highest strike ${cp} option on ${underlyingTicker} was the $${strike} strike. You ${action} ${qty} ${qty === 1 ? 'contract' : 'contracts'} on ${tradeDate} for $${premium.toFixed(2)} total premium, expiring ${expirationDate}.`;
        break;
      }

      case 'total_premium': {
        // Aggregated premium
        const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
        const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
        const sharesCovered = totalContracts * 100;
        const avgPremium = totalContracts > 0 ? totalPremium / totalContracts / 100 : 0;

        response = `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${normalizedSymbol ? ` on ${normalizedSymbol}` : ''}${timePeriod ? ` ${timePeriod}` : ''}, ${premiumVerb} total premium of $${totalPremium.toFixed(2)}. The average premium per share was $${avgPremium.toFixed(2)}, covering ${sharesCovered} shares across ${data.length} trades.`;
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

        response = `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${normalizedSymbol ? ` on ${normalizedSymbol}` : ''}${timePeriod ? ` ${timePeriod}` : ''}, ${premiumVerb} total premium of $${totalPremium.toFixed(2)}. The average premium per share was $${avgPremium.toFixed(2)}, covering ${sharesCovered} shares across ${data.length} trades.`;
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
      timePeriod: description || timePeriod || null,
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
