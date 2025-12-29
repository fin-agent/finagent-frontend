/**
 * Data Availability Utility
 * Checks if data exists for requested date ranges and provides helpful suggestions
 * Uses LLM to generate natural time period descriptions
 */

import { createClient } from '@supabase/supabase-js';
import type { ResolvedDates } from './date-parser';
import { parseTimePeriodToResolvedDates } from './date-parser';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export interface DataAvailability {
  earliestDate: string;
  latestDate: string;
  hasData: boolean;
}

export type DataTable = 'TradeData' | 'FeesAndInterest' | 'AccountBalance';

/**
 * Get the earliest and latest dates with data for a given table
 *
 * @param table - Database table to check
 * @param accountCode - Account code (defaults to C40421)
 * @returns DataAvailability with date range or empty if no data
 */
export async function getDataAvailability(
  table: DataTable,
  accountCode: string = ACCOUNT_CODE
): Promise<DataAvailability> {
  try {
    // Get earliest date
    const { data: earliestData, error: earliestError } = await supabase
      .from(table)
      .select('Date')
      .eq('AccountCode', accountCode)
      .order('Date', { ascending: true })
      .limit(1);

    if (earliestError || !earliestData?.length) {
      return { earliestDate: '', latestDate: '', hasData: false };
    }

    // Get latest date
    const { data: latestData, error: latestError } = await supabase
      .from(table)
      .select('Date')
      .eq('AccountCode', accountCode)
      .order('Date', { ascending: false })
      .limit(1);

    if (latestError || !latestData?.length) {
      return { earliestDate: '', latestDate: '', hasData: false };
    }

    return {
      earliestDate: earliestData[0].Date,
      latestDate: latestData[0].Date,
      hasData: true
    };
  } catch (error) {
    console.error('Error getting data availability:', error);
    return { earliestDate: '', latestDate: '', hasData: false };
  }
}

/**
 * Format a date string for display
 */
function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Check if requested dates overlap with available data and provide suggestion if not
 *
 * @param requestedRange - The resolved dates from user query
 * @param availableRange - The data availability from database
 * @returns Suggestion message if no overlap, null if data exists for requested range
 */
export function formatDataSuggestion(
  requestedRange: ResolvedDates,
  availableRange: DataAvailability
): string | null {
  if (!availableRange.hasData) {
    return 'No data is available for this account.';
  }

  const availStart = new Date(availableRange.earliestDate);
  const availEnd = new Date(availableRange.latestDate);

  if (requestedRange.type === 'discrete' && requestedRange.dates) {
    // Check if any of the discrete dates are within available range
    const hasOverlap = requestedRange.dates.some(dateStr => {
      const date = new Date(dateStr);
      return date >= availStart && date <= availEnd;
    });

    if (!hasOverlap) {
      return `No data found for the requested dates. Data is available from ${formatDateForDisplay(availableRange.earliestDate)} to ${formatDateForDisplay(availableRange.latestDate)}.`;
    }
  } else if (requestedRange.startDate && requestedRange.endDate) {
    const reqStart = new Date(requestedRange.startDate);
    const reqEnd = new Date(requestedRange.endDate);

    // Check if requested range is entirely outside available data
    if (reqEnd < availStart || reqStart > availEnd) {
      return `No data found for ${requestedRange.description}. Data is available from ${formatDateForDisplay(availableRange.earliestDate)} to ${formatDateForDisplay(availableRange.latestDate)}.`;
    }
  }

  return null; // No suggestion needed, ranges overlap
}

/**
 * Check data availability and return suggestion for empty results
 * Convenience function that combines getDataAvailability and formatDataSuggestion
 *
 * @param table - Database table to check
 * @param requestedRange - The resolved dates from user query
 * @returns Object with suggestion message and available range info
 */
export async function checkDataAvailability(
  table: DataTable,
  requestedRange: ResolvedDates
): Promise<{
  suggestion: string | null;
  availableRange: DataAvailability;
}> {
  const availableRange = await getDataAvailability(table);
  const suggestion = formatDataSuggestion(requestedRange, availableRange);

  return { suggestion, availableRange };
}

// ============================================================================
// LLM-Based Data Period Suggestion
// ============================================================================

// Load .env.local for Azure OpenAI config (same pattern as classifier.ts)
let envLocalConfig: Record<string, string> = {};

function loadEnvLocal(): Record<string, string> {
  if (Object.keys(envLocalConfig).length > 0) return envLocalConfig;
  try {
    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const envContent = fs.readFileSync(envLocalPath, 'utf-8');
      envLocalConfig = dotenv.parse(envContent);
    }
  } catch (error) {
    console.warn('[Data Availability] Could not load .env.local:', error);
  }
  return envLocalConfig;
}

