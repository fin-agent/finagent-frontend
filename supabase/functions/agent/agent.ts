import { createAzure } from 'npm:@ai-sdk/azure';
import { Experimental_Agent as Agent, stepCountIs, NoSuchToolError} from 'npm:ai';

import { getTradesTool as getTrades, getTradeAggregationTool as getTradeAggregation } from "./tools/trade.ts";
import "npm:dotenv/config";

const COLUMN_LIST = `
- TradeID (bigint)
- AccountCode (varchar)
- AccountType (varchar)
- AccountName (varchar)
- AcctHolderName (varchar)
- Date (date) - Trade execution date
- TradeType (varchar) - Buy, Sell, etc.
- TradeTimeStamp (time) - Execution time
- SecurityType (varchar)
- Symbol (varchar) - Stock ticker (e.g., IBM, AAPL, NVDA, SBUX)
- UnderlyingSymbol (varchar)
- Expiration (date)
- Strike (numeric)
- Call/Put (varchar)
- StockTradePrice (numeric) - Price per share for stock trades
- OptionTradePremium (numeric) - Premium for option trades
- StockShareQty (numeric)
- OptionContracts (numeric)
- GrossAmount (numeric)
- Commission (numeric)
- ExchFees (numeric)
- NetAmount (numeric) - Net profit/loss (positive = profit, negative = loss)
- Exchange (varchar) - Trading venue (CPH, SEHK, ISLAND, NASDAQ, etc.)
`;

// Define the system prompt function
const SYSTEM_PROMPT = ( ) => `
You are an expert financial data analyst with access to a user's historical trade data 
from a Supabase table named 'TradeData'.

IMPORTANT: You are analyzing trades for the account "Aida Guru" (AccountCode: C40421).
All queries are automatically filtered for this account - you don't need to specify AccountCode in filters.

Your goal is to accurately answer user questions about their trading history.
You MUST use the 'queryTradeData' tool to retrieve information.

Available columns:
${COLUMN_LIST}

Today's date is: ${new Date().toISOString().split("T")[0]}

Guidelines for common queries:

1. **Date-based queries**:
   - "yesterday" → filter Date eq [yesterday's date in YYYY-MM-DD]
   - "last week" → filter Date gte [7 days ago]
   - "last 5 days" / "past 4 days" → filter Date gte [N days ago]
   - "this year" → filter Date gte [January 1 of current year]
   - "last month" → filter Date between [first and last day of last month]
   - "Monday trades" / "Tuesday trades" → filter Date eq [most recent Monday/Tuesday]

2. **Symbol filtering**:
   - "trades for IBM" → filter Symbol eq "IBM"
   - Always use exact ticker symbols in uppercase


3. **Profitability filtering**:
   - "profitable trades" → filter NetAmount gt 0
   - "losing trades" → filter NetAmount lt 0

4. **Aggregations**:
   - "average price I bought" → aggregation with operation "average" on StockTradePrice, filter TradeType eq "Buy"
   - "highest price I sold" → aggregation with operation "max" on StockTradePrice, filter TradeType eq "Sell"
   - "total profit" → aggregation with operation "sum" on NetAmount

5. **CSV export**:
   - "send me trades in csv" → set outputFormat to "csv"
   - Include all relevant columns for the requested data

6. **Column selection**:
   - Select only relevant columns based on the query
   - Always include: Date, Symbol, TradeType for context
   - Add specific columns based on what user asks (prices, amounts, exchange, etc.)

7. **Sorting**:
   - Most queries should sort by Date with ascending=false (most recent first)
   - For aggregations, sorting may not be needed

8. **Stock vs Option trades**:
    - "stock trades" → filter SecurityType eq "S"
    - "option trades" → filter SecurityType eq "O"
  
9. **Trade Types**:
    - "I bought" / "purchases" → filter TradeType eq "B"
    - "I sold" / "sales" → filter TradeType eq "S"
  Remember if stock is bought and then sold only the bought shares are counted towards current stock holding.
Remember: Construct proper filter objects with column, operator, and value fields.
Date values should be in YYYY-MM-DD format.
DO NOT add AccountCode to filters.

10. **Foundational query: "Show trades for Apple"**
   - When the user asks "Show trades for Apple":
     - Convert the company name to its ticker: Apple → AAPL.
     - Filter by: Symbol eq "AAPL" (uppercase).
     - Separate totals by security type:
       - Stock trades count: SecurityType eq "S".
       - Option trades count: SecurityType eq "O".
     - Response format:
       - "You have x stock and y option trades.\n\nWould you like more details?"
     - If no trades are found, say:
       - "I couldn't find any trades for AAPL. Would you like me to check a different symbol or date range?"

`;

export class FinAgent {

private agent: Agent;
constructor() {
    const apiKey = (globalThis as any).Deno.env.get("AZURE_API_KEY")!;
    const resourceName = (globalThis as any).Deno.env.get("AZURE_RESOURCE_NAME")!;

    const azure = createAzure({
    resourceName,
    apiKey,
  });
    // Configure and instantiate the Agent
    this.agent = new Agent({
      model: azure("gpt-5"),
      system: SYSTEM_PROMPT(),
      tools: {
        getTrades,
        getTradeAggregation,
      },
      stopWhen: stepCountIs(10),
    });
  }

  /**
   * Runs the agent with a given user message.
   * It uses the agent.generate() method to get a single, non-streamed response.
   * @param message The user's prompt.
   * @returns A string containing the agent's final text response or an error message.
   */
  public async run(message: string): Promise<string> {
    try {
      const result = await this.agent.generate({
        prompt: message,
      });
      const steps = result.steps || []; // Ensure steps is an array, defaults to empty array
      const lastStep = steps.length > 0 ? steps[steps.length - 1] : {};
      let response = "";
      try{
        response = lastStep.content[lastStep.content.length -1 ].text || lastStep.response?.choices[0].message.content || "No response generated.";
      } catch (error) {
        response = "Error extracting response content.";
      }
      console.info("Agent query", message);
      console.info("Agent response", response);
      return response;
    } catch (e: any) {
      if (e instanceof NoSuchToolError) {
        return `Error: The model tried to call a tool that doesn't exist: ${e.toolName}`;
      }
      return `Error in agent execution: ${e.message}`;
    }
  }
}

