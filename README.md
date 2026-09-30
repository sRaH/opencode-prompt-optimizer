# Context Prompt Optimizer for OpenCode v2

[![CI](https://github.com/sRaH/opencode-prompt-optimizer/actions/workflows/ci.yml/badge.svg)](https://github.com/sRaH/opencode-prompt-optimizer/actions/workflows/ci.yml)

Rewrites an eligible user request once with a separately configured, inexpensive model before OpenCode admits it. The rewrite becomes the visible user message and the main model's input. The original is retained in message metadata. Errors leave the original prompt unchanged and record a short `contextPromptOptimizerError` reason that never echoes the request. OpenCode v1 is not supported.

## Install locally

Run `bun install && bun run build`, then add this directory to `opencode.json` (replace the path if you move the checkout):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [{
    "package": "/Users/srah/Projects/Personal/OpenCode/opencode-prompt-optimizer",
    "options": { "model": "your-provider/your-cheap-model" }
  }]
}
```

The model must already be available in OpenCode. The plugin **never** borrows the chat model or calls a provider directly. If the model is missing, the prompt passes through. Restart OpenCode after building or changing the plugin. Do not also install this checkout in an auto-discovered `.opencode/plugins/` directory: that would load it twice.
Use this directory **instead of** the older prompt-optimizer checkout in `plugins`; running both would rewrite the same message twice and collide on `/optimize` and `/optimized`.

To install from a [GitHub Release](https://github.com/sRaH/opencode-prompt-optimizer/releases), download the `opencode-prompt-optimizer-v*.tar.gz` asset, extract it into a permanent directory, and run `bun install --production --frozen-lockfile` there. Set `plugins[].package` to that directory's absolute path. Releases include compiled `dist/` and a `SHA256SUMS` file; they do not require a build or publish to npm.

## OpenChamber panel

The same repository also contains an optional OpenChamber extension. On OpenChamber web or desktop, open **Settings → Extensions** and add this repository's HTTPS Git URL (`https://github.com/sRaH/opencode-prompt-optimizer.git`) or your local checkout folder. Approve its access to `~/.config/opencode/opencode.json` and `~/.config/openchamber/opencode.managed.json`, plus the **local service** permission for reading session rewrites. The OpenCode plugin still needs to be installed separately; the extension is only its control panel.

The **Settings** tab edits one selected plugin entry in one of those two files, keeping unrelated settings and JSONC comments. It does not silently add or replace plugin entries. OpenChamber can regenerate its managed config, so use the global config as a durable fallback when appropriate. **Prompts** shows recent original/optimized pairs for the open session when `metadata` is `"full"`; `"rewrite"` cannot show the original, and `"none"` stores neither. Prompts the optimizer could not rewrite are listed as **Not optimized** with their stored failure reason. No session messages are stored by the extension. A local service uses OpenCode's authenticated local-service discovery to read only the selected session's optimizer metadata; remote or private OpenCode servers are not supported by this comparison bridge. The service runs with your user permissions, as OpenChamber's approval dialog warns. VS Code and mobile OpenChamber do not load extensions yet.

For development, run `bun run build:extension` after editing `openchamber/` and commit the generated `panel/main.js` and `service/main.js`; OpenChamber does not build source files on install. `bun run typecheck` and `bun test` also check the extension. The release archive includes its built assets.

For a new release, update `package.json`'s version, commit and push, then push the matching `v<version>` tag. GitHub Actions checks the version, runs typecheck/tests/build (including extension assets), and creates a GitHub Release with the directory-plugin archive and checksum. CI runs on pushes and pull requests to `main`. The isolated v2 end-to-end test needs a local `opencode` binary and is run separately with `bun run e2e`.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `model` | unset | Required `provider/model` for optimization. |
| `enabled` | `true` | Turn optimization off without removing the plugin. |
| `minChars` | `20` | Skip shorter requests. |
| `timeoutMs` | `15000` | Timeout for the optimizer call. |
| `maxPromptChars` | `6000` | Skip longer requests instead of paying for them. |
| `maxRewriteChars` | `8000` | Reject longer model responses. |
| `toast` | `true` | Show successful rewrites in the TUI when metadata is enabled. |
| `turns` | `1` | Number of candidate rewrites (1–8); values above 1 add one judge call. |
| `strategy` | `"parallel"` | Generate independent candidates in parallel, or use `"refine"` to improve the previous rewrite. |
| `prompts` | model-family defaults | Map of target-model globs to optimizer instructions (e.g. `"*gpt*"`); `default` is the fallback. Custom keys override built-ins. |
| `judgePrompt` | built-in | Instructions for selecting a candidate when more than one valid rewrite exists. |
| `metadata` | `"full"` | `"full"` stores original and rewrite, `"rewrite"` stores only the rewrite, `"none"` stores neither. |
| `skipPatterns` | built-in | Regex strings matching requests to skip; replaces the defaults. |
| `context.enabled` | `true` | Allow background context in the optimizer call. |
| `context.recapChars` | `1200` | Maximum readable compaction recap sent to the optimizer; `0` disables recap lookup. |
| `context.recentChars` | `1800` | Maximum recent conversation text sent to the optimizer; `0` disables it. |
| `context.maxMessages` | `6` | Maximum recent user/assistant messages considered. |

Only user text and visible assistant text are used as recent context. Tool output, reasoning, attachments, and metadata are excluded. If available, a completed OpenCode summary compaction contributes a short recap; native provider checkpoints are opaque and ignored. The plugin observes completed compactions from the connected server in memory (up to 100 sessions); on startup, it can also check a local OpenCode service for the latest recap after verifying the same session and location. Events are live-only, so a private or remote server may use recent text alone after plugin restart until the next compaction. Context is supplied to the optimizer only, not pasted into the rewritten user message. The plugin does not trigger compaction or create an optimizer session.

By default, the plugin makes one standalone generation call per eligible request. With `turns > 1`, it generates up to that many candidates and makes one additional judge call if multiple valid candidates survive. Candidate failures are ignored when another candidate succeeds; judge failure selects the first parallel candidate or final refined candidate. There is no extra summarization call or automatic retry. The v2 standalone generation API has no output-token cap; input is bounded and oversized output is rejected, but **cost cannot be hard-capped** by this plugin. Users should select a cheap model and configure provider budgets as appropriate. Session text sent to the optimizer may contain sensitive information; set `context.enabled: false` to send only the current request.

In the TUI, `/optimized` opens the last rewrite and shows whether recap or recent text was used; it also shows the original and candidate count when `metadata: "full"`. `/optimize <request>` submits a request through the same admission hook; it does not force optimization of otherwise skipped or disabled prompts. With `metadata: "none"`, `/optimized` has no persisted rewrite to show. No recap content is stored in message metadata. The plugin skips slash commands, child sessions, short prompts, attachment prompts with fewer than 120 text characters (the optimizer cannot see attachments), and prompts above the configured maximum. An unchanged rewrite is passed through without metadata. Mechanical checks reject rewrites that drop quoted literals, paths or flags, or grow excessively; they cannot guarantee semantic equivalence. The parser accepts the tagged block even when a cheap model surrounds it with a sentence or code fence, preferring the last valid block.

Run `bun test`, `bun run typecheck`, and `bun run e2e`. Set `V2_MULTICANDIDATE=1` for the judge and model-specific prompt path, `V2_COMPACTION=1` for a real summary-compaction and recap, and `V2_TUI=1` to test `/optimized` in tmux. The end-to-end tests start an isolated OpenCode v2 server with a local mock model; they do not call a paid provider. Native encrypted checkpoints are covered by unit-level empty-recap handling, not by the mock provider's compaction endpoint.
