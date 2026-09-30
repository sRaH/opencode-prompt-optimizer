import { connectHost } from "@openchamber/sdk"
import { applyHostReady, mountBanner, mountButton, mountEmpty, mountList, mountSelect, mountSwitch, mountTabs, mountTextField } from "@openchamber/sdk/ui"
import { pluginEntries, updatePluginSettings, type PluginEntry, type SettingsPatch } from "../settings.js"
import type { RewriteRow } from "../service/rewrites.js"

const host = connectHost()
const root = document.querySelector<HTMLElement>("#root")!
const settings = root.querySelector<HTMLElement>("#settings")!
const comparison = root.querySelector<HTMLElement>("#comparison")!
const notice = root.querySelector<HTMLElement>("#notice")!
const sources = [
  { path: "~/.config/openchamber/opencode.managed.json", label: "OpenChamber managed config" },
  { path: "~/.config/opencode/opencode.json", label: "Global OpenCode config" },
]
type Source = { path: string; label: string; entry: PluginEntry }
let available: Source[] = []
let selected = ""
let draft: SettingsPatch | null = null
let promptsText = ""
let skipsText = ""
let judgeText = ""
let directory: string | null = null
let sessionID: string | null = null
let rewrites: RewriteRow[] = []
let selectedRewrite: string | null = null
let settingsGeneration = 0
let rewriteGeneration = 0
let noticeHandle: { dispose(): void } | null = null
let controls: Array<{ dispose(): void }> = []
let active = "comparison"

function banner(title: string, body = "", tone: "info" | "error" | "success" = "info") {
  noticeHandle?.dispose()
  noticeHandle = mountBanner(notice, { title, body, tone })
}

const tabs = mountTabs(root.querySelector("#tabs")!, {
  activeId: active, items: [{ id: "comparison", label: "Prompts" }, { id: "settings", label: "Settings" }],
  onChange(id) {
    active = id
    tabs.update({ activeId: id })
    comparison.classList.toggle("hidden", id !== "comparison")
    settings.classList.toggle("hidden", id !== "settings")
  },
})
settings.classList.add("hidden")

function slot(parent: HTMLElement): HTMLElement {
  const element = document.createElement("div")
  parent.appendChild(element)
  return element
}

function heading(parent: HTMLElement, title: string): void {
  const element = document.createElement("h2")
  element.textContent = title
  parent.appendChild(element)
}

function fromEntry(entry: PluginEntry): SettingsPatch {
  const options = entry.options
  const context = (options.context && typeof options.context === "object" && !Array.isArray(options.context))
    ? options.context as Record<string, unknown> : {}
  const numeric = (value: unknown, fallback: number) => typeof value === "number" ? value : fallback
  promptsText = options.prompts && typeof options.prompts === "object" ? JSON.stringify(options.prompts, null, 2) : ""
  skipsText = Array.isArray(options.skipPatterns) ? JSON.stringify(options.skipPatterns, null, 2) : ""
  judgeText = typeof options.judgePrompt === "string" ? options.judgePrompt : ""
  return {
    enabled: options.enabled !== false, model: typeof options.model === "string" ? options.model : "",
    turns: numeric(options.turns, 1), strategy: options.strategy === "refine" ? "refine" : "parallel",
    minChars: numeric(options.minChars, 20), timeoutMs: numeric(options.timeoutMs, 15000),
    maxPromptChars: numeric(options.maxPromptChars, 6000), maxRewriteChars: numeric(options.maxRewriteChars, 8000),
    metadata: options.metadata === "rewrite" || options.metadata === "none" ? options.metadata : "full",
    toast: options.toast !== false,
    context: {
      enabled: context.enabled !== false, recapChars: numeric(context.recapChars, 1200),
      recentChars: numeric(context.recentChars, 1800), maxMessages: numeric(context.maxMessages, 6),
    },
  }
}

