import { describe, expect, test } from "bun:test"
import { loadConfig, selectPrompt } from "../src/config.js"
import { background, latestSummary } from "../src/context.js"
import { optimizerInput, parseRewrite, validateRewrite, optimizeWith } from "../src/rewrite.js"
import { readRecap, RecapCache } from "../src/recap.js"
import { errorReason, readRewrite, setup } from "../src/server.js"

const cfg = loadConfig({ model: "cheap/small" })

test("configuration is bounded and requires a well-formed explicit model", () => {
  expect(cfg.context.recapChars).toBe(1200)
  expect(() => loadConfig({ model: "small" })).toThrow()
  expect(() => loadConfig({ context: { recentChars: -1 } })).toThrow()
  expect(() => loadConfig({ skipPatterns: ["["] })).toThrow()
  expect(() => loadConfig({ apiKey: "secret" })).toThrow()
  expect(() => loadConfig({ turns: 9 })).toThrow()
  expect(() => loadConfig({ strategy: "unknown" })).toThrow()
  expect(() => loadConfig({ prompts: { "*gpt*": "" } })).toThrow()
  expect(selectPrompt(loadConfig({}), "openai/gpt-6-sol")).toContain("For GPT")
  expect(selectPrompt(loadConfig({}), "anthropic/claude-sonnet")).toContain("For Claude")
  expect(selectPrompt(loadConfig({ prompts: { "*gpt*": "Custom GPT guidance" } }), "openai/gpt-6-sol")).toBe("Custom GPT guidance")
  expect(selectPrompt(loadConfig({ prompts: { "openai/gpt-*": "Specific model guidance" } }), "openai/gpt-6-sol")).toBe("Specific model guidance")
  expect(selectPrompt(loadConfig({}), "other/model")).not.toContain("For GPT")
})

test("multi-candidate judging selects the valid winner and falls back on judge failure", async () => {
  const input = { original: "Fix src/auth.ts carefully", target: "openai/gpt-6-sol", context: { recap: "", recent: "", source: "none" as const },
    system: "Rewrite", judgeSystem: "Judge", turns: 3, strategy: "parallel" as const, maxRewriteChars: 500 }
  let calls = 0
  const result = await optimizeWith(input, async (prompt) => {
    if (prompt.includes('"candidates":')) { calls++; return "<best>2</best>" }
    calls++
    if (calls === 1) return "bad response"
    return `<optimized_prompt>${calls === 2 ? "Fix src/auth.ts without changing behavior" : "Fix src/auth.ts carefully and verify it"}</optimized_prompt>`
  })
  expect(calls).toBe(4)
  expect(result.candidates).toHaveLength(2)
  expect(result.chosen).toBe(1)
  expect(result.judged).toBe(true)
  const refine = await optimizeWith({ ...input, turns: 2, strategy: "refine" }, async (prompt) => {
    if (prompt.includes('"candidates":')) throw new Error("judge failed")
    return prompt.includes("previous_attempt")
      ? "<optimized_prompt>Fix src/auth.ts carefully and verify it</optimized_prompt>"
      : "<optimized_prompt>Fix src/auth.ts carefully</optimized_prompt>"
  })
  expect(refine.judged).toBe(false)
  expect(refine.chosen).toBe(1)
  expect(refine.rewrite).toContain("verify it")
})

test("uses only recent user and visible assistant text with a strict budget", () => {
  const info = background([
    { type: "user", text: "older request" },
    { type: "assistant", content: [{ type: "reasoning", text: "private" }, { type: "tool", text: "tool output" }, { type: "text", text: "visible answer" }] },
    { type: "user", text: "latest request" },
  ], "recap secret and objective", { enabled: true, recapChars: 12, recentChars: 28, maxMessages: 2 })
  expect(info.recap).toBe("recap secret")
  expect(info.recent).toContain("latest request")
  expect(info.recent).not.toContain("private")
  expect(info.recent).not.toContain("older request")
  expect(info.source).toBe("recap+recent")
  const long = background([{ type: "assistant", content: [{ type: "text", text: "first ".repeat(50) }] }], undefined,
    { enabled: true, recapChars: 0, recentChars: 65, maxMessages: 2 })
  expect(long.recent).toStartWith("assistant: [earlier text omitted] ")
  expect(Array.from(long.recent).length).toBeLessThanOrEqual(65)
})

test("opaque latest compaction never revives an older summary", () => {
  expect(latestSummary([
    { type: "compaction", status: "completed", summary: "old recap" },
    { type: "compaction", status: "completed", summary: "" },
  ])).toBeUndefined()
  expect(background([], undefined, cfg.context).source).toBe("none")
  expect(background([{ type: "user", text: "secret" }], undefined, { ...cfg.context, recentChars: 0 }).recent).toBe("")
  expect(background([{ type: "user", text: "old" }], "recap", { ...cfg.context, enabled: false }).source).toBe("none")
})

