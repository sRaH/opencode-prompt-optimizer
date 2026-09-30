import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { parseManifestJson } from "@openchamber/sdk/schemas"
import manifest from "../package.json" with { type: "json" }

test("OpenChamber accepts the manifest exactly as installed", () => {
  const parsed = parseManifestJson(JSON.stringify(manifest))
  if (!parsed.ok) throw new Error(`manifest rejected: ${parsed.code} — ${parsed.message}`)
  expect(parsed.manifest.apiVersion).toBe(1)
  const contributes = parsed.manifest.contributes
  expect(contributes.panel?.id).toBe("prompt-optimizer")
  // OpenChamber installs the shipped bundle; it never compiles these entry files.
  expect(existsSync(new URL(`../${contributes.panel!.entry}`, import.meta.url))).toBe(true)
  expect(existsSync(new URL(`../${contributes.service!.entry}`, import.meta.url))).toBe(true)
  expect(contributes.filesystem).toContain("~/.config/opencode/opencode.json")
})
