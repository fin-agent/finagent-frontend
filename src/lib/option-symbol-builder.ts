/**
 * Option Symbol Builder
 *
 * Converts natural language option descriptions to OCC (Options Clearing Corporation) symbols.
 *
 * OCC Symbol Format: ROOT + YYMMDD + C/P + 00000000 (8-digit strike * 1000)
 * Example: AAPL Jan 17 2025 $200 Call = AAPL250117C00200000
 */

/**
 * Parse a natural language expiration string into a Date object
 *
 * Supported formats:
 * - "Dec 16" or "Dec'16" or "Dec16" - Month and day (current year assumed)
 * - "December 16" - Full month name
 * - "Dec 16 2025" or "December 16, 2025" - With year
 * - "2025-12-16" - ISO format
 * - "12/16/2025" - US date format
 * - "next Friday" - Relative dates
 */
export function parseExpiration(expiration: string): Date | null {
  const now = new Date();
  const currentYear = now.getFullYear();
  const lower = expiration.toLowerCase().trim();

  // ISO format: 2025-12-16
  const isoMatch = lower.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // US format: 12/16/2025
  const usMatch = lower.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    return new Date(parseInt(usMatch[3]), parseInt(usMatch[1]) - 1, parseInt(usMatch[2]));
  }

  // Month name mappings
  const monthMap: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  // Pattern: "Dec 16 2025" or "December 16, 2025" or "Dec 16, 2025"
  const fullDateMatch = lower.match(
    /^([a-z]+)['\s,]*(\d{1,2})[,\s]+(\d{4})$/
  );
  if (fullDateMatch) {
    const month = monthMap[fullDateMatch[1]];
    if (month !== undefined) {
      return new Date(parseInt(fullDateMatch[3]), month, parseInt(fullDateMatch[2]));
    }
  }

  // Pattern: "Dec 16" or "Dec'16" or "Dec16" (day in current/next occurrence)
  const shortDateMatch = lower.match(/^([a-z]+)['\s]*(\d{1,2})$/);
  if (shortDateMatch) {
    const month = monthMap[shortDateMatch[1]];
    if (month !== undefined) {
      const day = parseInt(shortDateMatch[2]);
      let year = currentYear;
      // If the date is in the past, use next year
      const testDate = new Date(year, month, day);
      if (testDate < now) {
        year++;
      }
      return new Date(year, month, day);
    }
  }

  // Pattern: "16 Dec" or "16 December"
  const reverseDateMatch = lower.match(/^(\d{1,2})['\s]+([a-z]+)$/);
  if (reverseDateMatch) {
    const month = monthMap[reverseDateMatch[2]];
    if (month !== undefined) {
      const day = parseInt(reverseDateMatch[1]);
      let year = currentYear;
      const testDate = new Date(year, month, day);
      if (testDate < now) {
        year++;
      }
      return new Date(year, month, day);
    }
  }

  // Pattern: Just month name (assume 3rd Friday - standard expiration)
  const monthOnlyMatch = lower.match(/^([a-z]+)$/);
  if (monthOnlyMatch && monthMap[monthOnlyMatch[1]] !== undefined) {
    const month = monthMap[monthOnlyMatch[1]];
    let year = currentYear;
    if (month < now.getMonth()) {
      year++;
    }
    // Find 3rd Friday
    return getThirdFriday(year, month);
  }

  // Pattern: "next Friday", "this Friday"
  if (lower.includes('friday')) {
    const today = now.getDay();
    const daysUntilFriday = (5 - today + 7) % 7 || 7; // 5 = Friday
    const nextFriday = new Date(now);
    nextFriday.setDate(now.getDate() + daysUntilFriday);
    return nextFriday;
  }

  // Pattern: "tomorrow"
  if (lower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return tomorrow;
  }

  // Pattern: "this week" or "weekly" - next Friday
  if (lower.includes('week')) {
    const today = now.getDay();
    const daysUntilFriday = (5 - today + 7) % 7 || 7;
    const nextFriday = new Date(now);
    nextFriday.setDate(now.getDate() + daysUntilFriday);
    return nextFriday;
  }

  // Pattern: "this month" or "monthly" - 3rd Friday
  if (lower.includes('month')) {
    return getThirdFriday(currentYear, now.getMonth());
  }

  return null;
}

/**
 * Get the 3rd Friday of a given month (standard options expiration)
 */
export function getThirdFriday(year: number, month: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstFridayOffset = (5 - firstDay.getDay() + 7) % 7;
  const thirdFriday = new Date(year, month, 1 + firstFridayOffset + 14);
  return thirdFriday;
}

/**
 * Format date to YYMMDD for OCC symbol
 */
export function formatExpirationForOCC(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Format strike price for OCC symbol (8 digits, strike * 1000)
 */
export function formatStrikeForOCC(strike: number): string {
  const strikeInt = Math.round(strike * 1000);
  return String(strikeInt).padStart(8, '0');
}

/**
 * Build a complete OCC option symbol
 *
 * @param underlying - Stock ticker (e.g., "AAPL", "SPY")
 * @param expiration - Expiration date string (e.g., "Dec 16", "January 17 2025")
 * @param strike - Strike price (e.g., 200, 105.50)
 * @param callPut - Option type: "call" or "put"
 * @returns OCC symbol string or null if parsing fails
 */
export function buildOCCSymbol(
  underlying: string,
  expiration: string,
  strike: number,
  callPut: 'call' | 'put'
): string | null {
  // Parse expiration
  const expDate = parseExpiration(expiration);
  if (!expDate) {
    return null;
  }

  // Root symbol (6 chars max, left-aligned, no padding for display)
  const root = underlying.toUpperCase().trim();

  // Expiration YYMMDD
  const expStr = formatExpirationForOCC(expDate);

  // Call/Put indicator
  const type = callPut === 'call' ? 'C' : 'P';

  // Strike price (8 digits)
  const strikeStr = formatStrikeForOCC(strike);

  return `${root}${expStr}${type}${strikeStr}`;
}

/**
 * Parse an OCC symbol back into its components
 */
export interface ParsedOCCSymbol {
  underlying: string;
  expiration: Date;
  expirationString: string;
  type: 'call' | 'put';
  strike: number;
}

export function parseOCCSymbol(occSymbol: string): ParsedOCCSymbol | null {
  // OCC format: ROOT(1-6 chars) + YYMMDD + C/P + 00000000
  // Minimum length: 1 + 6 + 1 + 8 = 16
  if (occSymbol.length < 16) {
    return null;
  }

  // Find the C or P in the symbol (it's always followed by 8 digits)
  const typeMatch = occSymbol.match(/([CP])(\d{8})$/);
  if (!typeMatch) {
    return null;
  }

  const type = typeMatch[1] === 'C' ? 'call' : 'put';
  const strikeStr = typeMatch[2];
  const strike = parseInt(strikeStr, 10) / 1000;

  // Extract expiration (6 chars before C/P)
  const beforeType = occSymbol.slice(0, -9); // Remove C/P and 8 strike digits
  const expStr = beforeType.slice(-6);
  const underlying = beforeType.slice(0, -6).trim();

  // Parse expiration
  const yy = parseInt(expStr.slice(0, 2), 10);
  const mm = parseInt(expStr.slice(2, 4), 10) - 1;
  const dd = parseInt(expStr.slice(4, 6), 10);
  const year = yy > 50 ? 1900 + yy : 2000 + yy;
  const expiration = new Date(year, mm, dd);

  // Format expiration for display
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const expirationString = `${months[mm]} ${dd}, ${year}`;

  return {
    underlying,
    expiration,
    expirationString,
    type,
    strike,
  };
}

/**
 * Format an OCC symbol for human-readable display
 * Example: "AAPL250117C00200000" -> "AAPL Jan 17, 2025 $200 Call"
 */
export function formatOCCForDisplay(occSymbol: string): string {
  const parsed = parseOCCSymbol(occSymbol);
  if (!parsed) {
    return occSymbol;
  }

  const strikeDisplay = parsed.strike % 1 === 0
    ? `$${parsed.strike}`
    : `$${parsed.strike.toFixed(2)}`;

  const typeDisplay = parsed.type === 'call' ? 'Call' : 'Put';

  return `${parsed.underlying} ${parsed.expirationString} ${strikeDisplay} ${typeDisplay}`;
}

/**
 * Find the nearest expiration date from a list
 */
export function findNearestExpiration(
  expirations: Date[],
  target?: Date
): Date | null {
  if (expirations.length === 0) {
    return null;
  }

  const targetDate = target || new Date();
  let nearest = expirations[0];
  let minDiff = Math.abs(expirations[0].getTime() - targetDate.getTime());

  for (const exp of expirations) {
    const diff = Math.abs(exp.getTime() - targetDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      nearest = exp;
    }
  }

  return nearest;
}

/**
 * Get the next monthly expiration (3rd Friday)
 */
export function getNextMonthlyExpiration(): Date {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();

  // Try current month first
  const currentMonthExp = getThirdFriday(year, month);
  if (currentMonthExp > now) {
    return currentMonthExp;
  }

  // Otherwise, next month
  month++;
  if (month > 11) {
    month = 0;
    year++;
  }
  return getThirdFriday(year, month);
}
