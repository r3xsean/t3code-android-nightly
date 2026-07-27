const API_ORIGIN = "https://api.github.com";

export function githubApi(token) {
  if (!token) {
    throw new Error("GITHUB_TOKEN is required");
  }

  return async function api(path, options = {}) {
    const url = path.startsWith("https://") ? path : `${API_ORIGIN}${path}`;
    const response = await fetch(url, {
      ...options,
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
      throw new Error(
        `GitHub API ${options.method ?? "GET"} ${url} failed: ${response.status} ${body}`,
      );
    }

    if (response.status === 204) {
      return null;
    }
    return response.json();
  };
}
