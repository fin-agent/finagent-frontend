import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';
import { formatDisplayDate, formatDateRange } from '@/src/lib/date-utils';
import { normalizeSymbol, symbolToCompanyName } from '@/src/lib/symbol-utils';
import { suggestDataPeriod } from '@/src/lib/data-availability';
import { formatCurrencyForTTS, formatNumberForTTS } from '@/src/lib/tts-utils';

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

    if (!timePeriod) {
      return NextResponse.json({
        response: 'Please specify a time period like "last week", "yesterday", "past 5 days", "November 18th", "June 1st to the 7th", or a day name like "Monday".',
      });
    }

    // Parse the time period using centralized parser
    const resolved = parseTimePeriodToResolvedDates(timePeriod);
    if (!resolved) {
      return NextResponse.json({
        response: `I couldn't understand the time period "${timePeriod}". Try "last week", "yesterday", "past 5 days", "November 18th", "June 1st to the 7th", "August and September", or a day name like "Monday".`,
      });
    }

    const { startDate, endDate, dates, description } = resolved;
    console.log(`Parsed time period: ${description}, type: ${resolved.type}, dates: ${dates || `${startDate} to ${endDate}`}`);

    // Build the query
    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE);

    if (resolved.type === 'discrete' && dates && dates.length > 0) {
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

    // Use company name for natural voice output (e.g., "Tesla" instead of "T S L A")
    const companyName = normalizedSymbol ? symbolToCompanyName(normalizedSymbol) : '';

    // Build response based on results
    const symbolText = companyName ? ` for ${companyName}` : '';

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
        statsText = ` The average price was ${formatCurrencyForTTS(avgPrice)}.`;
      }
    }

    // Calculate total value
    const totalValue = trades.reduce((sum, t) => {
      const netAmount = Math.abs(parseFloat(t.NetAmount || '0'));
      return sum + netAmount;
    }, 0);

    // Format dates for display - handle both discrete and range
    const displayRange = resolved.type === 'discrete' && dates
      ? dates.map(d => formatDisplayDate(d)).join(', ')
      : formatDateRange(startDate || '', endDate || '');

    // Calculate trading days
    let tradingDays = 1;
    if (resolved.type === 'discrete' && dates) {
      tradingDays = dates.length;
    } else if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      tradingDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    // Build response message with explicit counts
    // TTS requires numbers spelled out as words for proper pronunciation
    const totalValueStr = formatCurrencyForTTS(totalValue);

    // Always state the exact counts clearly - use words for natural TTS
    const summaryLine = `You executed ${formatNumberForTTS(tradeCount)} total trades${symbolText} for ${description}: ${formatNumberForTTS(stockCount)} stock trade${stockCount !== 1 ? 's' : ''} and ${formatNumberForTTS(optionCount)} option trade${optionCount !== 1 ? 's' : ''} with a total value of ${totalValueStr}.`;

    const stockHighlights = stockTrades.slice(0, 2).map(t => {
      const action = t.TradeType === 'B' ? 'buying' : 'selling';
      const shares = parseInt(t.StockShareQty || '0');
      const price = parseFloat(t.StockTradePrice || '0');
      // Use company name and TTS-friendly currency format
      const stockName = symbolToCompanyName(t.Symbol || '');
      return `${action} ${formatNumberForTTS(shares)} shares of ${stockName} at ${formatCurrencyForTTS(price)}`;
    });

    const optionHighlights = optionTrades.slice(0, 2).map(t => {
      const action = t.TradeType === 'B' ? 'buying' : 'selling';
      const contracts = parseInt(t.OptionContracts || '0');
      const premium = parseFloat(t.OptionTradePremium || '0');
      const callPut = t['Call/Put'] === 'C' ? 'call' : 'put';
      const rawSymbol = String(t.Symbol || '');
      const parsedUnderlying = rawSymbol.match(/^[A-Z]{1,6}/)?.[0];
      const underlying = t.UnderlyingSymbol || parsedUnderlying || rawSymbol;
      // Use company name and TTS-friendly formats
      const underlyingName = symbolToCompanyName(underlying);
      const strike = t.Strike ? `${formatCurrencyForTTS(parseFloat(t.Strike))}` : null;
      const instrumentText = strike ? `${underlyingName} ${strike}` : underlyingName;
      return `${action} ${formatNumberForTTS(contracts)} ${instrumentText} ${callPut} contracts at ${formatCurrencyForTTS(premium)} premium`;
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
