/**
 * Natural language date parsing for time-based trade queries
 * Parses expressions like "last week", "yesterday", "past 5 days", "Monday"
 *
 * IMPORTANT: Uses US Eastern timezone for consistent date calculations
 * (matches user timezone and market hours)
 */

import { formatDateForDB, realDateToDemoDate } from './date-utils';
import type { DateFilter } from './intent-detection/types';

/**
 * Get the current date in US Eastern timezone as a Date object
 * Eastern timezone aligns with NYSE/NASDAQ market hours and user's local time
 */
function getEasternToday(): Date {
  const now = new Date();
  const easternDateStr = now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = easternDateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

// Convert spelled-out numbers to digits
const wordToNumber: Record<string, number> = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
};

// Month name to number mapping (0-indexed for JavaScript Date)
const monthNameToNumber: Record<string, number> = {
  'january': 0, 'jan': 0,
  'february': 1, 'feb': 1,
  'march': 2, 'mar': 2,
  'april': 3, 'apr': 3,
  'may': 4,
  'june': 5, 'jun': 5,
  'july': 6, 'jul': 6,
  'august': 7, 'aug': 7,
  'september': 8, 'sept': 8, 'sep': 8,
  'october': 9, 'oct': 9,
  'november': 10, 'nov': 10,
  'december': 11, 'dec': 11,
};

function parseNumber(str: string): number | null {
  const lower = str.toLowerCase().trim();
  if (wordToNumber[lower] !== undefined) {
    return wordToNumber[lower];
  }
  const parsed = parseInt(lower);
  return isNaN(parsed) ? null : parsed;
}

export interface DateRange {
  startDate: string; // YYYY-MM-DD format (DB-adjusted)
  endDate: string; // YYYY-MM-DD format (DB-adjusted)
  description: string; // Human-readable description
  tradingDays: number; // Calendar days in the range (for display)
}

export interface ParsedDateQuery {
  type: 'range' | 'specific';
  dateRange: DateRange;
  dayOfWeek?: string; // For "Monday", "Tuesday" queries
}

/**
 * Parse a natural language time expression into a date range
 * Returns dates adjusted for the demo database timeline
 *
 * @param expression - Natural language time expression
 * @returns ParsedDateQuery with DB-adjusted dates, or null if not parseable
 */