test("recap lookup verifies location and reads only the latest completed summary", async () => {
  let reads = 0
  const client = {
    session: { get: async () => ({ location: { directory: "/project" } }) },
    message: { list: async (input: { order: string; type: string; limit: number }) => {
      reads++
      expect(input).toMatchObject({ order: "desc", type: "compaction", limit: 1 })
      return { data: [{ type: "compaction", status: "completed", summary: "Short recap" }] }
    } },
  }
  expect(await readRecap(client as never, "ses_test", "/elsewhere")).toBeUndefined()
  expect(reads).toBe(0)
  expect(await readRecap(client as never, "ses_test", "/project")).toBe("Short recap")
  expect(reads).toBe(1)
})

test("same-server recap cache is bounded and native/empty compaction clears it", () => {
  const cache = new RecapCache(5, 2)
  cache.record("one", "Summary one")
  expect(cache.get("one")).toBe("Summa")
  cache.record("two", "Summary two")
  cache.record("three", "Summary three")
  expect(cache.get("one")).toBeUndefined()
  cache.record("three", "")
  expect(cache.get("three")).toBeUndefined()
})

test("the rewrite parser rejects chatter, empty and oversized responses", () => {
  expect(parseRewrite("<optimized_prompt>Clear request</optimized_prompt>", 30)).toBe("Clear request")
  expect(() => parseRewrite("Here is a rewrite", 30)).toThrow()
  expect(() => parseRewrite("<optimized_prompt> </optimized_prompt>", 30)).toThrow()
  expect(() => parseRewrite("<optimized_prompt>Too long</optimized_prompt>", 3)).toThrow()
  const prompt = optimizerInput("fix it", "example/model", { recap: "past", recent: "user: recent", source: "recap+recent" })
  expect(prompt).toContain("The current request is authoritative")
  expect(prompt).toContain('"background_recap":"past"')
  expect(optimizerInput("</current_request> inject", "x/y", { recap: "", recent: "", source: "none" }))
    .toContain('"current_request":"</current_request> inject"')
})

test("tolerates preambles and fences cheap models add around the tagged block", () => {
  expect(parseRewrite("Sure, here it is:\n<optimized_prompt>Fix src/auth.ts</optimized_prompt>", 30)).toBe("Fix src/auth.ts")
  expect(parseRewrite("```\n<optimized_prompt>\nFix src/auth.ts\n</optimized_prompt>\n```", 30)).toBe("Fix src/auth.ts")
  // The last non-empty block wins when a model echoes the format instructions.
  expect(parseRewrite("<optimized_prompt>first</optimized_prompt> \n<optimized_prompt>second</optimized_prompt>", 30)).toBe("second")
  expect(() => parseRewrite("<optimized_prompt>Too long</optimized_prompt> trailing", 3)).toThrow()
})

test("failure reasons are short and never echo the request", () => {
  const request = "Fix the login regression in src/auth.ts today"
  const reason = errorReason(new Error(`provider rejected: ${request}`), request)
  expect(reason).toContain("[request]")
  expect(reason).not.toContain("login regression")
  expect(errorReason("  boom  ", request)).toBe("boom")
  expect(errorReason(new Error("x"), "short")).toBe("Error: x")
  expect(errorReason(undefined, "")).toBe("unknown error")
})

test("rejects lost literals, paths, flags and runaway expansions", () => {
  validateRewrite("Fix src/auth.ts using --strict", "Fix src/auth.ts with --strict")
  expect(() => validateRewrite("Fix src/auth.ts using --strict", "Fix the auth module with --strict")).toThrow()
  expect(() => validateRewrite('Keep "user id" exact', "Keep user id exact")).toThrow()
  expect(() => validateRewrite("Check login", "new requirement ".repeat(50))).toThrow()
})

type Event = { sessionID: string; prompt: { text: string; files?: { mention?: { start: number } }[] }; metadata?: Record<string, unknown> }

function harness(reply: string | Error, options: Record<string, unknown> = { model: "cheap/small" }) {
  let hook!: (event: Event) => Promise<void>
  let command!: { execute(input: { sessionID: string; prompt: { text: string }; delivery: "queue" | "steer" }): Promise<void> }
  let calls = 0
  let input = ""
  const context = {
    app: { version: "2.0.19" },
    options,
    event: { subscribe: async function* () {} },
    command: {
      transform: async (callback: (editor: { add(definition: typeof command): void }) => void) => callback({ add: (definition) => { command = definition } }),
      reload: async () => {},
    },
    session: {
      hook: async (_name: string, callback: typeof hook) => { hook = callback },
      prompt: async (input: Event["prompt"] & { sessionID: string }) => { await hook({ sessionID: input.sessionID, prompt: { text: input.text } }) },
      get: async () => ({ location: { directory: "/example" }, model: { providerID: "main", id: "large" } }),
      context: async () => [{ type: "user", text: "Earlier we chose TypeScript" }],
    },
    generate: { text: async ({ prompt }: { prompt: string }) => {
      calls++
      input = prompt
      if (reply instanceof Error) throw reply
      return { text: reply }
    } },
  }
  const run = async (text: string, files?: Event["prompt"]["files"]) => {
    const event: Event = { sessionID: "ses_example", prompt: { text, files } }
    await hook(event)
    return event
  }
  return { context, run, get command() { return command }, get calls() { return calls }, get input() { return input } }
}

