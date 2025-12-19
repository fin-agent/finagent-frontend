import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate } from '@/src/lib/date-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';
import { checkDataAvailability } from '@/src/lib/data-availability';

// Use formatCalendarDate from date-utils to apply demo date offset
// This ensures voice and UI show the same dates
function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';
  return formatCalendarDate(dateStr);
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

    // Resolve dates using centralized parser
    const resolved = timePeriod ? parseTimePeriodToResolvedDates(timePeriod) : null;

    // For balance trends (debit/credit balances), get multiple records
    if (queryType === 'debit_balances' || queryType === 'credit_balances') {
      let query = supabase
        .from('AccountBalance')
        .select('Date, DebitBalance, CreditBalance')
        .eq('AccountCode', ACCOUNT_CODE)
        .order('Date', { ascending: false });

      if (resolved) {
        if (resolved.type === 'discrete' && resolved.dates && resolved.dates.length > 0) {
          query = query.in('Date', resolved.dates);
        } else if (resolved.startDate && resolved.endDate) {
          query = query.gte('Date', resolved.startDate).lte('Date', resolved.endDate);
        }
      }

      const { data, error } = await query;

      if (error) {
        return NextResponse.json({
          response: `Error retrieving balance data: ${error.message}`,
        });
      }

      if (!data || data.length === 0) {
        // Check data availability to provide helpful suggestion
        const { availableRange } = resolved
          ? await checkDataAvailability('AccountBalance', resolved)
          : { availableRange: { hasData: false, earliestDate: '', latestDate: '' } };
        const suggestionText = availableRange.hasData
          ? ` Data is available from ${new Date(availableRange.earliestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} to ${new Date(availableRange.latestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Would you like to try a different time period?`
          : '';

        return NextResponse.json({
          response: `No balance data found for the specified period.${suggestionText}`,
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
      const periodLabel = resolved?.description || timePeriod || 'the period';
      const highestDate = formatDate(maxDate || '');
      const lowestDate = formatDate(minDate || '');

      return NextResponse.json({
        response: `Your Average ${balanceType} balance for ${periodLabel} is ${formatCurrency(avg)}. The Highest ${balanceType} balance was on ${highestDate} in the amount of ${formatCurrency(max)}. The Lowest ${balanceType} balance was on ${lowestDate} in the amount of ${formatCurrency(min)}`,
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
          response: `Your account cash balance as of ${balanceDate} is ${formatCurrency(balance.CashBalance)} and account equity is ${formatCurrency(balance['Account Equity'])}`,
        });

      case 'buying_power':
        return NextResponse.json({
          response: `Your Day Trade Buying power as of ${balanceDate} is ${formatCurrency(balance.DayTradingBP)}`,
        });

      case 'nlv':
        return NextResponse.json({
          response: `Your account Net Liquidation value as of ${balanceDate} is ${formatCurrency(balance['Account Equity'])}`,
        });

      case 'overnight_margin':
        {
          const excessDeficit = balance.HouseExcessDeficit || 0;
          const label = excessDeficit >= 0 ? 'House Excess' : 'House Deficit';
          const amount = formatCurrency(Math.abs(excessDeficit));
          return NextResponse.json({
            response: `Your account House requirement as of ${balanceDate} is ${formatCurrency(balance.HouseRequirment)} and ${label} is ${amount}`,
          });
        }

      case 'market_value': {
        const stockLong = balance['Stock LMV'] || 0;
        const stockShort = balance['Stock SMV'] || 0;
        const optionsLong = balance['Options LMV'] || 0;
        const optionsShort = balance['Optons SMV'] || 0; // DB typo
        return NextResponse.json({
          response: `The market value of your long stock positions is ${formatCurrency(stockLong)}, your long options positions is ${formatCurrency(optionsLong)}, your short stock positions is ${formatCurrency(stockShort)}, your short options positions is ${formatCurrency(optionsShort)}`,
        });
      }

      case 'account_summary':
      default:
        return NextResponse.json({
          response: `Your account summary as of ${balanceDate}: Cash Balance is ${formatCurrency(balance.CashBalance)}, Account Equity is ${formatCurrency(balance['Account Equity'])}, Day Trading BP is ${formatCurrency(balance.DayTradingBP)}, Stock Long Market value is ${formatCurrency(balance['Stock LMV'] || 0)}, Stock Short Market value is ${formatCurrency(balance['Stock SMV'] || 0)}, Options Long Market value is ${formatCurrency(balance['Options LMV'] || 0)}, Options Short Market value is ${formatCurrency(balance['Optons SMV'] || 0)}`,
        });
    }
  } catch (error) {
    console.error('Account balance error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error retrieving your account balance.',
    });
  }
}
