import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { githubApi } from "./github-api.mjs";
import { loadHealth, REPOSITORY } from "./delivery-health.mjs";
import { resolveCommitSha } from "./nightlies.mjs";
import { writeState } from "./dispatch-nightly.mjs";
import { REPAIR_MODEL, REPAIR_EFFORT, repairDecision, validateProposal, validateCandidateDiff, validateVerification, validRepositoryPath } from "./repair-policy.mjs";

const exec = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const root = `/repos/${REPOSITORY}`;
const stateDirectory = path.join(os.homedir(), "Library/Application Support/T3CodeNightly");
const statePath = path.join(stateDirectory, "repair-state.json");
const ghPath = "/opt/homebrew/bin/gh";
const codexPath = path.join(os.homedir(), ".local/bin/codex");

async function gh(args) {
  return (await exec(ghPath, args, { maxBuffer: 8 * 1024 * 1024, timeout: 60_000 })).stdout;
}
async function content(api, repository, name, ref) {
  const file = await api(`/repos/${repository}/contents/${name}?ref=${encodeURIComponent(ref)}`);
  if (file.type !== "file" || file.encoding !== "base64") throw new Error(`Expected regular file ${name}`);
  return Buffer.from(file.content, "base64").toString("utf8");
}

async function rendererEvidence(mobilePackage, directory) {
  const version = mobilePackage.dependencies?.["react-native"]?.replace(/^[~^]/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) return "React Native version is not an exact registry version; maintenance may be required.";
  const response = await fetch(`https://registry.npmjs.org/react-native/-/react-native-${version}.tgz`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`React Native evidence download failed: ${response.status}`);
  const archive = path.join(directory, "react-native.tgz");
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  const entries = (await exec("/usr/bin/tar", ["-tzf", archive], { maxBuffer: 2_000_000 })).stdout.split("\n")
    .filter((entry) => /^package\/Libraries\/Renderer\/implementations\/React[\w-]*-prod\.js$/.test(entry));
  const results = [];
  for (const entry of entries) {
    const source = (await exec("/usr/bin/tar", ["-xzOf", archive, entry], { maxBuffer: 4_000_000 })).stdout;
    const lines = source.split("\n");
    const snippets = lines.flatMap((line, i) => /rendererPackageName|isomorphicReactPackageVersion/.test(line) ? [lines.slice(Math.max(0, i - 4), i + 5).join("\n")] : []);
    results.push({ entry, snippets });
  }
  return { version, renderers: results };
}

