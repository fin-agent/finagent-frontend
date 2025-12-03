import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import "npm:dotenv/config";
import { FinAgent } from './agent.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const agent = new FinAgent();
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  try{
    const { query } = await req.json()
    if (!query) {
      return new Response("Bad Request: 'query' field is required in the JSON body.", { status: 400 });
    }
    const response = await agent.run(query);
    return Response.json({response});
  } catch (error) {
    return new Response(`Error parsing JSON: ${error.message}`, { status: 400 })
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/agent' \
    --header 'Authorization: Bearer auth' \
    --header 'Content-Type: application/json' \
    --data '{"query":"Functions"}'

*/
