/**
 * Date utilities for time-based trade queries
 * Handles offset calculation between demo data dates and actual today
 */

// The latest trade date in the demo database - this represents "today" in the demo
const DEMO_TODAY = '2025-11-20';

/**
 * Calculate the offset in days between demo "today" and actual today
 * Positive offset means demo dates are in the future relative to actual today
 */
export function getDateOffset(): number {
  const actualToday = new Date();
  actualToday.setHours(0, 0, 0, 0);

  const demoToday = new Date(DEMO_TODAY);
  demoToday.setHours(0, 0, 0, 0);

  const diffMs = demoToday.getTime() - actualToday.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Convert a real-world date to the equivalent demo database date
 * e.g., if user asks about "yesterday", convert actual yesterday to demo equivalent
 *
 * @param realDate - The actual calendar date
 * @returns Date adjusted to demo timeline
 */
export function realDateToDemoDate(realDate: Date): Date {
  const offset = getDateOffset();
  const demoDate = new Date(realDate);
  demoDate.setDate(demoDate.getDate() + offset);
  return demoDate;
}

/**
 * Convert a demo database date to display-friendly date
 * Subtracts offset so users see dates relative to actual today
 *
 * @param demoDateStr - Date string from database (YYYY-MM-DD)
 * @returns Date adjusted to actual timeline
 */
export function demoDateToRealDate(demoDateStr: string): Date {
  const offset = getDateOffset();
  const demoDate = new Date(demoDateStr);
  demoDate.setDate(demoDate.getDate() - offset);
  return demoDate;
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

  const today = new Date();
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
 */
export function formatDateForDB(date: Date): string {
  return date.toISOString().split('T')[0];
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
