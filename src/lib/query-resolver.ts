/**
 * Unified Query Resolver
 *
 * Single source of truth for resolving user queries into normalized, database-ready parameters.
 * Used by both voice webhooks and UI endpoints to ensure consistency.
 *
 * This replaces scattered symbol/date resolution logic throughout the codebase.
 */

import { normalizeSymbol, resolveSymbol } from './symbol-utils';
import { parseTimePeriodToResolvedDates, resolveDateFilter } from './date-parser';

// =============================================================================
// Types
// =============================================================================

export interface DateRange {
  start: string;        // YYYY-MM-DD format for database queries
  end: string;          // YYYY-MM-DD format for database queries
  description: string;  // Human-readable description ("January 2025", "last week")
}

export interface ResolvedQuery {
  symbol: string;           // Normalized ticker (AAPL, not "Apple")
  dateRange: DateRange;
  instrument: 'stock' | 'option' | 'all';
  tradeType: 'buy' | 'sell' | 'all';
  // Metadata for debugging/tracing
  _debug?: {
    rawSymbol?: string;
    rawTimePeriod?: string;
    rawDateFilter?: unknown;
    resolvedAt: string;
  };
}

export interface DateFilter {
  type: 'range' | 'discrete' | 'relative';
  startDate?: string;
  endDate?: string;
  dates?: string[];
  period?: string;        // For relative: "last month", "yesterday"
  description: string;    // Human-readable: "June 1st to 7th"
}

export interface QueryResolverInput {
  symbol?: string;
  timePeriod?: string;
  dateFilter?: DateFilter;
  tradeType?: 'buy' | 'sell' | 'all';
  instrument?: 'stock' | 'option' | 'all';
  // If true, use LLM fallback for unknown symbols
  useLLMFallback?: boolean;
}

// =============================================================================
// Symbol Resolution
// =============================================================================

/**
 * Resolve a symbol to its normalized ticker form.
 * Handles:
 * - Company names ("Apple" → "AAPL")
 * - OCC option symbols ("AAPL251219C00190000" → "AAPL")
 * - Passthrough for already-normalized tickers
 * - Optional LLM fallback for unknown names
 */
export async function resolveSymbolInput(
  rawSymbol: string | undefined,
  useLLMFallback = false
): Promise<string> {
  if (!rawSymbol || rawSymbol.trim() === '') {
    return '';
  }

  // First try synchronous normalization (company map, OCC parsing)
  const normalized = normalizeSymbol(rawSymbol);

  // If normalization changed the symbol, we found a match
  if (normalized !== rawSymbol.toUpperCase()) {
    return normalized;
  }

  // If LLM fallback is enabled and we got passthrough, try async resolution
  if (useLLMFallback && normalized === rawSymbol.toUpperCase()) {
    try {
      const llmResolved = await resolveSymbol(rawSymbol);
      if (llmResolved && llmResolved !== rawSymbol.toUpperCase()) {
        return llmResolved;
      }
    } catch (error) {
      console.warn('[QueryResolver] LLM symbol resolution failed:', error);
    }
  }

  // Return the normalized (uppercase) version
  return normalized;
}

// =============================================================================
// Date Resolution
// =============================================================================

/**
 * Resolve date inputs to a normalized DateRange.
 * Priority:
 * 1. Explicit dateFilter with startDate/endDate
 * 2. Parse timePeriod string
 * 3. Default to current year
 */
export function resolveDateInput(
  timePeriod?: string,
  dateFilter?: DateFilter
): DateRange {
  // Priority 1: Explicit dateFilter with dates
  if (dateFilter && dateFilter.startDate && dateFilter.endDate) {
    return {
      start: dateFilter.startDate,
      end: dateFilter.endDate,
      description: dateFilter.description || timePeriod || 'selected period',
    };
  }

  // Priority 2: Use resolveDateFilter if dateFilter exists but needs parsing
  if (dateFilter) {
    const resolved = resolveDateFilter(dateFilter);
    if (resolved && resolved.startDate && resolved.endDate) {
      return {
        start: resolved.startDate,
        end: resolved.endDate,
        description: resolved.description,
      };
    }
    // For discrete dates, use first and last date as range
    if (resolved && resolved.type === 'discrete' && resolved.dates && resolved.dates.length > 0) {
      const sortedDates = [...resolved.dates].sort();
      return {
        start: sortedDates[0],
        end: sortedDates[sortedDates.length - 1],
        description: resolved.description,
      };
    }
  }

  // Priority 3: Parse timePeriod string
  if (timePeriod && timePeriod.trim() !== '') {
    const parsed = parseTimePeriodToResolvedDates(timePeriod);
    if (parsed && parsed.startDate && parsed.endDate) {
      return {
        start: parsed.startDate,
        end: parsed.endDate,
        description: parsed.description,
      };
    }
    // For discrete dates from timePeriod parsing
    if (parsed && parsed.type === 'discrete' && parsed.dates && parsed.dates.length > 0) {
      const sortedDates = [...parsed.dates].sort();
      return {
        start: sortedDates[0],
        end: sortedDates[sortedDates.length - 1],
        description: parsed.description,
      };
    }
  }

  // Default: Current year
  const now = new Date();
  const year = now.getFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    description: 'this year',
  };
}