export function parseTimeExpression(expression: string): ParsedDateQuery | null {
  // Strip common prefixes like "in ", "for ", "during " that ElevenLabs may include
  let lowerExpr = expression.toLowerCase().trim();
  lowerExpr = lowerExpr.replace(/^(in|for|during)\s+/i, '');

  const today = getEasternToday();
  today.setHours(0, 0, 0, 0);

  // Helper to format date for DB query (no offset applied)
  const toDBDate = (date: Date): string => {
    return formatDateForDB(date);
  };

  // Pattern: "today"
  if (/^today$/.test(lowerExpr)) {
    return {
      type: 'specific',
      dateRange: {
        startDate: toDBDate(today),
        endDate: toDBDate(today),
        description: 'today',
        tradingDays: 1
      }
    };
  }

  // Pattern: "yesterday"
  if (/^yesterday$/.test(lowerExpr)) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      type: 'specific',
      dateRange: {
        startDate: toDBDate(yesterday),
        endDate: toDBDate(yesterday),
        description: 'yesterday',
        tradingDays: 1
      }
    };
  }

  // Pattern: Specific calendar date - "November 18th", "Nov 18", "December 3rd"
  // Matches: full/abbreviated month name + day number + optional ordinal suffix
  const monthNames = 'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec';
  const calendarDateMatch = lowerExpr.match(new RegExp(`^(?:on\\s+)?(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?$`, 'i'));
  if (calendarDateMatch) {
    const monthStr = calendarDateMatch[1].toLowerCase();
    const day = parseInt(calendarDateMatch[2]);
    const month = monthNameToNumber[monthStr];

    if (month !== undefined && day >= 1 && day <= 31) {
      // Determine the year - use current year, but if the date is in the future, use last year
      let year = today.getFullYear();
      const targetDate = new Date(year, month, day);
      targetDate.setHours(0, 0, 0, 0);

      // If the date is in the future, assume user means last year
      if (targetDate > today) {
        year -= 1;
        targetDate.setFullYear(year);
      }

      // Format the description nicely
      const monthDisplay = targetDate.toLocaleDateString('en-US', { month: 'long' });
      const dayDisplay = day;
      const ordinal = day === 1 || day === 21 || day === 31 ? 'st'
                    : day === 2 || day === 22 ? 'nd'
                    : day === 3 || day === 23 ? 'rd' : 'th';

      return {
        type: 'specific',
        dateRange: {
          startDate: toDBDate(targetDate),
          endDate: toDBDate(targetDate),
          description: `${monthDisplay} ${dayDisplay}${ordinal}`,
          tradingDays: 1
        }
      };
    }
  }

  // Pattern: "last week" / "past week" - actual previous calendar week (Sun-Sat)
  if (/^(last|past)\s*week$/.test(lowerExpr)) {
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    // Find last Saturday (end of previous week)
    // If today is Sunday (0), last Saturday was yesterday (1 day ago)
    // If today is Monday (1), last Saturday was 2 days ago
    // If today is Saturday (6), last Saturday was 7 days ago (previous Saturday, not today)
    const daysToLastSaturday = dayOfWeek === 6 ? 7 : dayOfWeek + 1;
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - daysToLastSaturday);

    // Start of last week is 6 days before last Saturday (the Sunday)
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 6);

    return {
      type: 'range',
      dateRange: {
        startDate: toDBDate(startDate),
        endDate: toDBDate(endDate),
        description: 'last week',
        tradingDays: 7
      }
    };
  }

  // Pattern: "this week"
  if (/^this\s*week$/.test(lowerExpr)) {
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek); // Sunday
    return {
      type: 'range',
      dateRange: {
        startDate: toDBDate(startOfWeek),
        endDate: toDBDate(today),
        description: 'this week',
        tradingDays: dayOfWeek + 1 // Actual days since Sunday
      }
    };
  }

  // Pattern: "last N days" / "past N days" (supports spelled-out numbers)
  const numberWordsPattern = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+';
  const daysMatch = lowerExpr.match(new RegExp(`^(?:last|past)\\s*(${numberWordsPattern})\\s*days?$`, 'i'));
  if (daysMatch) {
    const numDays = parseNumber(daysMatch[1]);
    if (numDays !== null) {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - numDays + 1);
      return {
        type: 'range',
        dateRange: {
          startDate: toDBDate(startDate),
          endDate: toDBDate(today),
          description: `last ${numDays} days`,
          tradingDays: numDays // Use the actual days requested
        }
      };
    }
  }

  // Pattern: "last month" / "past month"
  if (/^(last|past)\s*month$/.test(lowerExpr)) {
    const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endDate = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of prev month
    return {
      type: 'range',
      dateRange: {
        startDate: toDBDate(startDate),
        endDate: toDBDate(endDate),
        description: 'last month',
        tradingDays: endDate.getDate() // Actual days in previous month
      }
    };
  }

  // Pattern: "last N months" / "past N months" (supports spelled-out numbers)
  const monthsMatch = lowerExpr.match(new RegExp(`^(?:last|past|the\\s+(?:last|past))\\s*(${numberWordsPattern})\\s*months?$`, 'i'));
  if (monthsMatch) {
    const numMonths = parseNumber(monthsMatch[1]);
    if (numMonths !== null && numMonths > 0) {
      const startDate = new Date(today.getFullYear(), today.getMonth() - numMonths, today.getDate());
      return {
        type: 'range',
        dateRange: {
          startDate: toDBDate(startDate),
          endDate: toDBDate(today),
          description: `last ${numMonths} months`,
          tradingDays: numMonths * 30 // Approximate
        }
      };
    }
  }

  // Pattern: "this month"
  if (/^this\s*month$/.test(lowerExpr)) {
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      type: 'range',
      dateRange: {
        startDate: toDBDate(startDate),
        endDate: toDBDate(today),
        description: 'this month',
        tradingDays: today.getDate() // Actual days so far this month
      }
    };
  }

  // Pattern: "this year"
  if (/^this\s*year$/.test(lowerExpr)) {
    const startDate = new Date(today.getFullYear(), 0, 1); // Jan 1
    return {
      type: 'range',
      dateRange: {
        startDate: toDBDate(startDate),
        endDate: toDBDate(today),
        description: 'this year',
        tradingDays: Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      }
    };
  }

  // Pattern: "last year"
  if (/^last\s*year$/.test(lowerExpr)) {
    const lastYear = today.getFullYear() - 1;
    const startDate = new Date(lastYear, 0, 1); // Jan 1 of last year
    const endDate = new Date(lastYear, 11, 31); // Dec 31 of last year
    return {
      type: 'range',
      dateRange: {
        startDate: toDBDate(startDate),
        endDate: toDBDate(endDate),
        description: 'last year',
        tradingDays: 365
      }
    };
  }

  // Pattern: "last quarter" / "past quarter"
  if (/^(last|past)\s*quarter$/.test(lowerExpr)) {
    const currentMonth = today.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3); // 0=Q1, 1=Q2, 2=Q3, 3=Q4
    const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
    const lastQuarterYear = currentQuarter === 0 ? today.getFullYear() - 1 : today.getFullYear();
    const startMonth = lastQuarter * 3; // Q1=0, Q2=3, Q3=6, Q4=9
    const startDate = new Date(lastQuarterYear, startMonth, 1);
    const endDate = new Date(lastQuarterYear, startMonth + 3, 0); // Last day of quarter
    const quarterName = `Q${lastQuarter + 1} ${lastQuarterYear}`;
    return {
      type: 'range',
      dateRange: {
        startDate: toDBDate(startDate),
        endDate: toDBDate(endDate),
        description: `last quarter (${quarterName})`,
        tradingDays: 90 // Approximate
      }
    };
  }

  // Pattern: "this quarter"
  if (/^this\s*quarter$/.test(lowerExpr)) {
    const currentMonth = today.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);
    const startMonth = currentQuarter * 3;
    const startDate = new Date(today.getFullYear(), startMonth, 1);
    const quarterName = `Q${currentQuarter + 1} ${today.getFullYear()}`;
    return {
      type: 'range',
      dateRange: {
        startDate: toDBDate(startDate),
        endDate: toDBDate(today),
        description: `this quarter (${quarterName})`,
        tradingDays: Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      }
    };
  }

  // Pattern: Day of week - "Monday", "Tuesday", etc.
  const dayOfWeekMap: Record<string, number> = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
  };

  for (const [dayName, dayNum] of Object.entries(dayOfWeekMap)) {
    const currentDayNum = today.getDay();

    // Match "last monday" - explicitly previous week
    const lastDayPattern = new RegExp(`^last\\s+${dayName}(?:'s)?$`, 'i');
    if (lastDayPattern.test(lowerExpr)) {
      const targetDate = new Date(today);
      // Get most recent occurrence first
      let daysBack = currentDayNum >= dayNum ? currentDayNum - dayNum : 7 - (dayNum - currentDayNum);
      // Then go back one more week for "last"
      daysBack += 7;
      targetDate.setDate(targetDate.getDate() - daysBack);

      return {
        type: 'specific',
        dateRange: {
          startDate: toDBDate(targetDate),
          endDate: toDBDate(targetDate),
          description: `last ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}`,
          tradingDays: 1
        },
        dayOfWeek: dayName
      };
    }

    // Match bare day name "monday" or "on monday" - most recent occurrence INCLUDING today
    const bareDayPattern = new RegExp(`^(?:on\\s+)?${dayName}(?:'s)?$`, 'i');
    if (bareDayPattern.test(lowerExpr)) {
      const targetDate = new Date(today);
      // If today is the same day, daysBack = 0 (return today)
      // Otherwise, find the most recent occurrence
      const daysBack = currentDayNum >= dayNum ? currentDayNum - dayNum : 7 - (dayNum - currentDayNum);
      targetDate.setDate(targetDate.getDate() - daysBack);

      return {
        type: 'specific',
        dateRange: {
          startDate: toDBDate(targetDate),
          endDate: toDBDate(targetDate),
          description: dayName.charAt(0).toUpperCase() + dayName.slice(1),
          tradingDays: 1
        },
        dayOfWeek: dayName
      };
    }
  }

  // Pattern: "X trading days" (supports spelled-out numbers)
  const tradingDaysMatch = lowerExpr.match(new RegExp(`^(?:last|past)\\s*(${numberWordsPattern})\\s*trading\\s*days?$`, 'i'));
  if (tradingDaysMatch) {
    const numTradingDays = parseNumber(tradingDaysMatch[1]);
    if (numTradingDays !== null) {
      // Approximate calendar days (trading days * 7/5)
      const calendarDays = Math.ceil(numTradingDays * 7 / 5);
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - calendarDays);
      return {
        type: 'range',
        dateRange: {
          startDate: toDBDate(startDate),
          endDate: toDBDate(today),
          description: `last ${numTradingDays} trading days`,
          tradingDays: numTradingDays
        }
      };
    }
  }

  return null;
}

