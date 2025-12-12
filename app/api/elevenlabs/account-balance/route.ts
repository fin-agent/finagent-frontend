import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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
                 'overnight_margin' | 'market_value' | 'debit_balances' | 'credit_balances';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDateRange(timePeriod?: string): { fromDate?: Date; toDate?: Date } {
  const today = new Date();

  if (!timePeriod || timePeriod === 'latest') {
    return {}; // No filter, get latest
  }

  const lowerPeriod = timePeriod.toLowerCase();

  if (lowerPeriod.includes('last month') || lowerPeriod.includes('past month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const toDate = new Date(today.getFullYear(), today.getMonth(), 0);
    return { fromDate, toDate };
  }

  if (lowerPeriod.includes('this month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    return { fromDate, toDate: today };
  }

  if (lowerPeriod.includes('last week') || lowerPeriod.includes('past week')) {
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 7);
    return { fromDate, toDate: today };
  }

  if (lowerPeriod.includes('this year')) {
    const fromDate = new Date(today.getFullYear(), 0, 1);
    return { fromDate, toDate: today };
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

    const { fromDate, toDate } = getDateRange(timePeriod);

    // For balance trends (debit/credit balances), get multiple records
    if (queryType === 'debit_balances' || queryType === 'credit_balances') {
      let query = supabase
        .from('AccountBalance')
        .select('Date, DebitBalance, CreditBalance')
        .eq('AccountCode', ACCOUNT_CODE)
        .order('Date', { ascending: false });

      if (fromDate) {
        query = query.gte('Date', fromDate.toISOString().split('T')[0]);
      }
      if (toDate) {
        query = query.lte('Date', toDate.toISOString().split('T')[0]);
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
      const periodDesc = timePeriod || 'available period';

      return NextResponse.json({
        response: `Your ${balanceType} balance for the ${periodDesc}: Average: ${formatCurrency(avg)}, Highest: ${formatCurrency(max)} on ${formatDate(maxDate || '')}, Lowest: ${formatCurrency(min)} on ${formatDate(minDate || '')}.`,
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
          response: `Your account cash balance as of ${balanceDate} is ${formatCurrency(balance.CashBalance)}. Your total account equity is ${formatCurrency(balance['Account Equity'])}.`,
        });

      case 'buying_power':
        return NextResponse.json({
          response: `Your day trading buying power as of ${balanceDate} is ${formatCurrency(balance.DayTradingBP)}.`,
        });

      case 'nlv':
        return NextResponse.json({
          response: `Your net liquidation value (account equity) as of ${balanceDate} is ${formatCurrency(balance['Account Equity'])}.`,
        });

      case 'overnight_margin':
        return NextResponse.json({
          response: `Your overnight margin status as of ${balanceDate}: House Requirement: ${formatCurrency(balance.HouseRequirment)}, House Excess/Deficit: ${formatCurrency(balance.HouseExcessDeficit)}, Federal Requirement: ${formatCurrency(balance.FedRequirement)}, Federal Excess/Deficit: ${formatCurrency(balance.FedExcessDeficit)}.`,
        });

      case 'market_value': {
        const stockLong = balance['Stock LMV'] || 0;
        const stockShort = balance['Stock SMV'] || 0;
        const optionsLong = balance['Options LMV'] || 0;
        const optionsShort = balance['Optons SMV'] || 0; // DB typo
        return NextResponse.json({
          response: `Market value of your positions as of ${balanceDate}: Stock Long: ${formatCurrency(stockLong)}, Stock Short: ${formatCurrency(stockShort)}, Options Long: ${formatCurrency(optionsLong)}, Options Short: ${formatCurrency(optionsShort)}.`,
        });
      }

      case 'account_summary':
      default:
        return NextResponse.json({
          response: `Your account summary as of ${balanceDate}: Cash Balance: ${formatCurrency(balance.CashBalance)}, Account Equity: ${formatCurrency(balance['Account Equity'])}, Day Trading BP: ${formatCurrency(balance.DayTradingBP)}, Stock Long Market Value: ${formatCurrency(balance['Stock LMV'] || 0)}, Stock Short Market Value: ${formatCurrency(balance['Stock SMV'] || 0)}, Options Long Market Value: ${formatCurrency(balance['Options LMV'] || 0)}, Options Short Market Value: ${formatCurrency(balance['Optons SMV'] || 0)}.`,
        });
    }
  } catch (error) {
    console.error('Account balance error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error retrieving your account balance.',
    });
  }
}
