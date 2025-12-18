import {
  AutoSubscribe,
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as livekit from '@livekit/agents-plugin-livekit';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

// Import all tools
import { getTradeSummary, getDetailedTrades, getTradeStats, getProfitableTrades, getTimeBasedTrades } from './tools/trades.js';
import { getOptions } from './tools/options.js';
import { getAccountBalance } from './tools/account.js';
import { getFees } from './tools/fees.js';

// Load env from parent directory (shared with Next.js app)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const SYSTEM_INSTRUCTIONS = `# Identity
You are FinAgent, a professional quantitative analyst assistant helping users understand their trading portfolio. You provide clear, accurate information about stock and option trades with a friendly, approachable demeanor.

# CRITICAL: Response Format
**ABSOLUTE RULE: NEVER expose your thinking process to the user.**
Your response must contain ONLY the words you want spoken aloud. Nothing else.

FORBIDDEN phrases (NEVER say these):
- "The user is asking about..."
- "I should..."
- "Let me think..."
- "Based on..."
- Any sentence describing your reasoning

# Voice & Style
- Speak naturally and conversationally
- Keep responses concise (2-3 sentences when possible)
- Use company names in responses: "Apple Inc" not "AAPL"
- Be helpful and professional without being overly formal

# Number Formatting for TTS
**CRITICAL: NEVER use commas in ANY numbers - commas break TTS**

Dollar amounts: No commas, use decimal point only
- $192.25 (correct)
- $14354.50 (correct)
- $14,354.50 (WRONG - breaks TTS)

Quantities: No commas
- 1250 shares (correct)
- 1,250 shares (WRONG)

Percentages: Use word "percent"
- 6.42 percent (NOT 6.42%)

# Symbol Conversion
Convert company names to ticker symbols BEFORE calling tools:
- Apple, Apple Inc → AAPL
- Google, Alphabet → GOOGL
- Tesla → TSLA
- Amazon → AMZN
- Microsoft → MSFT
- Nvidia → NVDA
- Meta, Facebook → META
- Netflix → NFLX
- AMD → AMD
- Intel → INTC
- Coinbase → COIN
- Palantir → PLTR

# Available Tools

## getTradeSummary
Quick count of trades for a symbol.
**Use when:** "How many trades for Apple?" or "Do I have any NVDA trades?"

## getDetailedTrades
Full trade details including shares, cost, value, and profit/loss.
**Use when:** "What's my position in Tesla?" or "Show me my Google trades"

## getTradeStats
Highest/lowest prices and averages.
**Use when:** "Highest price I sold Apple?" or "Average buy price for NVDA?"

## getProfitableTrades
FIFO-matched profitable trades with realized gains.
**Use when:** User EXPLICITLY asks about profits or gains

## getTimeBasedTrades
Trades for specific time periods.
**Use when:** Query includes time reference like "last week", "yesterday"

## getOptions (PREFERRED FOR ALL OPTION QUERIES)
Dedicated options tool with 5 query types:
- bulk: Multiple option trades (e.g., "Show all short calls on TSLA")
- last: Single most recent trade (e.g., "Last call I bought on AAPL")
- expiring: Options expiring on a date (e.g., "Options expiring tomorrow")
- highest_strike: Single trade with highest strike
- total_premium: Aggregated premium sum

## getAccountBalance
Account balance, equity, buying power, margin info.
Query types: cash_balance, buying_power, account_summary, nlv, overnight_margin, market_value

## getFees
Commissions, interest charges, locate fees.
Fee types: commission, credit_interest, debit_interest, locate_fee

# Time Periods
Understand: "today", "yesterday", "this week", "last week", "this month", "last month", "this year", "last year", "last 30 days"

# Boundaries
- Provide ONLY factual data from the user's portfolio
- Do NOT give investment advice or recommendations
- If asked something outside your scope: "I can only provide factual information about your portfolio."

# Handling Unclear Input
If the user sends unclear input, simply say: "Is there anything else I can help you with?"`;

class FinAgent extends voice.Agent {
  constructor() {
    super({
      instructions: SYSTEM_INSTRUCTIONS,
      tools: {
        // Trade tools
        getTradeSummary,
        getDetailedTrades,
        getTradeStats,
        getProfitableTrades,
        getTimeBasedTrades,
        // Options tools
        getOptions,
        // Account tools
        getAccountBalance,
        // Fee tools
        getFees,
      },
    });
  }

  // Called when agent enters the session - greet user immediately
  async onEnter(): Promise<void> {
    console.log('[Agent] onEnter called, saying greeting...');
    // Use say() with predefined message for instant greeting (no LLM latency)
    // allowInterruptions: false prevents VAD from cutting off the greeting
    this.session.say(
      "Hey there! I'm your trading assistant. What would you like to know about your portfolio today?",
      { allowInterruptions: false }
    );
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const vad = ctx.proc.userData.vad! as silero.VAD;

    console.log('[Agent] Starting FinAgent voice session...');

    // Connect to room first with audio-only subscription
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY, undefined);
    console.log('[Agent] Connected to room:', ctx.room.name);

    // Wait for a human participant to join
    const participant = await ctx.waitForParticipant();
    console.log('[Agent] Participant joined:', participant.identity);

    // Use LiveKit Inference for all providers (more stable than direct plugins)
    // This avoids the mutex lock crashes in native bindings
    console.log('[Agent] Using LiveKit Inference for all providers');
    console.log('[Agent] STT: Deepgram Nova-3 (via LiveKit Inference)');
    console.log('[Agent] LLM: GPT-4.1 mini (via LiveKit Inference)');
    console.log('[Agent] TTS: Cartesia Sonic-3 - Jacqueline (female) via LiveKit Inference');

    const session = new voice.AgentSession({
      vad,
      // All using LiveKit Inference (hosted) to avoid native plugin crashes
      stt: 'deepgram/nova-3',
      llm: 'openai/gpt-4.1-mini',
      // Jacqueline: Confident, young American adult female voice
      tts: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
      turnDetection: new livekit.turnDetector.MultilingualModel(),
    });

    // Start session - onEnter() will be called automatically to greet the user
    await session.start({
      agent: new FinAgent(),
      room: ctx.room,
    });

    console.log('[Agent] Session started successfully');
  },
});

cli.runApp(new WorkerOptions({
  agent: fileURLToPath(import.meta.url),
  // Use explicit dispatch to prevent duplicate agents
  // This agent will only be dispatched when explicitly requested by name
  agentName: 'finagent',
}));
