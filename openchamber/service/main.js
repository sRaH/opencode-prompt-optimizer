var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      res = fn(fn = 0);
    } catch (e) {
      err = [e];
    }
  if (err)
    throw err[0];
  return res;
};

// node_modules/@opencode/client/dist/chunks/contract-m2eywc8w.js
var init_contract_m2eywc8w = () => {};

// node_modules/@opencode/client/dist/chunks/contract-9rqn6x4v.js
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __defProp, __returnValue = (v) => v, __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var init_contract_9rqn6x4v = __esm(() => {
  __defProp = Object.defineProperty;
});

// node_modules/@opencode/client/dist/chunks/contract-frbwqjmf.js
function make7(connect) {
  let current;
  const capacity = 4096;
  function stop(connection) {
    connection.connected = undefined;
    connection.controller.abort();
    if (current === connection)
      current = undefined;
  }
  async function run(connection) {
    let iterator;
    let completion = {};
    try {
      if (connection.controller.signal.aborted)
        return;
      iterator = connect(connection.controller.signal, () => {
        connection.subscribers.forEach((subscriber) => subscriber.activity?.());
      })[Symbol.asyncIterator]();
      while (!connection.controller.signal.aborted) {
        const item = await iterator.next();
        if (item.done || connection.controller.signal.aborted)
          break;
        if (item.value.type === "server.connected")
          connection.connected = item.value;
        connection.subscribers.forEach((subscriber) => subscriber.push(item.value));
      }
    } catch (error) {
      completion = { error };
    } finally {
      stop(connection);
      try {
        await iterator?.return?.();
      } catch (error) {
        if (!("error" in completion))
          completion = { error };
      }
      connection.subscribers.forEach((subscriber) => subscriber.finish(completion));
    }
  }
  return {
    subscribe(options) {
      return {
        [Symbol.asyncIterator]() {
          const pending = [];
          const queued = [];
          let started = false;
          let completion;
          let connection;
          function finish(result, discard = true) {
            completion = result;
            if (discard)
              queued.length = 0;
            options?.signal?.removeEventListener("abort", abort);
            if (connection?.subscribers.delete(subscriber) && !connection.subscribers.size)
              stop(connection);
            pending.splice(0).forEach((request) => {
              if ("error" in result)
                request.reject(result.error);
              else
                request.resolve({ done: true, value: undefined });
            });
          }
          function abort() {
            finish({});
          }
          const subscriber = {
            activity: options?.onActivity,
            finish(result) {
              finish(result, false);
            },
            push(value) {
              if (completion)
                return;
              const request = pending.shift();
              if (request) {
                request.resolve({ done: false, value });
                return;
              }
              if (queued.length === capacity) {
                finish({ error: new Error(`Event subscriber exceeded its ${capacity}-event capacity`) });
                return;
              }
              queued.push(value);
            }
          };
          function start() {
            if (completion)
              return;
            const fresh = !current;
            connection = current ?? {
              controller: new AbortController,
              subscribers: new Set
            };
            current = connection;
            connection.subscribers.add(subscriber);
            if (connection.connected)
              subscriber.push(connection.connected);
            if (fresh)
              run(connection);
          }
          return {
            next() {
              const value = queued.shift();
              if (value)
                return Promise.resolve({ done: false, value });
              if (completion) {
                if ("error" in completion)
                  return Promise.reject(completion.error);
                return Promise.resolve({ done: true, value: undefined });
              }
              if (options?.signal?.aborted) {
                abort();
                return Promise.resolve({ done: true, value: undefined });
              }
              const request = Promise.withResolvers();
              pending.push(request);
              if (!started) {
                started = true;
                options?.signal?.addEventListener("abort", abort, { once: true });
                start();
              }
              return request.promise;
            },
            return() {
              finish({});
              return Promise.resolve({ done: true, value: undefined });
            }
          };
        }
      };
    }
  };
}
var exports_shared_events;
var init_contract_frbwqjmf = __esm(() => {
  init_contract_9rqn6x4v();
  exports_shared_events = {};
  __export(exports_shared_events, {
    SharedEvents: () => exports_shared_events,
    make: () => make7
  });
});

// node_modules/@opencode/client/dist/chunks/contract-nwcpakzx.js
var ClientError3;
var init_contract_nwcpakzx = __esm(() => {
  ClientError3 = class ClientError3 extends Error {
    reason;
    name = "ClientError";
    constructor(reason, options) {
      const detail = options?.detail ?? (options?.cause instanceof Error ? options.cause.message : undefined);
      super(detail ? `${reason}: ${detail}` : reason, options);
      this.reason = reason;
    }
  };
});

