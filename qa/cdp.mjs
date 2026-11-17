/**
 * Minimal Chrome DevTools Protocol client for QA runs (owned by C).
 * Uses the global WebSocket and http client shipped with Node 24, so the
 * project needs no extra dev dependency to measure the real page.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";

const CHROME = process.env.KAYANGAN_CHROME ?? "google-chrome";

export async function waitJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      /* Chrome is still starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`DevTools endpoint ${url} never came up`);
}

export function launchChrome(port, url, extraArgs = []) {
  const args = [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    "--window-size=1920,1080",
    "--hide-scrollbars",
    ...extraArgs,
    url,
  ];
  const child = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });
  return { child, getStderr: () => stderr };
}

export async function connect(page, port) {
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await once(socket, "open");
  let id = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const settle = pending.get(message.id);
      pending.delete(message.id);
      settle.resolve(message);
    } else if (message.method) {
      events.push(message);
    }
  });
  return {
    socket,
    events,
    call(method, params = {}) {
      const requestId = ++id;
      return new Promise((resolve) => {
        pending.set(requestId, { resolve });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      }).then((message) => {
        if (message.error) throw new Error(`${method}: ${message.error.message}`);
        return message.result;
      });
    },
    async evaluate(expression, awaitPromise = false) {
      const result = await this.call("Runtime.evaluate", {
        expression,
        awaitPromise,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      }
      return result.result.value;
    },
    close() {
      socket.close();
    },
  };
}

export async function serveHtml(port, html) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return () => new Promise((resolve) => server.close(resolve));
}

export function consoleErrors(events) {
  const errors = [];
  for (const event of events) {
    if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") {
      errors.push(event.params.args.map((arg) => arg.value ?? arg.description).join(" "));
    }
    if (event.method === "Log.entryAdded" && event.params.entry.level === "error") {
      errors.push(event.params.entry.message);
    }
  }
  return errors;
}

export async function runPage({ port = 9333, url, args = [], timeoutMs = 60_000 }, work) {
  const { child, getStderr } = launchChrome(port, url, args);
  const killed = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  let session = null;
  try {
    const pages = await waitJson(`http://127.0.0.1:${port}/json/list`);
    const page = pages.find((entry) => entry.type === "page") ?? pages[0];
    if (!page) throw new Error(`No page target: ${getStderr()}`);
    session = await connect(page, port);
    await session.call("Runtime.enable");
    await session.call("Log.enable");
    return await work(session, getStderr());
  } finally {
    session?.close();
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), killed]);
  }
}