/**
 * Extract time period from a user query
 * Finds the time-related portion of a query like "trades for last week"
 *
 * @param query - Full user query
 * @returns Extracted time period string or null
 */
export function extractTimePeriodFromQuery(query: string): string | null {
  const lowerQuery = query.toLowerCase();

  // Common time patterns to extract
  const patterns = [
    // "trades for last week", "trades from yesterday"
    /trades?\s+(?:for|from|on|over)\s+(?:the\s+)?(.+?)(?:\s+for\s+|\s+on\s+|\?|$)/i,
    // "last week trades", "yesterday's trades"
    /(.+?)\s+trades?/i,
    // "show my Monday trades"
    /show\s+(?:my\s+)?(.+?)\s+trades?/i,
    // "for last week", "over the past 5 days"
    /(?:for|over|in|during)\s+(?:the\s+)?(.+?)$/i,
  ];

  for (const pattern of patterns) {
    const match = lowerQuery.match(pattern);
    if (match && match[1]) {
      const timePart = match[1].trim();
      // Validate it's actually a time expression
      if (parseTimeExpression(timePart)) {
        return timePart;
      }
    }
  }

  // Direct time expressions
  const directPatterns = [
    'today', 'yesterday', 'this week', 'last week', 'past week',
    'this month', 'last month', 'past month',
    'this quarter', 'last quarter', 'past quarter',
    'this year', 'last year',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ];

  for (const pattern of directPatterns) {
    if (lowerQuery.includes(pattern)) {
      return pattern;
    }
  }

  // "last N days" pattern (supports spelled-out numbers)
  const numberWordsExtract = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+';
  const daysMatch = lowerQuery.match(new RegExp(`((?:last|past)\\s*(?:${numberWordsExtract})\\s*(?:trading\\s*)?days?)`, 'i'));
  if (daysMatch) {
    return daysMatch[1];
  }

  // Specific calendar date patterns - "November 18th", "Nov 18", "December 3rd"
  const monthNamesExtract = 'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec';
  const calendarDateExtract = lowerQuery.match(new RegExp(`((?:${monthNamesExtract})\\s+\\d{1,2}(?:st|nd|rd|th)?)`, 'i'));
  if (calendarDateExtract) {
    return calendarDateExtract[1];
  }

  return null;
}

