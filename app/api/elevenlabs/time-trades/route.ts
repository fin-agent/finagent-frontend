/**
 * Time-Based Trades Webhook
 *
 * Returns trades for a specific time period.
 * Uses unified queryTrades() to ensure voice/UI consistency.
 * Includes data availability suggestions when no data found.
 * Supports conversation context for follow-up queries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryTrades, TradeRow } from '@/src/lib/trade-query';
import { DateFilter } from '@/src/lib/query-resolver';
import { suggestDataPeriod } from '@/src/lib/data-availability';
import { formatDisplayDate, formatDateRange } from '@/src/lib/date-utils';
import { startTrace, formatTraceForResponse } from '@/src/lib/request-trace';
// Context merging disabled - ElevenLabs LLM has full conversation history and handles context better

// Format date in PACIFIC TIMEZONE to match UI display
function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const datePart = dateStr.split('T')[0];
  const date = new Date(datePart + 'T00:00:00Z');
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

// Build trade highlights for voice response
function buildTradeHighlights(rows: TradeRow[]): string {
  const stockTrades = rows.filter(t => t.SecurityType === 'S');
  const optionTrades = rows.filter(t => t.SecurityType === 'O');

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
  return highlightsText;
}

export async function POST(req: NextRequest) {
  const trace = startTrace('time-trades');

  try {
    const body = await req.json();

    // Log request body keys for debugging
    console.log('📬 [time-trades] Request body keys:', Object.keys(body));

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

    // Log input parameters (context merging disabled - ElevenLabs LLM handles context)
    trace.logInput({ symbol, timePeriod, dateFilter, calculation, tradeType });

    if (!timePeriod && !dateFilter) {
      trace.logError('No time period or date filter provided');
      return NextResponse.json({
        response: 'Please specify a time period like "last week", "yesterday", "past 5 days", "Q3", "January", or a date range like "June 1st to the 7th".',
      });
    }

    // Determine trade type filter
    const normalizedTradeType = tradeType && tradeType.toLowerCase() !== 'all'
      ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy')
      : 'all';

    // Use unified query - SINGLE SOURCE OF TRUTH
    const result = await queryTrades({
      symbol: symbol || undefined,
      timePeriod,
      dateFilter,
      tradeType: normalizedTradeType as 'buy' | 'sell' | 'all',
    });

    const { rows, counts, aggregates, metadata } = result;

    // Log resolved parameters and query results
    trace.logResolved({
      symbol: metadata.symbol,
      dateRange: metadata.dateRange,
      tradeType: normalizedTradeType,
    });
    trace.logQueryResult({
      rowCount: rows.length,
      counts,
    });

    const symbolText = metadata.symbol && metadata.symbol !== '(all)' ? ` for ${metadata.symbol}` : '';
    const description = metadata.dateRange.description;

    // Handle zero results with data availability suggestion
    if (counts.total === 0) {
      const suggestion = await suggestDataPeriod('TradeData', description);

      trace.logResponse({
        voiceText: `No trades found${symbolText} for ${description}.`,
        uiDataSummary: '0 trades',
      }, 'skipped');
      const completedTrace = trace.complete();

      if (suggestion) {
        return NextResponse.json({
          response: `No trades found${symbolText} for ${description}. However, I found ${suggestion.count} trades for ${suggestion.suggestedPeriod}. Would you like to see those instead?`,
          uiData: {
            tradeCount: 0,
            timePeriod: description,
            symbol: metadata.symbol === '(all)' ? null : metadata.symbol,
            trades: [],
            suggestion: {
              period: suggestion.suggestedPeriod,
              count: suggestion.count,
              startDate: suggestion.startDate,
              endDate: suggestion.endDate,
            },
          },
          _debug: formatTraceForResponse(completedTrace),
        });
      }

      return NextResponse.json({
        response: `No trades found${symbolText} for ${description}.`,
        uiData: {
          tradeCount: 0,
          timePeriod: description,
          symbol: metadata.symbol === '(all)' ? null : metadata.symbol,
          trades: [],
        },
        _debug: formatTraceForResponse(completedTrace),
      });
    }

    // Calculate average price if requested
    let statsText = '';
    if (calculation === 'average') {
      const stockTrades = rows.filter(t => t.SecurityType === 'S');
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

    // Build voice response with exact counts from computed data
    const totalValueStr = `$${aggregates.totalValue.toFixed(2)}`;
    const summaryLine = `You executed ${counts.total} total trades${symbolText} for ${description}: ${counts.stocks} stock trade${counts.stocks !== 1 ? 's' : ''} and ${counts.options} option trade${counts.options !== 1 ? 's' : ''} with a total value of ${totalValueStr}.`;

    // Add trade highlights
    const highlightsText = buildTradeHighlights(rows);
    const response = summaryLine + highlightsText + statsText;

    // Format dates for display
    const { start: startDate, end: endDate } = metadata.dateRange;
    const isAbsoluteMonth = /^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(description);
    const displayRange = isAbsoluteMonth ? description : formatDateRange(startDate, endDate);
    const displayStartDate = formatDisplayDate(startDate);
    const displayEndDate = formatDisplayDate(endDate);

    // Calculate trading days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const tradingDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Log response
    trace.logResponse({
      voiceText: response,
      uiDataSummary: `${counts.total} trades, ${rows.length} rows`,
    }, 'passed');
    const completedTrace = trace.complete();

    return NextResponse.json({
      response,
      uiData: {
        tradeCount: counts.total,
        stockCount: counts.stocks,
        optionCount: counts.options,
        timePeriod: description,
        displayRange,
        tradingDays,
        startDate: displayStartDate,
        endDate: displayEndDate,
        dateRange: displayRange,
        symbol: metadata.symbol === '(all)' ? null : metadata.symbol,
        totalValue: aggregates.totalValue,
        trades: rows.map(t => ({
          ...t,
          Date: formatDateForVoice(t.Date),
          displayDate: formatDisplayDate(t.Date),
        })),
      },
      _debug: formatTraceForResponse(completedTrace),
    });
  } catch (error) {
    trace.logError(error instanceof Error ? error : String(error));
    return NextResponse.json({
      response: 'Sorry, there was an error looking up your trades for that time period.',
    });
  }
}