export async function runAgent(directory, name, prompt, schemaName) {
  const output = path.join(directory, `${name}.json`);
  const args = ["exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "--sandbox", name === "review" ? "read-only" : "workspace-write",
    "--model", REPAIR_MODEL, "-c", `model_reasoning_effort="${REPAIR_EFFORT}"`, "-c", "approval_policy=\"never\"",
    "-c", "features.apps=false", "-c", "web_search=\"live\"", "-c", "project_doc_max_bytes=0",
    "--cd", directory, "--output-schema", path.join(scripts, schemaName), "--output-last-message", output, "-"];
  await writeFile(path.join(directory, `${name}-prompt.txt`), prompt, { mode: 0o600 });
  await new Promise((resolve, reject) => {
    const child = spawn(codexPath, args, { env: { HOME: os.homedir(), PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", TMPDIR: os.tmpdir() }, stdio: ["pipe", "ignore", "pipe"] });
    let errors = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 30 * 60_000);
    child.stderr.on("data", (chunk) => { errors = (errors + chunk).slice(-6000); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Codex ${name} exited ${code}: ${errors}`)); });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
  return JSON.parse(await readFile(output, "utf8"));
}

async function prepareProposal(api, health, base, directory, state) {
  const upstreamSha = await resolveCommitSha(api, health.latest);
  for (const [name, repository, sha] of [["builder", REPOSITORY, base], ["upstream", "pingdotgg/t3code", upstreamSha]]) {
    const checkout = path.join(directory, name);
    await mkdir(checkout);
    await exec("/usr/bin/git", ["init", checkout]);
    await exec("/usr/bin/git", ["-C", checkout, "fetch", "--depth=1", `https://github.com/${repository}.git`, sha], { timeout: 180_000, maxBuffer: 2_000_000 });
    await exec("/usr/bin/git", ["-C", checkout, "checkout", "--detach", "FETCH_HEAD"]);
  }
  const mobilePackage = JSON.parse(await content(api, "pingdotgg/t3code", "apps/mobile/package.json", upstreamSha));
  const evidence = {
    base, upstreamSha, tag: health.latest, mobilePackage,
    failureLog: (await gh(["run", "view", String(health.run.id), "--repo", REPOSITORY, "--log-failed"])).slice(-100_000),
    rendererEvidence: await rendererEvidence(mobilePackage, directory),
    previousAttempt: state.lastFailedCandidate ?? null,
    previousError: state.lastError ?? null,
  };
  if (state.lastFailedCandidate?.tag === health.latest) {
    const runs = await api(`${root}/actions/workflows/verify-repair.yml/runs?per_page=30`);
    const prior = runs.workflow_runs.find((r) => r.display_title === `Verify repair ${state.lastFailedCandidate.sha}` && r.conclusion === "failure");
    if (prior) evidence.previousVerificationFailure = (await gh(["run", "view", String(prior.id), "--repo", REPOSITORY, "--log-failed"])).slice(-100_000);
  }
  const prompt = await readFile(path.join(scripts, "repair-prompt.md"), "utf8");
  const proposal = await runAgent(directory, "proposal", `${prompt}\n${JSON.stringify(evidence)}`, "repair-response.schema.json");
  const originals = {};
  for (const file of proposal.files ?? []) {
    if (!validRepositoryPath(file.path)) throw new Error("Invalid proposed repository path");
    try { originals[file.path] = await content(api, REPOSITORY, file.path, base); }
    catch (error) { if (error.status !== 404) throw error; originals[file.path] = null; }
  }
  const files = validateProposal(proposal, originals);
  const reviewPrompt = await readFile(path.join(scripts, "repair-review-prompt.md"), "utf8");
  const review = await runAgent(directory, "review", `${reviewPrompt}\n${JSON.stringify({ evidence, proposal })}`, "repair-review.schema.json");
  if (review.approved !== true) throw new Error(`Repair review rejected: ${review.reason}`);
  return { files, summary: proposal.summary };
}

async function candidateCommit(api, base, files, tag) {
  const commit = await api(`${root}/git/commits/${base}`);
  const originalTree = await api(`${root}/git/trees/${commit.tree.sha}?recursive=1`);
  if (originalTree.truncated) throw new Error("Cannot preserve file modes from a truncated tree");
  const modes = new Map(originalTree.tree.map((entry) => [entry.path, entry.mode]));
  const tree = await api(`${root}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha,
    tree: files.map((f) => ({ path: f.path, mode: modes.get(f.path) ?? "100644", type: "blob", ...(f.content === null ? { sha: null } : { content: f.content }) })) }) });
  const candidate = await api(`${root}/git/commits`, { method: "POST", body: JSON.stringify({ message: `Repair Android nightly delivery for ${tag}`, tree: tree.sha, parents: [base] }) });
  await validateRemoteCandidate(api, base, candidate.sha);
  const branch = `auto-repair/${tag}-${candidate.sha.slice(0, 10)}`;
  await api(`${root}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: candidate.sha }) });
  return { base, sha: candidate.sha, branch, tag, createdAt: Date.now(), stage: "verify" };
}

async function validateRemoteCandidate(api, base, sha) {
  const comparison = await api(`${root}/compare/${base}...${sha}`);
  validateCandidateDiff(comparison, base);
}

export async function reconcile(api, state, save = (value) => writeState(statePath, value)) {
  const pending = state.pending;
  if (pending.stage === "publish") {
    const ref = await api(`${root}/git/ref/heads/main`);
    if (ref.object.sha !== pending.sha) throw new Error("Main moved before repaired publication; fresh verification required");
    const runs = await api(`${root}/actions/workflows/android-nightly.yml/runs?branch=main&per_page=30`);
    const dispatched = runs.workflow_runs.some((r) => r.head_sha === pending.sha && r.event === "workflow_dispatch");
    if (!dispatched) await api(`${root}/actions/workflows/android-nightly.yml/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main", inputs: { upstream_tag: pending.tag } }) });
    state.lastResult = `Promoted verified repair ${pending.sha}; publication dispatched for ${pending.tag}`;
    state.lastError = null;
    state.pending = null;
    await save(state);
    return;
  }
  if (Date.now() - pending.createdAt > 3 * 60 * 60_000) throw new Error("Repair verification timed out after three hours");
  const runs = await api(`${root}/actions/workflows/verify-repair.yml/runs?branch=main&per_page=30`);
  const run = runs.workflow_runs.find((r) => r.display_title === `Verify repair ${pending.sha}` && r.event === "workflow_dispatch");
  if (!run) {
    if (pending.dispatchedAt && Date.now() - pending.dispatchedAt < 10 * 60_000) return;
    pending.dispatchedAt = Date.now();
    await save(state);
    await api(`${root}/actions/workflows/verify-repair.yml/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main",
      inputs: { upstream_tag: pending.tag, base_sha: pending.base, candidate_sha: pending.sha } }) });
    return;
  }
  if (run.status !== "completed") return;
  const jobs = await api(`${root}/actions/runs/${run.id}/jobs?per_page=100`);
  validateVerification(run, jobs.jobs, pending.sha);
  if (run.head_sha !== pending.base) throw new Error("Verification did not use the original trusted base");
  await validateRemoteCandidate(api, pending.base, pending.sha);
  const ref = await api(`${root}/git/ref/heads/main`);
  if (ref.object.sha !== pending.base && ref.object.sha !== pending.sha) throw new Error("Main changed during repair; refusing stale promotion");
  // Fast-forward only. A concurrent main update makes this request fail safely.
  if (ref.object.sha !== pending.sha) await api(`${root}/git/refs/heads/main`, { method: "PATCH", body: JSON.stringify({ sha: pending.sha, force: false }) });
  pending.stage = "publish";
  await save(state);
  await reconcile(api, state, save);
}

