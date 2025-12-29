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

    // Log input parameters (context merging disabled - ElevenLabs LLM handles context)
    trace.logInput({ symbol, timePeriod, dateFilter });

    if (!symbol) {
      trace.logError('No symbol provided');
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
        uiData: null,
      });
    }

    // Use unified query - SINGLE SOURCE OF TRUTH
    const result = await queryTrades({
      symbol,
      timePeriod,
      dateFilter,
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
      const noResultsMsg = await buildNoResultsMessage(
        result.metadata.symbol,
        'trades',
        result.metadata.dateRange.description
      );

      trace.logResponse({
        voiceText: noResultsMsg,
        uiDataSummary: '0 trades',
      }, 'passed');

      const completedTrace = trace.complete();

      return NextResponse.json({
        response: noResultsMsg,
        uiData: buildUIData(result),
        _debug: formatTraceForResponse(completedTrace),
      });
    }

    // Build voice response from computed data (never fabricates)
    const response = buildVoiceResponse(result, {
      includeAggregates: true,   // Include value totals
      includeBreakdown: true,    // Include stock/option breakdown
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
    trace.logError(error instanceof Error ? error : String(error));
    return NextResponse.json({
      response: 'Sorry, there was an error getting the detailed trades.',
      uiData: null,
    });
  }
}
