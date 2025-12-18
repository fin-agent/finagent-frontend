import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate, realDateToDemoDate, formatDateForDB } from '@/src/lib/date-utils';

// Use formatCalendarDate from date-utils to apply demo date offset
// This ensures voice and UI show the same dates
function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';
  return formatCalendarDate(dateStr);
}

// Convert real dates to demo dates for DB queries
function toDBDateStr(date: Date): string {
  const demoDate = realDateToDemoDate(date);
  return formatDateForDB(demoDate);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

interface AccountBalanceRow {
  Date: string;
  CashBalance: number;
  'Stock LMV': number;
  'Stock SMV': number;
  'Options LMV': number;
  'Optons SMV': number; // Typo in DB
  'Account Equity': number;
  CreditBalance: number;
  DebitBalance: number;
  DayTradingBP: number;
  HouseRequirment: number; // Typo in DB
  HouseExcessDeficit: number;
  FedRequirement: number;
  FedExcessDeficit: number;
}

type QueryType = 'cash_balance' | 'buying_power' | 'account_summary' | 'nlv' |
                 'cash_and_equity' | 'overnight_margin' | 'market_value' | 'debit_balances' | 'credit_balances';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

// Use formatDateForVoice for consistent date display WITHOUT offset
const formatDate = formatDateForVoice;

function getDateRange(timePeriod?: string): { fromDate?: string; toDate?: string; periodLabel?: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!timePeriod || timePeriod === 'latest') {
    return {}; // No filter, get latest
  }

  const lowerPeriod = timePeriod.toLowerCase();

  if (lowerPeriod.includes('last month') || lowerPeriod.includes('past month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const toDate = new Date(today.getFullYear(), today.getMonth(), 0);
    const monthName = fromDate.toLocaleDateString('en-US', { month: 'long' });
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(toDate), periodLabel: monthName };
  }

  if (lowerPeriod.includes('this month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthName = fromDate.toLocaleDateString('en-US', { month: 'long' });
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: monthName };
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

  // Check for explicit month names
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  for (let i = 0; i < monthNames.length; i++) {
    if (lowerPeriod.includes(monthNames[i])) {
      const year = today.getFullYear();
      const fromDate = new Date(year, i, 1);
      const toDate = new Date(year, i + 1, 0);
      const monthName = fromDate.toLocaleDateString('en-US', { month: 'long' });
      return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(toDate), periodLabel: monthName };
    }
  }

  return {};
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Account balance request body:', JSON.stringify(body, null, 2));

    // Extract parameters from various possible locations
    const queryType: QueryType = body.query_type || body.parameters?.query_type ||
                                  body.body?.query_type || body.body?.parameters?.query_type ||
                                  'account_summary';
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period;

    const { fromDate, toDate, periodLabel } = getDateRange(timePeriod);

    // For balance trends (debit/credit balances), get multiple records
    if (queryType === 'debit_balances' || queryType === 'credit_balances') {
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

      if (error) {
        return NextResponse.json({
          response: `Error retrieving balance data: ${error.message}`,
        });
      }

      if (!data || data.length === 0) {
        return NextResponse.json({
          response: 'No balance data found for the specified period.',
        });
      }

      const balanceField = queryType === 'debit_balances' ? 'DebitBalance' : 'CreditBalance';
      const values = data.map(d => d[balanceField] || 0);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      const maxDate = data.find(d => d[balanceField] === max)?.Date;
      const minDate = data.find(d => d[balanceField] === min)?.Date;

      const balanceType = queryType === 'debit_balances' ? 'debit' : 'credit';
      const monthLabel = periodLabel || 'the period';
      const highestDate = formatDate(maxDate || '');
      const lowestDate = formatDate(minDate || '');

      return NextResponse.json({
        response: `Your average ${balanceType} balance for ${monthLabel} is ${formatCurrency(avg)}.\nThe highest ${balanceType} balance was on ${highestDate} at ${formatCurrency(max)}.\nThe lowest ${balanceType} balance was on ${lowestDate} at ${formatCurrency(min)}.`,
      });
    }

    // For other queries, get the latest record
    const { data, error } = await supabase
      .from('AccountBalance')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .order('Date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return NextResponse.json({
        response: `Error retrieving account balance: ${error.message}`,
      });
    }

    if (!data) {
      return NextResponse.json({
        response: 'No account balance data found.',
      });
    }

    const balance = data as AccountBalanceRow;
    const balanceDate = formatDate(balance.Date);

    switch (queryType) {
      case 'cash_balance':
        return NextResponse.json({
          response: `Your account cash balance as of ${balanceDate} is ${formatCurrency(balance.CashBalance)}`,
        });

      case 'cash_and_equity':
        return NextResponse.json({
          response: `Your account cash balance as of ${balanceDate} is ${formatCurrency(balance.CashBalance)}, and your account equity is ${formatCurrency(balance['Account Equity'])}`,
        });

      case 'buying_power':
        return NextResponse.json({
          response: `Your day trading buying power as of ${balanceDate} is ${formatCurrency(balance.DayTradingBP)}`,
        });

      case 'nlv':
        return NextResponse.json({
          response: `Your net liquidation value as of ${balanceDate} is ${formatCurrency(balance['Account Equity'])}`,
        });

      case 'overnight_margin':
        {
          const excessDeficit = balance.HouseExcessDeficit || 0;
          const label = excessDeficit >= 0 ? 'excess' : 'deficit';
          const amount = formatCurrency(Math.abs(excessDeficit));
          return NextResponse.json({
            response: `Your house requirement as of ${balanceDate} is ${formatCurrency(balance.HouseRequirment)}, and your house ${label} is ${amount}`,
          });
        }

      case 'market_value': {
        const stockLong = balance['Stock LMV'] || 0;
        const stockShort = balance['Stock SMV'] || 0;
        const optionsLong = balance['Options LMV'] || 0;
        const optionsShort = balance['Optons SMV'] || 0; // DB typo
        return NextResponse.json({
          response: `The market value of your long stock positions is ${formatCurrency(stockLong)}, your long options positions is ${formatCurrency(optionsLong)}, your short stock positions is ${formatCurrency(stockShort)}, and your short options positions is ${formatCurrency(optionsShort)}`,
        });
      }

      case 'account_summary':
      default:
        return NextResponse.json({
          response: `Your account summary as of ${balanceDate}:\n\n* Cash Balance: ${formatCurrency(balance.CashBalance)}\n* Account Equity: ${formatCurrency(balance['Account Equity'])}\n* Day Trading Buying Power: ${formatCurrency(balance.DayTradingBP)}\n* Stock Long Market Value: ${formatCurrency(balance['Stock LMV'] || 0)}\n* Stock Short Market Value: ${formatCurrency(balance['Stock SMV'] || 0)}\n* Options Long Market Value: ${formatCurrency(balance['Options LMV'] || 0)}\n* Options Short Market Value: ${formatCurrency(balance['Optons SMV'] || 0)}`,
        });
    }
  } catch (error) {
    console.error('Account balance error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error retrieving your account balance.',
    });
  }
}
