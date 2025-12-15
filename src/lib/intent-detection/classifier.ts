// Intent Classifier
// Uses Azure OpenAI GPT for intent classification via direct fetch

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

function getApiVersion(): string {
  return getEnvVar('AZURE_OPENAI_API_VERSION', '2024-10-21');
}

function getApiKey(): string {
  return getEnvVar('AZURE_OPENAI_API_KEY');
}

// Cache the Azure config
let cachedConfig: { baseURL: string; rawEndpoint: string; deploymentName: string } | null = null;

function getAzureConfig(): { baseURL: string; rawEndpoint: string; deploymentName: string } {
  if (cachedConfig) return cachedConfig;

  const deploymentName = getDeploymentName();

  // Prioritize AZURE_EXISTING_AIPROJECT_ENDPOINT (openai.azure.com) which works with the API key
  const rawEndpoint =
    getEnvVar('AZURE_EXISTING_AIPROJECT_ENDPOINT') ||
    getEnvVar('AZURE_OPENAI_ENDPOINT');

  if (!rawEndpoint) {
    throw new Error('Missing AZURE_OPENAI_ENDPOINT or AZURE_EXISTING_AIPROJECT_ENDPOINT');
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Missing AZURE_OPENAI_API_KEY (required for intent classification)');
  }

  try {
    const url = new URL(rawEndpoint);
    // Azure OpenAI URL format: https://<resource>.openai.azure.com/openai/deployments/<deployment>
    const baseURL = `${url.origin}/openai/deployments/${deploymentName}`;
    cachedConfig = { baseURL, rawEndpoint, deploymentName };
    return cachedConfig;
  } catch {
    throw new Error(`Invalid endpoint URL: "${rawEndpoint}"`);
  }
}

// Cache the developer prompt since it doesn't change
let cachedDeveloperPrompt: string | null = null;

function getDeveloperPrompt(): string {
  if (!cachedDeveloperPrompt) {
    cachedDeveloperPrompt = buildDeveloperPrompt(intentRegistry);
  }
  return cachedDeveloperPrompt;
}

export async function classifyIntent(userQuery: string): Promise<ClassificationResult | null> {
  try {
    const { rawEndpoint, baseURL, deploymentName } = getAzureConfig();
    const apiKey = getApiKey();
    const apiVersion = getApiVersion();

    console.log('🤖 [LLM Classifier] ================================');
    console.log('🤖 [LLM Classifier] Query:', userQuery);
    console.log('🤖 [LLM Classifier] Raw endpoint (from .env.local):', rawEndpoint || '(not set)');
    console.log('🤖 [LLM Classifier] Base URL:', baseURL);
    console.log('🤖 [LLM Classifier] Model/Deployment:', deploymentName);
    console.log('🤖 [LLM Classifier] API Version:', apiVersion);
    console.log('🤖 [LLM Classifier] API Key present:', !!apiKey, '| Key length:', apiKey?.length || 0);
    console.log('🤖 [LLM Classifier] API Key preview:', apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-8)}` : 'N/A');
    console.log('🤖 [LLM Classifier] Making API call...');
    const startTime = Date.now();
    const developerPrompt = getDeveloperPrompt();

    // Use direct fetch to ensure exact URL format for Azure OpenAI
    const requestUrl = `${baseURL}/chat/completions?api-version=${apiVersion}`;
    console.log('🤖 [LLM Classifier] Request URL:', requestUrl);

    const fetchResponse = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'developer', content: developerPrompt },
          { role: 'user', content: userQuery },
        ],
        temperature: 0.1,
        max_completion_tokens: 200,
        response_format: { type: 'json_object' },
      }),
    });

    if (!fetchResponse.ok) {
      const errorBody = await fetchResponse.text();
      throw new Error(`${fetchResponse.status} ${errorBody}`);
    }

    const response = await fetchResponse.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const elapsed = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.warn('[Intent Classifier] Empty response from GPT');
      return null;
    }

    console.log('🤖 [LLM Classifier] Raw response content:', content);
    const result = JSON.parse(content) as GPTClassificationResponse;

    console.log(`[Intent Classifier] Query: "${userQuery.substring(0, 50)}..." -> Intent: ${result.intent} (${(result.confidence * 100).toFixed(0)}% conf) [${elapsed}ms]`);
    console.log('[Intent Classifier] Entities:', result.entities);

    // Handle unknown intent
    if (result.intent === 'unknown' || result.confidence < 0.3) {
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
