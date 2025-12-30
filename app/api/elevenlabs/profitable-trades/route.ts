import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { calculateRealizedMatchesFIFO, filterProfitableTrades } from '@/src/lib/profitable-trades';
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Profitable trades request:', JSON.stringify(body, null, 2));

    const symbol = body.symbol || body.parameters?.symbol;
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter ||
                       body.body?.date_filter || body.body?.parameters?.date_filter;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
        uiData: null,
      });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    // Recovery Type B: Validate and correct time period if needed
    let correctedTimePeriod = timePeriod;
    if (timePeriod && !dateFilter) {
      const recovery = parseTimePeriodWithRecovery(timePeriod);
      if (!recovery.parsed && recovery.suggestion) {
        // Time period couldn't be parsed - return helpful message
        console.log(`[profitable-trades] Invalid time period: ${timePeriod}`);
        return NextResponse.json({
          response: recovery.suggestion,
          uiData: null,
        });
      }
      if (recovery.correctedPeriod) {
        correctedTimePeriod = recovery.correctedPeriod;
        console.log(`[profitable-trades] Corrected time period: "${timePeriod}" -> "${correctedTimePeriod}"`);
      }
    }

    // Resolve dates for filtering profitable trades by sell date
    let startDate: string | undefined;
    let endDate: string | undefined;
    let dates: string[] | undefined;
    let description: string = correctedTimePeriod || '';
    let resolvedType: 'range' | 'discrete' = 'range';

    if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
      const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
      const realStart = new Date(sy, sm - 1, sd);
      const realEnd = new Date(ey, em - 1, ed);
      startDate = formatDateForDB(realStart);
      endDate = formatDateForDB(realEnd);
      description = dateFilter.description || timePeriod || 'selected period';
      console.log(`Using LLM dateFilter: ${dateFilter.startDate} to ${dateFilter.endDate} -> ${startDate} to ${endDate} (${description})`);
    } else if (dateFilter && dateFilter.type === 'discrete' && dateFilter.dates && dateFilter.dates.length > 0) {
      dates = dateFilter.dates.map(d => {
        const [y, m, day] = d.split('-').map(Number);
        const date = new Date(y, m - 1, day);
        return formatDateForDB(date);
      });
      resolvedType = 'discrete';
      description = dateFilter.description || timePeriod || 'selected dates';
      console.log(`Using LLM discrete dates: ${dateFilter.dates.join(', ')} -> demo ${dates.join(', ')} (${description})`);
    } else if (correctedTimePeriod) {
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
        console.log(`Could not parse timePeriod "${correctedTimePeriod}", showing all profitable trades`);
      }
    }

    // Build time period label for responses
    const periodLabelFor = description ? ` for ${description}` : '';

    // Fetch ALL trades for FIFO matching (we need complete history for accurate matching)
    const { data: trades, error } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: true })
      .order('TradeID', { ascending: true });

    if (error) {
      return NextResponse.json({
        response: `Error fetching trades: ${error.message}`,
        uiData: null,
      });
    }

    const allTrades = trades || [];
    if (allTrades.length === 0) {
      // Recovery Type A: Check for similar symbols
      const similarSymbols = await findSimilarSymbols(normalizedSymbol, 'TradeData');
      const symbolSuggestion = buildSymbolSuggestionMessage(normalizedSymbol, similarSymbols);

      // Check if symbol exists elsewhere (e.g., in fees)
      const presence = await checkSymbolPresence(normalizedSymbol, 'TradeData');
      let responseText = `No trades found for ${normalizedSymbol}${periodLabelFor}.`;
      if (presence.context) {
        const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
        responseText += ` However, ${contextLower} Would you like to see those instead?`;
      } else if (symbolSuggestion) {
        // Add symbol suggestion if no other context available
        responseText += ` ${symbolSuggestion}`;
      }

      return NextResponse.json({
        response: responseText,
        uiData: {
          symbol: normalizedSymbol,
          profitableTrades: [],
          totalProfit: 0,
          tradeCount: 0,
          timePeriod: description || undefined,
          symbolContext: presence.context || undefined,
        },
      });
    }

    const matchedTrades = calculateRealizedMatchesFIFO(allTrades, normalizedSymbol);
    let { profitableTrades, totalProfit } = filterProfitableTrades(matchedTrades);

    // Filter profitable trades by sell date if time period was specified
    if (startDate && endDate) {
      profitableTrades = profitableTrades.filter(t => {
        const sellDate = t.sellDate;
        return sellDate >= startDate && sellDate <= endDate;
      });
      totalProfit = profitableTrades.reduce((sum, t) => sum + t.profitLoss, 0);
      console.log(`Filtered to ${profitableTrades.length} profitable trades closed between ${startDate} and ${endDate}`);
    } else if (resolvedType === 'discrete' && dates && dates.length > 0) {
      profitableTrades = profitableTrades.filter(t => dates!.includes(t.sellDate));
      totalProfit = profitableTrades.reduce((sum, t) => sum + t.profitLoss, 0);
      console.log(`Filtered to ${profitableTrades.length} profitable trades closed on discrete dates`);
    }

    if (profitableTrades.length === 0) {
      return NextResponse.json({
        response: `No completed profitable trades found for ${normalizedSymbol}${periodLabelFor}. Your positions may still be open.`,
        uiData: {
          symbol: normalizedSymbol,
          profitableTrades: [],
          totalProfit: 0,
          tradeCount: 0,
          timePeriod: description || undefined,
        },
      });
    }

    const top = profitableTrades[0];
    const response = top
      ? `For ${normalizedSymbol}${periodLabelFor}, you have ${profitableTrades.length} profitable trades with total realized profit $${totalProfit.toFixed(2)}. Your top profit was $${top.profitLoss.toFixed(2)} from ${top.buyDate} to ${top.sellDate}.`
      : `For ${normalizedSymbol}${periodLabelFor}, you have ${profitableTrades.length} profitable trades with total realized profit $${totalProfit.toFixed(2)}.`;

    // Build uiData with all information needed for UI rendering - SINGLE SOURCE OF TRUTH
    const uiData = {
      symbol: normalizedSymbol,
      totalProfit,
      tradeCount: profitableTrades.length,
      timePeriod: description || undefined,
      topTrade: top ? {
        profitLoss: top.profitLoss,
        buyDate: top.buyDate,
        sellDate: top.sellDate,
        quantity: top.quantity,
        buyPrice: top.buyPrice,
        sellPrice: top.sellPrice,
      } : null,
      profitableTrades: profitableTrades.map(t => ({
        profitLoss: t.profitLoss,
        buyDate: t.buyDate,
        sellDate: t.sellDate,
        quantity: t.quantity,
        buyPrice: t.buyPrice,
        sellPrice: t.sellPrice,
        securityType: t.securityType,
      })),
    };

    return NextResponse.json({ response, uiData });
  } catch (error) {
    // Recovery Type C: Handle query failures gracefully
    const { userMessage, logEntry } = handleQueryError(error, {
      endpoint: 'profitable-trades',
      params: { symbol: 'unknown', timePeriod: 'unknown' },
    });

    console.error(`[profitable-trades] [${logEntry.code}] ${logEntry.message}`);

    return NextResponse.json({
      response: userMessage,
      uiData: null,
    });
  }
}
