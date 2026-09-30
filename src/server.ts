import { Plugin } from "@opencode/plugin"
import type { SessionPrompt } from "@opencode/plugin/promise/session"
import { loadConfig, selectPrompt } from "./config.js"
import { background, latestSummary } from "./context.js"
import { localRecap, RecapCache } from "./recap.js"
import { optimizeWith } from "./rewrite.js"

export const ID = "context-prompt-optimizer"

export interface RewriteMetadata {
  version: 1
  original?: string
  rewrite: string
  model: string
  target: string
  context: "recap+recent" | "recap" | "recent" | "none"
  ms: number
  candidates?: string[]
  chosen?: number
  judged?: boolean
  toast?: boolean
}

export function readRewrite(value: unknown): RewriteMetadata | undefined {
  if (!value || typeof value !== "object") return
  const record = value as Partial<RewriteMetadata>
  if (record.version === 1 && (record.original === undefined || typeof record.original === "string") && typeof record.rewrite === "string"
    && typeof record.model === "string" && typeof record.target === "string" && typeof record.ms === "number"
    && ["recap+recent", "recap", "recent", "none"].includes(record.context ?? "")) return record as RewriteMetadata
}

export const setup: Plugin.Plugin["setup"] = async (ctx) => {
  if (!ctx.app.version.startsWith("2.")) throw new Error(`${ID} requires OpenCode v2`)
  const config = loadConfig(ctx.options)
  let warnedModel = false
  let warnedContext = false
  const recaps = new RecapCache(config.context.recapChars)
  const checkedRecap = new Set<string>()
  const controller = new AbortController()
  if (config.context.enabled && config.context.recapChars) {
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === "session.compaction.ended") {
          recaps.record(event.data.sessionID, event.data.text)
          checkedRecap.add(event.data.sessionID)
        }
        if (event.type === "session.deleted") {
          recaps.remove(event.data.sessionID)
          checkedRecap.delete(event.data.sessionID)
        }
      }
    })().catch(() => {
      if (!controller.signal.aborted) console.warn(`${ID}: recap event stream unavailable; using session context`)
    })
  }
  const prepare = async (event: SessionPrompt) => {
    const original = event.prompt.text
    try {
      const text = original.trim()
      if (!config.enabled || text.length < config.minChars || text.length > config.maxPromptChars
        || ((event.prompt.files?.length ?? 0) > 0 && text.length < 120)
        || config.skipPatterns.some((pattern) => pattern.test(text))) return
      if (!config.model) {
        if (!warnedModel) { warnedModel = true; console.warn(`${ID}: set an explicit cheap optimizer model in plugin options`) }
        return
      }
      const session = await ctx.session.get({ sessionID: event.sessionID })
      if (session.parentID) return
      // Never borrow the main model for optimization, even if it happens to be cheap.
      const selected = session.model ?? (await ctx.model.default({ location: session.location })).data
      const target = selected ? `${selected.providerID}/${selected.id}` : "unknown"
      let messages: Awaited<ReturnType<typeof ctx.session.context>> = []
      let recap: string | undefined
      if (config.context.enabled && (config.context.recapChars || config.context.recentChars)) {
        try {
          messages = await ctx.session.context({ sessionID: event.sessionID })
          recap = latestSummary(messages) ?? recaps.get(event.sessionID)
          if (!recap && config.context.recapChars && !checkedRecap.has(event.sessionID)) {
            checkedRecap.add(event.sessionID)
            recap = await localRecap(event.sessionID, session.location.directory)
            if (recap) recaps.record(event.sessionID, recap)
          }
        } catch {
          // Context is best effort. An unreadable recap must not prevent a one-call rewrite.
          if (!warnedContext) {
            warnedContext = true
            console.warn(`${ID}: recap lookup unavailable; using readable recent context when possible`)
          }
        }
      }
      const info = background(messages, recap, config.context)
      const slash = config.model.indexOf("/")
      const started = Date.now()
      const result = await optimizeWith({
        original: text, target, context: info, system: selectPrompt(config, target), judgeSystem: config.judgePrompt,
        turns: config.turns, strategy: config.strategy, maxRewriteChars: config.maxRewriteChars,
      }, async (prompt) => {
        const reply = await ctx.generate.text({
          model: { providerID: config.model!.slice(0, slash), id: config.model!.slice(slash + 1) }, prompt,
        }, { signal: AbortSignal.timeout(config.timeoutMs) })
        return reply.text
      })
      const rewrite = result.rewrite
      if (rewrite === text) return
      // Admission is the single canonical edit; only mutate after all fallible work succeeds.
      event.prompt.text = rewrite
      for (const attachment of [...(event.prompt.files ?? []), ...(event.prompt.agents ?? []), ...(event.prompt.skills ?? [])])
        delete attachment.mention
      if (config.metadata !== "none") event.metadata = { ...event.metadata, contextPromptOptimizer: {
        version: 1, ...(config.metadata === "full" ? { original } : {}),
        rewrite, model: config.model, target, context: info.source, ms: Date.now() - started,
        ...(config.metadata === "full" ? { candidates: result.candidates } : {}),
        chosen: result.chosen, judged: result.judged, toast: config.toast,
      } satisfies RewriteMetadata }
    } catch (error) {
      // Do not persist prompt contents or provider errors in metadata or logs.
      console.warn(`${ID}: sent original prompt (${error instanceof Error ? error.name : "error"})`)
    }
  }
  await ctx.session.hook("prompt", prepare)
  await ctx.command.transform((commands) => commands.add({
    name: "optimize",
    description: "Optimize and send a request using the configured optimizer model",
    async execute({ sessionID, prompt, delivery }) {
      if (!prompt.text.trim()) throw new Error("Usage: /optimize <request>")
      await ctx.session.prompt({ sessionID, ...prompt, delivery })
    },
  }))
  await ctx.command.reload()
  return () => controller.abort()
}

export default Plugin.define({ id: ID, setup })
