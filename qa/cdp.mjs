/**
 * Minimal Chrome DevTools Protocol client for QA runs (owned by C).
 * Uses the global WebSocket and http client shipped with Node 24, so the
 * project needs no extra dev dependency to measure the real page.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";

const CHROME = process.env.KAYANGAN_CHROME ?? "google-chrome";

export async function waitPageTarget(port, timeoutMs = 20_000) {
  const url = `http://127.0.0.1:${port}/json/list`;
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const list = await response.json();
        const page = list.find((entry) => entry.type === "page");
        if (page) return page;
        last = `targets: ${list.map((entry) => entry.type).join(", ") || "none"}`;
      } else {
        last = `http ${response.status}`;
      }
    } catch (error) {
      last = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No page target on port ${port} (${last})`);
}

export function launchChrome(port, url, extraArgs = []) {
  // A fresh profile per run: a shared one restores old tabs and QA then reads
  // the wrong page target.
  const profile = process.env.KAYANGAN_PROFILE ?? `${process.cwd()}/.chrome-profile-${port}`;
  const args = [
    "--headless=new",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    "--window-size=1920,1080",
    "--hide-scrollbars",
    ...extraArgs,
    "about:blank",
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
    async waitFor(selector = "#viewport", timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const ready = await this.evaluate(
          `document.readyState === 'complete' && document.querySelector(${JSON.stringify(selector)}) !== null`,
        );
        if (ready) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error(`Page never rendered ${selector} (readyState never completed)`);
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

/**
 * Serve a file over HTTP so a real browser can decode it and hand pixels back
 * to us. Data URLs are unreliable for large PNGs, and file:// taints the canvas.
 */
/**
 * Serve the page and its image from ONE origin. A second port would make the
 * image cross-origin, which taints the canvas and blocks pixel readback.
 */
export async function servePair(port, html, filePath, mime) {
  const { readFile } = await import("node:fs/promises");
  const body = await readFile(filePath);
  const server = createServer((request, response) => {
    if (request.url && request.url.startsWith("/asset")) {
      response.writeHead(200, { "content-type": mime, "cache-control": "no-store" });
      response.end(body);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html.replace("__ASSET__", `http://127.0.0.1:${port}/asset`));
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((resolve) => server.close(resolve)) };
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
    let page;
    try {
      page = await waitPageTarget(port);
    } catch (error) {
      throw new Error(`${error.message}; chrome stderr: ${getStderr() || "(empty)"}`);
    }
    session = await connect(page, port);
    await session.call("Runtime.enable");
    await session.call("Log.enable");
    await session.call("Page.enable");
    await session.call("Page.navigate", { url });
    return await work(session, getStderr());
  } finally {
    session?.close();
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), killed]);
  }
}
