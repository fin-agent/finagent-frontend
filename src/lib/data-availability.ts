/**
 * Data Availability Utility
 * Checks if data exists for requested date ranges and provides helpful suggestions
 */

import { createClient } from '@supabase/supabase-js';
import type { ResolvedDates } from './date-parser';

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