/**
 * Check if a query is asking about a time period
 */
export function isTimeBasedQuery(query: string): boolean {
  const timePeriod = extractTimePeriodFromQuery(query);
  return timePeriod !== null;
}

// ============================================================================
// LLM-First Date Resolution (with regex fallback)
// ============================================================================

/**
 * Resolved dates ready for database queries
 * Handles both range queries and discrete date queries
 */
export interface ResolvedDates {
  type: 'range' | 'discrete';
  startDate?: string;   // For range queries (YYYY-MM-DD)
  endDate?: string;     // For range queries (YYYY-MM-DD)
  dates?: string[];     // For discrete date queries (array of YYYY-MM-DD)
  description: string;  // Human-readable description
}

/**
 * Resolve DateFilter from LLM to database-ready dates
 * Handles demo date offset conversion
 *
 * @param filter - DateFilter object from LLM classification
 * @returns ResolvedDates with DB-adjusted dates
 */
export function resolveDateFilter(filter: DateFilter): ResolvedDates {
  // No offset applied - dates pass through unchanged

  // Handle discrete dates (multiple specific dates)
  if (filter.type === 'discrete' && filter.dates && filter.dates.length > 0) {
    // CRITICAL FIX: If dates are already in YYYY-MM-DD format, use them directly
    // to avoid timezone issues where new Date("2025-08-21") creates UTC midnight
    // which then shifts backward when formatDateForDB uses local timezone
    const formattedDates = filter.dates.map(d => {
      // Check if already in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return d;  // Already in correct format, use as-is
      }
      // Otherwise parse and format (with timezone-safe approach)
      const date = new Date(d + 'T00:00:00');  // Parse as local midnight, not UTC
      return formatDateForDB(date);
    });
    return {
      type: 'discrete',
      dates: formattedDates,
      description: filter.description
    };
  }

  // Handle explicit date ranges
  if (filter.type === 'range' && filter.startDate && filter.endDate) {
    // CRITICAL FIX: If dates are already in YYYY-MM-DD format, use them directly
    // to avoid timezone issues (same as discrete dates fix above)
    let startFormatted = filter.startDate;
    let endFormatted = filter.endDate;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(filter.startDate)) {
      const start = new Date(filter.startDate + 'T00:00:00');  // Parse as local midnight
      startFormatted = formatDateForDB(start);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filter.endDate)) {
      const end = new Date(filter.endDate + 'T00:00:00');  // Parse as local midnight
      endFormatted = formatDateForDB(end);
    }

    return {
      type: 'range',
      startDate: startFormatted,
      endDate: endFormatted,
      description: filter.description
    };
  }

  // Handle relative periods (fall back to existing parseTimeExpression)
  if (filter.type === 'relative' && filter.period) {
    const parsed = parseTimeExpression(filter.period);
    if (parsed) {
      return {
        type: 'range',
        startDate: parsed.dateRange.startDate,
        endDate: parsed.dateRange.endDate,
        description: parsed.dateRange.description
      };
    }
  }

  // Ultimate fallback: last 30 days
  const today = getEasternToday();
  const start = new Date(today);
  start.setDate(start.getDate() - 30);
  return {
    type: 'range',
    startDate: formatDateForDB(realDateToDemoDate(start)),
    endDate: formatDateForDB(realDateToDemoDate(today)),
    description: 'last 30 days'
  };
}

