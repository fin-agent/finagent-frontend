import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Demo date system
const DEMO_TODAY = '2025-11-20';

function getDateOffset(): number {
  const actualToday = new Date();
  actualToday.setHours(0, 0, 0, 0);
  const [year, month, day] = DEMO_TODAY.split('-').map(Number);
  const demoToday = new Date(year, month - 1, day);
  demoToday.setHours(0, 0, 0, 0);
  const diffMs = demoToday.getTime() - actualToday.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function applyDateOffset(dateStr: string): string {
  if (!dateStr) return dateStr;
  const offset = getDateOffset();
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - offset);
  return date.toISOString().split('T')[0];
}

// Tables available for exploration
const TABLES = [
  { name: 'TradeData', displayName: 'Trade Data', dateColumns: ['Date', 'Expiration'] },
  { name: 'AccountBalance', displayName: 'Account Balance', dateColumns: ['Date'] },
  { name: 'AccountInfo', displayName: 'Account Info', dateColumns: ['AccountOpened', 'AccountClosed', 'Updated'] },
  { name: 'FeesAndInterest', displayName: 'Fees & Interest', dateColumns: ['Date'] },
  { name: 'conversations', displayName: 'Conversations', dateColumns: ['created_at', 'updated_at'] },
  { name: 'messages', displayName: 'Messages', dateColumns: ['created_at'] },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const table = searchParams.get('table');
  const applyOffset = searchParams.get('applyOffset') === 'true';
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');

  // If no table specified, return list of tables
  if (!table) {
    return NextResponse.json({ tables: TABLES });
  }

  // Validate table name
  const tableConfig = TABLES.find(t => t.name === table);
  if (!tableConfig) {
    return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
  }

  try {
    // Get total count
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    // Determine order column based on table
    const orderColumn = table === 'TradeData' ? 'Date'
      : table === 'conversations' ? 'created_at'
      : table === 'messages' ? 'created_at'
      : table === 'AccountBalance' ? 'Date'
      : table === 'AccountInfo' ? 'AccountCode'
      : table === 'FeesAndInterest' ? 'Date'
      : 'id';

    // Fetch data with pagination
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(offset, offset + limit - 1)
      .order(orderColumn, { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let processedData = data || [];

    // Apply date offset if requested
    if (applyOffset && processedData.length > 0) {
      processedData = processedData.map(row => {
        const newRow = { ...row };
        tableConfig.dateColumns.forEach(col => {
          if (newRow[col]) {
            // Handle timestamp columns
            if (typeof newRow[col] === 'string' && newRow[col].includes('T')) {
              const datePart = newRow[col].split('T')[0];
              const timePart = newRow[col].split('T')[1];
              newRow[col] = applyDateOffset(datePart) + 'T' + timePart;
            } else {
              newRow[col] = applyDateOffset(newRow[col]);
            }
          }
        });
        return newRow;
      });
    }

    // Get column info from first row
    const columns = processedData.length > 0
      ? Object.keys(processedData[0]).filter(col => col !== 'embedding') // Exclude embedding column
      : [];

    return NextResponse.json({
      table: tableConfig.name,
      displayName: tableConfig.displayName,
      dateColumns: tableConfig.dateColumns,
      columns,
      data: processedData,
      totalCount: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Data explorer error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
