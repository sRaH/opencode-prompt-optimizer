import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"

export interface PluginEntry {
  index: number
  package: string
  options: Record<string, unknown>
}

export type SettingsPatch = {
  enabled: boolean
  model: string
  turns: number
  strategy: "parallel" | "refine"
  minChars: number
  timeoutMs: number
  maxPromptChars: number
  maxRewriteChars: number
  metadata: "full" | "rewrite" | "none"
  toast: boolean
  context: {
    enabled: boolean
    recapChars: number
    recentChars: number
    maxMessages: number
  }
  prompts?: Record<string, string>
  judgePrompt?: string
  skipPatterns?: string[]
}

function document(source: string): Record<string, unknown> {
  const errors: ParseError[] = []
  const value = parse(source, errors, { allowTrailingComma: true })
  if (errors.length || !value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Config is not valid JSON or JSONC; no changes were made")
  return value as Record<string, unknown>
}

export function pluginEntries(source: string): PluginEntry[] {
  const plugins = document(source).plugins
  if (!Array.isArray(plugins)) return []
  return plugins.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    const entry = value as Record<string, unknown>
    if (typeof entry.package !== "string" || !entry.package.includes("opencode-prompt-optimizer")) return []
    const options = entry.options
    return [{ index, package: entry.package, options: options && typeof options === "object" && !Array.isArray(options)
      ? options as Record<string, unknown> : {} }]
  })
}

export function validateSettings(patch: SettingsPatch): void {
  if (!/^[^/\s]+\/[^\s]+$/.test(patch.model)) throw new Error("Model must be provider/model")
  const bounds: Record<string, [number, number]> = {
    turns: [1, 8], minChars: [0, 10000], timeoutMs: [1000, 120000],
    maxPromptChars: [100, 100000], maxRewriteChars: [100, 100000],
    recapChars: [0, 10000], recentChars: [0, 10000], maxMessages: [0, 30],
  }
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const value = key in patch.context ? patch.context[key as keyof SettingsPatch["context"]] : patch[key as keyof SettingsPatch]
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max)
      throw new Error(`${key} must be an integer from ${min} to ${max}`)
  }
  if (!["parallel", "refine"].includes(patch.strategy)) throw new Error("Invalid strategy")
  if (!["full", "rewrite", "none"].includes(patch.metadata)) throw new Error("Invalid metadata setting")
  for (const key of ["enabled", "toast"] as const) if (typeof patch[key] !== "boolean") throw new Error(`Invalid ${key}`)
  if (typeof patch.context.enabled !== "boolean") throw new Error("Invalid context setting")
  if (patch.prompts !== undefined && (typeof patch.prompts !== "object" || Array.isArray(patch.prompts)
    || Object.values(patch.prompts).some((value) => typeof value !== "string" || !value.trim())))
    throw new Error("Model prompts must be a map of nonempty strings")
  if (patch.judgePrompt !== undefined && !patch.judgePrompt.trim()) throw new Error("Judge instructions cannot be empty")
  if (patch.skipPatterns !== undefined) {
    if (!Array.isArray(patch.skipPatterns)) throw new Error("Skip patterns must be an array")
    for (const pattern of patch.skipPatterns) {
      if (typeof pattern !== "string") throw new Error("Skip patterns must be strings")
      try { new RegExp(pattern) } catch { throw new Error(`Invalid skip pattern: ${pattern}`) }
    }
  }
}

export function updatePluginSettings(source: string, entry: Pick<PluginEntry, "index" | "package">, patch: SettingsPatch): string {
  validateSettings(patch)
  const current = pluginEntries(source).find((item) => item.index === entry.index)
  if (!current || current.package !== entry.package) throw new Error("Plugin entry changed; reload before saving")
  let next = source
  const formattingOptions = { insertSpaces: true, tabSize: 2, eol: "\n" }
  for (const [key, value] of Object.entries(patch)) {
    if (key === "context") {
      for (const [child, childValue] of Object.entries(patch.context))
        next = applyEdits(next, modify(next, ["plugins", entry.index, "options", "context", child], childValue, { formattingOptions }))
    } else if (value !== undefined) {
      next = applyEdits(next, modify(next, ["plugins", entry.index, "options", key], value, { formattingOptions }))
    }
  }
  document(next)
  return next
}
