#!/usr/bin/env bash

set -euo pipefail

readonly theme='Catppuccin-SE'
readonly icons_dir="${XDG_DATA_HOME:-${HOME}/.local/share}/icons"
readonly destination="${icons_dir}/${theme}"
readonly release_url='https://github.com/ljmill/catppuccin-icons/releases/latest/download/Catppuccin-SE.tar.bz2'

if [[ -f "${destination}/index.theme" ]]; then
  printf '%s is installed at %s\n' "${theme}" "${destination}"
  exit 0
fi

if [[ "${1:-}" != '--install' ]]; then
  printf '%s is not installed.\n' "${theme}"
  printf 'The repository main branch does not contain the installable theme.\n'
  printf 'Run %s --install to download the latest release asset from:\n%s\n' "$0" "${release_url}"
  exit 1
fi

if [[ $# -ne 1 ]]; then
  printf 'usage: %s [--install]\n' "$0" >&2
  exit 2
fi

command -v curl >/dev/null 2>&1 || {
  printf 'error: curl is required for --install\n' >&2
  exit 1
}
command -v tar >/dev/null 2>&1 || {
  printf 'error: tar is required for --install\n' >&2
  exit 1
}

if [[ -e "${destination}" || -L "${destination}" ]]; then
  printf 'error: refusing to overwrite existing path: %s\n' "${destination}" >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
trap 'rm -rf -- "${temp_dir}"' EXIT
readonly archive="${temp_dir}/Catppuccin-SE.tar.bz2"
readonly extract_dir="${temp_dir}/extract"

printf 'Downloading the latest Catppuccin-SE release asset...\n'
curl --fail --location --show-error --output "${archive}" "${release_url}"

while IFS= read -r member; do
  if [[ "${member}" == /* || "/${member}/" == *'/../'* ]]; then
    printf 'error: release archive contains an unsafe path: %s\n' "${member}" >&2
    exit 1
  fi
done < <(tar -tjf "${archive}")

mkdir -p -- "${extract_dir}"
tar -xjf "${archive}" -C "${extract_dir}"
theme_dir="$(find "${extract_dir}" -type f -name index.theme -printf '%h\n' | awk -F/ '$NF == "Catppuccin-SE" { print; exit }')"

if [[ -z "${theme_dir}" ]]; then
  printf 'error: release archive did not contain %s/index.theme\n' "${theme}" >&2
  exit 1
fi

mkdir -p -- "${icons_dir}"
mv -- "${theme_dir}" "${destination}"
printf 'Installed %s at %s\n' "${theme}" "${destination}"
