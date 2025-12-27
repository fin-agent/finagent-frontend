import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatDisplayDate, formatDateRange, realDateToDemoDate } from '@/src/lib/date-utils';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { suggestDataPeriod } from '@/src/lib/data-availability';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';

// Helper to format date as YYYY-MM-DD
function formatDateForDB(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Time trades request body:', JSON.stringify(body, null, 2));

    // Extract parameters - support various nesting patterns from ElevenLabs
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period;
    const symbol = body.symbol || body.parameters?.symbol ||
                   body.body?.symbol || body.body?.parameters?.symbol;
    const calculation = body.calculation || body.parameters?.calculation ||
                        body.body?.calculation || body.body?.parameters?.calculation;
    const tradeType = body.trade_type || body.parameters?.trade_type ||
                      body.body?.trade_type || body.body?.parameters?.trade_type;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter ||
                       body.body?.date_filter || body.body?.parameters?.date_filter;

    if (!timePeriod && !dateFilter) {
      return NextResponse.json({
        response: 'Please specify a time period like "last week", "yesterday", "past 5 days", "Q3", "January", or a date range like "June 1st to the 7th".',
      });
    }

    // Resolve dates - prioritize LLM-resolved dateFilter
    // LLM gives dates in real calendar time, we convert to demo database dates
    let startDate: string | undefined;
    let endDate: string | undefined;
    let dates: string[] | undefined;
    let description: string = timePeriod || '';
    let resolvedType: 'range' | 'discrete' = 'range';

    if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      // LLM resolved dates in real time - convert to demo database dates
      const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
      const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
      const realStart = new Date(sy, sm - 1, sd);
      const realEnd = new Date(ey, em - 1, ed);
      startDate = formatDateForDB(realDateToDemoDate(realStart));
      endDate = formatDateForDB(realDateToDemoDate(realEnd));
      description = dateFilter.description || timePeriod || 'selected period';
      console.log(`Using LLM dateFilter: real ${dateFilter.startDate} to ${dateFilter.endDate} -> demo ${startDate} to ${endDate} (${description})`);
    } else if (dateFilter && dateFilter.type === 'discrete' && dateFilter.dates && dateFilter.dates.length > 0) {
      // LLM provided discrete dates - convert each to demo dates
      dates = dateFilter.dates.map(d => {
        const [y, m, day] = d.split('-').map(Number);
        const realDate = new Date(y, m - 1, day);
        return formatDateForDB(realDateToDemoDate(realDate));
      });
      resolvedType = 'discrete';
      description = dateFilter.description || timePeriod || 'selected dates';
      console.log(`Using LLM discrete dates: ${dateFilter.dates.join(', ')} -> demo ${dates.join(', ')} (${description})`);
    } else if (timePeriod) {
      // Fall back to parsing timePeriod string when dateFilter not provided
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
        console.log(`Parsed timePeriod "${timePeriod}": ${resolved.type}, dates: ${dates || `${startDate} to ${endDate}`}`);
      } else {
        description = timePeriod;
        console.log(`Could not parse timePeriod "${timePeriod}", querying all data`);
      }
    } else {
      // No timePeriod and no dateFilter - query all available data
      description = 'all time';
      console.log('No dateFilter or timePeriod provided, querying all data');
    }

    console.log(`Parsed time period: ${description}, type: ${resolvedType}, dates: ${dates || `${startDate} to ${endDate}`}`);

    // Build the query
    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE);

    if (resolvedType === 'discrete' && dates && dates.length > 0) {
      query = query.in('Date', dates);
    } else if (startDate && endDate) {
      query = query.gte('Date', startDate).lte('Date', endDate);
    }

    query = query.order('Date', { ascending: false });

    // Filter by symbol if provided
    const normalizedSymbol = symbol ? normalizeSymbol(symbol) : null;
    if (normalizedSymbol) {
      query = query.or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);
    }

    // Filter by trade type if provided
    if (tradeType && tradeType.toLowerCase() !== 'all') {
      const normalizedType = tradeType.toLowerCase().startsWith('s') ? 'S' : 'B';
      query = query.eq('TradeType', normalizedType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({
        response: `Error fetching trades: ${error.message}`,
      });
    }

    const trades = data || [];
    const tradeCount = trades.length;

    // Build response based on results
    const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';

    if (tradeCount === 0) {
      // Use LLM-based suggestion for a natural time period with actual count
      const suggestion = await suggestDataPeriod('TradeData', description);

      if (suggestion) {
        return NextResponse.json({
          response: `No trades found${symbolText} for ${description}. However, I found ${suggestion.count} trades for ${suggestion.suggestedPeriod}. Would you like to see those instead?`,
          uiData: {
            tradeCount: 0,
            timePeriod: description,
            symbol: normalizedSymbol,
            trades: [],
            suggestion: {
              period: suggestion.suggestedPeriod,
              count: suggestion.count,
              startDate: suggestion.startDate,
              endDate: suggestion.endDate,
            },
          }
        });
      }

      return NextResponse.json({
        response: `No trades found${symbolText} for ${description}.`,
        uiData: {
          tradeCount: 0,
          timePeriod: description,
          symbol: normalizedSymbol,
          trades: [],
        }
      });
    }

    // Calculate statistics
    const stockTrades = trades.filter(t => t.SecurityType === 'S');
    const optionTrades = trades.filter(t => t.SecurityType === 'O');
    const stockCount = stockTrades.length;
    const optionCount = optionTrades.length;

    // Calculate average price if requested (weighted by shares)
    let statsText = '';
    if (calculation === 'average') {
      const validTrades = stockTrades
        .map(t => ({
          price: parseFloat(t.StockTradePrice || '0'),
          shares: parseFloat(t.StockShareQty || '0'),
        }))
        .filter(t => t.price > 0 && t.shares > 0);

      if (validTrades.length > 0) {
        const totalShares = validTrades.reduce((sum, t) => sum + t.shares, 0);
        const totalNotional = validTrades.reduce((sum, t) => sum + t.price * t.shares, 0);
        const avgPrice = totalShares > 0 ? totalNotional / totalShares : 0;
        statsText = ` The average price was $${avgPrice.toFixed(2)}.`;
      }
    }

    // Calculate total value
    const totalValue = trades.reduce((sum, t) => {
      const netAmount = Math.abs(parseFloat(t.NetAmount || '0'));
      return sum + netAmount;
    }, 0);

    // Format dates for display - use description for absolute months (e.g., "September")
    // formatDateRange applies offset which is wrong for absolute month queries
    const isAbsoluteMonth = /^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(description);
    const displayRange = isAbsoluteMonth
      ? description
      : resolvedType === 'discrete' && dates
        ? dates.map(d => formatDisplayDate(d)).join(', ')
        : formatDateRange(startDate || '', endDate || '');

    // Calculate trading days
    let tradingDays = 1;
    if (resolvedType === 'discrete' && dates) {
      tradingDays = dates.length;
    } else if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      tradingDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    // Build response message with explicit counts
    // TTS requires no commas in numbers - commas break speech synthesis
    const totalValueStr = `$${totalValue.toFixed(2)}`;

    // Always state the exact counts clearly
    const summaryLine = `You executed ${tradeCount} total trades${symbolText} for ${description}: ${stockCount} stock trade${stockCount !== 1 ? 's' : ''} and ${optionCount} option trade${optionCount !== 1 ? 's' : ''} with a total value of ${totalValueStr}.`;

    const stockHighlights = stockTrades.slice(0, 2).map(t => {
      const action = t.TradeType === 'B' ? 'buying' : 'selling';
      const shares = parseInt(t.StockShareQty || '0');
      const price = parseFloat(t.StockTradePrice || '0');
      return `${action} ${shares} shares of ${t.Symbol} at $${price.toFixed(2)}`;
    });

    const optionHighlights = optionTrades.slice(0, 2).map(t => {
      const action = t.TradeType === 'B' ? 'buying' : 'selling';
      const contracts = parseInt(t.OptionContracts || '0');
      const premium = parseFloat(t.OptionTradePremium || '0');
      const callPut = t['Call/Put'] === 'C' ? 'call' : 'put';
      const rawSymbol = String(t.Symbol || '');
      const parsedUnderlying = rawSymbol.match(/^[A-Z]{1,6}/)?.[0];
      const underlying = t.UnderlyingSymbol || parsedUnderlying || rawSymbol;
      const strike = t.Strike ? `$${t.Strike}` : null;
      const instrumentText = strike ? `${underlying} ${strike}` : underlying;
      return `${action} ${contracts} ${instrumentText} ${callPut} contracts at $${premium.toFixed(2)} premium`;
    });

    let highlightsText = '';
    if (stockHighlights.length > 0) {
      highlightsText += ` Stock trades included ${stockHighlights.join(' and ')}.`;
    }
    if (optionHighlights.length > 0) {
      highlightsText += ` Option trades included ${optionHighlights.join(' and ')}.`;
    }

    const response = summaryLine + highlightsText + statsText;

    // Convert individual dates for display (applying date offset)
    const displayStartDate = startDate ? formatDisplayDate(startDate) : '';
    const displayEndDate = endDate ? formatDisplayDate(endDate) : '';

    return NextResponse.json({
      response,
      uiData: {
        tradeCount,
        stockCount,
        optionCount,
        timePeriod: description,
        displayRange,
        tradingDays,
        // Use display-formatted dates so agent uses correct dates
        startDate: displayStartDate,
        endDate: displayEndDate,
        dateRange: displayRange, // Also provide explicit date range string
        symbol: normalizedSymbol,
        totalValue: Math.round(totalValue * 100) / 100,
        trades: trades.map(t => ({
          ...t,
          // Replace raw DB date with formatted display date (NO offset - must match UI)
          Date: formatDateForVoice(t.Date),
          displayDate: formatDisplayDate(t.Date),
        })),
      }
    });
  } catch (error) {
    console.error('Time trades error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error looking up your trades for that time period.',
    });
  }
}
