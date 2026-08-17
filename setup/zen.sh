#!/usr/bin/env bash

set -euo pipefail

readonly repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly zen_root="${XDG_CONFIG_HOME:-${HOME}/.config}/zen"

profile="${1:-}"
if [[ -z "${profile}" ]]; then
  mapfile -t candidates < <(find "${zen_root}" -mindepth 1 -maxdepth 1 -type d -name '*.Default*' -print 2>/dev/null | sort)
  if [[ ${#candidates[@]} -eq 1 ]]; then
    profile="${candidates[0]}"
    printf 'Using the only discovered Zen profile: %s\n' "${profile}"
  else
    printf 'usage: %s /absolute/path/to/zen/profile\n' "$0" >&2
    printf 'Find the active profile in Zen at about:support (Profile Directory).\n' >&2
    if [[ ${#candidates[@]} -gt 0 ]]; then
      printf 'Discovered candidates:\n' >&2
      printf '  %s\n' "${candidates[@]}" >&2
    fi
    exit 2
  fi
fi

if [[ ! -d "${profile}" ]]; then
  printf 'error: Zen profile does not exist: %s\n' "${profile}" >&2
  exit 1
fi

profile="$(cd -- "${profile}" && pwd)"
readonly chrome_dir="${profile}/chrome"

if [[ -L "${chrome_dir}" ]]; then
  printf 'error: %s is a directory symlink; refusing to create a chrome/chrome layout\n' "${chrome_dir}" >&2
  printf 'Replace it with a real directory before rerunning this helper.\n' >&2
  exit 1
fi

mkdir -p -- "${chrome_dir}"

link_file() {
  local source="$1"
  local destination="$2"

  if [[ -L "${destination}" && "$(readlink -f -- "${destination}")" == "$(readlink -f -- "${source}")" ]]; then
    printf 'Already linked: %s\n' "${destination}"
    return
  fi
  if [[ -e "${destination}" || -L "${destination}" ]]; then
    printf 'error: refusing to overwrite existing profile file: %s\n' "${destination}" >&2
    exit 1
  fi

  ln -s -- "${source}" "${destination}"
  printf 'Linked: %s -> %s\n' "${destination}" "${source}"
}

link_file "${repo_dir}/browser/chrome/userChrome.css" "${chrome_dir}/userChrome.css"
link_file "${repo_dir}/browser/chrome/userContent.css" "${chrome_dir}/userContent.css"
link_file "${repo_dir}/browser/chrome/zen-themes.css" "${chrome_dir}/zen-themes.css"
link_file "${repo_dir}/browser/user.js" "${profile}/user.js"

printf 'Restart Zen so user.js preferences and profile CSS are loaded.\n'
