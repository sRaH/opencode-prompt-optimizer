import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import type { OpenCodeClient } from "@opencode/client"

// Events come from the plugin's own connected server; no second service is involved.
// Summaries live in memory only and never outlive the plugin instance.
export class RecapCache {
  private readonly summaries = new Map<string, string>()
  constructor(private readonly maxChars: number, private readonly maxSessions = 100) {}

  record(sessionID: string, text: string): void {
    this.summaries.delete(sessionID)
    if (text.trim() && this.maxChars) {
      this.summaries.set(sessionID, Array.from(text.trim()).slice(0, this.maxChars).join(""))
      if (this.summaries.size > this.maxSessions) this.summaries.delete(this.summaries.keys().next().value!)
    }
  }

  get(sessionID: string): string | undefined { return this.summaries.get(sessionID) }
  remove(sessionID: string): void { this.summaries.delete(sessionID) }
}

export async function readRecap(client: Pick<OpenCodeClient, "session" | "message">, sessionID: string, directory: string): Promise<string | undefined> {
  const session = await client.session.get({ sessionID })
  if (session.location.directory !== directory) return
  const page = await client.message.list({ sessionID, type: "compaction", order: "desc", limit: 1 })
  const latest = page.data[0]
  if (latest?.type === "compaction" && latest.status === "completed") return latest.summary.trim() || undefined
}

// Plugin session.context exposes the active tail, but not older compaction messages.
// Discover the local service without starting another one; verify the session's location
// before reading its timeline. Remote and private servers simply use recent context only.
export async function localRecap(sessionID: string, directory: string): Promise<string | undefined> {
  const endpoint = await Service.discover()
  if (!endpoint) return
  const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
  return readRecap(client, sessionID, directory)
}
