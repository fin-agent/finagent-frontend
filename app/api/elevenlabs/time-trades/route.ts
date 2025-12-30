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
import { findNearestMonthWithTrades } from '@/src/lib/data-availability';
import { formatDisplayDate, formatDateRange } from '@/src/lib/date-utils';
import { startTrace, formatTraceForResponse } from '@/src/lib/request-trace';
import { checkSymbolPresence } from '@/src/lib/symbol-lookup';
import {
  findSimilarSymbols,
  buildSymbolSuggestionMessage,
  parseTimePeriodWithRecovery,
  handleQueryError,
} from '@/src/lib/error-recovery';
// Context merging disabled - ElevenLabs LLM has full conversation history and handles context better

// Format date for voice output - parse as local time to avoid UTC timezone shift
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
    const securityType = body.security_type || body.parameters?.security_type ||
                         body.body?.security_type || body.body?.parameters?.security_type;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter ||
                       body.body?.date_filter || body.body?.parameters?.date_filter;

    // Log input parameters (context merging disabled - ElevenLabs LLM handles context)
    trace.logInput({ symbol, timePeriod, dateFilter, calculation, tradeType, securityType });

    if (!timePeriod && !dateFilter) {
      trace.logError('No time period or date filter provided');
      return NextResponse.json({
        response: 'Please specify a time period like "last week", "yesterday", "past 5 days", "Q3", "January", or a date range like "June 1st to the 7th".',
      });
    }

    // Recovery Type B: Validate and correct time period if needed
    let correctedTimePeriod = timePeriod;

    if (timePeriod && !dateFilter) {
      const recovery = parseTimePeriodWithRecovery(timePeriod);
      if (!recovery.parsed && recovery.suggestion) {
        // Time period couldn't be parsed - return helpful message
        trace.logError(`Invalid time period: ${timePeriod}`);
        return NextResponse.json({
          response: recovery.suggestion,
        });
      }
      if (recovery.correctedPeriod) {
        correctedTimePeriod = recovery.correctedPeriod;
        trace.logInput({ correctedTimePeriod, suggestion: recovery.suggestion });
      }
    }

    // Determine trade type filter
    const normalizedTradeType = tradeType && tradeType.toLowerCase() !== 'all'
      ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy')
      : 'all';

    // Determine security type filter (stock/option)
    const normalizedSecurityType = securityType && securityType.toLowerCase() !== 'all'
      ? (securityType.toLowerCase().startsWith('o') ? 'option' : 'stock')
      : 'all';

    // Use unified query - SINGLE SOURCE OF TRUTH
    const result = await queryTrades({
      symbol: symbol || undefined,
      timePeriod: correctedTimePeriod,  // Use corrected time period
      dateFilter,
      tradeType: normalizedTradeType as 'buy' | 'sell' | 'all',
      instrument: normalizedSecurityType as 'stock' | 'option' | 'all',
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

    // Handle zero results with data availability suggestion and symbol lookup
    if (counts.total === 0) {
      // Recovery Type A: Check for similar symbols if a symbol was specified
      let symbolSuggestion: string | null = null;
      if (symbol) {
        const similarSymbols = await findSimilarSymbols(symbol, 'TradeData');
        symbolSuggestion = buildSymbolSuggestionMessage(symbol, similarSymbols);
      }

      // Determine trade type filter for nearest period search
      const tradeTypeFilter = normalizedTradeType === 'buy' ? 'B' : normalizedTradeType === 'sell' ? 'S' : undefined;

      // ALWAYS use granularity-aware suggestion (respects day/week/month/quarter/year)
      // Pass symbol filter if specified, otherwise search all trades
      const nearestPeriod = await findNearestMonthWithTrades(description, {
        symbol: metadata.symbol && metadata.symbol !== '(all)' ? metadata.symbol : undefined,
        tradeType: tradeTypeFilter as 'B' | 'S' | undefined,
      });

      // If a specific symbol was queried and no nearest period found, check if it exists in other tables
      let symbolContext: string | null = null;
      if (metadata.symbol && metadata.symbol !== '(all)' && !nearestPeriod) {
        const presence = await checkSymbolPresence(metadata.symbol, 'TradeData');
        symbolContext = presence.context;
      }

      trace.logResponse({
        voiceText: `No trades found${symbolText} for ${description}.`,
        uiDataSummary: '0 trades',
      }, 'skipped');
      const completedTrace = trace.complete();

      // Build response with granularity-aware suggestion
      let responseText = `No trades found${symbolText} for ${description}.`;
      if (nearestPeriod) {
        const tradeTypeLabel = normalizedTradeType === 'buy' ? 'buy ' : normalizedTradeType === 'sell' ? 'sell ' : '';
        const tradePlural = nearestPeriod.count === 1 ? 'trade' : 'trades';
        if (metadata.symbol && metadata.symbol !== '(all)') {
          responseText = `No ${tradeTypeLabel}trades found for ${metadata.symbol} in ${description}, but I found ${nearestPeriod.count} ${tradeTypeLabel}${tradePlural} on ${nearestPeriod.suggestedPeriod}. Would you like to see those instead?`;
        } else {
          responseText = `No ${tradeTypeLabel}trades found for ${description}, but I found ${nearestPeriod.count} ${tradeTypeLabel}${tradePlural} on ${nearestPeriod.suggestedPeriod}. Would you like to see those instead?`;
        }
      } else if (symbolContext) {
        // Make first letter lowercase to flow naturally after "However, "
        const contextLower = symbolContext.charAt(0).toLowerCase() + symbolContext.slice(1);
        responseText += ` However, ${contextLower} Would you like to see those instead?`;
      } else if (symbolSuggestion) {
        // Add symbol suggestion if no other suggestions available
        responseText += ` ${symbolSuggestion}`;
      }

      return NextResponse.json({
        response: responseText,
        uiData: {
          tradeCount: 0,
          timePeriod: description,
          symbol: metadata.symbol === '(all)' ? null : metadata.symbol,
          trades: [],
          suggestion: nearestPeriod ? {
            period: nearestPeriod.suggestedPeriod,
            count: nearestPeriod.count,
            startDate: nearestPeriod.startDate,
            endDate: nearestPeriod.endDate,
          } : undefined,
          symbolContext: symbolContext || undefined,
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

    // Build voice response - context-aware based on filters applied
    const hasTradeTypeFilter = normalizedTradeType !== 'all';
    const hasSecurityTypeFilter = normalizedSecurityType !== 'all';
    const symbolName = metadata.symbol && metadata.symbol !== '(all)' ? metadata.symbol : '';

    let summaryLine: string;

    if (hasTradeTypeFilter && hasSecurityTypeFilter) {
      // Both filters: "You bought 180 shares of AAPL across 4 trades in November"
      const action = normalizedTradeType === 'buy' ? 'bought' : 'sold';
      if (normalizedSecurityType === 'stock') {
        const shares = Math.round(aggregates.totalShares);
        const symbolPart = symbolName ? ` of ${symbolName}` : '';
        const tradesPart = counts.total > 1 ? ` across ${counts.total} trades` : '';
        summaryLine = `You ${action} ${shares} shares${symbolPart}${tradesPart} in ${description}.`;
      } else {
        const contracts = Math.round(aggregates.totalContracts);
        const symbolPart = symbolName ? ` on ${symbolName}` : '';
        const tradesPart = counts.total > 1 ? ` across ${counts.total} trades` : '';
        summaryLine = `You ${action} ${contracts} option contracts${symbolPart}${tradesPart} in ${description}.`;
      }
    } else if (hasTradeTypeFilter) {
      // Only trade type filter
      const action = normalizedTradeType === 'buy' ? 'buy' : 'sell';
      summaryLine = `You made ${counts.total} ${action} trades${symbolText} in ${description}. ${counts.stocks} stock trades and ${counts.options} option trades.`;
    } else if (hasSecurityTypeFilter) {
      // Only security type filter
      if (normalizedSecurityType === 'stock') {
        summaryLine = `Found ${counts.stocks} stock trades${symbolText} in ${description}. ${counts.buys} buys and ${counts.sells} sells. Total: ${Math.round(aggregates.totalShares)} shares.`;
      } else {
        summaryLine = `Found ${counts.options} option trades${symbolText} in ${description}. ${counts.buys} buys and ${counts.sells} sells. Total: ${Math.round(aggregates.totalContracts)} contracts.`;
      }
    } else {
      // No filters: standard verbose response
      const totalValueStr = `$${aggregates.totalValue.toFixed(2)}`;
      const totalTradePlural = counts.total === 1 ? 'trade' : 'trades';
      summaryLine = `You executed ${counts.total} total ${totalTradePlural}${symbolText} for ${description}: ${counts.stocks} stock trade${counts.stocks !== 1 ? 's' : ''} and ${counts.options} option trade${counts.options !== 1 ? 's' : ''} with a total value of ${totalValueStr}.`;
    }

    // Add trade highlights only for unfiltered queries
    const highlightsText = (!hasTradeTypeFilter && !hasSecurityTypeFilter) ? buildTradeHighlights(rows) : '';
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
    // Recovery Type C: Handle query failures gracefully
    const { userMessage, logEntry } = handleQueryError(error, {
      endpoint: 'time-trades',
      params: { timePeriod: 'unknown', symbol: 'unknown' },
    });

    trace.logError(`[${logEntry.code}] ${logEntry.message}`);
    const completedTrace = trace.complete();

    return NextResponse.json({
      response: userMessage,
      _debug: formatTraceForResponse(completedTrace),
    });
  }
}
