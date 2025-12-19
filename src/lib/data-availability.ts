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
 * Use LLM to suggest a natural time period based on available data range
 */
async function suggestTimePeriodWithLLM(
  requestedPeriod: string,
  earliestDate: string,
  latestDate: string
): Promise<string> {
  try {
    const deploymentName = getEnvVar('AZURE_OPENAI_MODEL', 'gpt-5.2');
    const apiVersion = getEnvVar('AZURE_OPENAI_API_VERSION', '2024-10-21');
    const apiKey = getEnvVar('AZURE_OPENAI_API_KEY');
    const rawEndpoint = getEnvVar('AZURE_EXISTING_AIPROJECT_ENDPOINT') || getEnvVar('AZURE_OPENAI_ENDPOINT');

    if (!rawEndpoint || !apiKey) {
      console.warn('[Data Availability] Missing Azure OpenAI config, using fallback');
      return 'this year'; // Fallback
    }

    const url = new URL(rawEndpoint);
    const baseURL = `${url.origin}/openai/deployments/${deploymentName}`;
    const requestUrl = `${baseURL}/chat/completions?api-version=${apiVersion}`;

    const formattedEarliest = formatDateForDisplay(earliestDate);
    const formattedLatest = formatDateForDisplay(latestDate);

    const prompt = `The user asked for data from "${requestedPeriod}" but no data was found for that period.
Data IS available from ${formattedEarliest} to ${formattedLatest}.

Suggest a natural, conversational time period to offer the user based on the available date range.
Respond with ONLY the period name - no extra text. Examples:
- "this month"
- "the past two weeks"
- "this year"
- "the last 30 days"

Keep it concise and natural.`;

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
        temperature: 0.3,
        max_completion_tokens: 50,
      }),
    });

    if (!response.ok) {
      console.warn('[Data Availability] LLM request failed:', response.status);
      return 'this year'; // Fallback
    }

    const result = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const suggestion = result.choices[0]?.message?.content?.trim() || 'this year';
    console.log(`[Data Availability] LLM suggested period: "${suggestion}" for requested "${requestedPeriod}"`);
    return suggestion;

  } catch (error) {
    console.error('[Data Availability] LLM suggestion error:', error);
    return 'this year'; // Fallback
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
