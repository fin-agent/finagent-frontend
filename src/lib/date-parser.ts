/**
 * Natural language date parsing for time-based trade queries
 * Parses expressions like "last week", "yesterday", "past 5 days", "Monday"
 */

import { getDateOffset, formatDateForDB } from './date-utils';

export interface DateRange {
  startDate: string; // YYYY-MM-DD format (DB-adjusted)
  endDate: string; // YYYY-MM-DD format (DB-adjusted)
  description: string; // Human-readable description
  tradingDays: number; // Approximate trading days in range
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

  // Pattern: "last week" / "past week"
  if (/^(last|past)\s*week$/.test(lowerExpr)) {
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 1); // Yesterday
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 7);
    return {
      type: 'range',
      dateRange: {
        startDate: toDBDate(startDate),
        endDate: toDBDate(endDate),
        description: 'last week',
        tradingDays: 5
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
        tradingDays: Math.min(dayOfWeek + 1, 5)
      }
    };
  }

  // Pattern: "last N days" / "past N days"
  const daysMatch = lowerExpr.match(/^(?:last|past)\s*(\d+)\s*days?$/);
  if (daysMatch) {
    const numDays = parseInt(daysMatch[1]);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - numDays + 1);
    return {
      type: 'range',
      dateRange: {
        startDate: toDBDate(startDate),
        endDate: toDBDate(today),
        description: `last ${numDays} days`,
        tradingDays: Math.ceil(numDays * 5 / 7) // Approximate trading days
      }
    };
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
        tradingDays: 22 // Approximate trading days in a month
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
        tradingDays: Math.ceil(today.getDate() * 5 / 7)
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

  // Pattern: "X trading days"
  const tradingDaysMatch = lowerExpr.match(/^(?:last|past)\s*(\d+)\s*trading\s*days?$/);
  if (tradingDaysMatch) {
    const numTradingDays = parseInt(tradingDaysMatch[1]);
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

  // "last N days" pattern
  const daysMatch = lowerQuery.match(/((?:last|past)\s*\d+\s*days?)/i);
  if (daysMatch) {
    return daysMatch[1];
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
