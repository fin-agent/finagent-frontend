/**
 * OpenAI-Compatible Custom LLM Endpoint for ElevenLabs
 *
 * This endpoint receives requests from ElevenLabs in OpenAI format,
 * processes them using Azure OpenAI with tool calling,
 * and returns streaming responses.
 *
 * Uses direct fetch to Azure OpenAI (same as OpenAI SDK approach)
 * to avoid AI SDK 6's Responses API format issues.
 */

import { NextRequest } from 'next/server';
import { finagentTools } from '@/src/lib/ai-tools';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZodType } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Azure OpenAI Configuration (from environment variables)
// Uses OpenAI-compatible endpoint format: https://{resource}.openai.azure.com/openai/v1/
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const DEPLOYMENT_NAME = process.env.AZURE_OPENAI_MODEL || 'gpt-5.1';
const API_KEY = process.env.AZURE_OPENAI_API_KEY || '';

// Validate required environment variables
if (!API_KEY) {
  console.error('Missing AZURE_OPENAI_API_KEY environment variable');
}
if (!AZURE_ENDPOINT) {
  console.error('Missing AZURE_OPENAI_ENDPOINT environment variable');
}

// Load system prompt from file
function getSystemPrompt(): string {
  try {
    const promptPath = path.join(process.cwd(), 'prompts', 'finagent-neo.md');
    return fs.readFileSync(promptPath, 'utf-8');
  } catch (error) {
    console.error('Error loading system prompt:', error);
    return 'You are FinAgent, a helpful financial assistant.';
  }
}

// Convert our tools to OpenAI function format
function getToolsForOpenAI() {
  return Object.entries(finagentTools).map(([name, tool]) => {
    // Convert Zod schema to JSON Schema for OpenAI
    // Cast to ZodType since AI SDK wraps it in FlexibleSchema
    const jsonSchema = zodToJsonSchema(tool.inputSchema as unknown as ZodType, { target: 'openApi3' }) as Record<string, unknown>;
    // Remove $schema property that OpenAI doesn't expect
    delete jsonSchema.$schema;
    return {
      type: 'function' as const,
      function: {
        name,
        description: tool.description || '',
        parameters: jsonSchema,
      },
    };
  });
}

