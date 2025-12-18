/**
 * Date utilities for time-based trade queries
 * Handles offset calculation between demo data dates and actual today
 */

// The latest trade date in the demo database - this represents "today" in the demo
export const DEMO_TODAY = '2025-11-20';

function getPacificToday(): Date {
  const now = new Date();
  const pacificDateStr = now.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = pacificDateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

export function getDateOffset(): number {
  const actualToday = getPacificToday();
  actualToday.setHours(0, 0, 0, 0);

  const [year, month, day] = DEMO_TODAY.split('-').map(Number);
  const demoToday = new Date(year, month - 1, day);
  demoToday.setHours(0, 0, 0, 0);

  const diffMs = demoToday.getTime() - actualToday.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function realDateToDemoDate(realDate: Date): Date {
  const offset = getDateOffset();
  const demoDate = new Date(realDate);
  demoDate.setDate(demoDate.getDate() + offset);
  return demoDate;
}

export function demoDateToRealDate(demoDateStr: string): Date {
  const offset = getDateOffset();
  const [year, month, day] = demoDateStr.split('-').map(Number);
  const demoDate = new Date(year, month - 1, day);
  demoDate.setDate(demoDate.getDate() - offset);
  return demoDate;
}

export function formatDateForDB(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getDemoToday(): Date {
  const [year, month, day] = DEMO_TODAY.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const datePart = dateStr.split('T')[0];
  const date = new Date(datePart + 'T00:00:00Z');
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Parse relative dates and day-of-week references to demo date range
 */
export function parseRelativeDate(input: string): { start?: string; end?: string } {
  const demoToday = getDemoToday();
  const today = new Date(demoToday.getFullYear(), demoToday.getMonth(), demoToday.getDate());
  const lower = input.toLowerCase().trim();

  const formatDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const dayMap: Record<string, number> = {
    'sunday': 0, 'sun': 0,
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2, 'tues': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
  };

  const getMostRecentDay = (targetDay: number): Date => {
    const todayDay = today.getDay();
    const daysBack = todayDay >= targetDay ? todayDay - targetDay : 7 - (targetDay - todayDay);
    const result = new Date(today);
    result.setDate(today.getDate() - daysBack);
    return result;
  };

  const getLastWeekDay = (targetDay: number): Date => {
    const mostRecent = getMostRecentDay(targetDay);
    const result = new Date(mostRecent);
    result.setDate(mostRecent.getDate() - 7);
    return result;
  };

  const getThisWeekDay = (targetDay: number): Date => {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const result = new Date(startOfWeek);
    result.setDate(startOfWeek.getDate() + targetDay);
    return result;
  };

  const getNextWeekDay = (targetDay: number): Date => {
    const startOfNextWeek = new Date(today);
    startOfNextWeek.setDate(today.getDate() - today.getDay() + 7);
    const result = new Date(startOfNextWeek);
    result.setDate(startOfNextWeek.getDate() + targetDay);
    return result;
  };

  // Check for "last <day>" pattern
  const lastDayMatch = lower.match(/^last\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)$/);
  if (lastDayMatch) {
    const targetDay = dayMap[lastDayMatch[1]];
    const date = getLastWeekDay(targetDay);
    return { start: formatDate(date), end: formatDate(date) };
  }

  // Check for "this <day>" pattern
  const thisDayMatch = lower.match(/^this\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)$/);
  if (thisDayMatch) {
    const targetDay = dayMap[thisDayMatch[1]];
    const date = getThisWeekDay(targetDay);
    return { start: formatDate(date), end: formatDate(date) };
  }

  // Check for "next <day>" pattern
  const nextDayMatch = lower.match(/^next\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)$/);
  if (nextDayMatch) {
    const targetDay = dayMap[nextDayMatch[1]];
    const date = getNextWeekDay(targetDay);
    return { start: formatDate(date), end: formatDate(date) };
  }

  // Check for bare day name
  const bareDayMatch = lower.match(/^(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)$/);
  if (bareDayMatch) {
    const targetDay = dayMap[bareDayMatch[1]];
    const date = getMostRecentDay(targetDay);
    return { start: formatDate(date), end: formatDate(date) };
  }

  if (lower === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { start: formatDate(tomorrow), end: formatDate(tomorrow) };
  }
  if (lower === 'today') {
    return { start: formatDate(today), end: formatDate(today) };
  }
  if (lower === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: formatDate(yesterday), end: formatDate(yesterday) };
  }
  if (lower === 'this week') {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    return { start: formatDate(startOfWeek), end: formatDate(endOfWeek) };
  }
  if (lower === 'last week') {
    const startOfLastWeek = new Date(today);
    startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
    const endOfLastWeek = new Date(startOfLastWeek);
    endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
    return { start: formatDate(startOfLastWeek), end: formatDate(endOfLastWeek) };
  }
  if (lower === 'this month') {
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: formatDate(startOfMonth), end: formatDate(today) };
  }
  if (lower === 'last month') {
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: formatDate(startOfLastMonth), end: formatDate(endOfLastMonth) };
  }
  if (lower === 'this year' || lower === 'ytd') {
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    return { start: formatDate(startOfYear), end: formatDate(today) };
  }

  // "last N months" pattern
  const lastNMonthsMatch = lower.match(/last\s+(\d+)\s+months?/);
  if (lastNMonthsMatch) {
    const months = parseInt(lastNMonthsMatch[1]);
    const startDate = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
    return { start: formatDate(startDate), end: formatDate(today) };
  }

  // "last N days" pattern
  const lastNDaysMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (lastNDaysMatch) {
    const days = parseInt(lastNDaysMatch[1]);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    return { start: formatDate(startDate), end: formatDate(today) };
  }

  return {};
}