function getEnvVar(key: string, defaultValue: string = ''): string {
  const envLocal = loadEnvLocal();
  return envLocal[key]?.trim() || process.env[key]?.trim() || defaultValue;
}

/**
 * PARSEABLE_PERIODS - These are the ONLY periods that are guaranteed to parse correctly
 * The LLM suggestion must be one of these, or we use a deterministic fallback
 */
const PARSEABLE_PERIODS = [
  'this week',
  'last week',
  'this month',
  'last month',
  'this year',
  'last year',
  'the last 7 days',
  'the last 30 days',
  'the last two weeks',
  'the last three months',
  'the last six months',
  'the past week',
  'the past month',
  'the past two weeks',
  'the past three months',
  'the past six months',
];

/**
 * Calculate a deterministic suggested period based on data date range
 * This ensures we ALWAYS return a parseable period
 */
function calculateDeterministicPeriod(earliestDate: string, latestDate: string): string {
  const earliest = new Date(earliestDate);
  const latest = new Date(latestDate);

  // Calculate how many days of data we have
  const dataSpanDays = Math.ceil((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24));

  // Choose the most appropriate period based on data span
  if (dataSpanDays <= 7) {
    return 'this week';
  } else if (dataSpanDays <= 14) {
    return 'the last two weeks';
  } else if (dataSpanDays <= 31) {
    return 'this month';
  } else if (dataSpanDays <= 90) {
    return 'the last three months';
  } else if (dataSpanDays <= 180) {
    return 'the last six months';
  } else {
    return 'this year';
  }
}

/**
 * Validate that a suggested period is parseable
 */
function isParseablePeriod(period: string): boolean {
  const normalized = period.toLowerCase().trim();

  // Check against known parseable periods
  if (PARSEABLE_PERIODS.some(p => normalized === p || normalized.includes(p))) {
    return true;
  }

  // Also accept variations like "last 6 months", "past 3 months"
  if (/^(the )?(last|past) \d+ (days?|weeks?|months?|years?)$/i.test(normalized)) {
    return true;
  }

  // Try to actually parse it
  const resolved = parseTimePeriodToResolvedDates(period);
  if (!resolved) return false;
  const hasStartDate = resolved.startDate !== null && resolved.startDate !== undefined;
  const hasDates = Array.isArray(resolved.dates) && resolved.dates.length > 0;
  return hasStartDate || hasDates;
}

/**
 * Use LLM to suggest a natural time period based on available data range
 * ALWAYS returns a parseable period - uses deterministic fallback if LLM fails
 */
async function suggestTimePeriodWithLLM(
  requestedPeriod: string,
  earliestDate: string,
  latestDate: string
): Promise<string> {
  // Calculate deterministic fallback first - this is ALWAYS parseable
  const deterministicPeriod = calculateDeterministicPeriod(earliestDate, latestDate);

  try {
    const deploymentName = getEnvVar('AZURE_OPENAI_MODEL', 'gpt-5.2');
    const apiVersion = getEnvVar('AZURE_OPENAI_API_VERSION', '2024-10-21');
    const apiKey = getEnvVar('AZURE_OPENAI_API_KEY');
    const rawEndpoint = getEnvVar('AZURE_EXISTING_AIPROJECT_ENDPOINT') || getEnvVar('AZURE_OPENAI_ENDPOINT');

    if (!rawEndpoint || !apiKey) {
      console.warn('[Data Availability] Missing Azure OpenAI config, using deterministic fallback');
      return deterministicPeriod;
    }

    const url = new URL(rawEndpoint);
    const baseURL = `${url.origin}/openai/deployments/${deploymentName}`;
    const requestUrl = `${baseURL}/chat/completions?api-version=${apiVersion}`;

    const prompt = `The user asked for data from "${requestedPeriod}" but no data was found for that period.
Data IS available from ${formatDateForDisplay(earliestDate)} to ${formatDateForDisplay(latestDate)}.

Suggest a natural time period to offer the user. You MUST respond with ONLY ONE of these EXACT phrases:
- "this week"
- "last week"
- "this month"
- "last month"
- "this year"
- "the last two weeks"
- "the last three months"
- "the last six months"

Choose the one that best matches the available data range.
Respond with ONLY the period name - no other text.`;

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.1, // Low temperature for consistency
        max_completion_tokens: 30,
      }),
    });

    if (!response.ok) {
      console.warn('[Data Availability] LLM request failed:', response.status);
      return deterministicPeriod;
    }

    const result = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const suggestion = result.choices[0]?.message?.content?.trim() || '';

    // CRITICAL: Validate the suggestion is parseable
    if (suggestion && isParseablePeriod(suggestion)) {
      console.log(`[Data Availability] LLM suggested period: "${suggestion}" (validated parseable)`);
      return suggestion;
    } else {
      console.warn(`[Data Availability] LLM returned non-parseable period: "${suggestion}", using deterministic: "${deterministicPeriod}"`);
      return deterministicPeriod;
    }

  } catch (error) {
    console.error('[Data Availability] LLM suggestion error:', error);
    return deterministicPeriod;
  }
}

