import { apiUrl, normalizeApiBaseUrl } from "./nauip.mjs";

export function createStagehandModel(env = process.env, request = stagehandGatewayRequest) {
  
  const apiKey = env.NAUIP_API_KEY;
  const model = env.STAGEHAND_MODEL || env.NAUIP_MODEL;
  if (!apiKey || !model) throw new Error("Add a valid API key and form model to the local settings (.env).");
  
  return { async generate(params) {
    
    if (params.tools?.length) throw new Error("Autonomous tool execution is disabled in the form model adapter.");
    
    const messages = [];
    if (params.systemPrompt) messages.push({ role: "system", content: params.systemPrompt + " For action JSON: the caller orchestrates each primitive, so twoStep must always be false. A click always uses arguments: []; fill uses only the text argument. Put twoStep only at the top level, never in arguments. Do not invent element IDs. Use null only if the requested field truly does not exist." });
    
    for (const message of params.messages) {
      const blocks = Array.isArray(message.content) ? message.content : [message.content];
      messages.push({ role: message.role, content: blocks.map(block => {
        if (block.type === "text") return { type: "text", text: block.text };
        if (block.type === "image") return { type: "image_url", image_url: { url: `data:${block.mimeType};base64,${block.data}` } };
        throw new Error(`Unsupported model content: ${block.type}`);
      }) });
    }
    
    const format = params.responseFormat;
    
    
    if (format?.type === "json_schema") messages.unshift({ role: "system", content: `Return ONLY valid JSON matching this schema. No Markdown fences or prose. JSON schema: ${JSON.stringify(format.schema)}` });
    
    const response = await request({ baseUrl: normalizeApiBaseUrl(env.NAUIP_API_BASE_URL), apiKey,
      resource: "chat/completions", method: "POST", body: { model, messages, max_tokens: 4096, reasoning_effort: "none", chat_template_kwargs: { enable_thinking: false },
        temperature: params.temperature ?? 0,
        ...(params.stopSequences ? { stop: params.stopSequences } : {}),
        ...(format?.type === "json_schema" ? { response_format: { type: "json_schema", json_schema: { name: format.name, schema: format.schema, strict: true } } } : {}),
      },
    });
    
    const message = response?.choices?.[0]?.message;
    if (message?.refusal || typeof message?.content !== "string") throw new Error("The form model returned no usable text response.");
    const result = { role: "assistant", content: { type: "text", text: message.content } };
    if (format?.type !== "json_schema") return { ...result, outputFormat: "text" };
    
    const text = message.content.trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    const jsonText = fenced ? fenced[1].trim() : firstBrace >= 0 && lastBrace >= firstBrace ? text.slice(firstBrace, lastBrace + 1) : text;
    let structuredContent = JSON.parse(jsonText);
    
    if (format.schema?.properties?.action && structuredContent?.elementId && typeof structuredContent.twoStep === "boolean") {
      const { twoStep, ...action } = structuredContent;
      structuredContent = { action, twoStep };
    }
    
    
    if (structuredContent.action?.method === "click") structuredContent.action.arguments = [];
    
    
    if (format.schema?.properties?.action && typeof structuredContent.twoStep === "boolean") structuredContent.twoStep = false;
    
    return { ...result, outputFormat: "json_schema", structuredContent };
  } };
}




export async function stagehandGatewayRequest({ baseUrl, apiKey, resource, body }) {
  
  const started = Date.now();
  if (process.env.STAGEHAND_DEBUG === "1") {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(new URL("../artifacts/stagehand-last-request.json", import.meta.url), JSON.stringify(body, null, 2));
  }
  console.log(`Model inference: ${body.model}; ${JSON.stringify(body.messages).length} message characters`);
  
  const response = await fetch(apiUrl(baseUrl, resource), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90_000),
  });
  
  if (!response.ok) throw new Error(`Form model gateway returned HTTP ${response.status}. Please check the AI service settings. No form was submitted.`);
  
  const result = await response.json();
  if (process.env.STAGEHAND_DEBUG === "1") {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(new URL("../artifacts/stagehand-last-inference.json", import.meta.url), JSON.stringify({ request: body, response: result }, null, 2));
  }
  if (process.env.STAGEHAND_DEBUG === "1") console.log("Model decision:", result.choices?.[0]?.message?.content?.slice(0, 600));
  console.log(`Model response received in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return result;
}