// Execute a tool by name
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = finagentTools[name as keyof typeof finagentTools];
  if (!tool || !tool.execute) {
    return `Unknown tool: ${name}`;
  }
  try {
    // AI SDK 6 execute takes (args, options) - pass empty options
    const result = await tool.execute(args as never, {} as never);
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch (error) {
    console.error(`Tool ${name} error:`, error);
    return `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

// Call Azure OpenAI chat completions (OpenAI-compatible endpoint)
async function callAzureOpenAI(messages: OpenAIMessage[], stream: boolean = false) {
  const url = `${AZURE_ENDPOINT}chat/completions`;

  const body = {
    model: DEPLOYMENT_NAME,
    messages,
    tools: getToolsForOpenAI(),
    tool_choice: 'auto',
    stream,
  };

  console.log('Calling Azure OpenAI:', url);
  console.log('Messages count:', messages.length);
  console.log('API Key loaded:', API_KEY ? `Yes (${API_KEY.length} chars, starts with ${API_KEY.substring(0, 4)}...)` : 'NO - MISSING!');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Azure OpenAI error:', response.status, errorText);
    throw new Error(`Azure OpenAI error: ${response.status} - ${errorText}`);
  }

  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log('=== Custom LLM Request ===');
    console.log('Model requested:', body.model);
    console.log('Stream:', body.stream);
    console.log('Messages count:', body.messages?.length);

    const { messages: inputMessages, stream = true } = body as {
      messages: OpenAIMessage[];
      stream?: boolean;
    };

    // Build messages array with our system prompt
    const systemPrompt = getSystemPrompt();
    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...inputMessages.filter(m => m.role !== 'system'),
    ];

    // Handle non-streaming with tool calling loop
    if (!stream) {
      const currentMessages = [...messages];
      let iterations = 0;
      const maxIterations = 5;
      // Track the last tool called for UI metadata
      let lastToolCall: { name: string; args: Record<string, unknown> } | null = null;

      while (iterations < maxIterations) {
        iterations++;
        const response = await callAzureOpenAI(currentMessages, false);
        const data = await response.json();

        const choice = data.choices?.[0];
        const assistantMessage = choice?.message;

        if (!assistantMessage) {
          throw new Error('No response from Azure OpenAI');
        }

        // Check if there are tool calls
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          console.log('Tool calls:', assistantMessage.tool_calls.map((tc: { function: { name: string } }) => tc.function.name));

          // Add assistant message with tool calls
          currentMessages.push(assistantMessage);

          // Execute each tool and add results
          for (const toolCall of assistantMessage.tool_calls) {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executeTool(toolCall.function.name, args);
            console.log(`Tool ${toolCall.function.name} result:`, result.substring(0, 100));

            // Track the tool call for UI metadata
            lastToolCall = { name: toolCall.function.name, args };

            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
          }
        } else {
          // No tool calls, return final response
          // Prepend tool metadata if a tool was called (UI will parse and strip this)
          let finalContent = assistantMessage.content || '';
          if (lastToolCall) {
            const toolMeta = JSON.stringify({ tool: lastToolCall.name, args: lastToolCall.args });
            finalContent = `[FINAGENT_TOOL:${toolMeta}]${finalContent}`;
          }

          return Response.json({
            id: data.id || `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: data.created || Math.floor(Date.now() / 1000),
            model: DEPLOYMENT_NAME,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: finalContent,
                },
                finish_reason: 'stop',
              },
            ],
            usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          });
        }
      }

      // Max iterations reached
      return Response.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: DEPLOYMENT_NAME,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'I apologize, but I was unable to complete the request after multiple attempts.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }

    // Streaming response with tool calling
    const encoder = new TextEncoder();
    const completionId = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    const readable = new ReadableStream({
      async start(controller) {
        try {
          const currentMessages = [...messages];
          let iterations = 0;
          const maxIterations = 5;
          // Track the last tool called for UI metadata
          let lastToolCall: { name: string; args: Record<string, unknown> } | null = null;

          while (iterations < maxIterations) {
            iterations++;

            // First, make a non-streaming call to check for tool calls
            const checkResponse = await callAzureOpenAI(currentMessages, false);
            const checkData = await checkResponse.json();
            const choice = checkData.choices?.[0];
            const assistantMessage = choice?.message;

            if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
              console.log('Tool calls detected:', assistantMessage.tool_calls.map((tc: { function: { name: string } }) => tc.function.name));

              // Add assistant message with tool calls
              currentMessages.push(assistantMessage);

              // Execute tools
              for (const toolCall of assistantMessage.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments);
                const result = await executeTool(toolCall.function.name, args);
                console.log(`Tool ${toolCall.function.name} result:`, result.substring(0, 100));

                // Track the tool call for UI metadata
                lastToolCall = { name: toolCall.function.name, args };

                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: result,
                });
              }
              // Continue loop to get final response
            } else {
              // No tool calls - stream the final content
              // Prepend tool metadata if a tool was called
              let content = assistantMessage?.content || '';
              if (lastToolCall) {
                const toolMeta = JSON.stringify({ tool: lastToolCall.name, args: lastToolCall.args });
                content = `[FINAGENT_TOOL:${toolMeta}]${content}`;
              }

              if (content) {
                // Send content in chunks for better streaming feel
                const chunkSize = 20;
                for (let i = 0; i < content.length; i += chunkSize) {
                  const chunk = content.slice(i, i + chunkSize);
                  const openAIChunk = {
                    id: completionId,
                    object: 'chat.completion.chunk',
                    created,
                    model: DEPLOYMENT_NAME,
                    choices: [
                      {
                        index: 0,
                        delta: { content: chunk },
                        finish_reason: null,
                      },
                    ],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
                  // Small delay for streaming effect
                  await new Promise(r => setTimeout(r, 10));
                }
              }

              // Send final chunk
              const finalChunk = {
                id: completionId,
                object: 'chat.completion.chunk',
                created,
                model: DEPLOYMENT_NAME,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: 'stop',
                  },
                ],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              return;
            }
          }

          // Max iterations reached
          const errorChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: DEPLOYMENT_NAME,
            choices: [
              {
                index: 0,
                delta: { content: 'I apologize, but I was unable to complete the request.' },
                finish_reason: 'stop',
              },
            ],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Custom LLM error:', error);
    return Response.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Internal server error',
          type: 'server_error',
        },
      },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return Response.json({
    status: 'ok',
    endpoint: '/api/llm/v1/chat/completions',
    description: 'OpenAI-compatible custom LLM endpoint for ElevenLabs',
    tools: Object.keys(finagentTools),
  });
}
