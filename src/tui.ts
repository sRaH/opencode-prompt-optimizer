import type { Plugin } from "@opencode/plugin/tui"
import { readRewrite } from "./server.js"

type Solid = {
  createElement(tag: string): unknown
  setProp(element: unknown, name: string, value: unknown): void
  insert(parent: unknown, child: unknown): void
}

export const setup: Plugin.Definition["setup"] = async (ctx) => {
  // OpenCode supplies this module when rendering CLI plugins.
  // @ts-ignore host-provided optional renderer
  const solid: Solid = await import("@opentui/solid")
  const element = (tag: string, props: Record<string, unknown>, ...children: unknown[]) => {
    const value = solid.createElement(tag)
    for (const [key, prop] of Object.entries(props)) solid.setProp(value, key, prop)
    for (const child of children) solid.insert(value, child)
    return value
  }
  const unmount = ctx.ui.slot({ append: "app", render() {
    ctx.keymap.layer(() => ({ mode: "global", commands: [{
      id: "context-prompt-optimizer.show", title: "Show last prompt rewrite", group: "Prompt Optimizer",
      palette: true, slash: { name: "optimized" },
      run: () => { void (async () => {
        const route = ctx.ui.router.current()
        if (route.type !== "session") return
        await ctx.data.session.message.sync(route.sessionID)
        const rewrite = ctx.data.session.message.list(route.sessionID).slice().reverse()
          .filter((message) => message.type === "user")
          .map((message) => readRewrite(message.metadata?.contextPromptOptimizer)).find(Boolean)
        if (!rewrite) {
          ctx.ui.toast.show({ title: "Prompt optimizer", message: "No rewrite in this session", variant: "info" })
          return
        }
        ctx.ui.dialog.show(() => {
          let box: { scrollBy(n: number): void } | undefined
          ctx.keymap.layer(() => ({ mode: "modal", commands: [
            { bind: "up", run: () => box?.scrollBy(-1) },
            { bind: "down", run: () => box?.scrollBy(1) },
            { bind: "return", run: () => ctx.ui.dialog.clear() },
          ] }))
          return element("box", { padding: 1, gap: 1, height: 24 },
            element("text", {}, `Prompt rewrite · ${rewrite.model} · ${rewrite.ms}ms · ${rewrite.context}` +
              (rewrite.changed === false ? " · unchanged (already clear)" : "") +
              (rewrite.candidates ? ` · ${rewrite.candidates.length} candidate(s)${rewrite.judged ? " · judged" : ""}` : "")),
            element("scrollbox", { ref: (value: typeof box) => { box = value }, flexGrow: 1 },
              element("text", { wrapMode: "word" }, `Original:\n${rewrite.original ?? "Not stored (metadata: rewrite)"}\n\nRewrite:\n${rewrite.rewrite}`)),
            element("text", {}, "↑↓ to scroll · Enter/Esc to close")) as ReturnType<Parameters<typeof ctx.ui.dialog.show>[0]>
        })
        ctx.ui.dialog.set({ size: "large", centered: true })
      })().catch((error) => ctx.ui.toast.show({ message: String(error), variant: "error" })) },
    }] }))
    return null
  } })
  const unsubscribe = ctx.data.on("session.inbox.enqueued", (event) => {
    const item = event.data.item
    if (item.type !== "user") return
    const rewrite = readRewrite(item.payload.metadata?.contextPromptOptimizer)
    if (rewrite?.toast) ctx.ui.toast.show({
      title: "Prompt optimized", message: `${rewrite.rewrite.slice(0, 300)}\n/optimized to view full`, variant: "success",
    })
  })
  return () => { unmount(); unsubscribe() }
}

export default { id: "context-prompt-optimizer.tui", setup } satisfies Plugin.Definition
