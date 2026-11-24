import { createHash } from "node:crypto";
import { transcribeCaptcha } from "./captcha-ocr.mjs";

function normalizeMath(text) {
  return text.trim().replace(/[−–]/g, '-').replace(/×/g, '*')
    .replace(/÷/g, '/').replace(/\s+/g, '').replace(/=\??$/, '');
}


export function arithmeticAnswer(raw) {
  const source = normalizeMath(raw);
  if (!source || source.length > 256 || /[^0-9.+*/()\-]/.test(source))
    throw new Error('Unsupported arithmetic. Use numbers, + - * / and parentheses.');
  const tokens = source.match(/\d+(?:\.\d+)?|\.\d+|[()+*/-]/g) ?? [];
  if (tokens.join('') !== source) throw new Error('Invalid expression.');
  let pos = 0;
  const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };
  const fraction = (n, d = 1n) => {
    if (!d) throw new Error('Division by zero.');
    if (d < 0n) { n = -n; d = -d; }
    if (n.toString().length > 1024 || d.toString().length > 1024)
      throw new Error('Arithmetic resource limit exceeded.');
    const g = gcd(n, d);
    return [n / g, d / g];
  };
  function atom() {
    const t = tokens[pos++];
    if (t === '+' || t === '-') {
      const [n, d] = atom();
      return [t === '-' ? -n : n, d];
    }
    if (t === '(') {
      const v = expression();
      if (tokens[pos++] !== ')') throw new Error('Missing closing parenthesis.');
      return v;
    }
    if (!t || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(t))
      throw new Error('Expected a number.');
    const [whole, dec = ''] = t.split('.');
    return fraction(BigInt((whole || '0') + dec), 10n ** BigInt(dec.length));
  }
  function product() {
    let [a, b] = atom();
    while (tokens[pos] === '*' || tokens[pos] === '/') {
      const op = tokens[pos++];
      const [c, d] = atom();
      [a, b] = op === '*' ? fraction(a * c, b * d) : fraction(a * d, b * c);
    }
    return [a, b];
  }
  function expression() {
    let [a, b] = product();
    while (tokens[pos] === '+' || tokens[pos] === '-') {
      const op = tokens[pos++];
      const [c, d] = product();
      [a, b] = fraction(a * d + (op === '+' ? c : -c) * b, b * d);
    }
    return [a, b];
  }
  const [n, d] = expression();
  if (pos !== tokens.length) throw new Error('Unexpected arithmetic token.');
  let remaining = d;
  for (const factor of [2n, 5n]) while (remaining % factor === 0n) remaining /= factor;
  if (remaining !== 1n)
    throw new Error('Repeating decimal: configure the site-specific fraction/rounding rule.');
  const negative = n < 0n;
  const magnitude = negative ? -n : n;
  let answer = String(magnitude / d), remainder = magnitude % d;
  if (remainder) answer += '.';
  while (remainder) {
    remainder *= 10n;
    answer += String(remainder / d);
    remainder %= d;
  }
  return (negative ? '-' : '') + answer;
}


export function textAnswer(raw, expectedLength) {
  
  const answer = raw.trim();
  if (["UNREADABLE", "UNKNOWN", "ILLEGIBLE"].includes(answer.toUpperCase())) throw new Error("OCR could not read this challenge.");
  if (!/^[A-Za-z0-9]+$/.test(answer))
    throw new Error('OCR did not return one uninterrupted alphanumeric string.');
  if (answer.length > 256 || (expectedLength && answer.length !== expectedLength))
    throw new Error('Unexpected alphanumeric length.');
  return answer;
}


async function enlargePng(bytes) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(bytes);
  if (!image.width || !image.height || image.width * image.height > 2_000_000) throw new Error("CAPTCHA crop is too large or invalid.");
  const scale = Math.min(3, 2048 / Math.max(image.width, image.height));
  const canvas = createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toBuffer("image/png");
}


export async function solveCaptcha(adapter, config, dependencies = {}) {
  if (!["arithmetic", "alphanumeric"].includes(config.kind)) throw new Error("Choose arithmetic or alphanumeric CAPTCHA kind.");
  if (config.consent && config.consentAuthorized !== true) throw new Error("Checking survey consent requires user authorization.");
  if (config.expectedLength !== undefined && (!Number.isInteger(config.expectedLength) || config.expectedLength < 1 || config.expectedLength > 256)) throw new Error("Invalid expected CAPTCHA length.");
  
  if (config.kind === "arithmetic" && adapter.readVisibleText) {
    const challenge = await adapter.readVisibleText();
    let answer;
    try { answer = arithmeticAnswer(challenge); } catch { /* Image/unsupported text: try OCR below. */ }
    if (answer !== undefined) {
      if (await adapter.readVisibleText() !== challenge) throw new Error("CAPTCHA changed while reading. Try solving the current challenge again.");
      await adapter.fill(answer);
      if (await adapter.readVisibleText() !== challenge) {
        await adapter.fill("");
        throw new Error("CAPTCHA changed while filling. The stale answer was cleared.");
      }
      if (config.consent) await adapter.checkConsent();
      return { status: "filled-unverified", kind: config.kind, method: "visible-text", readings: 2 };
    }
  }
  const recognize = dependencies.recognize ?? transcribeCaptcha;
  const enlarge = dependencies.enlarge ?? enlargePng;
  const image = await adapter.capture();
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const parse = (raw) => config.kind === "arithmetic" ? arithmeticAnswer(raw) : textAnswer(raw, config.expectedLength);
  const original = parse(await recognize(image, config.kind));
  const enlarged = parse(await recognize(await enlarge(image), config.kind));
  if (original !== enlarged) throw new Error("OCR readings disagree. Complete the CAPTCHA manually.");
  if (hash(await adapter.capture()) !== hash(image)) throw new Error("CAPTCHA changed while OCR was running. Complete the current challenge manually.");
  await adapter.fill(original);
  if (config.consent) await adapter.checkConsent();
  return { status: "filled-unverified", kind: config.kind, method: "ocr", readings: 2 };
}
