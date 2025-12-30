/**
 * Date utilities for time-based trade queries
 * Handles offset calculation between demo data dates and actual today
 *
 * IMPORTANT: Uses US Eastern timezone for consistent date calculations
 * Eastern timezone aligns with NYSE/NASDAQ market hours and user's local time.
 */

// The latest trade date in the demo database - this represents "today" in the demo
// Updated to match actual latest data in AccountBalance table
const DEMO_TODAY = '2025-12-11';

/**
 * Get the current date in US Eastern timezone as a Date object
 * This ensures consistent "today" across local dev and production (UTC)
 * and aligns with market hours and user timezone.
 */
function getEasternToday(): Date {
  const now = new Date();
  const easternDateStr = now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // Parse MM/DD/YYYY format
  const [month, day, year] = easternDateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Calculate the offset in days between demo "today" and actual today (Eastern time)
 * Positive offset means demo dates are in the future relative to actual today
 */
export function getDateOffset(): number {
  const actualToday = getEasternToday();
  actualToday.setHours(0, 0, 0, 0);

  // Parse DEMO_TODAY as local date (not UTC) to avoid timezone issues
  const [year, month, day] = DEMO_TODAY.split('-').map(Number);
  const demoToday = new Date(year, month - 1, day); // month is 0-indexed
  demoToday.setHours(0, 0, 0, 0);

  const diffMs = demoToday.getTime() - actualToday.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Convert a real-world date to the equivalent demo database date
 * NOTE: Date offsetting has been DISABLED - dates pass through unchanged
 *
 * @param realDate - The actual calendar date
 * @returns Same date (no offset applied)
 */
export function realDateToDemoDate(realDate: Date): Date {
  // No offset - return date as-is
  return new Date(realDate);
}

/**
 * Convert a demo database date to display-friendly date
 * NOTE: Date offsetting has been DISABLED - dates pass through unchanged
 *
 * @param demoDateStr - Date string from database (YYYY-MM-DD or ISO timestamp)
 * @returns Same date as Date object (no offset applied)
 */
export function demoDateToRealDate(demoDateStr: string): Date {
  if (!demoDateStr) {
    return new Date(NaN); // Return Invalid Date for empty input
  }

  // Extract just the date part (handles both YYYY-MM-DD and ISO timestamps like 2025-11-15T00:00:00.000Z)
  const datePart = demoDateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);

  // Validate parsed values
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return new Date(NaN); // Return Invalid Date for unparseable input
  }

  return new Date(year, month - 1, day);
}

/**
 * Format a database date for display to the user
 * Shows relative dates like "Today", "Yesterday", "3 days ago"
 *
 * @param demoDateStr - Date string from database (YYYY-MM-DD)
 * @returns Human-readable relative date string
 */
export function formatDisplayDate(demoDateStr: string): string {
  const realDate = demoDateToRealDate(demoDateStr);

  const today = getEasternToday();
  today.setHours(0, 0, 0, 0);
  realDate.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - realDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  if (diffDays > 0 && diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 0 && diffDays > -7) return `In ${Math.abs(diffDays)} days`;

  // For older dates, show the actual date
  return realDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: realDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
  });
}

/**
 * Format a date as YYYY-MM-DD for database queries
 * Uses LOCAL date components to avoid timezone-related off-by-one bugs
 * (toISOString() converts to UTC which shifts dates in non-UTC timezones)
 */
export function formatDateForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get demo date string for "today" in the demo timeline
 */
export function getDemoToday(): string {
  return DEMO_TODAY;
}

/**
 * Get display date range string (e.g., "Dec 1 - Dec 4")
 */
export function formatDateRange(startDateStr: string, endDateStr: string): string {
  const startReal = demoDateToRealDate(startDateStr);
  const endReal = demoDateToRealDate(endDateStr);

  const startFormatted = startReal.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endFormatted = endReal.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (startFormatted === endFormatted) {
    return startFormatted;
  }

  return `${startFormatted} - ${endFormatted}`;
}

/**
 * Get the day of week name from a demo date
 */
export function getDayOfWeek(demoDateStr: string): string {
  const realDate = demoDateToRealDate(demoDateStr);
  return realDate.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Format a demo date to a standard calendar format (e.g., "Dec 3, 2024")
 * This converts the database date to the actual display date with offset applied
 */
export function formatCalendarDate(demoDateStr: string): string {
  if (!demoDateStr) {
    return 'N/A';
  }

  const realDate = demoDateToRealDate(demoDateStr);

  // Handle Invalid Date
  if (isNaN(realDate.getTime())) {
    return 'N/A';
  }

  return realDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
