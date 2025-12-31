import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { formatDateForDB } from '@/src/lib/date-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';
import { checkSymbolPresence } from '@/src/lib/symbol-lookup';
import {
  findSimilarSymbols,
  buildSymbolSuggestionMessage,
  parseTimePeriodWithRecovery,
  handleQueryError,
} from '@/src/lib/error-recovery';

// LLM-resolved date filter
interface DateFilter {
  type: 'range' | 'discrete' | 'relative';
  startDate?: string;
  endDate?: string;
  dates?: string[];
  description: string;
}

// Format date for voice output - parse as local time to avoid UTC timezone shift
// Database stores dates as YYYY-MM-DD, we display them verbatim
function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';

  // Parse YYYY-MM-DD as local time to avoid UTC → local timezone shift
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (isNaN(date.getTime())) return dateStr;

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

    // Recovery Type B: Validate and correct time period if needed
    let correctedTimePeriod = timePeriod;
    if (timePeriod && !dateFilter) {
      const recovery = parseTimePeriodWithRecovery(timePeriod);
      if (!recovery.parsed && recovery.suggestion) {
        console.log(`[options] Invalid time period: ${timePeriod}`);
        return NextResponse.json({
          response: recovery.suggestion,
          uiData: null,
        });
      }
      if (recovery.correctedPeriod) {
        correctedTimePeriod = recovery.correctedPeriod;
        console.log(`[options] Corrected time period: "${timePeriod}" -> "${correctedTimePeriod}"`);
      }
    }

    // Apply date range for trade date - prioritize LLM-resolved dateFilter, fall back to parsing timePeriod
    let startDate: string | undefined;
    let endDate: string | undefined;
    let dates: string[] | undefined;
    let description: string = correctedTimePeriod || '';
    let resolvedType: 'range' | 'discrete' = 'range';

    if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      // LLM has resolved the dates in real calendar time - convert to demo database dates
      const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
      const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
      const realStart = new Date(sy, sm - 1, sd);
      const realEnd = new Date(ey, em - 1, ed);
      startDate = formatDateForDB(realStart);
      endDate = formatDateForDB(realEnd);
      description = dateFilter.description || timePeriod || 'selected period';
      console.log(`Using LLM dateFilter: real ${dateFilter.startDate} to ${dateFilter.endDate} -> demo ${startDate} to ${endDate} (${description})`);
    } else if (dateFilter && dateFilter.type === 'discrete' && dateFilter.dates && dateFilter.dates.length > 0) {
      // LLM provided discrete dates - use directly
      dates = dateFilter.dates.map(d => {
        const [y, m, day] = d.split('-').map(Number);
        const date = new Date(y, m - 1, day);
        return formatDateForDB(date);
      });
      resolvedType = 'discrete';
      description = dateFilter.description || timePeriod || 'selected dates';
      console.log(`Using LLM discrete dates: ${dateFilter.dates.join(', ')} -> demo ${dates.join(', ')} (${description})`);
    } else if (correctedTimePeriod) {
      // Fall back to parsing timePeriod string when dateFilter not provided
      const resolved = parseTimePeriodToResolvedDates(correctedTimePeriod);
      if (resolved) {
        if (resolved.type === 'discrete' && resolved.dates) {
          dates = resolved.dates;
          resolvedType = 'discrete';
        } else if (resolved.startDate && resolved.endDate) {
          startDate = resolved.startDate;
          endDate = resolved.endDate;
        }
        description = resolved.description || correctedTimePeriod;
        console.log(`Parsed timePeriod "${correctedTimePeriod}": ${resolved.type}, dates: ${dates || `${startDate} to ${endDate}`}`);
      } else {
        description = correctedTimePeriod;
        console.log(`Could not parse timePeriod "${correctedTimePeriod}", querying all data`);
      }
    }

    // Apply date filters to query
    if (resolvedType === 'discrete' && dates && dates.length > 0) {
      query = query.in('Date', dates);
    } else if (startDate && endDate) {
      query = query.gte('Date', startDate).lte('Date', endDate);
    }

    // Apply expiration filter - use LLM dateFilter for expiration if provided
    if (expiration) {
      const expDateFilter = extractParam(body, 'expiration_date_filter') as DateFilter | undefined;

      if (expDateFilter && expDateFilter.type === 'range' && expDateFilter.startDate && expDateFilter.endDate) {
        // Use real calendar dates directly
        const [sy, sm, sd] = expDateFilter.startDate.split('-').map(Number);
        const [ey, em, ed] = expDateFilter.endDate.split('-').map(Number);
        const expStartDate = formatDateForDB(new Date(sy, sm - 1, sd));
        const expEndDate = formatDateForDB(new Date(ey, em - 1, ed));
        query = query.gte('Expiration', expStartDate).lte('Expiration', expEndDate);
      } else if (expDateFilter && expDateFilter.type === 'discrete' && expDateFilter.dates && expDateFilter.dates.length > 0) {
        // Use discrete dates directly
        const expDates = expDateFilter.dates.map(d => {
          const [y, m, day] = d.split('-').map(Number);
          return formatDateForDB(new Date(y, m - 1, day));
        });
        query = query.in('Expiration', expDates);
      } else {
        // Fall back to parsing expiration string
        const expResolved = parseTimePeriodToResolvedDates(expiration);
        if (expResolved && expResolved.startDate && expResolved.endDate) {
          query = query.gte('Expiration', expResolved.startDate).lte('Expiration', expResolved.endDate);
        } else {
          console.log(`Could not parse expiration "${expiration}", skipping expiration filter`);
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
      let filterDesc = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
      if (callPut) filterDesc += ` ${callPut}`;
      filterDesc += ' options';
      if (correctedTimePeriod) filterDesc += ` ${correctedTimePeriod}`;
      if (expiration) filterDesc += ` expiring ${expiration}`;

      // Recovery Type A: Check for similar symbols
      let symbolSuggestion: string | null = null;
      if (normalizedSymbol) {
        const similarSymbols = await findSimilarSymbols(normalizedSymbol, 'TradeData');
        symbolSuggestion = buildSymbolSuggestionMessage(normalizedSymbol, similarSymbols);
      }

      // Check if symbol exists elsewhere (trades or fees)
      let symbolContext: string | undefined;
      if (normalizedSymbol) {
        const presence = await checkSymbolPresence(normalizedSymbol);
        if (presence.context) {
          symbolContext = presence.context;
        }
      }

      let responseText = `No${filterDesc} found.`;
      if (symbolContext) {
        const contextLower = symbolContext.charAt(0).toLowerCase() + symbolContext.slice(1);
        responseText += ` However, ${contextLower} Would you like to see those instead?`;
      } else if (symbolSuggestion) {
        responseText += ` ${symbolSuggestion}`;
      }

      return NextResponse.json({
        response: responseText,
        uiData: {
          queryType,
          symbol: normalizedSymbol || null,
          timePeriod: description || correctedTimePeriod || null,
          expiration: expiration || null,
          tradeType: tradeType || null,
          callPut: callPut || null,
          trades: [],
          summary: null,
          symbolContext: symbolContext || undefined,
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
        const premium = Math.abs(parseFloat(trade.GrossAmount || '0'));
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
        const premium = Math.abs(parseFloat(trade.GrossAmount || '0'));
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
        const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.GrossAmount || '0')), 0);
        const sharesCovered = totalContracts * 100;
        const avgPremium = totalContracts > 0 ? totalPremium / totalContracts / 100 : 0;

        response = `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${normalizedSymbol ? ` on ${normalizedSymbol}` : ''}${timePeriod ? ` ${timePeriod}` : ''}, ${premiumVerb} total premium of $${totalPremium.toFixed(2)}. The average premium per share was $${avgPremium.toFixed(2)}, covering ${sharesCovered} shares across ${data.length} trades.`;
        break;
      }

      case 'expiring': {
        // Options expiring on a date - build detailed response with symbols
        const longCalls = data.filter(t => t['Call/Put'] === 'C' && t.TradeType === 'B');
        const shortCalls = data.filter(t => t['Call/Put'] === 'C' && t.TradeType === 'S');
        const longPuts = data.filter(t => t['Call/Put'] === 'P' && t.TradeType === 'B');
        const shortPuts = data.filter(t => t['Call/Put'] === 'P' && t.TradeType === 'S');

        const parts: string[] = [];
        if (longCalls.length > 0) {
          const symbols = longCalls.map(t => t.UnderlyingSymbol).join(', ');
          parts.push(`${longCalls.length} long call${longCalls.length === 1 ? '' : 's'} (${symbols})`);
        }
        if (shortCalls.length > 0) {
          const symbols = shortCalls.map(t => t.UnderlyingSymbol).join(', ');
          parts.push(`${shortCalls.length} short call${shortCalls.length === 1 ? '' : 's'} (${symbols})`);
        }
        if (longPuts.length > 0) {
          const symbols = longPuts.map(t => t.UnderlyingSymbol).join(', ');
          parts.push(`${longPuts.length} long put${longPuts.length === 1 ? '' : 's'} (${symbols})`);
        }
        if (shortPuts.length > 0) {
          const symbols = shortPuts.map(t => t.UnderlyingSymbol).join(', ');
          parts.push(`${shortPuts.length} short put${shortPuts.length === 1 ? '' : 's'} (${symbols})`);
        }

        // Format expiration date with year for natural speech
        const formattedExpiration = data[0]?.Expiration
          ? formatDateForVoice(data[0].Expiration)
          : expiration || 'soon';

        const breakdown = parts.length > 0 ? `: ${parts.join(' and ')}.` : '.';
        response = `You have ${data.length} option${data.length === 1 ? '' : 's'} expiring on ${formattedExpiration}${breakdown}`;
        break;
      }

      case 'bulk':
      default: {
        // Multiple trades summary
        const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
        const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.GrossAmount || '0')), 0);
        const sharesCovered = totalContracts * 100;
        const avgPremium = totalContracts > 0 ? totalPremium / totalContracts / 100 : 0;

        response = `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${normalizedSymbol ? ` on ${normalizedSymbol}` : ''}${timePeriod ? ` ${timePeriod}` : ''}, ${premiumVerb} total premium of $${totalPremium.toFixed(2)}. The average premium per share was $${avgPremium.toFixed(2)}, covering ${sharesCovered} shares across ${data.length} trades.`;
        break;
      }
    }

    // Calculate metadata for UI - SINGLE SOURCE OF TRUTH
    const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
    const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.GrossAmount || '0')), 0);
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
        premium: Math.abs(parseFloat(t.GrossAmount || '0')),
        premiumPerContract: parseFloat(t.OptionContracts || '0') > 0
          ? Math.abs(parseFloat(t.GrossAmount || '0')) / parseFloat(t.OptionContracts || '0')
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
    // Recovery Type C: Handle query failures gracefully
    const { userMessage, logEntry } = handleQueryError(error, {
      endpoint: 'options',
      params: { queryType: 'unknown', symbol: 'unknown', timePeriod: 'unknown' },
    });

    console.error(`[options] [${logEntry.code}] ${logEntry.message}`);

    return NextResponse.json({
      response: userMessage,
      uiData: null,
    });
  }
}