function renderSettings(): void {
  for (const control of controls) control.dispose()
  controls = []
  settings.replaceChildren()
  const sourceSelect = mountSelect(slot(settings), {
    label: "Configuration source", value: selected || null,
    options: available.map((source, index) => ({ id: String(index), label: source.label, hint: source.entry.package })),
    onChange(id) {
      selected = id
      sourceSelect.update({ value: id })
      draft = fromEntry(available[Number(id)]!.entry)
      renderSettings()
    },
  })
  controls.push(sourceSelect)
  if (!draft) {
    controls.push(mountEmpty(slot(settings), { title: "Plugin not configured", body: "Add the OpenCode plugin to a global or OpenChamber config first." }))
    return
  }
  const state = draft
  const field = (label: string, value: string, onChange: (value: string) => void, multiline = false) => {
    const handle = mountTextField(slot(settings), { label, value, mono: true, multiline, rows: multiline ? 5 : undefined, onChange })
    controls.push(handle)
  }
  const number = (label: string, value: number, assign: (value: number) => void) => field(label, String(value), (next) => assign(Number(next)))
  const toggle = (label: string, checked: boolean, assign: (checked: boolean) => void) => {
    const handle = mountSwitch(slot(settings), { label, checked, onChange(next) { assign(next); handle.update({ checked: next }) } })
    controls.push(handle)
  }
  toggle("Enabled", state.enabled, (value) => { state.enabled = value })
  field("Cheap optimizer model (provider/model)", state.model, (value) => { state.model = value })
  number("Candidates (1–8)", state.turns, (value) => { state.turns = value })
  const strategy = mountSelect(slot(settings), { label: "Candidate strategy", value: state.strategy,
    options: [{ id: "parallel", label: "Parallel" }, { id: "refine", label: "Refine" }],
    onChange(value) { state.strategy = value as SettingsPatch["strategy"]; strategy.update({ value }) },
  })
  controls.push(strategy)
  toggle("Use session context", state.context.enabled, (value) => { state.context.enabled = value })
  number("Recap characters", state.context.recapChars, (value) => { state.context.recapChars = value })
  number("Recent text characters", state.context.recentChars, (value) => { state.context.recentChars = value })
  number("Recent messages", state.context.maxMessages, (value) => { state.context.maxMessages = value })
  const metadata = mountSelect(slot(settings), { label: "Stored rewrite metadata", value: state.metadata,
    options: [{ id: "full", label: "Original + optimized" }, { id: "rewrite", label: "Optimized only" }, { id: "none", label: "None (comparison unavailable)" }],
    onChange(value) { state.metadata = value as SettingsPatch["metadata"]; metadata.update({ value }) },
  })
  controls.push(metadata)
  toggle("Show TUI toast", state.toast, (value) => { state.toast = value })
  heading(settings, "Limits")
  number("Minimum request characters", state.minChars, (value) => { state.minChars = value })
  number("Timeout (ms)", state.timeoutMs, (value) => { state.timeoutMs = value })
  number("Maximum request characters", state.maxPromptChars, (value) => { state.maxPromptChars = value })
  number("Maximum rewrite characters", state.maxRewriteChars, (value) => { state.maxRewriteChars = value })
  heading(settings, "Advanced")
  field("Model-specific prompts (JSON object; blank keeps existing)", promptsText, (value) => { promptsText = value }, true)
  field("Judge instructions (blank keeps existing)", judgeText, (value) => { judgeText = value }, true)
  field("Skip patterns (JSON array; blank keeps existing)", skipsText, (value) => { skipsText = value }, true)
  controls.push(mountButton(slot(settings), { label: "Save settings", onClick: () => void saveSettings() }))
  const note = document.createElement("p")
  note.className = "subtle"
  note.textContent = "Only this plugin entry is edited. OpenChamber may regenerate its managed config; global settings can be used as a durable fallback."
  settings.appendChild(note)
}

async function loadSettings(): Promise<void> {
  const current = ++settingsGeneration
  const found: Source[] = []
  for (const source of sources) {
    try {
      const { content } = await host.readFile(source.path)
      if (current !== settingsGeneration) return
      for (const entry of pluginEntries(content)) found.push({ ...source, entry })
    } catch (error) {
      if (String(error).includes("NOT_GRANTED")) { banner("File permission required", "Approve the extension's config-file access in Settings → Extensions.", "error"); return }
    }
  }
  if (current !== settingsGeneration) return
  available = found
  selected = found.length ? "0" : ""
  draft = found.length ? fromEntry(found[0]!.entry) : null
  renderSettings()
}

