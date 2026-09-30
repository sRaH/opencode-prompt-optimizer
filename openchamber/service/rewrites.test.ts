import { expect, test } from "bun:test"
import { readRewrites } from "./rewrites.js"

test("returns only optimizer metadata from user messages in the open project", async () => {
  let listed = 0
  const client = {
    session: { get: async () => ({ location: { directory: process.cwd() } }) },
    message: { list: async () => { listed++; return { data: [
      { type: "user", id: "msg_1", time: { created: 42 }, metadata: { contextPromptOptimizer: {
        version: 1, original: "Fix login", rewrite: "Fix login in src/auth.ts", model: "cheap/model", context: "recent", candidates: ["a", "b"], judged: true, ms: 120,
      } } },
      { type: "user", id: "msg_2", time: { created: 41 }, metadata: { unrelated: "secret" } },
      { type: "user", id: "msg_3", time: { created: 40 }, text: "Keep this exact request", metadata: {
        contextPromptOptimizerError: "Error: invalid or oversized optimizer response",
      } },
    ] } } },
  }
  expect(await readRewrites(client as never, "ses_test", process.cwd())).toEqual([
    {
      messageID: "msg_1", original: "Fix login", rewrite: "Fix login in src/auth.ts", model: "cheap/model",
      context: "recent", candidates: 2, judged: true, ms: 120, created: 42,
    },
    { messageID: "msg_3", original: "Keep this exact request", error: "Error: invalid or oversized optimizer response", created: 40 },
  ])
  expect(listed).toBe(1)
  await expect(readRewrites(client as never, "ses_test", "/other-project")).rejects.toThrow("open project")
  expect(listed).toBe(1)
})