export interface DataPeriodSuggestion {
  suggestedPeriod: string;   // LLM-generated: "this month", "the past two weeks", etc.
  amount: number;
  count: number;
  startDate: string;
  endDate: string;
}

export interface SuggestDataPeriodFilters {
  feeType?: string;          // For FeesAndInterest: 'DebitInt', 'CreditInt', 'LocateFee'
  symbol?: string;           // For locate fees
}

export interface TradeFilters {
  symbol?: string;           // Stock symbol
  tradeType?: 'B' | 'S';     // Buy or Sell
  securityType?: 'S' | 'O';  // Stock or Option
}

export interface NearestPeriodSuggestion {
  suggestedPeriod: string;   // "October 2025", "last month", etc.
  count: number;
  startDate: string;
  endDate: string;
}

/**
 * Find the nearest month with matching trade data
 * Searches both forward and backward from the requested period
 *
 * @param requestedPeriod - What the user asked for ("September", "last month")
 * @param filters - Symbol, tradeType, securityType filters
 * @returns Suggestion with the nearest month that has data, or null if none found
 */
export async function findNearestMonthWithTrades(
  requestedPeriod: string,
  filters: TradeFilters
): Promise<NearestPeriodSuggestion | null> {
  try {
    // Build query with filters
    let query = supabase
      .from('TradeData')
      .select('Date')
      .eq('AccountCode', ACCOUNT_CODE);

    if (filters.symbol) {
      query = query.or(`Symbol.eq.${filters.symbol},UnderlyingSymbol.eq.${filters.symbol}`);
    }
    if (filters.tradeType) {
      query = query.eq('TradeType', filters.tradeType);
    }
    if (filters.securityType) {
      query = query.eq('SecurityType', filters.securityType);
    }

    const { data, error } = await query.order('Date', { ascending: false });

    if (error || !data?.length) {
      console.log('[Data Availability] No matching trades found');
      return null;
    }

    // Group trades by month
    const monthGroups: Map<string, { count: number; dates: string[] }> = new Map();

    for (const trade of data) {
      const date = new Date(trade.Date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthGroups.has(monthKey)) {
        monthGroups.set(monthKey, { count: 0, dates: [] });
      }
      const group = monthGroups.get(monthKey)!;
      group.count++;
      group.dates.push(trade.Date);
    }

    // Find the most recent month with data
    const sortedMonths = Array.from(monthGroups.entries())
      .sort((a, b) => b[0].localeCompare(a[0])); // Sort descending by month

    if (sortedMonths.length === 0) {
      return null;
    }

    // Get the most recent month with data
    const [monthKey, monthData] = sortedMonths[0];
    const [year, month] = monthKey.split('-').map(Number);

    // Format the month name
    const monthDate = new Date(year, month - 1, 1);
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Calculate date range for that month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    console.log(`[Data Availability] Nearest month with matching trades: ${monthName} (${monthData.count} trades)`);

    return {
      suggestedPeriod: monthName,
      count: monthData.count,
      startDate,
      endDate,
    };

  } catch (error) {
    console.error('[Data Availability] findNearestMonthWithTrades error:', error);
    return null;
  }
}

/**
 * Find available data and suggest a natural time period with the actual amount
 *
 * @param table - Database table to check
 * @param requestedPeriod - What the user asked for ("last week", "the other day")
 * @param filters - Optional filters for fees queries
 * @returns Suggestion with period, amount, and count, or null if no data exists
 */
