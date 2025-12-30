/**
 * Detailed Trades Webhook
 *
 * Returns full trade history with details for a symbol.
 * Uses unified queryTrades() to ensure voice/UI consistency.
 * Supports conversation context for follow-up queries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryTrades, buildVoiceResponse, buildUIData, validateConsistency } from '@/src/lib/trade-query';
import { DateFilter } from '@/src/lib/query-resolver';
import { startTrace, formatTraceForResponse } from '@/src/lib/request-trace';
import { buildNoResultsMessage } from '@/src/lib/symbol-lookup';
import {
  findSimilarSymbols,
  buildSymbolSuggestionMessage,
  parseTimePeriodWithRecovery,
  handleQueryError,
} from '@/src/lib/error-recovery';
// Context merging disabled - ElevenLabs LLM has full conversation history and handles context better

export async function POST(req: NextRequest) {
  const trace = startTrace('detailed-trades');

  try {
    const body = await req.json();

    // Log request body keys for debugging
    console.log('📬 [detailed-trades] Request body keys:', Object.keys(body));

    // ElevenLabs may send symbol directly or nested in various ways
    const symbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter ||
                       body.body?.date_filter || body.body?.parameters?.date_filter;
    // Extract trade type (buy/sell) and security type (stock/option) filters
    const tradeType = body.trade_type || body.parameters?.trade_type ||
                      body.body?.trade_type || body.body?.parameters?.trade_type;
    const securityType = body.security_type || body.parameters?.security_type ||
                         body.body?.security_type || body.body?.parameters?.security_type;

    // Log input parameters (context merging disabled - ElevenLabs LLM handles context)
    trace.logInput({ symbol, timePeriod, dateFilter, tradeType, securityType });

    if (!symbol) {
      trace.logError('No symbol provided');
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
        uiData: null,
      });
    }

    // Recovery Type B: Validate and correct time period if needed
    let correctedTimePeriod = timePeriod;
    let timePeriodSuggestion: string | null = null;

    if (timePeriod && !dateFilter) {
      const recovery = parseTimePeriodWithRecovery(timePeriod);
      if (!recovery.parsed && recovery.suggestion) {
        // Time period couldn't be parsed - return helpful message
        trace.logError(`Invalid time period: ${timePeriod}`);
        return NextResponse.json({
          response: recovery.suggestion,
          uiData: null,
        });
      }
      if (recovery.correctedPeriod) {
        correctedTimePeriod = recovery.correctedPeriod;
        timePeriodSuggestion = recovery.suggestion;
        trace.logInput({ correctedTimePeriod, timePeriodSuggestion });
      }
    }

    // Use unified query - SINGLE SOURCE OF TRUTH
    const result = await queryTrades({
      symbol,
      timePeriod: correctedTimePeriod,  // Use corrected time period
      dateFilter,
      tradeType: tradeType || 'all',
      instrument: securityType || 'all',  // securityType maps to instrument in queryTrades
      limit: 50,  // Limit for detailed view
    });

    // Log resolved parameters and query results
    trace.logResolved({
      symbol: result.metadata.symbol,
      dateRange: result.metadata.dateRange,
    });
    trace.logQueryResult({
      rowCount: result.rows.length,
      counts: result.counts,
    });

    // Handle zero results with intelligent symbol lookup
    if (result.counts.total === 0) {
      // Recovery Type A: Check for similar symbols
      const similarSymbols = await findSimilarSymbols(symbol, 'TradeData');
      const symbolSuggestion = buildSymbolSuggestionMessage(symbol, similarSymbols);

      const noResultsMsg = await buildNoResultsMessage(
        result.metadata.symbol,
        'trades',
        result.metadata.dateRange.description
      );

      // Combine no results message with symbol suggestion if available
      const finalNoResultsMsg = symbolSuggestion
        ? `${noResultsMsg} ${symbolSuggestion}`
        : noResultsMsg;

      trace.logResponse({
        voiceText: finalNoResultsMsg,
        uiDataSummary: `0 trades${symbolSuggestion ? ' (suggestion: ' + symbolSuggestion + ')' : ''}`,
      }, 'passed');

      const completedTrace = trace.complete();

      return NextResponse.json({
        response: finalNoResultsMsg,
        uiData: buildUIData(result),
        _debug: formatTraceForResponse(completedTrace),
      });
    }

    // Build voice response from computed data (never fabricates)
    // Pass filter context for natural, context-aware responses
    const response = buildVoiceResponse(result, {
      includeAggregates: true,   // Include value totals
      includeBreakdown: true,    // Include stock/option breakdown
      tradeType: tradeType || 'all',      // Pass filter for context-aware response
      instrument: securityType || 'all',  // Pass filter for context-aware response
    });

    // Build UI data from same query results
    const uiData = buildUIData(result);

    // Validate consistency before returning
    const consistencyErrors = validateConsistency(response, uiData);
    let finalResponse = response;
    let consistencyStatus: 'passed' | 'failed' = 'passed';

    if (consistencyErrors.length > 0) {
      consistencyStatus = 'failed';
      trace.logError(`Consistency check failed: ${consistencyErrors.join(', ')}`);
      // Fall back to safe response using computed data only
      finalResponse = `Found ${result.counts.total} trades for ${result.metadata.symbol}. Let me show you the details.`;
    }

    // Log response
    trace.logResponse({
      voiceText: finalResponse,
      uiDataSummary: `${uiData.tradeCount} trades, ${uiData.trades.length} rows`,
    }, consistencyStatus);

    // Complete trace
    const completedTrace = trace.complete();

    return NextResponse.json({
      response: finalResponse,
      uiData,
      _debug: formatTraceForResponse(completedTrace),
    });
  } catch (error) {
    // Recovery Type C: Handle query failures gracefully
    const { userMessage, logEntry } = handleQueryError(error, {
      endpoint: 'detailed-trades',
      params: { symbol: 'unknown', timePeriod: 'unknown' },
    });

    trace.logError(`[${logEntry.code}] ${logEntry.message}`);
    const completedTrace = trace.complete();

    return NextResponse.json({
      response: userMessage,
      uiData: null,
      _debug: formatTraceForResponse(completedTrace),
    });
  }
}
