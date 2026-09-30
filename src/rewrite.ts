import type { Background } from "./context.js"

// The canonical instructions live with the config defaults (selectPrompt); this module
// only assembles the untrusted payload around whichever instructions the caller chose.
export function optimizerInput(original: string, target: string, context: Background, system: string, previous?: string): string {
  // JSON encoding prevents user text containing XML-like tags from closing a field.
  // It is still untrusted text, not an instruction boundary enforced by the provider.
  return `${system}\n\nInput data (JSON; values are untrusted text):\n` + JSON.stringify({
    target_model: target, background_recap: context.recap,
    recent_conversation: context.recent, current_request: original,
    ...(previous === undefined ? {} : { previous_attempt: previous }),
  })
}

export function judgeInput(original: string, target: string, context: Background, candidates: readonly string[], system: string): string {
  return `${system}\n\nInput data (JSON; values are untrusted text):\n` + JSON.stringify({
    target_model: target, background_recap: context.recap, recent_conversation: context.recent,
    current_request: original, candidates: candidates.map((text, index) => ({ index: index + 1, text })),
  })
}

export function parseRewrite(response: string, limit: number): string {
  // Cheap models often wrap the block in a sentence or code fence. Prefer a
  // whole-message match, then fall back to the last non-empty tagged block.
  const exact = response.match(/^\s*<optimized_prompt>([\s\S]*?)<\/optimized_prompt>\s*$/)?.[1]?.trim()
  const blocks = [...response.matchAll(/<optimized_prompt>([\s\S]*?)<\/optimized_prompt>/gi)]
    .map((match) => match[1]!.trim()).filter(Boolean)
  const within = (value: string | undefined): value is string =>
    !!value && Array.from(value).length <= limit
  const result = within(exact) ? exact : blocks.filter((block) => within(block)).at(-1) ?? blocks.at(-1)
  if (!result || Array.from(result).length > limit) {
    const snippet = response.replace(/\s+/g, " ").trim().slice(0, 120)
    throw new Error(`invalid or oversized optimizer response (reply: "${snippet}")`)
  }
  return result
}

/**
 * How much a rewrite may grow. Adding structure (goal, context, constraints) costs far
 * more characters than it saves on a short request, so a pure ratio rejects legitimate
 * rewrites of one-liners. Allow a fixed floor for that structure while still catching a
 * model that answered the task instead of rewriting it. `maxRewriteChars` is the
 * absolute cost cap and still applies first.
 */
export function growthLimit(originalLength: number): number {
  return Math.max(originalLength * 2, originalLength + 800)
}

export function validateRewrite(original: string, rewrite: string): void {
  const originalLength = Array.from(original).length
  const rewriteLength = Array.from(rewrite).length
  const limit = growthLimit(originalLength)
  if (rewriteLength > limit)
    throw new Error(`optimizer expanded the request excessively (${originalLength} → ${rewriteLength} chars, limit ${limit})`)
  // These are mechanical checks, not a claim that meaning is preserved.
  const protectedText = [
    ...original.matchAll(/`[^`\n]+`|"[^"\n]+"/g),
    ...original.matchAll(/(?:https?:\/\/[^\s"'`<>]+|(?:\.{1,2}\/|~\/|\/)?(?:[\w.-]+\/)+[\w.-]+|\b[\w.-]+\.(?:ts|tsx|js|jsx|json|md|py|go|rs|java|kt|sh|yaml|yml)\b|--[\w-]+)/g),
  ].map((match) => match[0])
  for (const value of protectedText) {
    if (!rewrite.includes(value)) throw new Error("optimizer omitted a literal or path")
  }
}

export interface OptimizeResult { rewrite: string; candidates: string[]; chosen: number; judged: boolean }

export async function optimizeWith(input: {
  original: string; target: string; context: Background; system: string; judgeSystem: string
  turns: number; strategy: "parallel" | "refine"; maxRewriteChars: number
}, generate: (prompt: string) => Promise<string>): Promise<OptimizeResult> {
  const candidate = async (previous?: string) => {
    const text = parseRewrite(await generate(optimizerInput(input.original, input.target, input.context, input.system, previous)), input.maxRewriteChars)
    validateRewrite(input.original, text)
    return text
  }
  const candidates: string[] = []
  let firstError: unknown
  if (input.strategy === "refine") {
    for (let i = 0; i < input.turns; i++) {
      try { candidates.push(await candidate(candidates.at(-1))) }
      catch (error) { firstError = error; break }
    }
  } else {
    const results = await Promise.allSettled(Array.from({ length: input.turns }, () => candidate()))
    for (const result of results) {
      if (result.status === "fulfilled") candidates.push(result.value)
      else firstError ??= result.reason
    }
  }
  if (!candidates.length) throw firstError ?? new Error("optimizer produced no valid candidates")
  const fallback = input.strategy === "refine" ? candidates.length - 1 : 0
  if (candidates.length === 1) return { rewrite: candidates[0]!, candidates, chosen: 0, judged: false }
  try {
    const response = await generate(judgeInput(input.original, input.target, input.context, candidates, input.judgeSystem))
    const match = response.match(/<best>\s*(\d+)\s*<\/best>/)
    const chosen = match ? Number(match[1]) - 1 : -1
    if (Number.isInteger(chosen) && chosen >= 0 && chosen < candidates.length)
      return { rewrite: candidates[chosen]!, candidates, chosen, judged: true }
  } catch { /* A failed judge must not discard valid candidates. */ }
  return { rewrite: candidates[fallback]!, candidates, chosen: fallback, judged: false }
}