// node_modules/@opencode/client/dist/chunks/contract-n8g24fq8.js
function make6(options) {
  const fetch2 = options.fetch ?? globalThis.fetch;
  const prepare = (descriptor, requestOptions) => {
    const baseUrl = new URL(options.baseUrl);
    if (!baseUrl.pathname.endsWith("/"))
      baseUrl.pathname += "/";
    const url = new URL(descriptor.path.slice(1), baseUrl);
    for (const [key, value] of Object.entries(descriptor.query ?? {}))
      appendQuery(url.searchParams, key, value);
    const headers = new Headers(options.headers);
    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {
      if (value !== undefined && value !== null)
        headers.set(key, String(value));
    }
    for (const [key, value] of new Headers(requestOptions?.headers))
      headers.set(key, value);
    if (descriptor.body !== undefined && !headers.has("content-type"))
      headers.set("content-type", descriptor.binaryBody ? "application/octet-stream" : "application/json");
    return {
      url,
      init: {
        method: descriptor.method,
        signal: requestOptions?.signal,
        headers,
        body: descriptor.body === undefined ? undefined : descriptor.binaryBody ? descriptor.body : JSON.stringify(descriptor.body)
      }
    };
  };
  const execute = async (descriptor, requestOptions) => {
    try {
      const prepared = prepare(descriptor, requestOptions);
      return await fetch2(prepared.url, prepared.init);
    } catch (cause) {
      throw new ClientError3("Transport", { cause });
    }
  };
  const responseError = async (response, descriptor) => {
    if (descriptor.declaredStatuses.includes(response.status))
      throw declared(await json(response));
    try {
      await response.body?.cancel();
    } catch {}
    throw new ClientError3("UnexpectedStatus", { cause: { status: response.status }, detail: String(response.status) });
  };
  const request = async (descriptor, requestOptions) => {
    const response = await execute(descriptor, requestOptions);
    if (response.status !== descriptor.successStatus)
      return responseError(response, descriptor);
    if (descriptor.binary)
      return new Uint8Array(await response.arrayBuffer());
    if (descriptor.empty) {
      try {
        await response.body?.cancel();
      } catch {}
      return;
    }
    return await json(response);
  };
  const sse = (descriptor, requestOptions) => ({
    async* [Symbol.asyncIterator]() {
      const response = await execute(descriptor, requestOptions);
      if (response.status !== descriptor.successStatus)
        await responseError(response, descriptor);
      if (!isContentType(response, "text/event-stream")) {
        try {
          await response.body?.cancel();
        } catch {}
        throw new ClientError3("UnsupportedContentType", { detail: response.headers.get("content-type") });
      }
      if (response.body === null)
        throw new ClientError3("MalformedResponse");
      const reader = response.body.getReader();
      const decoder = new TextDecoder;
      let buffer = "";
      try {
        while (true) {
          let next;
          try {
            next = await reader.read();
          } catch (cause) {
            throw new ClientError3("Transport", { cause });
          }
          if (!next.done)
            requestOptions?.onActivity?.();
          buffer += decoder.decode(next.value, { stream: !next.done });
          if (buffer.length > maxSseEventBytes)
            throw new ClientError3("SseEventTooLarge");
          const trailingCarriageReturn = !next.done && buffer.endsWith("\r");
          if (trailingCarriageReturn)
            buffer = buffer.slice(0, -1);
          buffer = buffer.replaceAll(`\r
`, `
`).replaceAll("\r", `
`);
          if (trailingCarriageReturn)
            buffer += "\r";
          if (next.done && buffer !== "")
            buffer += `

`;
          let boundary = buffer.indexOf(`

`);
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = block.split(`
`).flatMap((line) => line.startsWith("data:") ? [line.slice(5).trimStart()] : []).join(`
`);
            if (data !== "") {
              try {
                yield JSON.parse(data);
              } catch (cause) {
                throw new ClientError3("MalformedResponse", { cause });
              }
            }
            boundary = buffer.indexOf(`

`);
          }
          if (next.done)
            return;
        }
      } finally {
        try {
          await reader.cancel();
        } catch {}
        reader.releaseLock();
      }
    }
  });
  return {
    server: {
      info: (requestOptions) => request({ method: "GET", path: `/api/info`, successStatus: 200, declaredStatuses: [400, 401], empty: false }, requestOptions),
      pair: (requestOptions) => request({ method: "POST", path: `/api/pair`, successStatus: 200, declaredStatuses: [400, 401], empty: false }, requestOptions),
      connect: (input, requestOptions) => request({
        method: "GET",
        path: `/auth/connect/${encodeURIComponent(input.code)}`,
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions)
    },
    location: {
      get: (input, requestOptions) => request({
        method: "GET",
        path: `/api/location`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      reload: (requestOptions) => request({
        method: "POST",
        path: `/api/location/reload`,
        successStatus: 204,
        declaredStatuses: [400, 401, 503],
        empty: true
      }, requestOptions)
    },
    agent: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/agent`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      get: (input, requestOptions) => request({
        method: "GET",
        path: `/api/agent/${encodeURIComponent(input.agentID)}`,
        query: { location: input["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions)
    },
    plugin: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/plugin`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      check: (input, requestOptions) => request({
        method: "POST",
        path: `/api/plugin/check`,
        query: { location: input?.["location"] },
        body: { target: input?.["target"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      update: (input, requestOptions) => request({
        method: "POST",
        path: `/api/plugin/update`,
        query: { location: input["location"] },
        body: { targets: input["targets"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 503],
        empty: true
      }, requestOptions)
    },
    session: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/session`,
        query: {
          limit: input?.["limit"],
          order: input?.["order"],
          search: input?.["search"],
          parentID: input?.["parentID"],
          directory: input?.["directory"],
          project: input?.["project"],
          subpath: input?.["subpath"],
          cursor: input?.["cursor"]
        },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      stats: (input, requestOptions) => request({
        method: "GET",
        path: `/api/experimental/session/stats`,
        query: {
          from: input?.["from"],
          to: input?.["to"],
          project: input?.["project"],
          timezone: input?.["timezone"],
          tools: input?.["tools"]
        },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions).then((value) => value.data),
      create: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session`,
        body: {
          id: input?.["id"],
          title: input?.["title"],
          agent: input?.["agent"],
          model: input?.["model"],
          location: input?.["location"],
          metadata: input?.["metadata"],
          permissions: input?.["permissions"]
        },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions).then((value) => value.data),
      import: (input, requestOptions) => request({
        method: "POST",
        path: `/api/experimental/session/import`,
        body: { info: input["info"], messages: input["messages"], location: input["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404, 409],
        empty: false
      }, requestOptions).then((value) => value.data),
      export: (input, requestOptions) => request({
        method: "GET",
        path: `/api/experimental/session/${encodeURIComponent(input.sessionID)}/export`,
        query: { sanitize: input["sanitize"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404, 500],
        empty: false
      }, requestOptions).then((value) => value.data),
      active: (requestOptions) => request({
        method: "GET",
        path: `/api/session/active`,
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions).then((value) => value.data),
      get: (input, requestOptions) => request({
        method: "GET",
        path: `/api/session/${encodeURIComponent(input.sessionID)}`,
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions).then((value) => value.data),
      remove: (input, requestOptions) => request({
        method: "DELETE",
        path: `/api/session/${encodeURIComponent(input.sessionID)}`,
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      fork: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/fork`,
        body: { before: input["before"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions).then((value) => value.data),
      switchAgent: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/agent`,
        body: { agent: input["agent"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      switchModel: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/model`,
        body: { model: input["model"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      update: (input, requestOptions) => request({
        method: "PATCH",
        path: `/api/session/${encodeURIComponent(input.sessionID)}`,
        body: { title: input["title"], metadata: input["metadata"], permissions: input["permissions"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      move: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/move`,
        body: { directory: input["directory"], delivery: input["delivery"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      prompt: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/prompt`,
        body: {
          id: input["id"],
          text: input["text"],
          files: input["files"],
          agents: input["agents"],
          skills: input["skills"],
          metadata: input["metadata"],
          delivery: input["delivery"],
          resume: input["resume"]
        },
        successStatus: 200,
        declaredStatuses: [400, 401, 404, 409],
        empty: false
      }, requestOptions).then((value) => value.data),
      command: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/command`,
        body: {
          name: input["name"],
          text: input["text"],
          files: input["files"],
          agents: input["agents"],
          skills: input["skills"],
          delivery: input["delivery"]
        },
        successStatus: 204,
        declaredStatuses: [400, 401, 404, 500],
        empty: true
      }, requestOptions),
      skill: (input, requestOptions) => request({
        method: "POST",
        path: `/api/experimental/session/${encodeURIComponent(input.sessionID)}/skill`,
        body: { id: input["id"], resume: input["resume"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      synthetic: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/synthetic`,
        body: {
          id: input["id"],
          text: input["text"],
          description: input["description"],
          metadata: input["metadata"],
          delivery: input["delivery"],
          resume: input["resume"]
        },
        successStatus: 200,
        declaredStatuses: [400, 401, 404, 409],
        empty: false
      }, requestOptions).then((value) => value.data),
      shell: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/shell`,
        body: { id: input["id"], command: input["command"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      compact: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/compact`,
        body: { id: input["id"], delivery: input["delivery"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404, 409],
        empty: false
      }, requestOptions).then((value) => value.data),
      wait: (input, requestOptions) => request({
        method: "POST",
        path: `/api/experimental/session/${encodeURIComponent(input.sessionID)}/wait`,
        successStatus: 204,
        declaredStatuses: [400, 401, 404, 503],
        empty: true
      }, requestOptions),
      revert: {
        stage: (input, requestOptions) => request({
          method: "POST",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/revert/stage`,
          body: { messageID: input["messageID"], files: input["files"] },
          successStatus: 200,
          declaredStatuses: [400, 401, 404, 409, 500],
          empty: false
        }, requestOptions).then((value) => value.data),
        clear: (input, requestOptions) => request({
          method: "DELETE",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/revert`,
          successStatus: 204,
          declaredStatuses: [400, 401, 404, 409, 500],
          empty: true
        }, requestOptions),
        commit: (input, requestOptions) => request({
          method: "POST",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/revert/commit`,
          successStatus: 204,
          declaredStatuses: [400, 401, 404, 409],
          empty: true
        }, requestOptions)
      },
      context: (input, requestOptions) => request({
        method: "GET",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/context`,
        successStatus: 200,
        declaredStatuses: [400, 401, 404, 500],
        empty: false
      }, requestOptions).then((value) => value.data),
      diff: (input, requestOptions) => request({
        method: "GET",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/diff`,
        query: { from: input["from"], to: input["to"], context: input["context"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404, 500],
        empty: false
      }, requestOptions).then((value) => value.data),
      inbox: {
        list: (input, requestOptions) => request({
          method: "GET",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/inbox`,
          successStatus: 200,
          declaredStatuses: [400, 401, 404],
          empty: false
        }, requestOptions).then((value) => value.data),
        cancel: (input, requestOptions) => request({
          method: "DELETE",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/inbox/${encodeURIComponent(input.inboxID)}`,
          successStatus: 204,
          declaredStatuses: [400, 401, 404],
          empty: true
        }, requestOptions),
        update: (input, requestOptions) => request({
          method: "PATCH",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/inbox/${encodeURIComponent(input.inboxID)}`,
          body: { delivery: input["delivery"] },
          successStatus: 204,
          declaredStatuses: [400, 401, 404, 409],
          empty: true
        }, requestOptions)
      },
      instructions: {
        entry: {
          list: (input, requestOptions) => request({
            method: "GET",
            path: `/api/experimental/session/${encodeURIComponent(input.sessionID)}/instructions/entries`,
            successStatus: 200,
            declaredStatuses: [400, 401, 404],
            empty: false
          }, requestOptions).then((value) => value.data),
          put: (input, requestOptions) => request({
            method: "PUT",
            path: `/api/experimental/session/${encodeURIComponent(input.sessionID)}/instructions/entries/${encodeURIComponent(input.key)}`,
            body: { value: input["value"] },
            successStatus: 204,
            declaredStatuses: [400, 401, 404, 413],
            empty: true
          }, requestOptions),
          remove: (input, requestOptions) => request({
            method: "DELETE",
            path: `/api/experimental/session/${encodeURIComponent(input.sessionID)}/instructions/entries/${encodeURIComponent(input.key)}`,
            successStatus: 204,
            declaredStatuses: [400, 401, 404],
            empty: true
          }, requestOptions)
        }
      },
      generate: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/generate`,
        body: { prompt: input["prompt"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404, 503],
        empty: false
      }, requestOptions).then((value) => value.data),
      log: (input, requestOptions) => sse({
        method: "GET",
        path: `/api/experimental/session/${encodeURIComponent(input.sessionID)}/log`,
        query: { after: input["after"], follow: input["follow"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions),
      interrupt: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/interrupt`,
        query: { resume: input["resume"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions),
      background: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/background`,
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      message: {
        get: (input, requestOptions) => request({
          method: "GET",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/message/${encodeURIComponent(input.messageID)}`,
          successStatus: 200,
          declaredStatuses: [400, 401, 404],
          empty: false
        }, requestOptions).then((value) => value.data)
      },
      form: {
        list: (input, requestOptions) => request({
          method: "GET",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/form`,
          successStatus: 200,
          declaredStatuses: [400, 401, 404],
          empty: false
        }, requestOptions).then((value) => value.data),
        create: (input, requestOptions) => request({
          method: "POST",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/form`,
          body: { id: input["id"], title: input["title"], metadata: input["metadata"], fields: input["fields"] },
          successStatus: 200,
          declaredStatuses: [400, 401, 404, 409],
          empty: false
        }, requestOptions).then((value) => value.data),
        get: (input, requestOptions) => request({
          method: "GET",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/form/${encodeURIComponent(input.formID)}`,
          successStatus: 200,
          declaredStatuses: [400, 401, 404],
          empty: false
        }, requestOptions).then((value) => value.data),
        reply: (input, requestOptions) => request({
          method: "POST",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/form/${encodeURIComponent(input.formID)}/reply`,
          body: { answer: input["answer"] },
          successStatus: 204,
          declaredStatuses: [400, 401, 404, 409],
          empty: true
        }, requestOptions),
        cancel: (input, requestOptions) => request({
          method: "DELETE",
          path: `/api/session/${encodeURIComponent(input.sessionID)}/form/${encodeURIComponent(input.formID)}`,
          successStatus: 204,
          declaredStatuses: [400, 401, 404, 409],
          empty: true
        }, requestOptions)
      },
      environment: (input, requestOptions) => request({
        method: "PUT",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/environment`,
        body: { variables: input["variables"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      view: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/view`,
        body: { idle: input["idle"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions)
    },
    message: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/message`,
        query: { limit: input["limit"], order: input["order"], cursor: input["cursor"], type: input["type"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404, 500],
        empty: false
      }, requestOptions)
    },
    model: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/model`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 503],
        empty: false
      }, requestOptions),
      default: (input, requestOptions) => request({
        method: "GET",
        path: `/api/model/default`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 503],
        empty: false
      }, requestOptions)
    },
    generate: {
      text: (input, requestOptions) => request({
        method: "POST",
        path: `/api/experimental/generate`,
        body: { prompt: input["prompt"], model: input["model"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 503],
        empty: false
      }, requestOptions).then((value) => value.data)
    },
    provider: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/provider`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 503],
        empty: false
      }, requestOptions),
      get: (input, requestOptions) => request({
        method: "GET",
        path: `/api/provider/${encodeURIComponent(input.providerID)}`,
        query: { location: input["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404, 503],
        empty: false
      }, requestOptions)
    },
    integration: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/integration`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      get: (input, requestOptions) => request({
        method: "GET",
        path: `/api/integration/${encodeURIComponent(input.integrationID)}`,
        query: { location: input["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions),
      wellknown: {
        add: (input, requestOptions) => request({
          method: "POST",
          path: `/api/experimental/integration/wellknown`,
          query: { location: input["location"] },
          body: { url: input["url"] },
          successStatus: 204,
          declaredStatuses: [400, 401],
          empty: true
        }, requestOptions)
      },
      connect: {
        key: (input, requestOptions) => request({
          method: "POST",
          path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/key`,
          query: { location: input["location"] },
          body: { key: input["key"], answer: input["answer"], label: input["label"] },
          successStatus: 204,
          declaredStatuses: [400, 401, 404],
          empty: true
        }, requestOptions)
      },
      oauth: {
        connect: (input, requestOptions) => request({
          method: "POST",
          path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth`,
          query: { location: input["location"] },
          body: { methodID: input["methodID"], answer: input["answer"], label: input["label"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false
        }, requestOptions),
        status: (input, requestOptions) => request({
          method: "GET",
          path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}`,
          query: { location: input["location"] },
          successStatus: 200,
          declaredStatuses: [400, 401, 404],
          empty: false
        }, requestOptions),
        complete: (input, requestOptions) => request({
          method: "POST",
          path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}/complete`,
          query: { location: input["location"] },
          body: { code: input["code"] },
          successStatus: 204,
          declaredStatuses: [400, 401, 404],
          empty: true
        }, requestOptions),
        cancel: (input, requestOptions) => request({
          method: "DELETE",
          path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}`,
          query: { location: input["location"] },
          successStatus: 204,
          declaredStatuses: [400, 401],
          empty: true
        }, requestOptions)
      },
      command: {
        connect: (input, requestOptions) => request({
          method: "POST",
          path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/command`,
          query: { location: input["location"] },
          body: { methodID: input["methodID"], label: input["label"] },
          successStatus: 200,
          declaredStatuses: [400, 401, 404],
          empty: false
        }, requestOptions),
        status: (input, requestOptions) => request({
          method: "GET",
          path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/command/${encodeURIComponent(input.attemptID)}`,
          query: { location: input["location"] },
          successStatus: 200,
          declaredStatuses: [400, 401, 404],
          empty: false
        }, requestOptions),
        cancel: (input, requestOptions) => request({
          method: "DELETE",
          path: `/api/integration/${encodeURIComponent(input.integrationID)}/connect/command/${encodeURIComponent(input.attemptID)}`,
          query: { location: input["location"] },
          successStatus: 204,
          declaredStatuses: [400, 401],
          empty: true
        }, requestOptions)
      }
    },
    mcp: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/mcp`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      add: (input, requestOptions) => request({
        method: "PUT",
        path: `/api/experimental/mcp/${encodeURIComponent(input.server)}`,
        query: { location: input["location"] },
        body: { config: input["config"] },
        successStatus: 204,
        declaredStatuses: [400, 401],
        empty: true
      }, requestOptions),
      remove: (input, requestOptions) => request({
        method: "DELETE",
        path: `/api/experimental/mcp/${encodeURIComponent(input.server)}`,
        query: { location: input["location"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      connect: (input, requestOptions) => request({
        method: "POST",
        path: `/api/experimental/mcp/${encodeURIComponent(input.server)}/connect`,
        query: { location: input["location"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      disconnect: (input, requestOptions) => request({
        method: "POST",
        path: `/api/experimental/mcp/${encodeURIComponent(input.server)}/disconnect`,
        query: { location: input["location"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      resource: {
        catalog: (input, requestOptions) => request({
          method: "GET",
          path: `/api/mcp/resource`,
          query: { location: input?.["location"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false
        }, requestOptions)
      }
    },
    credential: {
      update: (input, requestOptions) => request({
        method: "PATCH",
        path: `/api/credential/${encodeURIComponent(input.credentialID)}`,
        body: { label: input["label"] },
        successStatus: 204,
        declaredStatuses: [400, 401],
        empty: true
      }, requestOptions),
      activate: (input, requestOptions) => request({
        method: "POST",
        path: `/api/credential/${encodeURIComponent(input.credentialID)}/activate`,
        successStatus: 204,
        declaredStatuses: [400, 401],
        empty: true
      }, requestOptions),
      remove: (input, requestOptions) => request({
        method: "DELETE",
        path: `/api/credential/${encodeURIComponent(input.credentialID)}`,
        successStatus: 204,
        declaredStatuses: [400, 401],
        empty: true
      }, requestOptions)
    },
    project: {
      list: (requestOptions) => request({ method: "GET", path: `/api/project`, successStatus: 200, declaredStatuses: [400, 401], empty: false }, requestOptions),
      update: (input, requestOptions) => request({
        method: "PATCH",
        path: `/api/project/${encodeURIComponent(input.projectID)}`,
        body: {
          canonical: input["canonical"],
          name: input["name"],
          icon: input["icon"],
          commands: input["commands"]
        },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions)
    },
    form: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/form`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions)
    },
    permission: {
      request: {
        list: (input, requestOptions) => request({
          method: "GET",
          path: `/api/permission/request`,
          query: { location: input?.["location"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false
        }, requestOptions)
      },
      saved: {
        list: (input, requestOptions) => request({
          method: "GET",
          path: `/api/permission/saved`,
          query: { projectID: input?.["projectID"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false
        }, requestOptions).then((value) => value.data),
        remove: (input, requestOptions) => request({
          method: "DELETE",
          path: `/api/permission/saved/${encodeURIComponent(input.id)}`,
          successStatus: 204,
          declaredStatuses: [400, 401],
          empty: true
        }, requestOptions)
      },
      create: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/permission`,
        body: {
          id: input["id"],
          action: input["action"],
          resources: input["resources"],
          save: input["save"],
          metadata: input["metadata"],
          source: input["source"],
          agent: input["agent"]
        },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions).then((value) => value.data),
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/permission`,
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions).then((value) => value.data),
      get: (input, requestOptions) => request({
        method: "GET",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}`,
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions).then((value) => value.data),
      reply: (input, requestOptions) => request({
        method: "POST",
        path: `/api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}/reply`,
        body: { decision: input["decision"], message: input["message"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions)
    },
    file: {
      read: (input, requestOptions) => request({
        method: "GET",
        path: `/api/fs/read/${encodePath(input.path)}`,
        query: { location: input["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false,
        binary: true
      }, requestOptions),
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/fs/list`,
        query: { location: input?.["location"], path: input?.["path"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      find: (input, requestOptions) => request({
        method: "GET",
        path: `/api/fs/find`,
        query: { location: input["location"], query: input["query"], type: input["type"], limit: input["limit"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      write: (input, requestOptions) => request({
        method: "POST",
        path: `/api/experimental/fs/write`,
        query: { location: input["location"], path: input["path"] },
        body: input["payload"],
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false,
        binaryBody: true
      }, requestOptions)
    },
    command: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/command`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions)
    },
    skill: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/skill`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions)
    },
    rpc: {
      call: (input, requestOptions) => request({
        method: "POST",
        path: `/api/rpc/${encodeURIComponent(input.rpcID)}/${encodeURIComponent(input.method)}`,
        query: { location: input["location"] },
        body: { input: input["input"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 500],
        empty: false
      }, requestOptions)
    },
    event: {
      subscribe: (requestOptions) => sse({ method: "GET", path: `/api/event`, successStatus: 200, declaredStatuses: [400, 401], empty: false }, requestOptions)
    },
    pty: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/pty`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      create: (input, requestOptions) => request({
        method: "POST",
        path: `/api/pty`,
        query: { location: input?.["location"] },
        body: {
          command: input?.["command"],
          args: input?.["args"],
          cwd: input?.["cwd"],
          title: input?.["title"],
          env: input?.["env"]
        },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      get: (input, requestOptions) => request({
        method: "GET",
        path: `/api/pty/${encodeURIComponent(input.ptyID)}`,
        query: { location: input["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions),
      update: (input, requestOptions) => request({
        method: "PUT",
        path: `/api/pty/${encodeURIComponent(input.ptyID)}`,
        query: { location: input["location"] },
        body: { title: input["title"], size: input["size"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions),
      remove: (input, requestOptions) => request({
        method: "DELETE",
        path: `/api/pty/${encodeURIComponent(input.ptyID)}`,
        query: { location: input["location"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      connect: {
        token: (input, requestOptions) => request({
          method: "POST",
          path: `/api/pty/${encodeURIComponent(input.ptyID)}/connect-token`,
          query: { location: input["location"] },
          headers: { "x-opencode-ticket": input["x-opencode-ticket"] },
          successStatus: 200,
          declaredStatuses: [400, 401, 403, 404],
          empty: false
        }, requestOptions)
      }
    },
    experimental: {
      persistentPty: {
        read: (input, requestOptions) => request({
          method: "GET",
          path: `/api/experimental/session/${encodeURIComponent(input.sessionID)}/terminal/read`,
          query: { lines: input["lines"] },
          successStatus: 200,
          declaredStatuses: [400, 401, 503],
          empty: false
        }, requestOptions).then((value) => value.data),
        list: (input, requestOptions) => request({
          method: "GET",
          path: `/api/experimental/session/${encodeURIComponent(input.sessionID)}/terminal`,
          successStatus: 200,
          declaredStatuses: [400, 401, 503],
          empty: false
        }, requestOptions).then((value) => value.data),
        create: (input, requestOptions) => request({
          method: "POST",
          path: `/api/experimental/session/${encodeURIComponent(input.sessionID)}/terminal`,
          body: {
            command: input["command"],
            args: input["args"],
            cwd: input["cwd"],
            title: input["title"],
            env: input["env"],
            size: input["size"]
          },
          successStatus: 200,
          declaredStatuses: [400, 401, 503],
          empty: false
        }, requestOptions).then((value) => value.data),
        shutdown: (requestOptions) => request({
          method: "POST",
          path: `/api/experimental/persistent-pty/shutdown`,
          successStatus: 204,
          declaredStatuses: [400, 401, 503],
          empty: true
        }, requestOptions),
        handoff: (requestOptions) => request({
          method: "POST",
          path: `/api/experimental/persistent-pty/handoff`,
          successStatus: 200,
          declaredStatuses: [400, 401, 503],
          empty: false
        }, requestOptions),
        get: (input, requestOptions) => request({
          method: "GET",
          path: `/api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}`,
          successStatus: 200,
          declaredStatuses: [400, 401, 404, 503],
          empty: false
        }, requestOptions).then((value) => value.data),
        update: (input, requestOptions) => request({
          method: "PUT",
          path: `/api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}`,
          body: { attachmentID: input["attachmentID"], size: input["size"] },
          successStatus: 200,
          declaredStatuses: [400, 401, 404, 503],
          empty: false
        }, requestOptions).then((value) => value.data),
        snapshot: (input, requestOptions) => request({
          method: "GET",
          path: `/api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}/snapshot`,
          successStatus: 200,
          declaredStatuses: [400, 401, 404, 503],
          empty: false
        }, requestOptions).then((value) => value.data),
        remove: (input, requestOptions) => request({
          method: "DELETE",
          path: `/api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}`,
          successStatus: 204,
          declaredStatuses: [400, 401, 404, 503],
          empty: true
        }, requestOptions),
        connectToken: (input, requestOptions) => request({
          method: "POST",
          path: `/api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}/connect-token`,
          headers: { "x-opencode-ticket": input["x-opencode-ticket"] },
          successStatus: 200,
          declaredStatuses: [400, 401, 403, 404, 503],
          empty: false
        }, requestOptions).then((value) => value.data)
      }
    },
    shell: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/shell`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      create: (input, requestOptions) => request({
        method: "POST",
        path: `/api/shell`,
        query: { location: input["location"] },
        body: {
          command: input["command"],
          cwd: input["cwd"],
          timeout: input["timeout"],
          metadata: input["metadata"]
        },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      get: (input, requestOptions) => request({
        method: "GET",
        path: `/api/shell/${encodeURIComponent(input.id)}`,
        query: { location: input["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions),
      output: (input, requestOptions) => request({
        method: "GET",
        path: `/api/shell/${encodeURIComponent(input.id)}/output`,
        query: { location: input["location"], cursor: input["cursor"], limit: input["limit"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions),
      remove: (input, requestOptions) => request({
        method: "DELETE",
        path: `/api/shell/${encodeURIComponent(input.id)}`,
        query: { location: input["location"] },
        successStatus: 204,
        declaredStatuses: [400, 401],
        empty: true
      }, requestOptions)
    },
    reference: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/reference`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions)
    },
    worktree: {
      list: (input, requestOptions) => request({
        method: "GET",
        path: `/api/worktree`,
        query: { projectID: input["projectID"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions),
      create: (input, requestOptions) => request({
        method: "POST",
        path: `/api/worktree`,
        body: {
          projectID: input["projectID"],
          from: input["from"],
          branch: input["branch"],
          directory: input["directory"],
          name: input["name"]
        },
        successStatus: 200,
        declaredStatuses: [400, 401, 404],
        empty: false
      }, requestOptions),
      remove: (input, requestOptions) => request({
        method: "DELETE",
        path: `/api/worktree`,
        body: { projectID: input["projectID"], directory: input["directory"], force: input["force"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions),
      refresh: (input, requestOptions) => request({
        method: "POST",
        path: `/api/worktree/refresh`,
        body: { projectID: input["projectID"] },
        successStatus: 204,
        declaredStatuses: [400, 401, 404],
        empty: true
      }, requestOptions)
    },
    vcs: {
      get: (input, requestOptions) => request({
        method: "GET",
        path: `/api/vcs`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      base: (input, requestOptions) => request({
        method: "GET",
        path: `/api/vcs/base`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 503],
        empty: false
      }, requestOptions),
      status: (input, requestOptions) => request({
        method: "GET",
        path: `/api/vcs/status`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      branch: {
        list: (input, requestOptions) => request({
          method: "GET",
          path: `/api/vcs/branch`,
          query: { location: input?.["location"], search: input?.["search"], limit: input?.["limit"] },
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false
        }, requestOptions)
      },
      diff: (input, requestOptions) => request({
        method: "GET",
        path: `/api/vcs/diff`,
        query: { location: input["location"], mode: input["mode"], base: input["base"], context: input["context"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 503],
        empty: false
      }, requestOptions)
    },
    debug: {
      location: {
        list: (requestOptions) => request({
          method: "GET",
          path: `/api/debug/location`,
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false
        }, requestOptions),
        evict: (input, requestOptions) => request({
          method: "DELETE",
          path: `/api/debug/location`,
          query: { location: input?.["location"] },
          successStatus: 204,
          declaredStatuses: [400, 401],
          empty: true
        }, requestOptions)
      }
    },
    migration: {
      v1: {
        status: (requestOptions) => request({
          method: "GET",
          path: `/api/experimental/migration/v1`,
          successStatus: 200,
          declaredStatuses: [400, 401],
          empty: false
        }, requestOptions)
      }
    },
    websearch: {
      providers: (input, requestOptions) => request({
        method: "GET",
        path: `/api/websearch/provider`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 503],
        empty: false
      }, requestOptions),
      query: (input, requestOptions) => request({
        method: "POST",
        path: `/api/websearch`,
        query: { location: input["location"] },
        body: { query: input["query"], providerID: input["providerID"] },
        successStatus: 200,
        declaredStatuses: [400, 401, 503],
        empty: false
      }, requestOptions)
    },
    config: {
      get: (input, requestOptions) => request({
        method: "GET",
        path: `/api/config`,
        query: { location: input?.["location"] },
        successStatus: 200,
        declaredStatuses: [400, 401],
        empty: false
      }, requestOptions),
      shells: (requestOptions) => request({ method: "GET", path: `/api/config/shell`, successStatus: 200, declaredStatuses: [400, 401], empty: false }, requestOptions),
      update: (input, requestOptions) => request({
        method: "PATCH",
        path: `/api/experimental/config`,
        body: { shell: input["shell"] },
        successStatus: 204,
        declaredStatuses: [400, 401],
        empty: true
      }, requestOptions)
    }
  };
}
function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}
function appendQuery(params, key, value) {
  if (value === undefined)
    return;
  if (value === null) {
    params.append(key, "null");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value)
      appendQuery(params, key, item);
    return;
  }
  if (typeof value === "object") {
    for (const [child, item] of Object.entries(value))
      appendQuery(params, `${key}[${child}]`, item);
    return;
  }
  params.append(key, String(value));
}
async function json(response) {
  if (!isContentType(response, "application/json") && !response.headers.get("content-type")?.includes("+json")) {
    try {
      await response.body?.cancel();
    } catch {}
    throw new ClientError3("UnsupportedContentType", { detail: response.headers.get("content-type") });
  }
  let text;
  try {
    text = await response.text();
  } catch (cause) {
    throw new ClientError3("Transport", { cause });
  }
  if (text === "")
    throw new ClientError3("MalformedResponse");
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new ClientError3("MalformedResponse", { cause });
  }
}
function declared(body) {
  const error = Object.assign(new Error(body.message ?? body.data?.message), body);
  if (body._tag)
    error.name = body._tag;
  return error;
}
function isContentType(response, expected) {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === expected;
}
var exports_client4, maxSseEventBytes;
var init_contract_n8g24fq8 = __esm(() => {
  init_contract_nwcpakzx();
  init_contract_9rqn6x4v();
  exports_client4 = {};
  __export(exports_client4, {
    make: () => make6
  });
  maxSseEventBytes = 16 * 1024 * 1024;
});

// node_modules/@opencode/client/dist/chunks/contract-4tveyqeh.js
var isRpcError2 = (value) => typeof value === "object" && value !== null && ("_tag" in value) && value["_tag"] === "RpcError", isRpcInternalError2 = (value) => typeof value === "object" && value !== null && ("_tag" in value) && value["_tag"] === "RpcInternalError";
var init_contract_4tveyqeh = () => {};

// node_modules/@opencode/client/dist/chunks/contract-1tbj6z39.js
function makeRpc2(raw, events) {
  return (definition) => {
    const subscribe = (name, options) => {
      if (!Object.hasOwn(definition.events, name))
        throw new Error(`Unknown RPC event: ${definition.id}.${name}`);
      const type = eventType(definition, name);
      return {
        [Symbol.asyncIterator]() {
          const controller = new AbortController;
          const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
          const iterator = async function* () {
            try {
              for await (const published of events.subscribe({ signal })) {
                if (signal.aborted)
                  return;
                if (published.type !== type)
                  continue;
                yield published;
              }
            } catch (error) {
              if (!signal.aborted)
                throw error;
            } finally {
              controller.abort();
            }
          }();
          return {
            next: () => iterator.next(),
            return: () => {
              controller.abort();
              return iterator.return();
            }
          };
        }
      };
    };
    return Object.assign(Object.fromEntries(Object.keys(definition.methods).map((name) => [
      name,
      async (input, options) => {
        try {
          const result = await raw.rpc.call({
            rpcID: definition.id,
            method: name,
            input,
            location: options?.location
          }, { signal: options?.signal, headers: options?.headers });
          return result.output;
        } catch (error) {
          if (!isRpcError2(error) && !isRpcInternalError2(error))
            throw error;
          throw error.data === undefined ? { type: error.type, message: error.message } : { type: error.type, message: error.message, data: error.data };
        }
      }
    ])), {
      events: {
        subscribe,
        on: (name, handler, options) => {
          const controller = new AbortController;
          const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
          const source = subscribe(name, { signal });
          (async () => {
            for await (const event of source)
              await handler(event);
          })().catch((error) => console.error(error));
          return () => controller.abort();
        }
      }
    });
  };
}
function eventType(definition, name) {
  return `rpc.${definition.id}.${name}`;
}
var init_contract_1tbj6z39 = __esm(() => {
  init_contract_4tveyqeh();
});

// node_modules/@opencode/client/dist/chunks/contract-hg4r8g3y.js
function make5(options) {
  const raw = make6(options);
  const events = make7((signal, onActivity) => raw.event.subscribe({ signal, onActivity }));
  return {
    ...raw,
    rpc: Object.assign(makeRpc2(raw, events), raw.rpc),
    event: events
  };
}
var exports_client3;
var init_contract_hg4r8g3y = __esm(() => {
  init_contract_frbwqjmf();
  init_contract_n8g24fq8();
  init_contract_1tbj6z39();
  init_contract_9rqn6x4v();
  exports_client3 = {};
  __export(exports_client3, {
    OpenCode: () => exports_client3,
    make: () => make5
  });
});

// node_modules/@opencode/client/dist/chunks/contract-vyas3vgt.js
var init_contract_vyas3vgt = () => {};

// node_modules/@opencode/client/dist/promise/index.js
var init_promise = __esm(() => {
  init_contract_m2eywc8w();
  init_contract_hg4r8g3y();
  init_contract_1tbj6z39();
  init_contract_vyas3vgt();
  init_contract_n8g24fq8();
  init_contract_4tveyqeh();
  init_contract_nwcpakzx();
  init_contract_frbwqjmf();
});

// openchamber/service/main.ts
init_promise();
import { createServer } from "node:http";

// node_modules/@opencode/client/dist/chunks/contract-txckps9j.js
import { spawn } from "node:child_process";
var stderrLimit = 8 * 1024;
function spawnServiceContender2(command, args, env) {
  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, ...env }
  });
  let error;
  let closed = false;
  let stderr = Buffer.alloc(0);
  const onStderr = (chunk) => {
    const tail = chunk.subarray(-stderrLimit);
    stderr = tail.length === stderrLimit ? Buffer.from(tail) : Buffer.concat([stderr.subarray(-(stderrLimit - tail.length)), tail]);
  };
  child.stderr?.on("data", onStderr);
  if (child.stderr !== null && "unref" in child.stderr && typeof child.stderr.unref === "function")
    child.stderr.unref();
  child.once("error", (cause) => {
    error = new Error("Failed to start server", { cause });
  });
  child.once("close", () => {
    closed = true;
  });
  child.unref();
  return {
    child,
    error: () => error,
    closed: () => closed,
    stderr: () => stderr.toString("utf8").trim(),
    release: () => {
      child.stderr?.off("data", onStderr);
      child.stderr?.resume();
      stderr = Buffer.alloc(0);
    }
  };
}
function contenderFailure2(contender) {
  const error = contender.error();
  if (error !== undefined)
    return error;
  if (contender.child.exitCode !== null && contender.child.exitCode !== 0)
    return startupError(`Server process exited with code ${contender.child.exitCode}`, contender.stderr());
  if (contender.child.signalCode !== null)
    return startupError(`Server process terminated by ${contender.child.signalCode}`, contender.stderr());
  return;
}
function contenderFinished2(contender) {
  return contender.error() !== undefined || contender.closed();
}
function startupError(message, stderr) {
  return new Error(stderr ? `${message}
${stderr}` : message);
}

// node_modules/@opencode/client/dist/chunks/contract-xgnj2w4v.js
var timings = new WeakMap;
var defaultEnsureTiming2 = {
  pollInterval: 25,
  requestTimeout: 2000,
  spawnDelay: 5000,
  maxSpawnDelay: 30000,
  promiseTimeout: 120000,
  stopPollInterval: 50,
  stopPollAttempts: 100
};
function ensureTiming2(options) {
  return timings.get(options) ?? defaultEnsureTiming2;
}

// node_modules/@opencode/client/dist/chunks/contract-sxt88q69.js
function matchesVersion2(version, options) {
  if (options.version === undefined)
    return true;
  if (version === undefined)
    return false;
  if (typeof options.version === "function")
    return options.version(version);
  return version === options.version;
}

// node_modules/@opencode/client/dist/chunks/contract-a7ekbhcb.js
init_contract_9rqn6x4v();
import { readFile, rename, rm, writeFile } from "node:fs/promises";
var exports_pty_handoff = {};
__export(exports_pty_handoff, {
  PtyHandoff: () => exports_pty_handoff,
  clear: () => clear2,
  complete: () => complete2,
  environment: () => environment2,
  prepare: () => prepare2
});
async function prepare2(file, info, timeout) {
  const existing = await read(file);
  if (existing !== undefined && existing.expiresAt > Date.now() && same(existing.source, info))
    return;
  await Promise.resolve().then(() => init_promise());
  const client = exports_client3.make({
    baseUrl: info.url,
    headers: info.password === undefined ? undefined : { authorization: "Basic " + Buffer.from(`opencode:${info.password}`).toString("base64") }
  });
  const missing = (error) => error instanceof ClientError3 && error.reason === "UnexpectedStatus" && typeof error.cause === "object" && error.cause !== null && ("status" in error.cause) && error.cause.status === 404;
  const result = await client.experimental.persistentPty.handoff({ signal: AbortSignal.timeout(timeout) }).then((value) => ({ value }), (cause) => ({ cause }));
  if ("cause" in result) {
    const concurrent = await read(file);
    if (concurrent !== undefined && concurrent.expiresAt > Date.now() && same(concurrent.source, info))
      return;
    if (!missing(result.cause))
      throw new Error("Failed to prepare persistent terminals for service replacement", { cause: result.cause });
    console.warn("Background service cannot hand off persistent terminals; shutting them down before replacement");
    await client.experimental.persistentPty.shutdown({ signal: AbortSignal.timeout(timeout) }).catch((cause) => {
      if (missing(cause))
        return;
      throw new Error("Failed to shut down persistent terminals before service replacement", { cause });
    });
    await publish(file, info, null);
    return;
  }
  const body = result.value;
  if (typeof body !== "object" || body === null || !("handoff" in body))
    throw new Error("Invalid persistent terminal handoff response");
  if (body.handoff === null) {
    await publish(file, info, null);
    return;
  }
  if (!isHandoff(body.handoff) || body.handoff.expiresAt <= Date.now())
    throw new Error("Invalid or expired persistent terminal handoff");
  await publish(file, info, body.handoff);
}
async function publish(file, info, handoff) {
  const temporary = `${file}.pty-handoff.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({
    source: { id: info.id, pid: info.pid, url: info.url },
    handoff,
    expiresAt: handoff?.expiresAt ?? Date.now() + 30000
  }), { mode: 384, flag: "wx" });
  await rename(temporary, file + ".pty-handoff").finally(() => rm(temporary, { force: true }));
}
async function environment2(file, env) {
  const record = await read(file);
  const current = await readFile(file, "utf8").then((text) => JSON.parse(text)).catch(() => {
    return;
  });
  const handoff = record !== undefined && record.expiresAt > Date.now() && (current === undefined || same(record.source, current)) ? record.handoff : undefined;
  return { ...env, OPENCODE_PTY_HANDOFF: handoff == null ? undefined : JSON.stringify(handoff) };
}
async function complete2(file, info) {
  const record = await read(file);
  if (record !== undefined && !same(record.source, info))
    await clear2(file);
}
async function clear2(file) {
  await rm(file + ".pty-handoff", { force: true });
}
async function read(file) {
  const value = await readFile(file + ".pty-handoff", "utf8").then((text) => JSON.parse(text)).catch(() => {
    return;
  });
  if (typeof value !== "object" || value === null || !("source" in value) || !("handoff" in value))
    return;
  if (typeof value.source !== "object" || value.source === null)
    return;
  if (!("pid" in value.source) || typeof value.source.pid !== "number")
    return;
  if (!("url" in value.source) || typeof value.source.url !== "string")
    return;
  if ("id" in value.source && typeof value.source.id !== "string")
    return;
  if (value.handoff !== null && !isHandoff(value.handoff))
    return;
  if (!("expiresAt" in value) || typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt))
    return;
  return {
    source: {
      id: "id" in value.source && typeof value.source.id === "string" ? value.source.id : undefined,
      pid: value.source.pid,
      url: value.source.url
    },
    handoff: value.handoff,
    expiresAt: value.expiresAt
  };
}
function same(left, right) {
  return left.id === right.id && left.pid === right.pid && left.url === right.url;
}
function isHandoff(value) {
  return typeof value === "object" && value !== null && "directory" in value && typeof value.directory === "string" && "instanceID" in value && typeof value.instanceID === "string" && "ticket" in value && typeof value.ticket === "string" && "expiresAt" in value && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt);
}
// node_modules/@opencode/client/dist/promise/service.js
import { readFile as readFile2, rm as rm2 } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
async function discover(options = {}) {
  const found = (await registered(options.file)).service;
  if (found?.state !== "ready")
    return;
  if (!found.compatible)
    return;
  if (!matchesVersion2(found.version, options))
    return;
  return found.endpoint;
}
async function ensure(options = {}) {
  const timing = ensureTiming2(options);
  const deadline = Date.now() + timing.promiseTimeout;
  const contenders = new Set;
  let timeouts;
  let announced = false;
  let lastSpawn = 0;
  let spawnDelay = timing.spawnDelay;
  const announce = (reason, previousVersion) => {
    if (announced)
      return;
    announced = true;
    options.onStart?.(reason, previousVersion);
  };
  const spawnContender = async () => {
    const [command, ...args] = options.command ?? ["opencode", "serve", "--service"];
    if (command === undefined)
      throw new Error("Missing service command");
    try {
      return spawnServiceContender2(command, args, await environment2(options.file ?? fallback(), options.env));
    } catch (cause) {
      throw new Error("Failed to start server", { cause });
    }
  };
  try {
    while (true) {
      if (Date.now() >= deadline)
        throw new Error("Timed out waiting for the background service to start");
      const registration = await registered(options.file, timing.requestTimeout);
      if (registration.timedOut && registration.info !== undefined) {
        timeouts = {
          info: registration.info,
          count: timeouts !== undefined && same2(timeouts.info, registration.info) ? timeouts.count + 1 : 1
        };
        if (timeouts.count >= 3) {
          announce("missing");
          console.warn("Background service is unresponsive; recovery cannot preserve persistent terminals");
          await clear2(options.file ?? fallback());
          await terminate(registration.info, options, timing);
          timeouts = undefined;
          lastSpawn = Date.now() - spawnDelay;
        }
      } else
        timeouts = undefined;
      if (registration.service !== undefined) {
        spawnDelay = timing.spawnDelay;
        const service2 = registration.service;
        const compatible = service2.compatible && matchesVersion2(service2.version, options);
        if (compatible && service2.state === "ready") {
          await complete2(options.file ?? fallback(), service2.info);
          return service2.endpoint;
        }
        if (compatible && service2.state === "failed")
          throw new Error("Background service failed to start");
        if (!compatible) {
          announce("version-mismatch", service2.version);
          if (service2.state !== "ready")
            console.warn("Background service is not ready; replacement cannot preserve persistent terminals");
          await stop({
            file: options.file,
            pty: service2.state === "ready" ? "handoff" : "clear"
          }).catch(() => {
            return;
          });
          lastSpawn = 0;
        }
      } else {
        if (lastSpawn === 0 && registration.info !== undefined)
          lastSpawn = Date.now();
        const finished = [...contenders].filter(contenderFinished2);
        const failure = finished.map(contenderFailure2).find((error) => error !== undefined);
        if (finished.some((item) => item.child.exitCode === 0)) {
          spawnDelay = Math.min(spawnDelay * 2, timing.maxSpawnDelay);
        }
        finished.forEach((item) => contenders.delete(item));
        if (failure !== undefined && contenders.size === 0)
          throw failure;
        if (contenders.size < 2 && Date.now() - lastSpawn >= spawnDelay) {
          announce("missing");
          contenders.add(await spawnContender());
          lastSpawn = Date.now();
        }
      }
      await delay(timing.pollInterval);
    }
  } finally {
    contenders.forEach((contender) => contender.release());
  }
}
async function stop(options = {}) {
  const info = await read2(options.file);
  if (options.pty === "handoff" && info !== undefined)
    await prepare2(options.file ?? fallback(), info, defaultEnsureTiming2.requestTimeout);
  else
    await clear2(options.file ?? fallback());
  if (info !== undefined)
    await terminate(info, options, defaultEnsureTiming2);
}
function fallback() {
  return join(process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state"), "opencode", "service.json");
}
function headers(endpoint) {
  if (endpoint.auth === undefined)
    return;
  return {
    authorization: "Basic " + Buffer.from(endpoint.auth.username + ":" + endpoint.auth.password).toString("base64")
  };
}
async function read2(file) {
  const text = await readFile2(file ?? fallback(), "utf8").catch(() => {
    return;
  });
  if (text === undefined)
    return;
  try {
    return JSON.parse(text);
  } catch {
    return;
  }
}
async function probeResult(info, timeout = defaultEnsureTiming2.requestTimeout) {
  const endpoint = {
    url: info.url,
    auth: info.password === undefined ? undefined : { type: "basic", username: "opencode", password: info.password }
  };
  const signal = AbortSignal.timeout(timeout);
  const result = await fetch(new URL("/api/info", info.url), { headers: headers(endpoint), signal }).then(async (response) => ({
    response,
    body: response.status === 404 ? undefined : await response.json()
  })).then((value) => ({ value }), (cause) => ({ cause }));
  if ("cause" in result)
    return { service: undefined, timedOut: signal.aborted };
  const response = result.value.response;
  if (response.status === 404)
    return {
      service: {
        info,
        endpoint,
        version: info.version,
        state: "ready",
        compatible: false
      },
      timedOut: false
    };
  const serverInfo = decodeInfo(result.value.body);
  if (serverInfo !== undefined) {
    if (serverInfo.pid !== info.pid)
      return { service: undefined, timedOut: false };
    if (info.version !== undefined && serverInfo.version !== info.version)
      return { service: undefined, timedOut: false };
    return {
      service: {
        info,
        endpoint,
        version: serverInfo.version,
        state: response.ok ? "ready" : response.status === 500 ? "failed" : "waiting",
        compatible: true
      },
      timedOut: false
    };
  }
  return { service: undefined, timedOut: false };
}
function decodeInfo(input) {
  if (typeof input !== "object" || input === null)
    return;
  if (!("version" in input) || typeof input.version !== "string")
    return;
  if (!("pid" in input) || typeof input.pid !== "number" || !Number.isInteger(input.pid) || input.pid < 0)
    return;
  return { version: input.version, pid: input.pid };
}
async function registered(file, timeout) {
  const info = await read2(file);
  if (info === undefined)
    return { info: undefined, service: undefined, timedOut: false };
  return { info, ...await probeResult(info, timeout) };
}
function signal(pid, name) {
  try {
    process.kill(pid, name);
  } catch {}
}
function stopped(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}
async function waitUntilStopped(pid, timing) {
  for (let attempt = 0;attempt <= timing.stopPollAttempts; attempt++) {
    if (stopped(pid))
      return true;
    if (attempt < timing.stopPollAttempts)
      await delay(timing.stopPollInterval);
  }
  return false;
}
function same2(left, right) {
  return left.id === right.id && left.version === right.version && left.url === right.url && left.pid === right.pid;
}
async function terminate(info, options, timing) {
  const current = await read2(options.file);
  if (current === undefined || !same2(current, info))
    return;
  signal(info.pid, "SIGTERM");
  if (!await waitUntilStopped(info.pid, timing)) {
    const latest = await read2(options.file);
    if (latest === undefined || !same2(latest, info))
      return;
    signal(info.pid, "SIGKILL");
    if (!await waitUntilStopped(info.pid, timing))
      throw new Error(`Server process ${info.pid} is still running`);
  }
  const latest = await read2(options.file);
  if (latest === undefined || !same2(latest, info))
    return;
  await rm2(options.file ?? fallback(), { force: true });
}
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
var Service = { discover, ensure, stop, headers };

// openchamber/service/rewrites.ts
import { realpathSync } from "node:fs";
function sameDirectory(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}
var text = (value, max) => typeof value === "string" ? value.slice(0, max) : undefined;
async function readRewrites(client, sessionID, directory) {
  const session = await client.session.get({ sessionID });
  if (!sameDirectory(session.location.directory, directory))
    throw new Error("Session does not belong to the open project");
  const page = await client.message.list({ sessionID, type: "user", order: "desc", limit: 100 });
  return page.data.flatMap((message) => {
    if (message.type !== "user")
      return [];
    const stored = message.metadata ?? {};
    const meta = stored.contextPromptOptimizer;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const value = meta;
      const rewrite = text(value.rewrite, 16000);
      if (value.version === 1 && rewrite && typeof value.model === "string")
        return [{
          messageID: message.id,
          original: text(value.original, 16000),
          rewrite,
          model: value.model,
          changed: value.changed !== false,
          target: text(value.target, 200),
          sent: text(value.sent, 40000),
          context: typeof value.context === "string" ? value.context : "none",
          candidates: Array.isArray(value.candidates) ? value.candidates.length : 0,
          judged: value.judged === true,
          ms: typeof value.ms === "number" ? value.ms : 0,
          created: message.time.created
        }];
    }
    const error = text(stored.contextPromptOptimizerError, 400);
    return error ? [{ messageID: message.id, original: message.text.slice(0, 16000), error, created: message.time.created }] : [];
  }).slice(0, 20);
}

// openchamber/service/main.ts
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var token = process.env.OPENCHAMBER_SERVICE_TOKEN;
if (!Number.isInteger(port) || port < 1 || !token)
  throw new Error("OpenChamber service credentials are required");
var reply = (response, status, data) => {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(data));
};
createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`)
    return reply(response, 401, { error: "Unauthorized" });
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (request.method === "GET" && path === "/health")
    return reply(response, 200, { ok: true });
  if (request.method !== "POST" || path !== "/rewrites")
    return reply(response, 404, { error: "Not found" });
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 4096)
        return reply(response, 413, { error: "Request too large" });
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof input.sessionID !== "string" || !/^ses_[\w-]+$/.test(input.sessionID) || typeof input.directory !== "string" || !input.directory.startsWith("/"))
      return reply(response, 400, { error: "Invalid session" });
    const endpoint = await Service.discover();
    if (!endpoint)
      return reply(response, 503, { error: "Local OpenCode service unavailable; remote servers are not supported by the comparison bridge" });
    const client = exports_client3.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
    return reply(response, 200, { rewrites: await readRewrites(client, input.sessionID, input.directory) });
  } catch {
    return reply(response, 502, { error: "Could not read rewrites from the local OpenCode service" });
  }
}).listen(port, "127.0.0.1");
