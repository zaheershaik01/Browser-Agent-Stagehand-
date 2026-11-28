import { readFile, writeFile } from "node:fs/promises";

const MARKER = "NMC_STAGEHAND_SPACE_COMPAT_4_4_0";

export function patchSpaceKeySource(source) {
  if (source.includes(MARKER)) return source;
  
  const start = source.indexOf("\tasync keyDown(key) {");
  const end = source.indexOf("\n\tasync keyUp(key)", start);
  if (start < 0 || end < 0) throw new Error("Unrecognized Stagehand keyboard implementation; refusing to patch it.");
  const method = source.slice(start, end);
  const anchor = "\t\tif (normalizedKey.length === 1) {";
  if (!method.includes(anchor)) throw new Error("Stagehand printable-key branch was not found.");
  
  const fix = `\t\tconst compatMarker = "${MARKER}";
\t\tif (normalizedKey === " ") {
\t\t\tawait this.mainSession.send("Input.dispatchKeyEvent", {
\t\t\t\ttype: modifiers === 0 ? "keyDown" : "rawKeyDown",
\t\t\t\tkey: " ", code: "Space", windowsVirtualKeyCode: 32,
\t\t\t\tmodifiers,
\t\t\t\t...(modifiers === 0 ? { text: " ", unmodifiedText: " " } : {})
\t\t\t});
\t\t\treturn;
\t\t}
`;
  
  return source.slice(0, start) + method.replace(anchor, fix + anchor) + source.slice(end);
}


export async function ensureStagehandSpaceCompatibility() {
  
  const entry = import.meta.resolve("@browserbasehq/stagehand");
  const pkg = JSON.parse(await readFile(new URL("../package.json", entry), "utf8"));
  
  if (pkg.version !== "4.4.0") return { applied: false, version: pkg.version };
  
  const runtimePath = new URL("./extension/service-worker.js", entry);
  const original = await readFile(runtimePath, "utf8");
  const patched = patchSpaceKeySource(original);
  
  if (patched !== original) {
    await writeFile(runtimePath, patched);
    console.log("Applied Stagehand 4.4 Space-key compatibility fix.");
  }
  return { applied: true, version: pkg.version };
}
