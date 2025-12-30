/**
 * Error Recovery Utilities for FinAgent
 *
 * Provides three types of error recovery:
 * A. Wrong Symbol Suggestion - Fuzzy matching for misspelled symbols
 * B. Invalid Time Period Correction - Fuzzy matching for date/time typos
 * C. Query Failure Handling - User-friendly error messages
 */

import { createClient } from '@supabase/supabase-js';
import { parseTimePeriodToResolvedDates, ResolvedDates } from './date-parser';

const ACCOUNT_CODE = 'C40421';

// =============================================================================
// UTILITY: Levenshtein Distance
// =============================================================================

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching symbols and time periods
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// =============================================================================
// RECOVERY TYPE A: Wrong Symbol Suggestion
// =============================================================================

export interface SimilarSymbolResult {
  symbol: string;
  distance: number;
}

/**
 * Find similar symbols in the database when the queried symbol has no data
 * Uses Levenshtein distance for fuzzy matching
 */
export async function findSimilarSymbols(
  queriedSymbol: string,
  table: 'TradeData' | 'FeesAndInterest' = 'TradeData',
  maxDistance: number = 2,
  limit: number = 3
): Promise<SimilarSymbolResult[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  let symbols: string[] = [];

  try {
    if (table === 'TradeData') {
      // Get distinct symbols from TradeData (both Symbol and UnderlyingSymbol)
      const { data } = await supabase
        .from('TradeData')
        .select('Symbol, UnderlyingSymbol')
        .eq('AccountCode', ACCOUNT_CODE);

      if (data) {
        const allSymbols = data.flatMap(d => [d.Symbol, d.UnderlyingSymbol]);
        symbols = [...new Set(allSymbols.map(s => s?.toUpperCase()).filter(Boolean))] as string[];
      }
    } else {
      // Get distinct symbols from FeesAndInterest
      const { data } = await supabase
        .from('FeesAndInterest')
        .select('Symbol')
        .eq('AccountCode', ACCOUNT_CODE)
        .not('Symbol', 'is', null);

      if (data) {
        symbols = [...new Set(data.map(d => d.Symbol?.toUpperCase()).filter(Boolean))] as string[];
      }
    }
  } catch (error) {
    console.error('[findSimilarSymbols] Error fetching symbols:', error);
    return [];
  }

  // Calculate distances and filter
  const upperQuery = queriedSymbol.toUpperCase();
  const results: SimilarSymbolResult[] = symbols
    .map(sym => ({
      symbol: sym,
      distance: levenshteinDistance(upperQuery, sym),
    }))
    .filter(r => r.distance > 0 && r.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  return results;
}

/**
 * Build a suggestion message for similar symbols
 */
export function buildSymbolSuggestionMessage(
  queriedSymbol: string,
  similarSymbols: SimilarSymbolResult[]
): string | null {
  if (similarSymbols.length === 0) return null;

  if (similarSymbols.length === 1) {
    return `Did you mean ${similarSymbols[0].symbol}?`;
  }

  const suggestions = similarSymbols.slice(0, 2).map(s => s.symbol).join(' or ');
  return `Did you mean ${suggestions}?`;
}

// =============================================================================
// RECOVERY TYPE B: Invalid Time Period Correction
// =============================================================================

// Valid time period patterns for fuzzy matching
const VALID_TIME_PERIODS = [
  'today', 'yesterday', 'tomorrow',
  'this week', 'last week', 'past week',
  'this month', 'last month', 'past month',
  'this year', 'last year',
  'this quarter', 'last quarter',
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'q1', 'q2', 'q3', 'q4',
  'first quarter', 'second quarter', 'third quarter', 'fourth quarter',
  'first half', 'second half', 'h1', 'h2',
  'last 7 days', 'last 30 days', 'last 90 days',
  'the last week', 'the last month', 'the last year',
  'the last two weeks', 'the last three months', 'the last six months',
];

// Common typo corrections (direct mappings)
const TYPO_CORRECTIONS: Record<string, string> = {
  'octember': 'october',
  'septemper': 'september',
  'septmber': 'september',
  'novemebr': 'november',
  'novmber': 'november',
  'febuary': 'february',
  'febrary': 'february',
  'janurary': 'january',
  'last month ago': 'last month',
  'past week ago': 'past week',
  'past month ago': 'past month',
  'ysterday': 'yesterday',
  'yeserday': 'yesterday',
  'tommorow': 'tomorrow',
  'tomorow': 'tomorrow',
  'tomarrow': 'tomorrow',
  'lst week': 'last week',
  'lst month': 'last month',
  'ths week': 'this week',
  'ths month': 'this month',
  'ths year': 'this year',
};

export interface TimePeriodSuggestion {
  original: string;
  suggestion: string;
  distance: number;
}

/**
 * Find the closest valid time period for an invalid input
 */
export function suggestTimePeriod(invalidPeriod: string): TimePeriodSuggestion | null {
  const normalized = invalidPeriod.toLowerCase().trim();

  // Check direct typo corrections first
  if (TYPO_CORRECTIONS[normalized]) {
    return {
      original: invalidPeriod,
      suggestion: TYPO_CORRECTIONS[normalized],
      distance: 1,
    };
  }

  // Fuzzy match against valid periods
  let bestMatch: TimePeriodSuggestion | null = null;
  let minDistance = Infinity;

  for (const validPeriod of VALID_TIME_PERIODS) {
    const distance = levenshteinDistance(normalized, validPeriod);
    // Only suggest if within reasonable edit distance (scaled by length)
    const maxAllowedDistance = Math.max(2, Math.floor(validPeriod.length * 0.35));

    if (distance < minDistance && distance <= maxAllowedDistance && distance > 0) {
      minDistance = distance;
      bestMatch = {
        original: invalidPeriod,
        suggestion: validPeriod,
        distance,
      };
    }
  }

  return bestMatch;
}

export interface TimePeriodRecoveryResult {
  parsed: ResolvedDates | null;
  suggestion: string | null;
  correctedPeriod: string | null;
}

/**
 * Parse time period with fuzzy fallback
 * Returns the parsed dates if successful, or a helpful suggestion if not
 */
export function parseTimePeriodWithRecovery(timePeriod: string): TimePeriodRecoveryResult {
  // First try exact parsing
  const parsed = parseTimePeriodToResolvedDates(timePeriod);

  if (parsed) {
    return { parsed, suggestion: null, correctedPeriod: null };
  }

  // Try fuzzy correction
  const correction = suggestTimePeriod(timePeriod);

  if (correction) {
    const correctedParsed = parseTimePeriodToResolvedDates(correction.suggestion);
    if (correctedParsed) {
      return {
        parsed: correctedParsed,
        suggestion: `I interpreted "${timePeriod}" as "${correction.suggestion}".`,
        correctedPeriod: correction.suggestion,
      };
    }
  }

  // No valid parsing possible
  return {
    parsed: null,
    suggestion: `I couldn't understand "${timePeriod}". Try "last month", "this week", or a month name like "October".`,
    correctedPeriod: null,
  };
}

// =============================================================================
// RECOVERY TYPE C: Query Failure Handling
// =============================================================================

export interface QueryError {
  code: string;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

// User-friendly messages based on error type
const USER_ERROR_MESSAGES: Record<string, string> = {
  'PGRST301': 'The database connection timed out. Please try again.',
  'PGRST116': 'The requested data could not be found.',
  '22P02': 'There was an issue with the query parameters. Please try rephrasing your question.',
  '42501': 'Access denied to the requested data.',
  '42P01': 'The requested data table could not be found.',
  '42703': 'Invalid column reference in query.',
  '23505': 'Duplicate data error.',
  'NETWORK_ERROR': 'Network error. Please check your connection and try again.',
  'TIMEOUT': 'The request timed out. Please try again.',
  'FETCH_ERROR': 'Failed to fetch data. Please try again.',
};

/**
 * Log and format Supabase query errors
 * Returns a user-friendly message and logs details for debugging
 */
export function handleQueryError(
  error: unknown,
  context: { endpoint: string; params: Record<string, unknown> }
): { userMessage: string; logEntry: QueryError } {
  const timestamp = new Date().toISOString();

  let errorMessage = 'Unknown error';
  let errorCode = 'UNKNOWN';

  if (error instanceof Error) {
    errorMessage = error.message;
    if ('code' in error) {
      errorCode = String((error as { code: unknown }).code);
    }
    // Check for specific error types
    if (error.message.includes('timeout')) {
      errorCode = 'TIMEOUT';
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorCode = 'NETWORK_ERROR';
    }
  } else if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    errorMessage = String(err.message || err.error || 'Unknown error');
    errorCode = String(err.code || 'UNKNOWN');
  }

  // Log for debugging
  const logEntry: QueryError = {
    code: errorCode,
    message: errorMessage,
    timestamp,
    context: {
      endpoint: context.endpoint,
      params: context.params,
    },
  };

  console.error(`[Query Error] ${context.endpoint}:`, JSON.stringify(logEntry, null, 2));

  const userMessage = USER_ERROR_MESSAGES[errorCode] ||
    'Sorry, there was an error retrieving your data. Please try again.';

  return { userMessage, logEntry };
}

/**
 * Wrapper for Supabase queries with error recovery
 * Catches errors and returns user-friendly messages
 */
export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: unknown }>,
  context: { endpoint: string; params: Record<string, unknown> }
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await queryFn();

    if (error) {
      const { userMessage } = handleQueryError(error, context);
      return { data: null, error: userMessage };
    }

    return { data, error: null };
  } catch (err) {
    const { userMessage } = handleQueryError(err, context);
    return { data: null, error: userMessage };
  }
}

// =============================================================================
// COMBINED RECOVERY HELPER
// =============================================================================

export interface RecoveryContext {
  endpoint: string;
  symbol?: string;
  timePeriod?: string;
  table?: 'TradeData' | 'FeesAndInterest';
}

export interface RecoveryResult {
  shouldReturn: boolean;
  response?: string;
  correctedTimePeriod?: string;
  parsedDates?: ResolvedDates;
}

/**
 * Run all applicable recovery checks and return appropriate response
 * Use this at the start of webhook handlers
 */
export async function runRecoveryChecks(
  context: RecoveryContext,
  queryResultCount: number
): Promise<RecoveryResult> {
  // Recovery A: Symbol suggestion on zero results
  if (queryResultCount === 0 && context.symbol) {
    const similarSymbols = await findSimilarSymbols(
      context.symbol,
      context.table || 'TradeData'
    );
    const symbolSuggestion = buildSymbolSuggestionMessage(context.symbol, similarSymbols);

    if (symbolSuggestion) {
      return {
        shouldReturn: false, // Don't return yet, let the handler include this in the response
        response: symbolSuggestion,
      };
    }
  }

  return { shouldReturn: false };
}
