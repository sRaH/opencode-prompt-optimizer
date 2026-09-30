import { realpathSync } from "node:fs"
import type { OpenCodeClient } from "@opencode/client"

export interface RewriteRow {
  messageID: string
  /** The user's request before a rewrite. Absent when metadata stores the rewrite only. */
  original?: string
  /** Set when the optimizer produced an accepted rewrite. */
  rewrite?: string
  model?: string
  /** The chat model the rewrite is prepared for, as provider/model. */
  target?: string
  /** The exact prompt sent to the optimizer: instructions + recap + recent + request. */
  sent?: string
  /** False when the optimizer returned the request unchanged because it was already clear. */
  changed?: boolean
  /** Set when the optimizer failed and the original prompt was sent unchanged. */
  error?: string
  context?: string
  candidates?: number
  judged?: boolean
  ms?: number
  created: number
}

function sameDirectory(left: string, right: string): boolean {
  try { return realpathSync(left) === realpathSync(right) } catch { return false }
}

const text = (value: unknown, max: number): string | undefined =>
  typeof value === "string" ? value.slice(0, max) : undefined

export async function readRewrites(client: Pick<OpenCodeClient, "session" | "message">, sessionID: string, directory: string): Promise<RewriteRow[]> {
  const session = await client.session.get({ sessionID })
  if (!sameDirectory(session.location.directory, directory)) throw new Error("Session does not belong to the open project")
  const page = await client.message.list({ sessionID, type: "user", order: "desc", limit: 100 })
  return page.data.flatMap((message): RewriteRow[] => {
    if (message.type !== "user") return []
    const stored = message.metadata ?? {}
    const meta = stored.contextPromptOptimizer
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const value = meta as Record<string, unknown>
      const rewrite = text(value.rewrite, 16000)
      if (value.version === 1 && rewrite && typeof value.model === "string") return [{
        messageID: message.id, original: text(value.original, 16000),
        rewrite, model: value.model, changed: value.changed !== false,
        target: text(value.target, 200), sent: text(value.sent, 40000),
        context: typeof value.context === "string" ? value.context : "none",
        candidates: Array.isArray(value.candidates) ? value.candidates.length : 0,
        judged: value.judged === true, ms: typeof value.ms === "number" ? value.ms : 0,
        created: message.time.created,
      } satisfies RewriteRow]
    }
    const error = text(stored.contextPromptOptimizerError, 400)
    // On failure the stored prompt text is still the original request.
    return error ? [{ messageID: message.id, original: message.text.slice(0, 16000), error, created: message.time.created }] : []
  }).slice(0, 20)
}
