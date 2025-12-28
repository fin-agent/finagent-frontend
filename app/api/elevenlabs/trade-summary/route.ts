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
import { getConversationKey, mergeWithContext, storeContext } from '@/src/lib/conversation-context';

export async function POST(req: NextRequest) {
  const trace = startTrace('trade-summary');

  try {
    const body = await req.json();

    // Extract conversation key from ElevenLabs headers or body
    const conversationKey = getConversationKey({
      conversationId: req.headers.get('x-conversation-id') || body.conversation_id,
      agentId: req.headers.get('x-agent-id') || body.agent_id,
      sessionId: req.headers.get('x-session-id') || body.session_id,
    });

    // ElevenLabs may send symbol directly or nested in various ways
    let symbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter ||
                       body.body?.date_filter || body.body?.parameters?.date_filter;

    // Merge with conversation context if symbol is missing (follow-up query)
    const merged = mergeWithContext(conversationKey, { symbol, timePeriod, dateFilter });
    symbol = merged.symbol;

    // Log input (including context application)
    trace.logInput({ symbol, timePeriod, dateFilter, _contextApplied: merged._contextApplied });

    if (!symbol) {
      trace.logError('No symbol provided');
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
        uiData: null,
      });
    }

    // Store context for future follow-up queries
    storeContext(conversationKey, { symbol, timePeriod, dateFilter, queryType: 'trade-summary' });

    // Use unified query - SINGLE SOURCE OF TRUTH
    const result = await queryTrades({
      symbol,
      timePeriod,
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
      finalResponse = result.counts.total === 0
        ? `No trades found for ${result.metadata.symbol}.`
        : `Found ${result.counts.total} trades for ${result.metadata.symbol}.`;
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
    trace.logError(error instanceof Error ? error : String(error));
    return NextResponse.json({
      response: 'Sorry, there was an error looking up the trade summary.',
      uiData: null,
    });
  }
}
