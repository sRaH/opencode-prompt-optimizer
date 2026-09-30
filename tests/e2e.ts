// Real OpenCode v2, isolated config and a local mock inference provider.
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { strict as assert } from "node:assert"

const root = await mkdtemp(join(tmpdir(), "context-optimizer-v2-"))
const config = join(root, "config", "opencode")
const project = join(root, "project")
await Promise.all([mkdir(config, { recursive: true }), mkdir(project)])
const calls: Record<string, any>[] = []
const mock = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) {
  const body = await request.json() as Record<string, any>
  calls.push(body)
  const text = (body.messages as { content: unknown }[]).map((message) =>
    typeof message.content === "string" ? message.content : JSON.stringify(message.content)).join("\n")
  if (text.includes("TRIGGER_OPTIMIZER_FAILURE"))
    return Response.json({ error: { message: "deliberate failure" } }, { status: 400 })
  const content = text.includes("You MUST summarize the conversation above")
    ? "## Objective\n- Investigate the login failure.\n\n## Requirements\n- Preserve prior decisions.\n\n## Decisions\n- (none)\n\n## Work State\n### Completed\n- Reviewed the request.\n### Active\n- Investigating authentication.\n### Blocked\n- (none)\n\n## Next Move\n1. Check src/auth.ts.\n\n## Relevant Files\n- `src/auth.ts`: authentication.\n\n## Important Context\n- (none)"
    : text.includes('"candidates":')
      ? "<best>2</best>"
      : text.includes("current_request")
      ? "<optimized_prompt>Investigate the login failure in src/auth.ts and fix its cause.</optimized_prompt>"
      : "Mock answer."
  if (body.stream) {
    const chunk = (delta: object, finish_reason: string | null = null) => `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`
    return new Response(chunk({ role: "assistant", content }) + chunk({}, "stop") + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } })
  }
  return Response.json({ id: "mock", object: "chat.completion", created: 1, model: body.model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
} })
const configuration = JSON.stringify({
  plugins: [{ package: resolve("."), options: { model: "optimizer-test/optimizer", turns: process.env.V2_MULTICANDIDATE === "1" ? 2 : 1,
    prompts: { "*selected": "CUSTOM_TARGET_PROMPT: Rewrite without inventing requirements. Return one <optimized_prompt>...</optimized_prompt> block." },
    context: { recapChars: process.env.V2_COMPACTION === "1" ? 400 : 0 } } }],
  compaction: { auto: false, keep: { tokens: 0 } },
  model: "optimizer-test/default",
  providers: { "optimizer-test": {
    package: "@opencode/ai/providers/openai/chat", settings: { baseURL: `http://127.0.0.1:${mock.port}/v1`, apiKey: "test-only" },
    models: { default: {}, selected: {}, optimizer: {} },
  } },
})
await writeFile(join(project, "opencode.json"), configuration)
const port = 19000 + Math.floor(Math.random() * 20000)
const base = `http://127.0.0.1:${port}`
const isolatedEnv = { ...process.env }
delete isolatedEnv.OPENCODE_CONFIG
const proc = Bun.spawn([process.env.OPENCODE_BIN ?? "opencode", "serve", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: project, env: { ...isolatedEnv, OPENCODE_TEST_HOME: root, OPENCODE_PASSWORD: "optimizer-integration-test",
    OPENCODE_CONFIG_DIR: config, XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state") },
  stdout: Bun.file(join(root, "server.log")), stderr: Bun.file(join(root, "server-errors.log")),
})
const api = async (path: string, body?: unknown): Promise<any> => {
  const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa("opencode:optimizer-integration-test")}` },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  if (response.status === 204) return
  const result = await response.json() as { data: any }
  return path.startsWith("/api/config") ? result : result.data
}
try {
  const callsPerPrompt = process.env.V2_MULTICANDIDATE === "1" ? 3 : 1
  for (let i = 0; ; i++) {
    try { await api("/api/info"); break } catch (error) { if (i >= 100) throw error; await Bun.sleep(100) }
  }
  let plugins: any
  for (let i = 0; i < 60; i++) {
    plugins = await api(`/api/plugin?location[directory]=${encodeURIComponent(project)}`)
    if (JSON.stringify(plugins).includes("context-prompt-optimizer")) break
    await Bun.sleep(100)
  }
  assert(JSON.stringify(plugins).includes("context-prompt-optimizer"), `plugin not loaded: ${JSON.stringify(plugins.filter((p: any) => p.source?.type !== "builtin"))}`)
  const session = await api("/api/session", { title: "Context optimizer integration", location: { directory: project }, model: { providerID: "optimizer-test", id: "selected" } })
  const original = "login broken in src/auth.ts please figure it out and fix it"
  const admitted = await api(`/api/session/${session.id}/prompt`, { text: original, resume: true })
  const payload = admitted.payload ?? admitted
  assert.equal(payload.text, "Investigate the login failure in src/auth.ts and fix its cause.")
  assert.equal(payload.metadata?.contextPromptOptimizer?.original, original)
  assert.equal(payload.metadata?.contextPromptOptimizer?.model, "optimizer-test/optimizer")
  const sent = payload.metadata?.contextPromptOptimizer?.sent
  assert(typeof sent === "string" && sent.includes('"current_request"'), "exact optimizer payload is stored")
  assert(String(sent).includes(original), "stored payload contains the request")
  assert(String(sent).includes("optimized_prompt"), "stored payload contains the skill instructions")
  assert.equal(calls.filter((call) => call.model === "optimizer").length, callsPerPrompt)
  assert.equal(calls[0]?.model, "optimizer")
  assert(JSON.stringify(calls[0]?.messages).includes("CUSTOM_TARGET_PROMPT"), "model-specific instructions are selected")
  if (callsPerPrompt > 1) assert.equal(payload.metadata?.contextPromptOptimizer?.judged, true)
  assert(!calls[0]?.tools?.length, "optimizer does not run agent tools")
  const sessions = await api(`/api/session?location[directory]=${encodeURIComponent(project)}`)
  assert.equal(sessions.filter((s: any) => s.title === "Prompt optimizer").length, 0)
  const isPrimary = (call: Record<string, any>) => call.messages.some((message: any) => message.role === "user"
    && (message.content === payload.text || Array.isArray(message.content) && message.content.some((part: any) => part.text === payload.text)))
  for (let i = 0; i < 100 && !calls.some(isPrimary); i++) await Bun.sleep(100)
  assert(calls.some(isPrimary), "main model receives the rewrite")
  await api(`/api/experimental/session/${session.id}/wait`, {})
  const second = await api(`/api/session/${session.id}/prompt`, { text: "Please investigate the login issue in src/auth.ts", resume: true })
  assert.equal((second.payload ?? second).metadata?.contextPromptOptimizer?.context, "recent")
  assert.equal(calls.filter((call) => call.model === "optimizer").length, callsPerPrompt * 2)
  assert(JSON.stringify(calls.filter((call) => call.model === "optimizer")[callsPerPrompt]?.messages).includes(payload.text), "the optimizer sees bounded recent text")
  if (process.env.V2_COMPACTION === "1") {
    await api(`/api/experimental/session/${session.id}/wait`, {})
    await api(`/api/session/${session.id}/compact`, {})
    await api(`/api/experimental/session/${session.id}/wait`, {})
    const compactions = await api(`/api/session/${session.id}/message?type=compaction&order=desc&limit=1`)
    assert.equal(compactions[0]?.status, "completed", `manual summary compaction: ${JSON.stringify(compactions)}`)
    assert(compactions[0]?.summary.includes("## Objective"), "completed summary is readable")
  }
  const failedRequest = "Investigate TRIGGER_OPTIMIZER_FAILURE without changing anything else"
  const failed = await api(`/api/session/${session.id}/prompt`, { text: failedRequest, resume: false })
  const failedPayload = failed.payload ?? failed
  assert.equal(failedPayload.text, failedRequest)
  const reason = failedPayload.metadata?.contextPromptOptimizerError
  assert(typeof reason === "string" && reason.length > 0, "failure reason is recorded for the UI")
  assert(!String(reason).includes(failedRequest), "failure reason never echoes the request")
  if (process.env.V2_COMPACTION === "1") {
    const optimizerCall = calls.filter((call) => call.model === "optimizer").at(-1)
    assert(JSON.stringify(optimizerCall?.messages).includes("## Objective"), "optimizer receives the completed recap from the connected server")
  }
  const beforeCommand = calls.filter((call) => call.model === "optimizer").length
  await api(`/api/session/${session.id}/command`, {
    name: "optimize", text: "Investigate the auth regression in src/auth.ts", delivery: "queue",
  })
  assert.equal(calls.filter((call) => call.model === "optimizer").length - beforeCommand, callsPerPrompt, "/optimize runs the admission hook")
  const inbox = await api(`/api/session/${session.id}/inbox`)
  assert(inbox.some((item: any) => item.payload?.text === "Investigate the login failure in src/auth.ts and fix its cause."), "/optimize queues the rewrite")
  if (process.env.V2_TUI === "1") {
    const name = `context-optimizer-${process.pid}`
    const tmux = (...args: string[]) => Bun.spawnSync(["tmux", ...args])
    try {
      const started = tmux("new-session", "-d", "-s", name, "-x", "140", "-y", "42", "env",
        `OPENCODE_CONFIG_DIR=${config}`, `OPENCODE_TEST_HOME=${root}`, `XDG_CONFIG_HOME=${join(root, "config")}`,
        `XDG_DATA_HOME=${join(root, "data")}`, `XDG_STATE_HOME=${join(root, "state")}`, `XDG_CACHE_HOME=${join(root, "cache")}`,
        "OPENCODE_PASSWORD=optimizer-integration-test", "TERM=xterm-256color",
        process.env.OPENCODE_BIN ?? "opencode", project, "--server", base, "--session", session.id)
      assert.equal(started.exitCode, 0, started.stderr.toString())
      await Bun.sleep(2000)
      tmux("send-keys", "-t", name, "-l", "/optimized")
      tmux("send-keys", "-t", name, "Enter")
      let captured = ""
      for (let i = 0; i < 100; i++) {
        captured = tmux("capture-pane", "-p", "-t", name).stdout.toString()
        if (captured.includes("Prompt rewrite")) break
        await Bun.sleep(100)
      }
      await writeFile(join(root, "tui.txt"), captured)
      assert(captured.includes("Prompt rewrite"), `TUI dialog did not open: ${captured}`)
      assert(captured.includes("Investigate the login failure"), "TUI displays the rewrite")
    } finally { tmux("kill-session", "-t", name) }
  }
  console.log(`PASS: v2 prompt rewrite, ${callsPerPrompt}-call optimization, /optimize, main model delivery, failure pass-through. Evidence: ${root}`)
} finally {
  proc.kill("SIGTERM")
  await proc.exited
  mock.stop(true)
  await writeFile(join(root, "requests.json"), JSON.stringify(calls, null, 2))
}