export async function suggestDataPeriod(
  table: DataTable,
  requestedPeriod: string,
  filters?: SuggestDataPeriodFilters
): Promise<DataPeriodSuggestion | null> {
  try {
    if (table === 'FeesAndInterest' && filters?.feeType) {
      // Query with fee type filter to get date range
      let rangeQuery = supabase
        .from(table)
        .select('Date')
        .eq('Type', filters.feeType);

      if (filters.symbol) {
        rangeQuery = rangeQuery.eq('Symbol', filters.symbol);
      }

      const { data: rangeData, error: rangeError } = await rangeQuery.order('Date', { ascending: true });

      if (rangeError || !rangeData?.length) {
        console.log(`[Data Availability] No ${filters.feeType} data found at all`);
        return null;
      }

      const earliestDate = rangeData[0].Date;
      const latestDate = rangeData[rangeData.length - 1].Date;

      // Step 1: Get LLM to suggest a natural period
      const suggestedPeriod = await suggestTimePeriodWithLLM(requestedPeriod, earliestDate, latestDate);

      // Step 2: Parse the suggested period to get actual date range
      const resolvedDates = parseTimePeriodToResolvedDates(suggestedPeriod);

      // Step 3: Re-query with the suggested period's date range to get ACCURATE amount
      let amountQuery = supabase
        .from(table)
        .select('Date, Amount')
        .eq('Type', filters.feeType);

      if (filters.symbol) {
        amountQuery = amountQuery.eq('Symbol', filters.symbol);
      }

      if (resolvedDates && resolvedDates.startDate && resolvedDates.endDate) {
        amountQuery = amountQuery
          .gte('Date', resolvedDates.startDate)
          .lte('Date', resolvedDates.endDate);
      }

      const { data: periodData, error: periodError } = await amountQuery.order('Date', { ascending: true });

      if (periodError || !periodData?.length) {
        // Fallback to all data if period parsing failed
        console.log(`[Data Availability] Could not fetch data for suggested period "${suggestedPeriod}", using all data`);
        const totalAmount = rangeData.length; // Just count since we only selected Date
        return {
          suggestedPeriod,
          amount: 0,
          count: totalAmount,
          startDate: earliestDate,
          endDate: latestDate,
        };
      }

      // Calculate amount for the suggested period
      const totalAmount = periodData.reduce((sum, row) => sum + Math.abs(row.Amount || 0), 0);
      const count = periodData.length;

      console.log(`[Data Availability] Suggested period "${suggestedPeriod}": ${count} records, $${totalAmount.toFixed(2)}`);

      return {
        suggestedPeriod,
        amount: totalAmount,
        count,
        startDate: resolvedDates?.startDate || earliestDate,
        endDate: resolvedDates?.endDate || latestDate,
      };

    } else if (table === 'TradeData') {
      // Query trades to get date range
      const { data: rangeData, error: rangeError } = await supabase
        .from(table)
        .select('Date')
        .eq('AccountCode', ACCOUNT_CODE)
        .order('Date', { ascending: true });

      if (rangeError || !rangeData?.length) {
        console.log('[Data Availability] No trade data found at all');
        return null;
      }

      const earliestDate = rangeData[0].Date;
      const latestDate = rangeData[rangeData.length - 1].Date;

      // Step 1: Get LLM to suggest a natural period
      const suggestedPeriod = await suggestTimePeriodWithLLM(requestedPeriod, earliestDate, latestDate);

      // Step 2: Parse the suggested period to get actual date range
      const resolvedDates = parseTimePeriodToResolvedDates(suggestedPeriod);

      // Step 3: Re-query with the suggested period's date range to get ACCURATE amount
      let amountQuery = supabase
        .from(table)
        .select('Date, Commission')
        .eq('AccountCode', ACCOUNT_CODE);

      if (resolvedDates && resolvedDates.startDate && resolvedDates.endDate) {
        amountQuery = amountQuery
          .gte('Date', resolvedDates.startDate)
          .lte('Date', resolvedDates.endDate);
      }

      const { data: periodData, error: periodError } = await amountQuery.order('Date', { ascending: true });

      if (periodError || !periodData?.length) {
        console.log(`[Data Availability] Could not fetch data for suggested period "${suggestedPeriod}"`);
        return {
          suggestedPeriod,
          amount: 0,
          count: rangeData.length,
          startDate: earliestDate,
          endDate: latestDate,
        };
      }

      // Calculate commission for the suggested period
      const totalAmount = periodData.reduce((sum, row) => sum + Math.abs(row.Commission || 0), 0);
      const count = periodData.length;

      console.log(`[Data Availability] Suggested period "${suggestedPeriod}": ${count} trades, $${totalAmount.toFixed(2)} commission`);

      return {
        suggestedPeriod,
        amount: totalAmount,
        count,
        startDate: resolvedDates?.startDate || earliestDate,
        endDate: resolvedDates?.endDate || latestDate,
      };

    } else {
      // Generic query for other tables
      const availability = await getDataAvailability(table);
      if (!availability.hasData) {
        return null;
      }

      const suggestedPeriod = await suggestTimePeriodWithLLM(
        requestedPeriod,
        availability.earliestDate,
        availability.latestDate
      );

      return {
        suggestedPeriod,
        amount: 0,
        count: 0,
        startDate: availability.earliestDate,
        endDate: availability.latestDate,
      };
    }

  } catch (error) {
    console.error('[Data Availability] suggestDataPeriod error:', error);
    return null;
  }
}
