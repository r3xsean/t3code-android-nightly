export const REPAIR_MODEL = "gpt-6-astra";
export const REPAIR_EFFORT = "high";
export const MAX_DAILY_REPAIRS = 2;

export function validRepositoryPath(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.\/-]+$/.test(value) && !value.startsWith("/") && value.split("/").every((part) => part && part !== "." && part !== ".." && part !== ".git");
}

export function validateProposal(proposal, originals) {
  if (proposal.status === "blocked") throw new Error(`Repair requires maintenance: ${proposal.summary}`);
  if (proposal.status !== "patch" || !Array.isArray(proposal.files) || !proposal.files.length) throw new Error("Repair returned no patch");
  const seen = new Set();
  for (const file of proposal.files) {
    if (!validRepositoryPath(file.path) || seen.has(file.path)) throw new Error(`Invalid or duplicate repository path: ${file.path}`);
    seen.add(file.path);
    if (file.content !== null && (typeof file.content !== "string" || Buffer.byteLength(file.content) > 2_000_000)) throw new Error("Invalid repair content");
    if (file.content === originals[file.path]) throw new Error("Repair did not change the compatibility adapter");
  }
  return proposal.files;
}

export function repairDecision(health, state, now = Date.now()) {
  if (state.pending) return "verify";
  if (health.current || health.active || !health.unhealthy) return "idle";
  const attempts = state.attempts ?? [];
  if (attempts.filter((a) => now - a.at < 86_400_000).length >= MAX_DAILY_REPAIRS) return "budget-exhausted";
  if (attempts.filter((a) => a.tag === health.latest).length >= 2) return "tag-exhausted";
  return "repair";
}

export function validateCandidateDiff(comparison, base) {
  if (comparison.status !== "ahead" || comparison.ahead_by !== 1 || comparison.behind_by !== 0 || comparison.commits?.length !== 1 || comparison.commits[0].parents?.length !== 1 || comparison.commits[0].parents[0].sha !== base) throw new Error("Repair candidate is not one commit directly above its trusted base");
  if (!comparison.files?.length || comparison.files.length >= 300 || comparison.files.some((f) => !validRepositoryPath(f.filename))) throw new Error("Invalid or incomplete candidate diff");
}

export function validateVerification(run, jobs, candidateSha) {
  if (run.display_title !== `Verify repair ${candidateSha}` || run.status !== "completed" || run.conclusion !== "success" || run.event !== "workflow_dispatch" || run.head_branch !== "main" || run.path !== ".github/workflows/verify-repair.yml") throw new Error("Candidate has no matching successful independent verification run");
  const build = jobs.find((j) => j.name === "Build candidate APK");
  if (build?.conclusion !== "success" || !build.steps?.some((s) => s.name === "Compile release APK" && s.conclusion === "success")) throw new Error("Verification did not compile a real Android APK");
  for (const job of jobs.filter((j) => /^(Sign native|Publish |Record successful)/.test(j.name))) {
    if (job.conclusion !== "skipped") throw new Error("Verification unexpectedly entered a publishing job");
  }
  if (!jobs.some((j) => j.name === "Verify candidate artifact" && j.conclusion === "success")) throw new Error("Independent APK verification did not pass");
}
