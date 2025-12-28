import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate, realDateToDemoDate, formatDateForDB } from '@/src/lib/date-utils';
import { suggestDataPeriod } from '@/src/lib/data-availability';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';

// LLM-resolved date filter
interface DateFilter {
  type: 'range' | 'discrete' | 'relative';
  startDate?: string;
  endDate?: string;
  dates?: string[];
  description: string;
}

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

// UI data structure for AccountSummary component
interface AccountBalanceUIData {
  queryType: QueryType;
  timePeriod?: string;
  asOfDate: string;
  cashBalance?: number;
  accountEquity?: number;
  dayTradingBP?: number;
  stockLMV?: number;
  stockSMV?: number;
  optionsLMV?: number;
  optionsSMV?: number;
  houseRequirement?: number;
  houseExcessDeficit?: number;
  debitBalance?: number;
  creditBalance?: number;
  // For balance trends
  avgBalance?: number;
  maxBalance?: number;
  minBalance?: number;
  maxBalanceDate?: string;
  minBalanceDate?: string;
  suggestion?: {
    period: string;
  } | null;
}

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
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter ||
                       body.body?.date_filter || body.body?.parameters?.date_filter;

    // Resolve dates - prioritize LLM-resolved dateFilter, fall back to parsing timePeriod
    let startDate: string | undefined;
    let endDate: string | undefined;
    let dates: string[] | undefined;
    let description: string = timePeriod || '';
    let resolvedType: 'range' | 'discrete' = 'range';

    if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      // LLM has resolved the dates in real calendar time - convert to demo database dates
      const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
      const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
      const realStart = new Date(sy, sm - 1, sd);
      const realEnd = new Date(ey, em - 1, ed);
      startDate = formatDateForDB(realDateToDemoDate(realStart));
      endDate = formatDateForDB(realDateToDemoDate(realEnd));
      description = dateFilter.description || timePeriod || 'selected period';
      console.log(`Using LLM dateFilter: real ${dateFilter.startDate} to ${dateFilter.endDate} -> demo ${startDate} to ${endDate} (${description})`);
    } else if (dateFilter && dateFilter.type === 'discrete' && dateFilter.dates && dateFilter.dates.length > 0) {
      // LLM provided discrete dates in real calendar time - convert each to demo dates
      dates = dateFilter.dates.map(d => {
        const [y, m, day] = d.split('-').map(Number);
        const realDate = new Date(y, m - 1, day);
        return formatDateForDB(realDateToDemoDate(realDate));
      });
      resolvedType = 'discrete';
      description = dateFilter.description || timePeriod || 'selected dates';
      console.log(`Using LLM discrete dates: ${dateFilter.dates.join(', ')} -> demo ${dates.join(', ')} (${description})`);
    } else if (timePeriod) {
      // Fall back to parsing timePeriod string when dateFilter not provided
      const resolved = parseTimePeriodToResolvedDates(timePeriod);
      if (resolved) {
        if (resolved.type === 'discrete' && resolved.dates) {
          dates = resolved.dates;
          resolvedType = 'discrete';
        } else if (resolved.startDate && resolved.endDate) {
          startDate = resolved.startDate;
          endDate = resolved.endDate;
        }
        description = resolved.description || timePeriod;
        console.log(`Parsed timePeriod "${timePeriod}": ${resolved.type}, dates: ${dates || `${startDate} to ${endDate}`}`);
      } else {
        description = timePeriod;
        console.log(`Could not parse timePeriod "${timePeriod}", querying all data`);
      }
    }

    // For balance trends (debit/credit balances), get multiple records
    if (queryType === 'debit_balances' || queryType === 'credit_balances') {
      let query = supabase
        .from('AccountBalance')
        .select('Date, DebitBalance, CreditBalance')
        .eq('AccountCode', ACCOUNT_CODE)
        .order('Date', { ascending: false });

      // Apply date filters
      if (resolvedType === 'discrete' && dates && dates.length > 0) {
        query = query.in('Date', dates);
      } else if (startDate && endDate) {
        query = query.gte('Date', startDate).lte('Date', endDate);
      }

      const { data, error } = await query;

      if (error) {
        const uiData: AccountBalanceUIData = {
          queryType,
          timePeriod: description || timePeriod,
          asOfDate: '',
        };
        return NextResponse.json({
          response: `Error retrieving balance data: ${error.message}`,
          uiData,
        });
      }

      if (!data || data.length === 0) {
        // Use LLM-based suggestion for a natural time period
        const periodDescription = description || timePeriod || 'the specified period';
        const suggestion = await suggestDataPeriod('AccountBalance', periodDescription);

        if (suggestion) {
          const uiData: AccountBalanceUIData = {
            queryType,
            timePeriod: periodDescription,
            asOfDate: '',
            suggestion: {
              period: suggestion.suggestedPeriod,
            },
          };
          return NextResponse.json({
            response: `No balance data found for ${periodDescription}. However, I found balance data for ${suggestion.suggestedPeriod}. Would you like to know more about that?`,
            uiData,
          });
        }

        const uiData: AccountBalanceUIData = {
          queryType,
          timePeriod: periodDescription,
          asOfDate: '',
        };
        return NextResponse.json({
          response: `No balance data found for ${periodDescription}.`,
          uiData,
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
      const periodLabel = description || timePeriod || 'the period';
      // Use formatted dates for voice response
      const highestDateFormatted = formatDate(maxDate || '');
      const lowestDateFormatted = formatDate(minDate || '');

      // Use raw dates for UI so the component can format them
      const uiData: AccountBalanceUIData = {
        queryType,
        timePeriod: periodLabel,
        asOfDate: data[0]?.Date || '',
        avgBalance: avg,
        maxBalance: max,
        minBalance: min,
        maxBalanceDate: maxDate || '', // Raw date for UI
        minBalanceDate: minDate || '', // Raw date for UI
      };

      return NextResponse.json({
        response: `Your Average ${balanceType} balance for ${periodLabel} is ${formatCurrency(avg)}. The Highest ${balanceType} balance was on ${highestDateFormatted} in the amount of ${formatCurrency(max)}. The Lowest ${balanceType} balance was on ${lowestDateFormatted} in the amount of ${formatCurrency(min)}`,
        uiData,
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
      const uiData: AccountBalanceUIData = {
        queryType,
        asOfDate: '',
      };
      return NextResponse.json({
        response: `Error retrieving account balance: ${error.message}`,
        uiData,
      });
    }

    if (!data) {
      const uiData: AccountBalanceUIData = {
        queryType,
        asOfDate: '',
      };
      return NextResponse.json({
        response: 'No account balance data found.',
        uiData,
      });
    }

    const balance = data as AccountBalanceRow;
    const balanceDate = formatDate(balance.Date);

    // Build base uiData with all available account fields
    // Use raw date for uiData so UI can format it; use formatted date for voice response
    const baseUIData: AccountBalanceUIData = {
      queryType,
      asOfDate: balance.Date, // Raw date for UI formatting
      cashBalance: balance.CashBalance,
      accountEquity: balance['Account Equity'],
      dayTradingBP: balance.DayTradingBP,
      stockLMV: balance['Stock LMV'] || 0,
      stockSMV: balance['Stock SMV'] || 0,
      optionsLMV: balance['Options LMV'] || 0,
      optionsSMV: balance['Optons SMV'] || 0, // DB typo
      houseRequirement: balance.HouseRequirment,
      houseExcessDeficit: balance.HouseExcessDeficit,
      debitBalance: balance.DebitBalance,
      creditBalance: balance.CreditBalance,
    };

    switch (queryType) {
      case 'cash_balance':
        return NextResponse.json({
          response: `Your account cash balance as of ${balanceDate} is ${formatCurrency(balance.CashBalance)}`,
          uiData: baseUIData,
        });

      case 'cash_and_equity':
        return NextResponse.json({
          response: `Your account cash balance as of ${balanceDate} is ${formatCurrency(balance.CashBalance)} and account equity is ${formatCurrency(balance['Account Equity'])}`,
          uiData: baseUIData,
        });

      case 'buying_power':
        return NextResponse.json({
          response: `Your Day Trade Buying power as of ${balanceDate} is ${formatCurrency(balance.DayTradingBP)}`,
          uiData: baseUIData,
        });

      case 'nlv':
        return NextResponse.json({
          response: `Your account Net Liquidation value as of ${balanceDate} is ${formatCurrency(balance['Account Equity'])}`,
          uiData: baseUIData,
        });

      case 'overnight_margin':
        {
          const excessDeficit = balance.HouseExcessDeficit || 0;
          const label = excessDeficit >= 0 ? 'House Excess' : 'House Deficit';
          const amount = formatCurrency(Math.abs(excessDeficit));
          return NextResponse.json({
            response: `Your account House requirement as of ${balanceDate} is ${formatCurrency(balance.HouseRequirment)} and ${label} is ${amount}`,
            uiData: baseUIData,
          });
        }

      case 'market_value': {
        const stockLong = balance['Stock LMV'] || 0;
        const stockShort = balance['Stock SMV'] || 0;
        const optionsLong = balance['Options LMV'] || 0;
        const optionsShort = balance['Optons SMV'] || 0; // DB typo
        return NextResponse.json({
          response: `The market value of your long stock positions is ${formatCurrency(stockLong)}, your long options positions is ${formatCurrency(optionsLong)}, your short stock positions is ${formatCurrency(stockShort)}, your short options positions is ${formatCurrency(optionsShort)}`,
          uiData: baseUIData,
        });
      }

      case 'account_summary':
      default:
        return NextResponse.json({
          response: `Your account summary as of ${balanceDate}: Cash Balance is ${formatCurrency(balance.CashBalance)}, Account Equity is ${formatCurrency(balance['Account Equity'])}, Day Trading BP is ${formatCurrency(balance.DayTradingBP)}, Stock Long Market value is ${formatCurrency(balance['Stock LMV'] || 0)}, Stock Short Market value is ${formatCurrency(balance['Stock SMV'] || 0)}, Options Long Market value is ${formatCurrency(balance['Options LMV'] || 0)}, Options Short Market value is ${formatCurrency(balance['Optons SMV'] || 0)}`,
          uiData: baseUIData,
        });
    }
  } catch (error) {
    console.error('Account balance error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error retrieving your account balance.',
    });
  }
}
