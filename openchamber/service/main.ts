import { createServer } from "node:http"
import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { readRewrites } from "./rewrites.js"

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT)
const token = process.env.OPENCHAMBER_SERVICE_TOKEN
if (!Number.isInteger(port) || port < 1 || !token) throw new Error("OpenChamber service credentials are required")

const reply = (response: import("node:http").ServerResponse, status: number, data: unknown) => {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
  response.end(JSON.stringify(data))
}

createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) return reply(response, 401, { error: "Unauthorized" })
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname
  if (request.method === "GET" && path === "/health") return reply(response, 200, { ok: true })
  if (request.method !== "POST" || path !== "/rewrites") return reply(response, 404, { error: "Not found" })
  try {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > 4096) return reply(response, 413, { error: "Request too large" })
      chunks.push(chunk)
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { sessionID?: unknown; directory?: unknown }
    if (typeof input.sessionID !== "string" || !/^ses_[\w-]+$/.test(input.sessionID)
      || typeof input.directory !== "string" || !input.directory.startsWith("/"))
      return reply(response, 400, { error: "Invalid session" })
    const endpoint = await Service.discover()
    if (!endpoint) return reply(response, 503, { error: "Local OpenCode service unavailable; remote servers are not supported by the comparison bridge" })
    const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
    return reply(response, 200, { rewrites: await readRewrites(client, input.sessionID, input.directory) })
  } catch {
    return reply(response, 502, { error: "Could not read rewrites from the local OpenCode service" })
  }
}).listen(port, "127.0.0.1")
