/**
 * Trade Summary Webhook
 *
 * Returns summary counts of trades for a symbol.
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
  const trace = startTrace('trade-summary');

  try {
    const body = await req.json();

    // Log request body keys for debugging
    console.log('📬 [trade-summary] Request body keys:', Object.keys(body));

    // ElevenLabs may send symbol directly or nested in various ways
    const symbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter ||
                       body.body?.date_filter || body.body?.parameters?.date_filter;

    // Log input parameters (context merging disabled - ElevenLabs LLM handles context)
    trace.logInput({ symbol, timePeriod, dateFilter });

    if (!symbol) {
      trace.logError('No symbol provided');
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
        uiData: null,
      });
    }

    // Recovery Type B: Validate and correct time period if needed
    let correctedTimePeriod = timePeriod;
    if (timePeriod && !dateFilter) {
      const recovery = parseTimePeriodWithRecovery(timePeriod);
      if (!recovery.parsed && recovery.suggestion) {
        trace.logError(`Invalid time period: ${timePeriod}`);
        return NextResponse.json({
          response: recovery.suggestion,
          uiData: null,
        });
      }
      if (recovery.correctedPeriod) {
        correctedTimePeriod = recovery.correctedPeriod;
        trace.logInput({ correctedTimePeriod, suggestion: recovery.suggestion });
      }
    }

    // Use unified query - SINGLE SOURCE OF TRUTH
    const result = await queryTrades({
      symbol,
      timePeriod: correctedTimePeriod,
      dateFilter,
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
    const response = buildVoiceResponse(result, {
      includeAggregates: false,  // Summary doesn't need value totals
      includeBreakdown: true,
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
      finalResponse = `Found ${result.counts.total} trades for ${result.metadata.symbol}.`;
    }

    // Log response
    trace.logResponse({
      voiceText: finalResponse,
      uiDataSummary: `${uiData.tradeCount} trades`,
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
      endpoint: 'trade-summary',
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
