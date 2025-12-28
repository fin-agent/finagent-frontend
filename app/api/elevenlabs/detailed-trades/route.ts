/**
 * Detailed Trades Webhook
 *
 * Returns full trade history with details for a symbol.
 * Uses unified queryTrades() to ensure voice/UI consistency.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryTrades, buildVoiceResponse, buildUIData, validateConsistency } from '@/src/lib/trade-query';
import { DateFilter } from '@/src/lib/query-resolver';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Detailed trades request body:', JSON.stringify(body, null, 2));

    // ElevenLabs may send symbol directly or nested in various ways
    const symbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;
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

    // Use unified query - SINGLE SOURCE OF TRUTH
    const result = await queryTrades({
      symbol,
      timePeriod,
      dateFilter,
      limit: 50,  // Limit for detailed view
    });

    // Build voice response from computed data (never fabricates)
    const response = buildVoiceResponse(result, {
      includeAggregates: true,   // Include value totals
      includeBreakdown: true,    // Include stock/option breakdown
    });

    // Build UI data from same query results
    const uiData = buildUIData(result);

    // Validate consistency before returning
    const consistencyErrors = validateConsistency(response, uiData);
    if (consistencyErrors.length > 0) {
      console.error('❌ [Consistency] Detailed trades voice/UI mismatch:', consistencyErrors);
      // Fall back to safe response using computed data only
      const safeResponse = result.counts.total === 0
        ? `No trades found for ${result.metadata.symbol}.`
        : `Found ${result.counts.total} trades for ${result.metadata.symbol}. Let me show you the details.`;
      return NextResponse.json({ response: safeResponse, uiData });
    }

    return NextResponse.json({ response, uiData });
  } catch (error) {
    console.error('Detailed trades error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error getting the detailed trades.',
      uiData: null,
    });
  }
}
