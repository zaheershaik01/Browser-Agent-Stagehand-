const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504, 524]);

export function normalizeApiBaseUrl(value) {
  const url = new URL(value || "https://nauip.negdaip.online/v1");
  return `${url.href.replace(/\/+$/, "")}/`;
}


export function apiUrl(baseUrl, resource) {
  return new URL(resource.replace(/^\//, ""), normalizeApiBaseUrl(baseUrl)).href;
}


export function isRetryableStatus(status) {
  return RETRYABLE_STATUS_CODES.has(status);
}


export function asOpenAiFunction(tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || `Playwright browser action: ${tool.name}`,
      parameters: tool.inputSchema || { type: "object", properties: {} },
    },
  };
}


function messageFromPayload(payload) {
  return payload?.error?.message || payload?.message || JSON.stringify(payload);
}


function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}


export async function nauipRequest({ baseUrl, apiKey, resource, method = "GET", body, onRetry }) {
  
  const attempts = 4;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      
      const response = await fetch(apiUrl(baseUrl, resource), {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { message: text || "The gateway returned an empty response." };
      }

      
      if (response.ok) return payload;
      const error = new Error(`AI service gateway ${response.status}: ${messageFromPayload(payload)}`);
      if (!isRetryableStatus(response.status) || attempt === attempts) throw error;
      lastError = error;
    
    } catch (error) {
      if (attempt === attempts) throw error;
      lastError = error;
    }

    
    const delay = 1_500 * 2 ** (attempt - 1);
    onRetry?.({ attempt, delay, error: lastError });
    await wait(delay);
  }

  throw lastError;
}


export function modelIds(payload) {
  return (payload?.data ?? []).map((model) => model.id).filter((id) => typeof id === "string");
}
