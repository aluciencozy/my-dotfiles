#!/usr/bin/env bash

set -euo pipefail

command -v fc-cache >/dev/null 2>&1 || {
  printf 'error: fc-cache is required (install fontconfig)\n' >&2
  exit 1
}
command -v fc-match >/dev/null 2>&1 || {
  printf 'error: fc-match is required (install fontconfig)\n' >&2
  exit 1
}

readonly config="${XDG_CONFIG_HOME:-${HOME}/.config}/fontconfig/fonts.conf"
if [[ ! -e "${config}" ]]; then
  printf 'error: %s is missing; run ./setup/stow.sh first\n' "${config}" >&2
  exit 1
fi

printf 'Rebuilding the Fontconfig cache...\n'
fc-cache -f

regular_match="$(fc-match 'Dotfiles Mono')"
extrabold_match="$(fc-match 'Dotfiles Mono:style=ExtraBold')"

printf 'Dotfiles Mono: %s\n' "${regular_match}"
printf 'Dotfiles Mono ExtraBold: %s\n' "${extrabold_match}"

if [[ "${regular_match}" != *JetBrainsMono* || "${extrabold_match}" != *JetBrainsMono* ]]; then
  printf 'error: Dotfiles Mono did not resolve to JetBrainsMono Nerd Font\n' >&2
  printf 'Install ttf-jetbrains-mono-nerd, then rerun this script.\n' >&2
  exit 1
fi
