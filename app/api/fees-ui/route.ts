import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate, realDateToDemoDate, formatDateForDB } from '@/src/lib/date-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

const SYMBOL_MAP: Record<string, string> = {
  'apple': 'AAPL',
  'google': 'GOOGL',
  'alphabet': 'GOOGL',
  'amazon': 'AMZN',
  'microsoft': 'MSFT',
  'tesla': 'TSLA',
  'nvidia': 'NVDA',
  'meta': 'META',
  'netflix': 'NFLX',
};

function normalizeSymbol(input: string): string {
  const lower = input.toLowerCase().trim();
  return SYMBOL_MAP[lower] || input.toUpperCase();
}

export interface FeesUIData {
  feeType: string;
  totalAmount: number;
  transactionCount: number;
  timePeriod: string;
  symbol?: string;
  breakdown?: Array<{
    date: string;
    amount: number;
    symbol?: string;
  }>;
}

function getDateRange(timePeriod: string): { fromDate: string; toDate: string } {
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
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(toDate) };
  }

  if (lowerPeriod.includes('this month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today) };
  }

  if (lowerPeriod.includes('last week') || lowerPeriod.includes('past week')) {
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 7);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today) };
  }

  if (lowerPeriod.includes('this week')) {
    const dayOfWeek = today.getDay();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - dayOfWeek);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today) };
  }

  if (lowerPeriod.includes('this year') || lowerPeriod.includes('since the beginning of the year')) {
    const fromDate = new Date(today.getFullYear(), 0, 1);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today) };
  }

  // Check for month names
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  for (let i = 0; i < monthNames.length; i++) {
    if (lowerPeriod.includes(monthNames[i])) {
      const year = lowerPeriod.includes('last year') ? today.getFullYear() - 1 : today.getFullYear();
      const fromDate = new Date(year, i, 1);
      const toDate = new Date(year, i + 1, 0);
      return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(toDate) };
    }
  }

  // Default to last 30 days
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 30);
  return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today) };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const feeType = body.feeType || 'commission';
    const timePeriod = body.timePeriod || 'this month';
    const symbol = body.symbol;

    const { fromDate, toDate } = getDateRange(timePeriod);

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
        timePeriod,
        breakdown: data.slice(0, 10).map(t => ({
          date: formatCalendarDate(t.Date),
          amount: Math.abs(t.Commission || 0),
          symbol: t.Symbol,
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
      timePeriod,
      symbol: symbol ? normalizeSymbol(symbol) : undefined,
      breakdown: data.slice(0, 10).map(f => ({
        date: formatCalendarDate(f.Date),
        amount: Math.abs(f.Amount || 0),
        symbol: f.Symbol,
      })),
    });
  } catch (error) {
    console.error('Fees UI error:', error);
    return NextResponse.json({ error: 'Internal server error' });
  }
}
