/**
 * Natural language date parsing for time-based trade queries
 * Parses expressions like "last week", "yesterday", "past 5 days", "Monday"
 */

import { getDateOffset, formatDateForDB } from './date-utils';

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
  const lowerExpr = expression.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const offset = getDateOffset();

  // Helper to format date with offset applied for DB query
  const toDBDate = (date: Date): string => {
    const adjusted = new Date(date);
    adjusted.setDate(adjusted.getDate() + offset);
    return formatDateForDB(adjusted);
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
    // Match patterns like "monday", "last monday", "on monday"
    const dayPattern = new RegExp(`^(?:last\\s+|on\\s+)?${dayName}(?:'s)?$`, 'i');
    if (dayPattern.test(lowerExpr)) {
      const targetDate = new Date(today);
      const currentDayNum = targetDate.getDay();
      let daysBack = currentDayNum - dayNum;

      // If same day or future day of week, go back a full week
      if (daysBack <= 0) {
        daysBack += 7;
      }

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
