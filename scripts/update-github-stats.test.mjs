import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import vm from "node:vm";
import { test } from "node:test";

const run = promisify(execFile);
const collectorUrl = new URL("./update-github-stats.mjs", import.meta.url).href;
const appSource = await fs.readFile(new URL("../app.js", import.meta.url), "utf8");
const previous = {
  organization: "test-org",
  generatedAt: "2026-10-17T10:00:00.000Z",
  repoCount: 2,
  totalCommits: 100,
  activeContributors: [{ login: "alice", commits: 6 }],
  repositories: [],
  profiles: { alice: { login: "alice", name: "Alice" } },
};
const repo = (name, size = 1) => ({ name, size, archived: false, fork: false });
const contributor = total => [{ total, author: { login: "alice" }, weeks: [] }];

async function collect(responses, { snapshot = previous, withToken = true, members = [] } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dina-stats-test-"));
  try {
    await fs.mkdir(path.join(directory, "data"));
    await fs.writeFile(path.join(directory, "data/members.json"), JSON.stringify(members));
    if (snapshot) await fs.writeFile(path.join(directory, "data/github-stats.json"), JSON.stringify(snapshot));
    const harness = `
      import fs from 'node:fs';
      const responses = ${JSON.stringify(responses)};
      const requests = [];
      globalThis.setTimeout = callback => { queueMicrotask(callback); return 0; };
      globalThis.fetch = async url => {
        requests.push(new URL(url).pathname);
        const next = responses.shift();
        if (!next) throw new Error('Unexpected extra API request');
        if (next.error) throw new Error(next.error);
        return new Response(next.status === 204 ? null : JSON.stringify(next.body ?? {}), {
          status: next.status ?? 200,
          headers: { 'content-type': 'application/json', ...next.headers },
        });
      };
      process.on('exit', () => fs.writeFileSync('requests.json', JSON.stringify(requests)));
      await import(${JSON.stringify(collectorUrl)});
    `;
    let exitCode = 0;
    let logs = "";
    try {
      const result = await run(process.execPath, ["--input-type=module", "--eval", harness], {
        cwd: directory,
        timeout: 10000,
        env: { ...process.env, GITHUB_ORG: "test-org", DINA_GITHUB_TOKEN: withToken ? "test-token" : "", EXCLUDE_REPOS: "test-org.github.io" },
      });
      logs = result.stdout + result.stderr;
    } catch (error) {
      exitCode = error.code;
      logs = (error.stdout || "") + (error.stderr || "");
    }
    let output = null;
    try { output = JSON.parse(await fs.readFile(path.join(directory, "data/github-stats.json"), "utf8")); } catch {}
    const requests = JSON.parse(await fs.readFile(path.join(directory, "requests.json"), "utf8"));
    return { output, requests, exitCode, logs };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function assertFallback(result) {
  assert.equal(result.exitCode, 0, result.logs);
  assert.equal(result.output.totalCommits, previous.totalCommits);
  assert.equal(result.output.repoCount, previous.repoCount);
  assert.equal(result.output.generatedAt, previous.generatedAt);
  assert.deepEqual(result.output.activeContributors, previous.activeContributors);
  assert.equal(result.output.snapshot, "last-known-good");
  assert.ok(result.output.lastAttemptAt);
}

test("a cache hit still fetches and publishes fresh complete statistics", async () => {
  const result = await collect([
    { body: [repo("private-a"), repo("private-b")] },
    { body: contributor(80), headers: { "x-ratelimit-remaining": "4998", "x-ratelimit-limit": "5000" } },
    { body: contributor(40) },
  ]);
  assert.equal(result.exitCode, 0, result.logs);
  assert.equal(result.requests.length, 3);
  assert.equal(result.output.totalCommits, 120);
  assert.equal(result.output.snapshot, "fresh");
  assert.notEqual(result.output.generatedAt, previous.generatedAt);
  assert.deepEqual(result.output.repositories, []);
  assert.ok(!JSON.stringify(result.output).includes("private-"));
});

test("a temporary 202 is retried and can produce a fresh snapshot", async () => {
  const result = await collect([
    { body: [repo("private-a")] },
    { status: 202 },
    { body: contributor(120) },
  ]);
  assert.equal(result.output.snapshot, "fresh");
  assert.equal(result.output.totalCommits, 120);
  assert.equal(result.requests.length, 3);
});

test("exhausted 202 responses preserve the complete previous snapshot", async () => {
  const result = await collect([
    { body: [repo("private-a"), repo("private-b")] },
    { body: contributor(80) },
    ...Array.from({ length: 5 }, () => ({ status: 202 })),
  ]);
  assertFallback(result);
  assert.equal(result.requests.length, 7);
});

test("an empty 200 for a nonempty repository cannot publish a partial total", async () => {
  assertFallback(await collect([
    { body: [repo("private-a"), repo("private-b")] },
    { body: contributor(80) },
    { body: [] },
  ]));
});

test("HTTP failures and network failures preserve the fallback", async () => {
  assertFallback(await collect([{ status: 500 }]));
  assertFallback(await collect([{ error: "network unavailable" }]));
});

test("primary and secondary rate limits stop further API requests", async () => {
  for (const limited of [
    { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "9999999999" } },
    { status: 403, body: { message: "You have exceeded a secondary rate limit." } },
    { status: 429, headers: { "retry-after": "120" } },
  ]) {
    const result = await collect([{ body: [repo("private-a"), repo("private-b")] }, limited], { members: [{ github: "alice" }, { github: "bob" }] });
    assertFallback(result);
    assert.equal(result.requests.length, 2);
  }
});

test("a low remaining quota stops before sending another request", async () => {
  const result = await collect([{ body: [repo("private-a")], headers: { "x-ratelimit-remaining": "25", "x-ratelimit-limit": "5000" } }]);
  assertFallback(result);
  assert.equal(result.requests.length, 1);
});

test("empty repositories with 204 responses are accepted", async () => {
  const result = await collect([{ body: [repo("private-a", 0)] }, { status: 204 }], { snapshot: null });
  assert.equal(result.exitCode, 0, result.logs);
  assert.equal(result.output.totalCommits, 0);
  assert.equal(result.output.snapshot, "fresh");
});

test("configuration errors preserve fallback, and fail visibly without one", async () => {
  assertFallback(await collect([], { withToken: false }));
  const result = await collect([], { withToken: false, snapshot: null });
  assert.equal(result.exitCode, 1);
  assert.equal(result.output, null);
  assert.equal(result.requests.length, 0);
});

test("a snapshot from another organization cannot become the fallback", async () => {
  const result = await collect([{ status: 500 }], { snapshot: { ...previous, organization: "other-org" } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.output.organization, "other-org");
  assert.equal(result.output.lastAttemptAt, undefined);
});

function browserContext(responses) {
  const values = new Map([["dina:last-good-github-stats", JSON.stringify(previous)]]);
  const requests = [];
  const elements = new Map();
  let timer;
  const context = vm.createContext({
    console: { warn() {}, error() {} },
    URL,
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    fetch: async (url, options) => {
      requests.push({ url, options });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { ok: true, json: async () => next };
    },
    document: { getElementById: id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
    window: { location: { href: "https://example.com/" }, setInterval: (callback, interval) => { timer = { callback, interval }; } },
  });
  vm.runInContext(appSource.slice(0, appSource.lastIndexOf("\nsetupThemeToggle();")), context);
  return { context, requests, values, elements, getTimer: () => timer };
}

test("browser fetches fresh JSON even with localStorage and keeps fallback for outages", async () => {
  const fresh = { ...previous, totalCommits: 120, generatedAt: "2026-10-18T06:00:00.000Z", snapshot: "fresh" };
  const browser = browserContext([fresh, new Error("offline")]);
  const first = await vm.runInContext("loadGithubStats()", browser.context);
  assert.equal(first.totalCommits, 120);
  const second = await vm.runInContext("loadGithubStats()", browser.context);
  assert.equal(second.totalCommits, 120);
  assert.equal(browser.requests.length, 2);
  assert.equal(browser.requests[0].options.cache, "no-store");
});

test("an open page refreshes only public JSON every two hours", async () => {
  const browser = browserContext([{ ...previous, totalCommits: 120 }]);
  vm.runInContext("setupStatsRefresh()", browser.context);
  assert.equal(browser.getTimer().interval, 2 * 60 * 60 * 1000);
  await browser.getTimer().callback();
  assert.match(browser.requests[0].url, /^data\/github-stats\.json\?v=/);
  assert.equal(browser.elements.get("statCommits").textContent, "120");
});

test("a stale deployment cannot replace a more recent browser snapshot", async () => {
  const browser = browserContext([{ ...previous, totalCommits: 80, generatedAt: null, snapshot: "last-known-good" }]);
  const result = await vm.runInContext("loadGithubStats()", browser.context);
  assert.equal(browser.requests.length, 1);
  assert.equal(result.totalCommits, previous.totalCommits);
  assert.equal(result.generatedAt, previous.generatedAt);
  assert.equal(result.snapshot, "last-known-good");
});
