import { solveCaptcha } from "./captcha.mjs";
import { FORM_URL } from "./nmc-form.mjs";

export const NMC_CAPTCHA = Object.freeze({ origin: FORM_URL, kind: "arithmetic",
  challenge: ".login-math-captcha-text", answerInput: "#captcha", consent: "#consent", consentAuthorized: true });


async function inspect(page, config, operation) {
  const read = ({ config, operation }) => {
    try {
      if (location.origin !== new URL(config.origin).origin) throw new Error("Unexpected CAPTCHA origin.");
      const selector = operation === "input" ? config.answerInput : operation === "consent" ? config.consent : config.challenge;
      const matches = document.querySelectorAll(selector);
      if (matches.length !== 1) throw new Error("CAPTCHA selector must match exactly one element.");
      const element = matches[0];
      if (operation === "input") return { value: element.value };
      if (operation === "consent") return { checked: element.checked === true };
      if (operation === "text") return { text: element.innerText || "" };
      element.scrollIntoView({ block: "center" });
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.width * rect.height > 2_000_000) throw new Error("Invalid CAPTCHA image size.");
      return { clip: { x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height } };
    } catch (error) { return { error: error.message }; }
  };
  const result = await page.evaluate(`(${read.toString()})(${JSON.stringify({ config, operation })})`);
  if (!result || result.error) throw new Error(result?.error || "No CAPTCHA inspection result.");
  return result;
}


export function stagehandCaptchaAdapter(page, stagehand, config) {
  const act = async (instruction, selector) => {
    const result = await stagehand.act(instruction, { page, locator: page.locator(selector) });
    if (result.data?.success !== true) throw new Error("Could not enter the challenge answer. No submission attempted.");
  };
  return {
    async readVisibleText() {
      await page.waitForSelector(config.challenge);
      return (await inspect(page, config, "text")).text;
    },
    async capture() {
      await page.waitForSelector(config.challenge);
      const { clip } = await inspect(page, config, "clip");
      const bytes = Buffer.from(await page.screenshot({ clip, animations: "disabled", caret: "hide" }));
      if (bytes.length > 4_000_000) throw new Error("CAPTCHA crop exceeds size limit.");
      return bytes;
    },
    async fill(answer) {
      await inspect(page, config, "input");
      await act(`Fill this CAPTCHA answer input with exactly ${JSON.stringify(answer)}. Use fill. Do not submit. Do not press Enter, click Submit, or change any other field.`, config.answerInput);
      if ((await inspect(page, config, "input")).value !== answer) throw new Error("Stagehand CAPTCHA answer did not match calculated value.");
    },
    async checkConsent() {
      if (!config.consent) return;
      if (!config.consentAuthorized) throw new Error("Survey consent is not authorized.");
      if (!(await inspect(page, config, "consent")).checked) {
        const scope = config.consentLabel || (/^#[\w-]+$/.test(config.consent) ? `label[for="${config.consent.slice(1)}"]` : config.consent);
        await act("Check this survey participation consent checkbox. The user has authorized it. Do not submit the form or change any other field.", scope);
      }
      if (!(await inspect(page, config, "consent")).checked) throw new Error("Survey consent was not checked.");
    }
  };
}



export async function solveStagehandCaptcha(page, stagehand, config = NMC_CAPTCHA, dependencies) {
  const adapter = stagehandCaptchaAdapter(page, stagehand, config);
  if (config.consentAuthorized && config.consent) await adapter.checkConsent();
  return solveCaptcha(adapter, config, dependencies);
}


export function installManualSubmissionClick() {
    if (!window.__nmcApproval || window.__nmcApproval.attempts !== 0) return { error: "Submission already attempted or guard missing." };
    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("button,input") : null;
      if (event.isTrusted && button?.type === "submit" && button.form?.id === "feedbackForm" && window.__nmcApproval.attempts === 0) {
        window.__nmcApproval.allowed = true;
        setTimeout(() => { window.__nmcApproval.allowed = false; }, 5000);
      }
    }, true);
    return { enabled: true };
}


export async function enableManualStagehandSubmission(page) {
  
  if ((await page.url()).split("?")[0] !== FORM_URL) throw new Error("Unexpected form page.");
  const result = await page.evaluate(`(${installManualSubmissionClick.toString()})()`);
  if (!result?.enabled) throw new Error(result?.error || "Could not enable manual submission.");
}
