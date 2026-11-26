const READ_ONLY_TOOLS = new Set([
  "browser_navigate",
  "browser_navigate_back",
  "browser_snapshot",
  "browser_find",
  "browser_take_screenshot",
  "browser_wait_for",
  "browser_console_messages",
  "browser_network_requests",
  "browser_tabs",
  "browser_close",
]);



const ALWAYS_BLOCKED_TOOLS = new Set([
  "browser_run_code_unsafe",
  "browser_evaluate",
  "browser_file_upload",
  "browser_drop",
]);


const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);


export function isAllowedUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !BLOCKED_HOSTS.has(url.hostname.toLowerCase()) &&
      !url.hostname.toLowerCase().endsWith(".local")
    );
  } catch {
    return false;
  }
}



export function toolIsAllowed(name, args, allowActions) {
  
  if (ALWAYS_BLOCKED_TOOLS.has(name)) {
    return {
      allowed: false,
      reason: `${name} is disabled in this starter agent because it can run arbitrary code or upload local files.`,
    };
  }

  
  if (!allowActions && !READ_ONLY_TOOLS.has(name)) {
    return {
      allowed: false,
      reason: `${name} can change a website. Re-run with --allow-actions only after reviewing the task.`,
    };
  }

  
  if (typeof args?.url === "string" && !isAllowedUrl(args.url)) {
    return {
      allowed: false,
      reason: "Navigation is limited to public http(s) websites; local and private network addresses are blocked.",
    };
  }

  return { allowed: true };
}


export function compactMcpResult(result, maxLength = 12_000) {
  
  const text = (result?.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  
  if (text.length <= maxLength) return text || "The browser action completed without text output.";
  return `${text.slice(0, maxLength)}\n[Browser result shortened]`;
}
