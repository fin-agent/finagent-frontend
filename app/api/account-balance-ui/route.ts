import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { realDateToDemoDate, formatDateForDB } from '@/src/lib/date-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export interface AccountBalanceUIData {
  queryType: string;
  date: string;
  cashBalance?: number;
  accountEquity?: number;
  dayTradingBP?: number;
  stockLMV?: number;
  stockSMV?: number;
  optionsLMV?: number;
  optionsSMV?: number;
  creditBalance?: number;
  debitBalance?: number;
  houseRequirement?: number;
  houseExcessDeficit?: number;
  fedRequirement?: number;
  fedExcessDeficit?: number;
  // For balance trends
  balanceTrend?: {
    average: number;
    highest: number;
    highestDate: string;
    lowest: number;
    lowestDate: string;
    period: string;
    periodMonth?: string;
  };
}

function getDateRange(timePeriod?: string): { fromDate?: string; toDate?: string; periodLabel?: string; periodMonth?: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!timePeriod || timePeriod === 'latest') {
    return {};
  }

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

  if (lowerPeriod.includes('this year')) {
    const fromDate = new Date(today.getFullYear(), 0, 1);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: 'this year' };
  }

  // Check for explicit month names (e.g., "October", "month of October")
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  for (let i = 0; i < monthNames.length; i++) {
    if (lowerPeriod.includes(monthNames[i])) {
      const year = today.getFullYear();
      const fromDate = new Date(year, i, 1);
      const toDate = new Date(year, i + 1, 0);
      const monthName = fromDate.toLocaleDateString('en-US', { month: 'long' });
      return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(toDate), periodLabel: `month of ${monthName}`, periodMonth: monthName };
    }
  }

  return {};
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const queryType = body.queryType || 'account_summary';
    const timePeriod = body.timePeriod;

    const { fromDate, toDate, periodLabel, periodMonth } = getDateRange(timePeriod);

    // For balance trends
    if (queryType === 'debit_balances' || queryType === 'credit_balances') {
      const resolvedPeriodLabel = periodLabel || timePeriod || 'available period';
      let query = supabase
        .from('AccountBalance')
        .select('Date, DebitBalance, CreditBalance')
        .eq('AccountCode', ACCOUNT_CODE)
        .order('Date', { ascending: false });

      if (fromDate) {
        query = query.gte('Date', fromDate);
      }
      if (toDate) {
        query = query.lte('Date', toDate);
      }

      const { data, error } = await query;

      if (error || !data || data.length === 0) {
        return NextResponse.json({ error: 'No data found' });
      }

      const balanceField = queryType === 'debit_balances' ? 'DebitBalance' : 'CreditBalance';
      const values = data.map(d => d[balanceField] || 0);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      const maxDate = data.find(d => d[balanceField] === max)?.Date || '';
      const minDate = data.find(d => d[balanceField] === min)?.Date || '';
      const entries = data
        .slice()
        .reverse()
        .map((row) => ({ date: row.Date, amount: row[balanceField] || 0 }));

      return NextResponse.json({
        queryType,
        date: data[0].Date, // Return raw date - component will format it
        balanceTrend: {
          average: avg,
          highest: max,
          highestDate: maxDate, // Return raw date
          lowest: min,
          lowestDate: minDate, // Return raw date
          period: resolvedPeriodLabel,
          periodMonth,
          entries,
        },
      });
    }

    // Get latest record for other queries
    const { data, error } = await supabase
      .from('AccountBalance')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .order('Date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'No data found' });
    }

    const result: AccountBalanceUIData = {
      queryType,
      date: data.Date, // Return raw date - component will format it
      cashBalance: data.CashBalance,
      accountEquity: data['Account Equity'],
      dayTradingBP: data.DayTradingBP,
      stockLMV: data['Stock LMV'],
      stockSMV: data['Stock SMV'],
      optionsLMV: data['Options LMV'],
      optionsSMV: data['Optons SMV'], // DB typo
      creditBalance: data.CreditBalance,
      debitBalance: data.DebitBalance,
      houseRequirement: data.HouseRequirment, // DB typo
      houseExcessDeficit: data.HouseExcessDeficit,
      fedRequirement: data.FedRequirement,
      fedExcessDeficit: data.FedExcessDeficit,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Account balance UI error:', error);
    return NextResponse.json({ error: 'Internal server error' });
  }
}