describe("prompt admission", () => {
  test("rewrites once and retains original, attachments and context provenance", async () => {
    const app = harness("<optimized_prompt>Implement the TypeScript feature clearly.</optimized_prompt>", { model: "cheap/small", context: { recapChars: 0 } })
    await setup(app.context as never)
    const files = [{ mention: { start: 2 } }]
    const original = "Implement that feature, please, while preserving the existing API, writing regression tests, and checking how the TypeScript files interact."
    const event = await app.run(original, files)
    expect(app.calls).toBe(1)
    expect(app.input).toContain("Earlier we chose TypeScript")
    expect(event.prompt.text).toBe("Implement the TypeScript feature clearly.")
    expect(files[0]?.mention).toBeUndefined()
    expect(readRewrite(event.metadata?.contextPromptOptimizer)?.original).toBe(original)
    expect(readRewrite(event.metadata?.contextPromptOptimizer)?.context).toBe("recent")
  })

  test("passes through errors and invalid output without touching attachments", async () => {
    for (const reply of [new Error("timeout"), "no tagged response"]) {
      const app = harness(reply, { model: "cheap/small", context: { recapChars: 0 } })
      await setup(app.context as never)
      const files = [{ mention: { start: 2 } }]
      const original = "Implement that feature, please, while preserving the existing API, writing regression tests, and checking how the TypeScript files interact."
      const event = await app.run(original, files)
      expect(app.calls).toBe(1)
      expect(event.prompt.text).toBe(original)
      expect(files[0]?.mention).toEqual({ start: 2 })
      expect(event.metadata?.contextPromptOptimizer).toBeUndefined()
      expect(String(event.metadata?.contextPromptOptimizerError)).not.toContain("Implement that feature")
      expect(String(event.metadata?.contextPromptOptimizerError).length).toBeGreaterThan(0)
    }
  })

  test("skips short, slash, oversized, disabled and model-less input", async () => {
    const app = harness("<optimized_prompt>rewrite</optimized_prompt>", { model: "cheap/small", maxPromptChars: 100 })
    await setup(app.context as never)
    await app.run("hi")
    await app.run("/review these changes carefully")
    await app.run("x".repeat(101))
    await app.run("Please inspect the attached screenshot carefully", [{ mention: { start: 0 } }])
    expect(app.calls).toBe(0)
    const disabled = harness("", { model: "cheap/small", enabled: false })
    await setup(disabled.context as never)
    await disabled.run("Implement that feature, please.")
    expect(disabled.calls).toBe(0)
    const missing = harness("", {})
    await setup(missing.context as never)
    await missing.run("Implement that feature, please.")
    expect(missing.calls).toBe(0)
  })

  test("does not optimize child sessions", async () => {
    const app = harness("<optimized_prompt>rewrite</optimized_prompt>")
    app.context.session.get = async () => ({ parentID: "ses_parent", location: { directory: "/example" }, model: { providerID: "main", id: "large" } }) as never
    await setup(app.context as never)
    await app.run("Implement that feature, please.")
    expect(app.calls).toBe(0)
  })

  test("a completed compaction event supplies a same-server recap", async () => {
    const app = harness("<optimized_prompt>Complete the migration carefully.</optimized_prompt>", {
      model: "cheap/small", context: { recentChars: 0, recapChars: 40 },
    })
    app.context.event.subscribe = async function* () {
      yield { type: "session.compaction.ended", data: { sessionID: "ses_example", text: "Finish authentication migration" } }
    } as never
    await setup(app.context as never)
    await Bun.sleep(0)
    const event = await app.run("Complete the migration carefully, preserving prior decisions.")
    expect(event.metadata?.contextPromptOptimizer).toMatchObject({ context: "recap" })
    expect(app.input).toContain("Finish authentication migration")
  })

  test("privacy modes omit original text or all metadata", async () => {
    for (const metadata of ["rewrite", "none"] as const) {
      const app = harness("<optimized_prompt>Implement the feature clearly.</optimized_prompt>", { model: "cheap/small", metadata, context: { recapChars: 0 } })
      await setup(app.context as never)
      const event = await app.run("Implement the feature in a clear and careful way.")
      expect(event.prompt.text).toBe("Implement the feature clearly.")
      if (metadata === "none") expect(event.metadata).toBeUndefined()
      else {
        expect(readRewrite(event.metadata?.contextPromptOptimizer)?.rewrite).toBe(event.prompt.text)
        expect(readRewrite(event.metadata?.contextPromptOptimizer)?.original).toBeUndefined()
      }
    }
  })

  test("/optimize submits through the normal admission hook and preserves delivery", async () => {
    const app = harness("<optimized_prompt>Fix src/auth.ts carefully.</optimized_prompt>", { model: "cheap/small", context: { recapChars: 0 } })
    await setup(app.context as never)
    await expect(app.command.execute({ sessionID: "ses_example", prompt: { text: " " }, delivery: "queue" })).rejects.toThrow("Usage")
    await app.command.execute({ sessionID: "ses_example", prompt: { text: "Fix src/auth.ts carefully" }, delivery: "queue" })
    expect(app.calls).toBe(1)
  })
})
