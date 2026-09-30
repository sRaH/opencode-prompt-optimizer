import { expect, test } from "bun:test"
import { pluginEntries, updatePluginSettings, type SettingsPatch } from "./settings.js"

const source = `{
  // Keep this comment and unrelated plugin.
  "plugins": [
    "another-plugin",
    { "package": "/Users/me/Personal/OpenCode/opencode-prompt-optimizer", "options": { "model": "cheap/model", "custom": true } }
  ],
  "model": "main/large"
}`
const patch: SettingsPatch = {
  enabled: false, model: "cheap/next", turns: 3, strategy: "refine", minChars: 20,
  timeoutMs: 15000, maxPromptChars: 6000, maxRewriteChars: 8000, metadata: "rewrite", toast: false,
  context: { enabled: true, recapChars: 500, recentChars: 1200, maxMessages: 4 },
  prompts: { "*gpt*": "Use a concise goal" }, skipPatterns: ["^/"], judgePrompt: "Pick the most faithful candidate",
}

test("edits only the selected plugin options, preserving comments and other settings", () => {
  const [entry] = pluginEntries(source)
  expect(entry).toBeDefined()
  const updated = updatePluginSettings(source, entry!, patch)
  expect(updated).toContain("// Keep this comment")
  expect(updated).toContain('"another-plugin"')
  expect(updated).toContain('"model": "main/large"')
  const next = pluginEntries(updated)[0]!
  expect(next.options).toMatchObject({ model: "cheap/next", enabled: false, turns: 3, custom: true,
    context: { recapChars: 500, maxMessages: 4 } })
})

test("rejects stale entries and invalid options without writing", () => {
  const entry = pluginEntries(source)[0]!
  expect(() => updatePluginSettings(source, { ...entry, package: "/wrong" }, patch)).toThrow("changed")
  expect(() => updatePluginSettings(source, entry, { ...patch, turns: 9 })).toThrow("turns")
  expect(() => updatePluginSettings(source, entry, { ...patch, model: "not-a-ref" })).toThrow("provider/model")
  expect(() => updatePluginSettings(source, entry, { ...patch, skipPatterns: ["["] })).toThrow("Invalid skip")
  expect(() => pluginEntries("{invalid")).toThrow("valid JSON")
})
