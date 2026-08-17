#!/usr/bin/env bash

set -euo pipefail

readonly repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly config_target="${XDG_CONFIG_HOME:-${HOME}/.config}"

readonly -a config_packages=(
  atuin bat btop cava fastfetch fd fontconfig gh-dash ghostty git gtk
  hypr kitty kvantum lazydocker lazygit nvim pacseek rofi starship swaync
  television tmux waybar wiremix yazi
)
readonly -a home_packages=(gtk-theme zsh)

stow_args=(--dir="${repo_dir}" --no-folding)
dry_run=false
if [[ "${1:-}" == '--dry-run' ]]; then
  dry_run=true
  stow_args+=(--simulate --verbose=1)
elif [[ $# -ne 0 ]]; then
  printf 'usage: %s [--dry-run]\n' "$0" >&2
  exit 2
fi

command -v stow >/dev/null 2>&1 || {
  printf 'error: GNU Stow is not installed\n' >&2
  exit 1
}

if [[ ! -d "${config_target}" ]]; then
  if [[ "${dry_run}" == true ]]; then
    printf 'error: dry-run target does not exist: %s\n' "${config_target}" >&2
    exit 1
  fi
  mkdir -p -- "${config_target}"
fi

printf 'Stowing config packages into %s\n' "${config_target}"
stow "${stow_args[@]}" --target="${config_target}" "${config_packages[@]}"

printf 'Stowing home packages into %s\n' "${HOME}"
stow "${stow_args[@]}" --target="${HOME}" "${home_packages[@]}"

printf 'Done. Existing files are never adopted or overwritten by this helper.\n'
