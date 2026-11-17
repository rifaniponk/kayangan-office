/**
 * Browser smoke route for the play loop. Drives real keys, buttons, pause,
 * restart, resize, visibility and quality paths in Chromium and reports
 * pass/fail per behaviour; it never re-implements app logic.
 *
 * Usage: node qa/smoke.mjs [url] [quality]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { consoleErrors, runPage } from "./cdp.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/?autoplay=0";
const quality = process.argv[3] ?? "high";
const out = resolve("qa/art/smoke.json");

const wait = (ms) => new Promise((resolve_) => setTimeout(resolve_, ms));
const read = async (session) => JSON.parse(await session.evaluate("JSON.stringify(window.KAYANGAN.debug())"));

const report = await runPage(
  { port: Number(process.env.KAYANGAN_DEBUG_PORT ?? 9335) + (process.pid % 40), url, timeoutMs: 150_000 },
  async (session, stderr) => {
    const checks = [];
    const push = (check, pass, detail) => checks.push({ check, pass: Boolean(pass), detail: String(detail).slice(0, 220) });

    await session.call("Runtime.enable")
    await session.waitFor();
    // The module boots a beat after dev-server reloads; wait for the API.
    await session.waitFor("window.KAYANGAN !== undefined && document.getElementById('play-button')", 20_000);
    await session.call("Log.enable");

    // Play action, through the real button.
    await session.evaluate("document.getElementById('play-button').click()");
    await wait(1200);
    push(
      "play button starts the game",
      (await session.evaluate("document.getElementById('boot').classList.contains('hidden')")) === true,
      `activeIndex=${(await read(session)).activeIndex}`,
    );

    // Key switching keeps each character's own position.
    await session.evaluate("window.KAYANGAN.key('Digit2', true); window.KAYANGAN.key('Digit2', false)");
    const automaton = await read(session);
    push("key 2 selects Automaton", automaton.activeIndex === 1, JSON.stringify(automaton.position));
    await session.evaluate("window.KAYANGAN.key('Digit1', true); window.KAYANGAN.key('Digit1', false)");
    const cloud = await read(session);
    push(
      "key 1 restores Cloud at its own position",
      cloud.activeIndex === 0 && Math.abs(cloud.position.x + 3) < 2 && Math.abs(cloud.position.z - 6) < 2,
      JSON.stringify(cloud.position),
    );

    // Movement through the normal keyboard path.
    const before = await read(session);
    await session.evaluate("window.KAYANGAN.key('KeyD', true)");
    await wait(1400);
    await session.evaluate("window.KAYANGAN.key('KeyD', false)");
    const moved = await read(session);
    push("D moves the active character", Math.abs(moved.position.x - before.position.x) > 0.5, `${before.position.x.toFixed(2)} -> ${moved.position.x.toFixed(2)}`);

    // Island edge containment while walking toward a corner.
    await session.evaluate("window.KAYANGAN.key('KeyA', true); window.KAYANGAN.key('KeyS', true)");
    await wait(2600);
    await session.evaluate("window.KAYANGAN.key('KeyA', false); window.KAYANGAN.key('KeyS', false)");
    const corner = await read(session);
    push(
      "deck edge stops the character",
      Math.abs(corner.position.x) <= 17.5 && Math.abs(corner.position.z) <= 11.5,
      JSON.stringify(corner.position),
    );

    // Furniture blocking: walking into the desk cluster must stop short of it.
    const deskWalk = (await session.runAsync("window.KAYANGAN.walkTo('desk-monitor')")).value;
    const atDesk = await read(session);
    push("walks to the desk anchor and sees the prompt", deskWalk.includes("arrived") && atDesk.nearestAnchor === "desk-monitor", `${deskWalk} / prompt=${atDesk.nearestAnchor}`);

    // Interaction path.
    await session.evaluate("window.KAYANGAN.key('KeyE', true)");
    await wait(700);
    await session.evaluate("window.KAYANGAN.key('KeyE', false)");
    const toast = await session.evaluate("document.getElementById('toast').textContent");
    push("E activates the desk zone", typeof toast === "string" && toast.toLowerCase().includes("monitor"), `${toast} / state=${(await read(session)).state}`);

    const meetingWalk = (await session.runAsync("window.KAYANGAN.walkTrace('meeting-screen')")).value;
    await session.evaluate("window.KAYANGAN.key('KeyE', true)");
    await wait(700);
    await session.evaluate("window.KAYANGAN.key('KeyE', false)");
    const meetingToast = await session.evaluate("document.getElementById('toast').textContent");
    push("meeting room display changes", meetingWalk.status.includes("arrived") && String(meetingToast).toLowerCase().includes("display"), `${meetingWalk.status} blocked=${meetingWalk.trace.filter((t) => t.blocked).length} / ${meetingToast}`);

    const loungeWalk = (await session.runAsync("window.KAYANGAN.walkTrace('lounge-sofa')")).value;
    await session.evaluate("window.KAYANGAN.key('KeyE', true)");
    await wait(700);
    await session.evaluate("window.KAYANGAN.key('KeyE', false)");
    const loungeToast = await session.evaluate("document.getElementById('toast').textContent");
    push("lounge sit/emote works", loungeWalk.status.includes("arrived") && String(loungeToast).length > 0, `${loungeWalk.status} blocked=${loungeWalk.trace.filter((t) => t.blocked).length} / ${loungeToast}`);

    const terraceWalk = (await session.runAsync("window.KAYANGAN.walkTrace('terrace-lookout')")).value;
    await session.evaluate("window.KAYANGAN.key('KeyE', true)");
    await wait(700);
    await session.evaluate("window.KAYANGAN.key('KeyE', false)");
    const terraceToast = await session.evaluate("document.getElementById('toast').textContent");
    push("terrace lookout works", terraceWalk.status.includes("arrived") && String(terraceToast).length > 0, `${terraceWalk.status} blocked=${terraceWalk.trace.filter((t) => t.blocked).length} / ${terraceToast}`);

    // On-screen movement pad drives the same path as WASD.
    await session.evaluate("window.KAYANGAN.restart()");
    await wait(400);
    const padPos = await session.evaluate("JSON.stringify(window.KAYANGAN.charactersPosition?.() ?? null)");
    const padBefore = padPos === null ? null : JSON.parse(padPos);
    await session.evaluate(
      "(() => { const b = document.querySelector('#dpad button[data-dir=\"right\"]'); b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, cancelable: true })); })()",
    );
    await wait(1200);
    await session.evaluate(
      "(() => { const b = document.querySelector('#dpad button[data-dir=\"right\"]'); b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true, cancelable: true })); })()",
    );
    await wait(200);
    const padAfter = JSON.parse(await session.evaluate("JSON.stringify(window.KAYANGAN.charactersPosition?.() ?? null)"));
    push(
      "on-screen pad moves the character",
      padBefore !== null && padAfter !== null && padAfter.x - padBefore.x > 1.5,
      `x ${padBefore?.x?.toFixed(2)} -> ${padAfter?.x?.toFixed(2)}`,
    );

    // Camera rig responds to drag and wheel within the safe limits.
    const beforeCam = JSON.parse(await session.evaluate("JSON.stringify(window.KAYANGAN.camera())"));
    await session.evaluate(
      "(() => { const c = document.getElementById('viewport'); const o = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: y, bubbles: true })); o('pointerdown', 800, 400); o('pointermove', 980, 460); o('pointerup', 980, 460); })()",
    );
    await wait(300);
    const dragged = JSON.parse(await session.evaluate("JSON.stringify(window.KAYANGAN.camera())"));
    push(
      "drag rotates the camera",
      Math.abs(dragged.yaw - beforeCam.yaw) > 0.05 && Math.abs(dragged.polar - beforeCam.polar) > 0.01,
      `yaw ${beforeCam.yaw.toFixed(2)} -> ${dragged.yaw.toFixed(2)}, polar ${beforeCam.polar.toFixed(2)} -> ${dragged.polar.toFixed(2)}`,
    );
    const zoomBefore = dragged.distance;
    await session.evaluate("document.getElementById('viewport').dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true }))");
    await wait(300);
    const zoomed = JSON.parse(await session.evaluate("JSON.stringify(window.KAYANGAN.camera())"));
    push(
      "wheel zooms within the clamp",
      Math.abs(zoomed.distance - zoomBefore) > 0.4 && zoomed.distance >= 5 && zoomed.distance <= 26,
      `distance ${zoomBefore.toFixed(2)} -> ${zoomed.distance.toFixed(2)}`,
    );

    // On-screen Interact button activates the nearest anchor.
    await session.evaluate("window.KAYANGAN.restart()");
    await wait(400);
    const padInteract = await session.runAsync("window.KAYANGAN.walkTo('desk-monitor')").then((r) => r.value);
    await session.evaluate("document.getElementById('toast').textContent = ''");
    await session.evaluate(
      "document.getElementById('interact-button').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }))",
    );
    await wait(400);
    await session.evaluate(
      "document.getElementById('interact-button').dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }))",
    );
    await wait(300);
    const padState = await session.evaluate("window.KAYANGAN.debug().state");
    await wait(600);
    const padToast = await session.evaluate("document.getElementById('toast').textContent");
    push(
      "on-screen Interact button activates the zone",
      padInteract.includes("arrived") && String(padToast).toLowerCase().includes("monitor") && padState === "interact",
      `${padInteract} / toast=${String(padToast).slice(0, 46)} / state=${padState}`,
    );

    // Pause keeps positions still; resume continues.
    await session.evaluate("window.KAYANGAN.pause(true)");
    const pausedAt = await read(session);
    await session.evaluate("window.KAYANGAN.key('KeyD', true)");
    await wait(1200);
    await session.evaluate("window.KAYANGAN.key('KeyD', false); window.KAYANGAN.pause(false)");
    const stillPaused = await read(session);
    push(
      "pause freezes the simulation",
      Math.abs(stillPaused.position.x - pausedAt.position.x) < 0.01,
      `${pausedAt.position.x.toFixed(2)} vs ${stillPaused.position.x.toFixed(2)}`,
    );

    // Restart returns everyone to their spawn point.
    await session.evaluate("window.KAYANGAN.restart()");
    const restarted = await read(session);
    push(
      "restart resets to spawn points",
      Math.abs(restarted.position.x + 3) < 0.3 && Math.abs(restarted.position.z - 6) < 0.3,
      JSON.stringify(restarted.position),
    );

    // Hidden tab stops the loop; a visible tab resumes it.
    const framesHidden = await session.evaluate("window.KAYANGAN.metrics().frames");
    await session.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))");
    await wait(1000);
    const framesAfterHide = await session.evaluate("window.KAYANGAN.metrics().frames");
    await session.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))");
    await wait(900);
    const framesAfterShow = await session.evaluate("window.KAYANGAN.metrics().frames");
    push(
      "hidden tab pauses, visible tab resumes",
      framesAfterHide <= framesHidden + 1 && framesAfterShow > framesAfterHide + 5,
      `frames ${framesHidden} -> ${framesAfterHide} -> ${framesAfterShow}`,
    );

    // Resize keeps the canvas in sync with the viewport.
    await session.call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await wait(500);
    const resized = JSON.parse(await session.evaluate("JSON.stringify({ w: document.getElementById('viewport').width, h: document.getElementById('viewport').height })"));
    push("browser resize resizes the canvas", resized.w >= 1280 && resized.h >= 720, JSON.stringify(resized));
    await session.call("Emulation.clearDeviceMetricsOverride");

    // Quality selector rebuilds the renderer without throwing.
    const errorsBefore = JSON.parse(await session.evaluate("JSON.stringify(window.KAYANGAN.errors())"));
    await session.evaluate("window.KAYANGAN.setQuality('low')");
    await wait(900);
    const lowWidth = await session.evaluate("document.getElementById('viewport').width");
    await session.evaluate("window.KAYANGAN.setQuality('high')");
    await wait(900);
    const errorsAfter = JSON.parse(await session.evaluate("JSON.stringify(window.KAYANGAN.errors())"));
    push(
      "quality selector switches without errors",
      errorsAfter.length === errorsBefore.length,
      `errors ${errorsBefore.length} -> ${errorsAfter.length}; low canvas width ${lowWidth}`,
    );

    const appErrors = JSON.parse(await session.evaluate("JSON.stringify(window.KAYANGAN.errors())"));
    push("no runtime console errors", appErrors.length === 0, appErrors.join(" | ") || "none");

    await mkdir("qa/art", { recursive: true });
    await writeFile(out, JSON.stringify({ url, quality, checks, browserErrors: consoleErrors(session.events), chromeStderr: stderr.trim().slice(0, 300) }, null, 2));
    return { checks, browserErrors: consoleErrors(session.events) };
  },
);

const failures = report.checks.filter((check) => !check.pass);
console.log(JSON.stringify({ passed: report.checks.length - failures.length, failed: failures.length, checks: report.checks, browserErrors: report.browserErrors }, null, 2));
if (failures.length > 0) process.exitCode = 1;
