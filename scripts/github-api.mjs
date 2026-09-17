import { setTimeout as sleep } from "node:timers/promises";

const API_ORIGIN = "https://api.github.com";
const TRANSIENT_CODES = new Set([
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED",
]);

export class GitHubApiError extends Error {
  constructor(method, url, status, body) {
    super(`GitHub API ${method} ${url} failed: ${status} ${body}`);
    this.name = "GitHubApiError";
    this.status = status;
    this.body = body;
  }
}

export function isTransientGitHubError(error) {
  if (error instanceof GitHubApiError) {
    return [408, 500, 502, 503, 504].includes(error.status);
  }
  return error?.name === "TimeoutError" ||
    TRANSIENT_CODES.has(error?.code) ||
    (error?.name === "TypeError" && TRANSIENT_CODES.has(error?.cause?.code));
}

export async function retryGitHub(operation, { wait = sleep } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 3 || !isTransientGitHubError(error)) throw error;
      await wait(1000 * 2 ** (attempt - 1));
    }
  }
}

export function githubApi(token, { wait = sleep, timeoutMs = 120_000 } = {}) {
  if (!token) {
    throw new Error("GITHUB_TOKEN is required");
  }

  return async function api(path, options = {}) {
    const url = path.startsWith("https://") ? path : `${API_ORIGIN}${path}`;
    const method = (options.method ?? "GET").toUpperCase();
    const request = async () => {
      options.signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;
      const response = await fetch(url, {
        ...options,
        signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "t3code-android-nightly-builder",
          ...options.headers,
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new GitHubApiError(method, url, response.status, body);
      }

      if (response.status === 204) return null;
      return response.json();
    };

    // A lost write response does not imply the write failed. The publisher
    // reconciles mutations before retrying; only reads are replayed here.
    return method === "GET" ? retryGitHub(request, { wait }) : request();
  };
}
