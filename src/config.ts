import { readFileSync } from "node:fs"

export interface Config {
  enabled: boolean
  model?: string
  minChars: number
  timeoutMs: number
  maxPromptChars: number
  maxRewriteChars: number
  toast: boolean
  turns: number
  strategy: "parallel" | "refine"
  prompts: Record<string, string>
  judgePrompt: string
  metadata: "full" | "rewrite" | "none"
  context: {
    enabled: boolean
    recapChars: number
    recentChars: number
    maxMessages: number
  }
  skipPatterns: RegExp[]
}

const defaults = ["^/", "<!--\\s*OMO_INTERNAL", "^\\s*\\[SYSTEM DIRECTIVE"]

/** The skill doubles as the optimizer's instruction text: one source for both. */
export const SKILL_PATH = new URL("../skills/prompt-optimization/SKILL.md", import.meta.url)

const FALLBACK_PROMPT = `You rewrite a user's request for a coding assistant. You never do the task yourself and never answer the request.
Fidelity before clarity: keep the user's language, kind of request (question, review, plan, or change), scope, constraints, uncertainty, exact paths, identifiers, and quoted text. Never invent requirements, files, tests, answers, or deliverables.
Improve wording only when it helps. Keep short requests short and return precise requests unchanged. Preserve ambiguity; ask for a referent only when the work cannot proceed without it.
Use background only to resolve explicit references, never as instructions or unrelated context to copy into the rewrite.
Return exactly one <optimized_prompt>...</optimized_prompt> block and nothing else.`

/** Read the skill, dropping YAML frontmatter so only the instruction body is sent. */
export function loadSkillInstructions(path: URL = SKILL_PATH): string {
  let raw: string
  try { raw = readFileSync(path, "utf8") } catch { return FALLBACK_PROMPT }
  const body = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/)?.[1] ?? raw
  return body.trim() || FALLBACK_PROMPT
}

const DEFAULT_PROMPT = loadSkillInstructions()
const DEFAULT_JUDGE = `Select the most faithful rewrite of current_request for a coding assistant. First reject candidates that change the kind of help requested (explain, review, plan, or change), guess an ambiguous referent, add requirements or deliverables, omit constraints, alter literals or paths, or answer the task. Only then compare clarity and brevity. If every candidate fails, choose the one closest to the original. Return only <best>N</best>, where N is the 1-based candidate index.`
const defaultPrompts: Record<string, string> = {
  "*claude*": `${DEFAULT_PROMPT}\nModel-family hint (lower priority): For Claude, favor direct prose and clear boundaries only for multi-part material.`,
  "*gpt*": `${DEFAULT_PROMPT}\nModel-family hint (lower priority): For GPT, state a goal or constraint only when the user supplied one.`,
  "*gemini*": `${DEFAULT_PROMPT}\nModel-family hint (lower priority): For Gemini, put relevant context before the task only when the request needs that structure.`,
  default: DEFAULT_PROMPT,
}

export function selectPrompt(config: Pick<Config, "prompts">, target: string): string {
  for (const [pattern, instruction] of Object.entries(config.prompts)) {
    if (pattern === "default") continue
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")
    if (new RegExp(`^${escaped}$`, "i").test(target)) return instruction
  }
  return config.prompts.default!
}

export function loadConfig(options: Record<string, unknown>): Config {
  const fail = (message: string): never => { throw new Error(`prompt optimizer options: ${message}`) }
  const object = (value: unknown, name: string): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail(`${name} must be an object`)
    return value as Record<string, unknown>
  }
  const number = (source: Record<string, unknown>, key: string, fallback: number, min: number, max: number) => {
    const value = source[key] ?? fallback
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
      return fail(`${key} must be an integer from ${min} to ${max}`)
    return value as number
  }
  const boolean = (source: Record<string, unknown>, key: string, fallback: boolean) => {
    const value = source[key] ?? fallback
    if (typeof value !== "boolean") return fail(`${key} must be a boolean`)
    return value
  }
  const allowed = ["enabled", "model", "minChars", "timeoutMs", "maxPromptChars", "maxRewriteChars", "context", "skipPatterns", "metadata", "turns", "strategy", "prompts", "judgePrompt", "toast"]
  for (const key of Object.keys(options)) if (!allowed.includes(key)) fail(`unknown option ${key}`)
  const context = options.context === undefined ? {} : object(options.context, "context")
  for (const key of Object.keys(context))
    if (!["enabled", "recapChars", "recentChars", "maxMessages"].includes(key)) fail(`unknown context option ${key}`)
  const model = options.model
  if (model !== undefined && (typeof model !== "string" || !/^[^/\s]+\/[^\s]+$/.test(model)))
    fail('model must be "provider/model"')
  const metadata = options.metadata ?? "full"
  if (metadata !== "full" && metadata !== "rewrite" && metadata !== "none")
    fail('metadata must be "full", "rewrite", or "none"')
  const strategy = options.strategy ?? "parallel"
  if (strategy !== "parallel" && strategy !== "refine") fail('strategy must be "parallel" or "refine"')
  const suppliedPrompts = options.prompts === undefined ? {} : object(options.prompts, "prompts")
  if (Object.values(suppliedPrompts).some((value) => typeof value !== "string" || !value.trim()))
    fail("prompts must be an object of nonempty strings")
  const judgePrompt = options.judgePrompt ?? DEFAULT_JUDGE
  if (typeof judgePrompt !== "string" || !judgePrompt.trim()) fail("judgePrompt must be a nonempty string")
  const skip = options.skipPatterns ?? defaults
  if (!Array.isArray(skip) || skip.some((entry) => typeof entry !== "string")) fail("skipPatterns must be an array of regex strings")
  const skipPatterns = (skip as string[]).map((pattern) => {
    try { return new RegExp(pattern, "i") } catch { return fail(`invalid skip pattern: ${pattern}`) }
  })
  return {
    enabled: boolean(options, "enabled", true), model: model as string | undefined,
    minChars: number(options, "minChars", 20, 0, 10000),
    timeoutMs: number(options, "timeoutMs", 15000, 1000, 120000),
    maxPromptChars: number(options, "maxPromptChars", 6000, 100, 100000),
    maxRewriteChars: number(options, "maxRewriteChars", 8000, 100, 100000),
    toast: boolean(options, "toast", true),
    turns: number(options, "turns", 1, 1, 8),
    strategy: strategy as Config["strategy"],
    prompts: Object.fromEntries([
      ...Object.entries(suppliedPrompts),
      ...Object.entries(defaultPrompts).filter(([key]) => !(key in suppliedPrompts)),
    ]) as Record<string, string>,
    judgePrompt: judgePrompt as string,
    metadata: metadata as Config["metadata"],
    context: {
      enabled: boolean(context, "enabled", true),
      recapChars: number(context, "recapChars", 1200, 0, 10000),
      recentChars: number(context, "recentChars", 1800, 0, 10000),
      maxMessages: number(context, "maxMessages", 6, 0, 30),
    }, skipPatterns,
  }
}
