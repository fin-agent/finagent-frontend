import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { realDateToDemoDate, formatDateForDB } from '@/src/lib/date-utils';
import { normalizeSymbol, parseOptionSymbol } from '@/src/lib/symbol-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export interface FeesUIData {
  feeType: string;
  totalAmount: number;
  transactionCount: number;
  timePeriod: string;
  periodMonth?: string;
  symbol?: string;
  breakdown?: Array<{
    date: string;
    amount: number;
    symbol?: string;
  }>;
}

function getDateRange(timePeriod: string): { fromDate: string; toDate: string; periodLabel: string; periodMonth?: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lowerPeriod = timePeriod.toLowerCase();

  // Convert real dates to demo dates for DB queries
  const toDBDateStr = (date: Date): string => {
    const demoDate = realDateToDemoDate(date);
    return formatDateForDB(demoDate);
  };

  if (lowerPeriod.includes('last month') || lowerPeriod.includes('past month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const toDate = new Date(today.getFullYear(), today.getMonth(), 0);
    const monthName = fromDate.toLocaleDateString('en-US', { month: 'long' });
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(toDate), periodLabel: `month of ${monthName}`, periodMonth: monthName };
  }

  if (lowerPeriod.includes('this month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthName = fromDate.toLocaleDateString('en-US', { month: 'long' });
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: `month of ${monthName}`, periodMonth: monthName };
  }

  if (lowerPeriod.includes('last week') || lowerPeriod.includes('past week')) {
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 7);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: 'last week' };
  }

  if (lowerPeriod.includes('this week')) {
    const dayOfWeek = today.getDay();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - dayOfWeek);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: 'this week' };
  }

  if (lowerPeriod.includes('this year') || lowerPeriod.includes('since the beginning of the year')) {
    const fromDate = new Date(today.getFullYear(), 0, 1);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: 'this year' };
  }

  // "last year" = trailing 12 months (not calendar year) to match user expectations
  if (lowerPeriod === 'last year' || lowerPeriod === 'past year') {
    const fromDate = new Date(today.getFullYear(), today.getMonth() - 12, today.getDate());
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: 'last year' };
  }

  // Check for month names
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  for (let i = 0; i < monthNames.length; i++) {
    if (lowerPeriod.includes(monthNames[i])) {
      const year = lowerPeriod.includes('last year') ? today.getFullYear() - 1 : today.getFullYear();
      const fromDate = new Date(year, i, 1);
      const toDate = new Date(year, i + 1, 0);
      const monthName = fromDate.toLocaleDateString('en-US', { month: 'long' });
      return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(toDate), periodLabel: `month of ${monthName}`, periodMonth: monthName };
    }
  }

  // Default to last 30 days
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 30);
  return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: timePeriod };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const feeType = body.feeType || 'commission';
    const timePeriod = body.timePeriod || 'this month';
    const symbol = body.symbol;

    const { fromDate, toDate, periodLabel, periodMonth } = getDateRange(timePeriod);
    const displayPeriod = periodLabel || timePeriod;

    // Handle commissions from TradeData table
    if (feeType === 'commission') {
      const { data, error } = await supabase
        .from('TradeData')
        .select('Commission, Date, Symbol')
        .eq('AccountCode', ACCOUNT_CODE)
        .gte('Date', fromDate)
        .lte('Date', toDate)
        .order('Date', { ascending: false });

      if (error || !data) {
        return NextResponse.json({ error: 'No data found' });
      }

      const totalAmount = data.reduce((sum, trade) => sum + Math.abs(trade.Commission || 0), 0);

      return NextResponse.json({
        feeType,
        totalAmount,
        transactionCount: data.length,
        timePeriod: displayPeriod,
        periodMonth,
        breakdown: data.slice(0, 10).map(t => ({
          date: t.Date,
          amount: Math.abs(t.Commission || 0),
          symbol: parseOptionSymbol(t.Symbol),
        })),
      });
    }

    // Handle other fee types from FeesAndInterest table
    const feeTypeMap: Record<string, string> = {
      'credit_interest': 'CreditInt',
      'debit_interest': 'DebitInt',
      'locate_fee': 'LocateFee',
    };

    const dbFeeType = feeTypeMap[feeType];

    let query = supabase
      .from('FeesAndInterest')
      .select('*')
      .eq('Type', dbFeeType)
      .gte('Date', fromDate)
      .lte('Date', toDate)
      .order('Date', { ascending: false });

    if (feeType === 'locate_fee' && symbol) {
      const normalizedSymbol = normalizeSymbol(symbol);
      query = query.eq('Symbol', normalizedSymbol);
    }

    const { data, error } = await query;

    if (error || !data) {
      return NextResponse.json({ error: 'No data found' });
    }

    const totalAmount = data.reduce((sum, fee) => sum + Math.abs(fee.Amount || 0), 0);

    return NextResponse.json({
      feeType,
      totalAmount,
      transactionCount: data.length,
      timePeriod: displayPeriod,
      periodMonth,
      symbol: symbol ? normalizeSymbol(symbol) : undefined,
      breakdown: data.slice(0, 10).map(f => ({
        date: f.Date,
        amount: Math.abs(f.Amount || 0),
        symbol: parseOptionSymbol(f.Symbol),
      })),
    });
  } catch (error) {
    console.error('Fees UI error:', error);
    return NextResponse.json({ error: 'Internal server error' });
  }
}
