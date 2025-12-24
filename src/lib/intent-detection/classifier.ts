// Intent Classifier
// Uses Azure OpenAI GPT for intent classification via OpenAI SDK

import OpenAI from 'openai';
import { buildDeveloperPrompt } from './prompt';
import { intentRegistry } from './intents/registry';
import type { ClassificationResult, ExtractedEntities, GPTClassificationResponse } from './types';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local explicitly to override any shell environment variables
// This is critical because shell env vars (for codex-cli) can override .env.local values
let envLocalConfig: Record<string, string> = {};

function loadEnvLocal(): Record<string, string> {
  if (Object.keys(envLocalConfig).length > 0) return envLocalConfig;

  try {
    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const envContent = fs.readFileSync(envLocalPath, 'utf-8');
      const parsed = dotenv.parse(envContent);
      envLocalConfig = parsed;
      console.log('🔧 [LLM Classifier] Loaded .env.local directly (bypassing shell env vars)');
    }
  } catch (error) {
    console.warn('⚠️ [LLM Classifier] Could not load .env.local:', error);
  }
  return envLocalConfig;
}

// Get env var with priority: .env.local > process.env
function getEnvVar(key: string, defaultValue: string = ''): string {
  const envLocal = loadEnvLocal();
  // Prioritize .env.local over shell environment variables
  return envLocal[key]?.trim() || process.env[key]?.trim() || defaultValue;
}

function getDeploymentName(): string {
  return getEnvVar('AZURE_OPENAI_MODEL', 'gpt-5.2');
}

function getApiKey(): string {
  return getEnvVar('AZURE_OPENAI_API_KEY');
}

// Cache the OpenAI client instance
let cachedClient: OpenAI | null = null;
let cachedDeploymentName: string | null = null;

function getOpenAIClient(): { client: OpenAI; deploymentName: string } {
  if (cachedClient && cachedDeploymentName) {
    return { client: cachedClient, deploymentName: cachedDeploymentName };
  }

  const deploymentName = getDeploymentName();

  // Prioritize AZURE_EXISTING_AIPROJECT_ENDPOINT (openai.azure.com) which works with the API key
  // Endpoint should be in format: https://<resource>.openai.azure.com/openai/v1/
  const baseURL =
    getEnvVar('AZURE_EXISTING_AIPROJECT_ENDPOINT') ||
    getEnvVar('AZURE_OPENAI_ENDPOINT');

  if (!baseURL) {
    throw new Error('Missing AZURE_OPENAI_ENDPOINT or AZURE_EXISTING_AIPROJECT_ENDPOINT');
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Missing AZURE_OPENAI_API_KEY (required for intent classification)');
  }

  // Create OpenAI client with Azure endpoint
  // The baseURL should be: https://<resource>.openai.azure.com/openai/v1/
  cachedClient = new OpenAI({
    baseURL: baseURL,
    apiKey: apiKey,
  });

  cachedDeploymentName = deploymentName;
  console.log('🤖 [LLM Classifier] OpenAI client initialized with baseURL:', baseURL);

  return { client: cachedClient, deploymentName: cachedDeploymentName };
}

// Cache the developer prompt since it doesn't change
let cachedDeveloperPrompt: string | null = null;

function getDeveloperPrompt(): string {
  if (!cachedDeveloperPrompt) {
    cachedDeveloperPrompt = buildDeveloperPrompt(intentRegistry);
  }
  return cachedDeveloperPrompt;
}

// Options for the classifier
export interface ClassifyOptions {
  // Current date/time from the user's browser (ISO string or Date)
  currentDate?: string | Date;
  // User's timezone (e.g., "America/Los_Angeles")
  timezone?: string;
}

// Helper to format date context for the LLM
function formatDateContext(options?: ClassifyOptions): string {
  let date: Date;

  if (options?.currentDate) {
    date = typeof options.currentDate === 'string'
      ? new Date(options.currentDate)
      : options.currentDate;
  } else {
    date = new Date();
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

  const dayOfWeek = dayNames[date.getDay()];
  const month = monthNames[date.getMonth()];
  const dayOfMonth = date.getDate();
  const year = date.getFullYear();

  return `Today is ${dayOfWeek}, ${month} ${dayOfMonth}, ${year}.`;
}

export async function classifyIntent(userQuery: string, options?: ClassifyOptions): Promise<ClassificationResult | null> {
  try {
    const { client, deploymentName } = getOpenAIClient();

    console.log('🤖 [LLM Classifier] ================================');
    console.log('🤖 [LLM Classifier] Query:', userQuery);
    console.log('🤖 [LLM Classifier] Model/Deployment:', deploymentName);
    console.log('🤖 [LLM Classifier] Making API call via OpenAI SDK...');
    const startTime = Date.now();
    const developerPrompt = getDeveloperPrompt();

    // Build date context for the LLM
    const dateContext = formatDateContext(options);
    console.log('🤖 [LLM Classifier] Date context:', dateContext);

    // Use OpenAI SDK for Azure OpenAI
    const completion = await client.chat.completions.create({
      model: deploymentName,
      messages: [
        { role: 'developer', content: developerPrompt },
        { role: 'user', content: `${dateContext}\n\nUser query: ${userQuery}` },
      ],
      temperature: 0.1,
      max_completion_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const elapsed = Date.now() - startTime;
    const content = completion.choices[0]?.message?.content;

    if (!content) {
      console.warn('[Intent Classifier] Empty response from GPT');
      return null;
    }

    console.log('🤖 [LLM Classifier] Raw response content:', content);
    const result = JSON.parse(content) as GPTClassificationResponse;

    console.log(`[Intent Classifier] Query: "${userQuery.substring(0, 50)}..." -> Intent: ${result.intent} (${(result.confidence * 100).toFixed(0)}% conf) [${elapsed}ms]`);
    console.log('[Intent Classifier] Entities:', result.entities);

    // Handle unknown intent - but still return entities if present (for symbol extraction)
    if (result.intent === 'unknown' || result.confidence < 0.3) {
      // Check if we have useful entities even with unknown intent
      // This is critical for extracting symbols from agent responses
      if (result.entities && Object.keys(result.entities).length > 0) {
        console.log('[Intent Classifier] No confident intent, but entities extracted:', result.entities);
        return {
          intent: 'unknown',
          confidence: result.confidence,
          entities: result.entities,
          cardType: 'none',
        };
      }
      console.log('[Intent Classifier] No confident match found');
      return null;
    }

    // Look up card type from registry
    const intentDef = intentRegistry.find(i => i.id === result.intent);
    if (!intentDef) {
      console.warn(`[Intent Classifier] Unknown intent ID: ${result.intent}`);
      return null;
    }

    return {
      intent: result.intent,
      confidence: result.confidence,
      entities: result.entities,
      cardType: intentDef.cardType,
    };
  } catch (error) {
    console.error('[Intent Classifier] Classification error:', error);
    throw error;
  }
}

// Re-export types for convenience
export type { ClassificationResult, ExtractedEntities };
