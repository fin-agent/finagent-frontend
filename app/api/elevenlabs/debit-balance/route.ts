import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate, formatDateForDB, getDemoToday } from '@/src/lib/date-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

interface DailyBalance {
  date: string;
  debitBalance: number;
}

interface DebitBalanceUIData {
  accountCode: string;
  accountName: string;
  timePeriod: string;
  currentBalance: number;
  currentBalanceDate: string;
  average: number;
  highest: number;
  highestDate: string;
  lowest: number;
  lowestDate: string;
  dailyBalances: DailyBalance[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';
  return formatCalendarDate(dateStr);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Debit balance request body:', JSON.stringify(body, null, 2));

    // Extract time_period from various possible locations
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period ||
                       'this month'; // Default to current month

    // Parse time period to get date range
    let startDate: string;
    let endDate: string;
    let description = timePeriod;

    const resolved = parseTimePeriodToResolvedDates(timePeriod);
    if (resolved && resolved.startDate && resolved.endDate) {
      startDate = resolved.startDate;
      endDate = resolved.endDate;
      description = resolved.description || timePeriod;
    } else {
      // Default to current month if parsing fails
      const demoTodayStr = getDemoToday();
      const demoToday = new Date(demoTodayStr + 'T00:00:00');
      const firstOfMonth = new Date(demoToday.getFullYear(), demoToday.getMonth(), 1);
      const lastOfMonth = new Date(demoToday.getFullYear(), demoToday.getMonth() + 1, 0);
      startDate = formatDateForDB(firstOfMonth);
      endDate = formatDateForDB(lastOfMonth);
      description = 'this month';
    }

    console.log(`Querying debit balances from ${startDate} to ${endDate} (${description})`);

    // Query all debit balances for the period
    const { data, error } = await supabase
      .from('AccountBalance')
      .select('Date, DebitBalance, AccountName')
      .eq('AccountCode', ACCOUNT_CODE)
      .gte('Date', startDate)
      .lte('Date', endDate)
      .order('Date', { ascending: true });

    if (error) {
      return NextResponse.json({
        response: `Error retrieving debit balance data: ${error.message}`,
      });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        response: `No debit balance data found for ${description}.`,
      });
    }

    // Calculate stats
    const balances = data.map(d => Number(d.DebitBalance) || 0);
    const sum = balances.reduce((a, b) => a + b, 0);
    const average = sum / balances.length;
    const highest = Math.max(...balances);
    const lowest = Math.min(...balances);

    const highestRecord = data.find(d => Number(d.DebitBalance) === highest);
    const lowestRecord = data.find(d => Number(d.DebitBalance) === lowest);
    const accountName = data[0]?.AccountName || 'Account';

    // Get current (most recent) balance - last entry since ordered ascending
    const currentRecord = data[data.length - 1];
    const currentBalance = Number(currentRecord?.DebitBalance) || 0;
    const currentBalanceDate = currentRecord?.Date || '';

    // Build daily balances array for UI
    const dailyBalances: DailyBalance[] = data.map(d => ({
      date: d.Date,
      debitBalance: Number(d.DebitBalance) || 0,
    }));

    // Format dates for voice response
    const highestDateVoice = formatDateForVoice(highestRecord?.Date || '');
    const lowestDateVoice = formatDateForVoice(lowestRecord?.Date || '');
    const currentDateVoice = formatDateForVoice(currentBalanceDate);

    // Build UI data
    const uiData: DebitBalanceUIData = {
      accountCode: ACCOUNT_CODE,
      accountName,
      timePeriod: description,
      currentBalance,
      currentBalanceDate,
      average,
      highest,
      highestDate: highestRecord?.Date || '',
      lowest,
      lowestDate: lowestRecord?.Date || '',
      dailyBalances,
    };

    // Build voice response - start with current balance, then stats
    const response = `Your debit balance as of ${currentDateVoice} is ${formatCurrency(currentBalance)}. ` +
      `Your average debit balance for ${description} is ${formatCurrency(average)}. ` +
      `The highest debit balance was ${formatCurrency(highest)} on ${highestDateVoice}. ` +
      `The lowest debit balance was ${formatCurrency(lowest)} on ${lowestDateVoice}.`;

    return NextResponse.json({
      response,
      uiData,
    });

  } catch (error) {
    console.error('Debit balance error:', error);
    return NextResponse.json({
      response: 'An error occurred while retrieving debit balance data.',
    });
  }
}