/**
 * Parse a time period string to ResolvedDates (regex fallback when LLM fails)
 * Extends parseTimeExpression to handle date ranges and discrete dates
 *
 * @param timePeriod - Time period string from user query
 * @returns ResolvedDates or null if not parseable
 */
export function parseTimePeriodToResolvedDates(timePeriod: string): ResolvedDates | null {
  // Strip common prefixes like "in ", "for ", "during " that ElevenLabs may include
  let lowerExpr = timePeriod.toLowerCase().trim();
  lowerExpr = lowerExpr.replace(/^(in|for|during)\s+/i, '');

  const today = getEasternToday();
  today.setHours(0, 0, 0, 0);

  // Helper to format date WITH offset - for DB queries
  // Absolute months/dates need offset because demo DB dates differ from real calendar dates
  // e.g., "December" in real time maps to Oct/Nov in demo database
  const toDBDate = (date: Date): string => {
    return formatDateForDB(realDateToDemoDate(date));
  };

  const monthNames = 'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec';

  // Pattern: Same-month date range - "June 1st to the 7th", "June 1 to 7"
  const samemonthRangeMatch = lowerExpr.match(
    new RegExp(`^(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:to|through|-)\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?$`, 'i')
  );
  if (samemonthRangeMatch) {
    const [, monthStr, startDayStr, endDayStr] = samemonthRangeMatch;
    const month = monthNameToNumber[monthStr.toLowerCase()];
    const startDay = parseInt(startDayStr);
    const endDay = parseInt(endDayStr);

    if (month !== undefined && startDay >= 1 && startDay <= 31 && endDay >= 1 && endDay <= 31) {
      let year = today.getFullYear();
      const testDate = new Date(year, month, endDay);
      if (testDate > today) {
        year -= 1;
      }

      const startDate = new Date(year, month, startDay);
      const endDate = new Date(year, month, endDay);
      const monthDisplay = startDate.toLocaleDateString('en-US', { month: 'long' });

      return {
        type: 'range',
        startDate: toDBDate(startDate),
        endDate: toDBDate(endDate),
        description: `${monthDisplay} ${startDay} to ${endDay}`
      };
    }
  }

  // Pattern: Cross-month date range - "June 1 to June 7", "November 15 to December 5"
  const crossMonthRangeMatch = lowerExpr.match(
    new RegExp(`^(?:from\\s+)?(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:to|through|-)\\s+(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?$`, 'i')
  );
  if (crossMonthRangeMatch) {
    const [, month1Str, day1Str, month2Str, day2Str] = crossMonthRangeMatch;
    const month1 = monthNameToNumber[month1Str.toLowerCase()];
    const month2 = monthNameToNumber[month2Str.toLowerCase()];
    const day1 = parseInt(day1Str);
    const day2 = parseInt(day2Str);

    if (month1 !== undefined && month2 !== undefined) {
      const year = today.getFullYear();
      // Handle year boundary (e.g., Dec to Jan)
      const endYear = month2 < month1 ? year + 1 : year;
      let startDate = new Date(year, month1, day1);
      let endDate = new Date(endYear, month2, day2);

      // If range is in future, shift back one year
      if (startDate > today) {
        startDate = new Date(startDate.getFullYear() - 1, month1, day1);
        endDate = new Date(endDate.getFullYear() - 1, month2, day2);
      }

      const month1Display = new Date(2025, month1, 1).toLocaleDateString('en-US', { month: 'long' });
      const month2Display = new Date(2025, month2, 1).toLocaleDateString('en-US', { month: 'long' });

      return {
        type: 'range',
        startDate: toDBDate(startDate),
        endDate: toDBDate(endDate),
        description: `${month1Display} ${day1} to ${month2Display} ${day2}`
      };
    }
  }

  // Pattern: Multi-month range - "August and September", "August through October"
  const multiMonthMatch = lowerExpr.match(
    new RegExp(`^(${monthNames})\\s+(?:and|through|to|-)\\s+(${monthNames})$`, 'i')
  );
  if (multiMonthMatch) {
    const [, month1Str, month2Str] = multiMonthMatch;
    const month1 = monthNameToNumber[month1Str.toLowerCase()];
    const month2 = monthNameToNumber[month2Str.toLowerCase()];

    if (month1 !== undefined && month2 !== undefined) {
      const year = today.getFullYear();
      // Handle year boundary
      const endYear = month2 < month1 ? year + 1 : year;
      let startDate = new Date(year, month1, 1);
      let endDate = new Date(endYear, month2 + 1, 0); // Last day of month2

      // If range is in future, shift back one year
      if (startDate > today) {
        startDate = new Date(startDate.getFullYear() - 1, month1, 1);
        endDate = new Date(endDate.getFullYear() - 1, month2 + 1, 0);
      }

      const month1Display = new Date(2025, month1, 1).toLocaleDateString('en-US', { month: 'long' });
      const month2Display = new Date(2025, month2, 1).toLocaleDateString('en-US', { month: 'long' });

      return {
        type: 'range',
        startDate: toDBDate(startDate),
        endDate: toDBDate(endDate),
        description: `${month1Display} and ${month2Display}`
      };
    }
  }

  // Pattern: Single month name - "September", "August", "October"
  const singleMonthMatch = lowerExpr.match(
    new RegExp(`^(${monthNames})$`, 'i')
  );
  if (singleMonthMatch) {
    const monthStr = singleMonthMatch[1].toLowerCase();
    const month = monthNameToNumber[monthStr];

    if (month !== undefined) {
      const year = today.getFullYear();
      let startDate = new Date(year, month, 1);
      let endDate = new Date(year, month + 1, 0); // Last day of month

      // If month is in future, use previous year
      if (startDate > today) {
        startDate = new Date(year - 1, month, 1);
        endDate = new Date(year - 1, month + 1, 0);
      }

      const monthDisplay = new Date(2025, month, 1).toLocaleDateString('en-US', { month: 'long' });

      return {
        type: 'range',
        startDate: toDBDate(startDate),
        endDate: toDBDate(endDate),
        description: monthDisplay
      };
    }
  }

  // Pattern: Discrete dates - "July 1st and August 1st", "January 5th, March 10th and June 20th"
  const discreteDatesMatch = lowerExpr.match(
    new RegExp(`(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(?:and\\s+)?(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?)+`, 'i')
  );
  if (discreteDatesMatch && lowerExpr.includes(' and ') && !lowerExpr.includes(' to ') && !lowerExpr.includes(' through ')) {
    // Parse all dates from the expression
    const datePattern = new RegExp(`(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'gi');
    const matches = [...lowerExpr.matchAll(datePattern)];

    if (matches.length >= 2) {
      const year = today.getFullYear();
      const dates: string[] = [];
      const descriptions: string[] = [];

      for (const match of matches) {
        const monthStr = match[1].toLowerCase();
        const day = parseInt(match[2]);
        const month = monthNameToNumber[monthStr];

        if (month !== undefined && day >= 1 && day <= 31) {
          let date = new Date(year, month, day);
          // If date is in future, use previous year
          if (date > today) {
            date = new Date(year - 1, month, day);
          }
          dates.push(toDBDate(date));
          const monthDisplay = date.toLocaleDateString('en-US', { month: 'long' });
          descriptions.push(`${monthDisplay} ${day}`);
        }
      }

      if (dates.length >= 2) {
        return {
          type: 'discrete',
          dates,
          description: descriptions.join(' and ')
        };
      }
    }
  }

  // Fall back to existing parseTimeExpression for relative periods
  const parsed = parseTimeExpression(timePeriod);
  if (parsed) {
    // parseTimeExpression returns real calendar dates without demo offset
    // Need to convert them to demo database dates using toDBDate
    const parseYMD = (dateStr: string): Date => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    };

    return {
      type: 'range',
      startDate: toDBDate(parseYMD(parsed.dateRange.startDate)),
      endDate: toDBDate(parseYMD(parsed.dateRange.endDate)),
      description: parsed.dateRange.description
    };
  }

  return null;
}