// =============================================================================
// Main Resolver
// =============================================================================

/**
 * Unified query resolver - the single source of truth for query parameters.
 *
 * Use this in all voice webhooks and UI endpoints to ensure voice/UI consistency.
 *
 * @example
 * ```typescript
 * const resolved = await resolveQuery({
 *   symbol: 'Apple',
 *   timePeriod: 'January',
 *   tradeType: 'buy',
 * });
 * // Returns: { symbol: 'AAPL', dateRange: { start: '2025-01-01', end: '2025-01-31', description: 'January' }, ... }
 * ```
 */
export async function resolveQuery(input: QueryResolverInput): Promise<ResolvedQuery> {
  const {
    symbol: rawSymbol,
    timePeriod,
    dateFilter,
    tradeType = 'all',
    instrument = 'all',
    useLLMFallback = false,
  } = input;

  // Resolve symbol
  const symbol = await resolveSymbolInput(rawSymbol, useLLMFallback);

  // Resolve dates
  const dateRange = resolveDateInput(timePeriod, dateFilter);

  return {
    symbol,
    dateRange,
    instrument,
    tradeType,
    _debug: {
      rawSymbol,
      rawTimePeriod: timePeriod,
      rawDateFilter: dateFilter,
      resolvedAt: new Date().toISOString(),
    },
  };
}

/**
 * Synchronous version for cases where async is not needed.
 * Does NOT use LLM fallback for symbol resolution.
 */
export function resolveQuerySync(input: Omit<QueryResolverInput, 'useLLMFallback'>): ResolvedQuery {
  const {
    symbol: rawSymbol,
    timePeriod,
    dateFilter,
    tradeType = 'all',
    instrument = 'all',
  } = input;

  // Resolve symbol synchronously (no LLM fallback)
  const symbol = rawSymbol ? normalizeSymbol(rawSymbol) : '';

  // Resolve dates
  const dateRange = resolveDateInput(timePeriod, dateFilter);

  return {
    symbol,
    dateRange,
    instrument,
    tradeType,
    _debug: {
      rawSymbol,
      rawTimePeriod: timePeriod,
      rawDateFilter: dateFilter,
      resolvedAt: new Date().toISOString(),
    },
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Check if a resolved query has a valid symbol.
 * Use this before making database queries that require a symbol.
 */
export function hasValidSymbol(resolved: ResolvedQuery): boolean {
  return resolved.symbol.length > 0;
}

/**
 * Check if a resolved query has a valid date range.
 * A valid range has both start and end dates in YYYY-MM-DD format.
 */
export function hasValidDateRange(resolved: ResolvedQuery): boolean {
  const { start, end } = resolved.dateRange;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  return dateRegex.test(start) && dateRegex.test(end);
}

/**
 * Validate that start date is before or equal to end date.
 */
export function isValidDateOrder(resolved: ResolvedQuery): boolean {
  const { start, end } = resolved.dateRange;
  return start <= end;
}

/**
 * Full validation of a resolved query.
 * Returns an array of validation errors (empty if valid).
 */
export function validateResolvedQuery(resolved: ResolvedQuery): string[] {
  const errors: string[] = [];

  if (!hasValidDateRange(resolved)) {
    errors.push('Invalid date range format');
  }

  if (!isValidDateOrder(resolved)) {
    errors.push('Start date must be before or equal to end date');
  }

  return errors;
}

// =============================================================================
// Debug/Logging Helpers
// =============================================================================

/**
 * Format a resolved query for logging.
 */
export function formatResolvedQueryForLog(resolved: ResolvedQuery): string {
  const parts = [
    `symbol=${resolved.symbol || '(all)'}`,
    `dates=${resolved.dateRange.start} to ${resolved.dateRange.end}`,
    `period="${resolved.dateRange.description}"`,
  ];

  if (resolved.instrument !== 'all') {
    parts.push(`instrument=${resolved.instrument}`);
  }

  if (resolved.tradeType !== 'all') {
    parts.push(`tradeType=${resolved.tradeType}`);
  }

  return parts.join(' | ');
}

/**
 * Create a trace ID for request tracking.
 */
export function createTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}
