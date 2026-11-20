// GitHub remotes only: never pass credentials, arbitrary hosts or paths to the browser.
// Inspired by Over9k's local Git remote discovery, MIT © 2026 the Over9k authors.
export function githubUrl(url) {
  if (typeof url !== "string") return null;
  const m = /^(?:https?:\/\/(?:[^/@\s]+@)?github\.com\/|ssh:\/\/(?:git@)?github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(url.trim());
  if (!m || m[1] === "." || m[1] === ".." || m[2] === "." || m[2] === "..") return null;
  return `https://github.com/${m[1]}/${m[2]}`;
}