async function main() {
  await mkdir(stateDirectory, { recursive: true });
  const lock = path.join(stateDirectory, "repair.lock");
  try { await writeFile(lock, String(process.pid), { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const pid = Number(await readFile(lock, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error("Invalid repair lock; maintenance required");
    try { process.kill(pid, 0); return; } catch (error) { if (error.code !== "ESRCH") throw error; }
    await unlink(lock);
    return; // Next scheduled tick acquires the recovered lock.
  }
  let state = { attempts: [] };
  let stateLoaded = false;
  let api;
  try {
    try { state = JSON.parse(await readFile(statePath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw new Error("Unreadable repair state; refusing to reset attempt limits"); }
    if (!Array.isArray(state.attempts)) throw new Error("Invalid repair attempt state");
    stateLoaded = true;
    const token = (await gh(["auth", "token"])).trim();
    api = githubApi(token);
    const health = await loadHealth(api);
    const decision = repairDecision(health, state);
    console.log(JSON.stringify({ at: new Date().toISOString(), decision, latest: health.latest, processed: health.processed }));
    if (decision === "verify") return await reconcile(api, state);
    if (decision !== "repair") return;
    if (health.stale && !health.failed) {
      const lastDispatch = state.lastCatchupDispatch ?? 0;
      if (Date.now() - lastDispatch < 60 * 60_000) return;
      state.lastCatchupDispatch = Date.now();
      await writeState(statePath, state);
      await api(`${root}/actions/workflows/android-nightly.yml/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main", inputs: { upstream_tag: health.latest } }) });
      console.log(`Dispatched missing nightly ${health.latest}`);
      return;
    }
    if (!health.run) throw new Error("No failed build evidence; dispatcher recovery is required");
    const base = (await api(`${root}/git/ref/heads/main`)).object.sha;
    state.attempts.push({ at: Date.now(), tag: health.latest, base });
    await writeState(statePath, state);
    const directory = await mkdtemp(path.join(stateDirectory, "repair-"));
    const proposal = await prepareProposal(api, health, base, directory, state);
    state.pending = await candidateCommit(api, base, proposal.files, health.latest);
    state.lastResult = proposal.summary;
    await writeState(statePath, state);
    await reconcile(api, state);
  } catch (error) {
    if (!stateLoaded) throw error;
    state.lastError = `${new Date().toISOString()} ${error.message}`;
    const retryable = error instanceof TypeError || error.status >= 500 || error.status === 429;
    if (state.pending && !retryable) {
      state.lastFailedCandidate = state.pending;
      state.pending = null;
    }
    await writeState(statePath, state);
    if (api && !retryable) {
      try {
        const issues = await api(`${root}/issues?state=open&per_page=100&creator=github-actions%5Bbot%5D`);
        const incident = issues.find((i) => i.body?.startsWith("<!-- t3code-delivery-health -->"));
        if (incident) await api(`${root}/issues/${incident.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Automatic repair could not complete.\n\n${error.message.slice(0, 4000)}\n\n${state.lastFailedCandidate ? `Candidate: https://github.com/${REPOSITORY}/commit/${state.lastFailedCandidate.sha}` : "The last working app release remains available."}` }) });
      } catch { /* The saved local error remains available if GitHub is unreachable. */ }
    }
    throw error;
  } finally { await unlink(lock); }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