async function saveSettings(): Promise<void> {
  const target = available[Number(selected)]
  if (!target || !draft) return
  try {
    const patch: SettingsPatch = { ...draft, context: { ...draft.context } }
    if (promptsText.trim()) patch.prompts = JSON.parse(promptsText) as Record<string, string>
    if (judgeText.trim()) patch.judgePrompt = judgeText
    if (skipsText.trim()) patch.skipPatterns = JSON.parse(skipsText) as string[]
    const { content } = await host.readFile(target.path)
    const updated = updatePluginSettings(content, target.entry, patch)
    await host.writeFile(target.path, updated)
    banner("Saved", `Updated ${target.label}. OpenCode reloads watched configuration automatically.`, "success")
    void host.toast({ kind: "success", message: "Prompt optimizer settings saved" })
    await loadSettings()
  } catch (error) { banner("Settings not saved", error instanceof Error ? error.message : String(error), "error") }
}

function renderComparison(): void {
  comparison.replaceChildren()
  const actions = slot(comparison)
  actions.className = "actions"
  mountButton(actions, { label: "Refresh rewrites", variant: "secondary", onClick: () => void refreshRewrites() })
  if (!sessionID) { mountEmpty(slot(comparison), { title: "Open a chat", body: "Select a session to see its prompt rewrites." }); return }
  if (!rewrites.length) { mountEmpty(slot(comparison), { title: "No stored rewrites", body: "Send an eligible prompt with metadata set to full or rewrite. Remote/private OpenCode services may not support comparison." }); return }
  mountList(slot(comparison), { items: rewrites.map((row) => ({
    id: row.messageID, title: row.original?.slice(0, 65) || row.rewrite?.slice(0, 65) || "(empty request)",
    subtitle: row.error ? "Not optimized · sent unchanged"
      : `${row.model} · ${row.context}${row.candidates ? ` · ${row.candidates} candidate(s)` : ""}`,
  })), onSelect(id) { selectedRewrite = id; renderComparison() } })
  const row = rewrites.find((value) => value.messageID === selectedRewrite) ?? rewrites[0]!
  selectedRewrite = row.messageID
  heading(comparison, "Original")
  const original = document.createElement("pre")
  original.textContent = row.original ?? "Not stored — metadata is set to rewrite-only."
  comparison.appendChild(original)
  if (row.error) {
    mountBanner(slot(comparison), {
      tone: "warning", title: "Not optimized", body: `${row.error} — the original request was sent to the chat model unchanged.`,
    })
    return
  }
  heading(comparison, "Optimized")
  const optimized = document.createElement("pre")
  optimized.textContent = row.rewrite ?? ""
  comparison.appendChild(optimized)
  const copy = slot(comparison)
  copy.className = "actions"
  const rewrite = row.rewrite ?? ""
  if (row.original) mountButton(copy, { label: "Copy original", variant: "outline", onClick: () => void host.writeClipboard(row.original!) })
  if (rewrite) mountButton(copy, { label: "Copy optimized", variant: "outline", onClick: () => void host.writeClipboard(rewrite) })
}

async function refreshRewrites(): Promise<void> {
  const current = ++rewriteGeneration
  if (!sessionID || !directory) { rewrites = []; renderComparison(); return }
  try {
    const result = await host.serviceRequest({ method: "POST", path: "/rewrites", body: JSON.stringify({ sessionID, directory }) })
    if (current !== rewriteGeneration) return
    const payload = JSON.parse(result.body) as { rewrites?: RewriteRow[]; error?: string }
    if (result.status !== 200) throw new Error(payload.error ?? `Bridge returned ${result.status}`)
    rewrites = payload.rewrites ?? []
    selectedRewrite = rewrites[0]?.messageID ?? null
    renderComparison()
  } catch (error) {
    if (current !== rewriteGeneration) return
    rewrites = []
    renderComparison()
    banner("Comparison unavailable", error instanceof Error ? error.message : String(error), "error")
  }
}

let mounted = false
host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement)
  const nextSession = ctx.session?.id ?? null
  const nextDirectory = ctx.directory
  if (!mounted) { mounted = true; void loadSettings() }
  if (sessionID !== nextSession || directory !== nextDirectory) {
    sessionID = nextSession
    directory = nextDirectory
    void refreshRewrites()
  }
})
