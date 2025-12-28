/**
 * Request Trace Utility
 *
 * Structured logging for voice/UI request debugging.
 * Captures the full request flow: Raw input → Resolved params → DB query → Response
 */

import { createTraceId } from './query-resolver';

// =============================================================================
// Types
// =============================================================================

export interface RequestTrace {
  traceId: string;
  timestamp: string;
  endpoint: string;
  // Input
  rawInput: {
    symbol?: string;
    timePeriod?: string;
    dateFilter?: unknown;
    tradeType?: string;
    [key: string]: unknown;
  };
  // Resolution
  resolved: {
    symbol: string;
    dateRange: {
      start: string;
      end: string;
      description: string;
    };
    instrument?: string;
    tradeType?: string;
  };
  // Query results
  queryResult: {
    rowCount: number;
    counts: {
      total: number;
      stocks: number;
      options: number;
      buys: number;
      sells: number;
    };
  };
  // Response
  response: {
    voiceText: string;
    uiDataSummary: string;
    consistencyCheck: 'passed' | 'failed' | 'skipped';
  };
  // Timing
  durationMs: number;
}

// =============================================================================
// Trace Logger
// =============================================================================

export class TraceLogger {
  private trace: Partial<RequestTrace>;
  private startTime: number;

  constructor(endpoint: string) {
    this.startTime = Date.now();
    this.trace = {
      traceId: createTraceId(),
      timestamp: new Date().toISOString(),
      endpoint,
    };
  }

  get traceId(): string {
    return this.trace.traceId!;
  }

  /**
   * Log raw input parameters
   */
  logInput(input: RequestTrace['rawInput']): void {
    this.trace.rawInput = input;
    console.log(`📥 [${this.trace.traceId}] Input:`, JSON.stringify(input, null, 2));
  }

  /**
   * Log resolved parameters
   */
  logResolved(resolved: RequestTrace['resolved']): void {
    this.trace.resolved = resolved;
    console.log(`🔍 [${this.trace.traceId}] Resolved: symbol=${resolved.symbol}, dates=${resolved.dateRange.start} to ${resolved.dateRange.end} (${resolved.dateRange.description})`);
  }

  /**
   * Log query results
   */
  logQueryResult(result: RequestTrace['queryResult']): void {
    this.trace.queryResult = result;
    const { counts } = result;
    console.log(`📊 [${this.trace.traceId}] Query: ${result.rowCount} rows, ${counts.stocks} stocks, ${counts.options} options, ${counts.buys} buys, ${counts.sells} sells`);
  }

  /**
   * Log response
   */
  logResponse(response: Omit<RequestTrace['response'], 'consistencyCheck'>, consistencyCheck: 'passed' | 'failed' | 'skipped'): void {
    this.trace.response = { ...response, consistencyCheck };
    const icon = consistencyCheck === 'passed' ? '✅' : consistencyCheck === 'failed' ? '❌' : '⏭️';
    console.log(`${icon} [${this.trace.traceId}] Response: "${response.voiceText.substring(0, 80)}..." | Consistency: ${consistencyCheck}`);
  }

  /**
   * Complete the trace and return full object
   */
  complete(): RequestTrace {
    this.trace.durationMs = Date.now() - this.startTime;
    console.log(`⏱️ [${this.trace.traceId}] Completed in ${this.trace.durationMs}ms`);
    return this.trace as RequestTrace;
  }

  /**
   * Log an error
   */
  logError(error: Error | string): void {
    const message = error instanceof Error ? error.message : error;
    console.error(`🔴 [${this.trace.traceId}] Error: ${message}`);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a new trace logger for an endpoint
 */
export function startTrace(endpoint: string): TraceLogger {
  return new TraceLogger(endpoint);
}

/**
 * Format trace for debug response field
 */
export function formatTraceForResponse(trace: RequestTrace): {
  traceId: string;
  resolvedSymbol: string;
  resolvedRange: { start: string; end: string };
  dbRowCount: number;
  computedAt: string;
  durationMs: number;
} {
  return {
    traceId: trace.traceId,
    resolvedSymbol: trace.resolved?.symbol || '',
    resolvedRange: {
      start: trace.resolved?.dateRange.start || '',
      end: trace.resolved?.dateRange.end || '',
    },
    dbRowCount: trace.queryResult?.rowCount || 0,
    computedAt: trace.timestamp,
    durationMs: trace.durationMs,
  };
}
