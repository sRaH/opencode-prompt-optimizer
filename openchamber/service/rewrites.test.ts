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
      { type: "user", id: "msg_4", time: { created: 39 }, text: "Already clear request", metadata: {
        contextPromptOptimizer: { version: 1, original: "Already clear request", rewrite: "Already clear request", changed: false, model: "cheap/model", context: "none", ms: 900 },
      } },
    ] } } },
  }
  expect(await readRewrites(client as never, "ses_test", process.cwd())).toEqual([
    {
      messageID: "msg_1", original: "Fix login", rewrite: "Fix login in src/auth.ts", model: "cheap/model",
      changed: true, context: "recent", candidates: 2, judged: true, ms: 120, created: 42,
    },
    { messageID: "msg_3", original: "Keep this exact request", error: "Error: invalid or oversized optimizer response", created: 40 },
    { messageID: "msg_4", original: "Already clear request", rewrite: "Already clear request", model: "cheap/model", changed: false, context: "none", candidates: 0, judged: false, ms: 900, created: 39 },
  ])
  expect(listed).toBe(1)
  await expect(readRewrites(client as never, "ses_test", "/other-project")).rejects.toThrow("open project")
  expect(listed).toBe(1)
})
