import type { Config } from "./config.js"

export interface Message {
  type: string
  text?: string
  status?: string
  summary?: string
  content?: readonly { type: string; text?: string }[]
}

export interface Background {
  recap: string
  recent: string
  source: "recap+recent" | "recap" | "recent" | "none"
}

// Slice on code points, so a cap never leaves a dangling surrogate pair.
export const clip = (text: string, length: number): string => Array.from(text).slice(0, length).join("")

export function background(messages: readonly Message[], summary: string | undefined, config: Config["context"]): Background {
  if (!config.enabled) return { recap: "", recent: "", source: "none" }
  const recap = clip(summary?.trim() ?? "", config.recapChars)
  const entries: string[] = []
  let remaining = config.recentChars
  for (const message of messages.slice().reverse()) {
    if (entries.length >= config.maxMessages || remaining <= 0) break
    if (message.type !== "user" && message.type !== "assistant") continue
    const text = message.type === "user" ? message.text : message.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n")
    if (!text?.trim()) continue
    const prefix = `${message.type}: `
    const content = text.trim()
    const space = remaining - prefix.length - (entries.length ? 2 : 0)
    if (space <= 0) break
    const chars = Array.from(content)
    let entry: string
    if (chars.length > space) {
      if (entries.length) break // do not cut an older turn in half to fill a tiny remainder
      const marker = "[earlier text omitted] "
      entry = prefix + (space > marker.length ? marker + chars.slice(-(space - marker.length)).join("") : chars.slice(-space).join(""))
    } else entry = prefix + content
    entries.unshift(entry)
    remaining -= Array.from(entry).length + (entries.length > 1 ? 2 : 0)
  }
  const recent = entries.join("\n\n")
  const source = recap && recent ? "recap+recent" : recap ? "recap" : recent ? "recent" : "none"
  return { recap, recent, source }
}

export function latestSummary(messages: readonly Message[]): string | undefined {
  // An opaque native checkpoint has an empty summary; never use older summaries in its place.
  const latest = messages.slice().reverse().find((message) => message.type === "compaction")
  return latest?.status === "completed" ? latest.summary?.trim() || undefined : undefined
}
