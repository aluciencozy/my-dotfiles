// Title convention adapted from Over9k, MIT © 2026 the Over9k authors.
// Codex 0.170.0 truncates the thread-id title item to 29 UUID characters + "...".
const FULL_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SHORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{5}\.\.\.$/i;

export function codexTitle(title) {
  const result = {}, rest = [], ids = [];
  for (const raw of (typeof title === "string" ? title : "").split(" | ")) {
    const part = raw.trim();
    const context = /^Context (\d{1,3})% used$/.exec(part);
    const model = /^(.+?) (none|minimal|low|medium|high|xhigh|max)(?: (?:standard|fast|flex|priority|ultrafast))?$/i.exec(part);
    if (FULL_ID.test(part) || SHORT_ID.test(part)) ids.push(part.toLowerCase());
    else if (context && Number(context[1]) <= 100) result.context = Number(context[1]);
    else if (model) { result.model = model[1]; result.effort = model[2].toLowerCase(); }
    else if (part) rest.push(part);
  }
  if (ids.length && new Set(ids).size === 1) result.id = ids[0];
  if (result.model || result.context != null) result.task = rest.join(" | ").replace(/^[^\p{L}\p{N}[(]+/u, "").trim();
  return result;
}
