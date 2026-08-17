#!/usr/bin/env bash

set -euo pipefail

readonly theme='Bibata-Modern-Ice'
readonly size=24

if ! command -v gsettings >/dev/null 2>&1; then
  printf 'error: gsettings is required (install glib2)\n' >&2
  exit 1
fi

if [[ ! -e "/usr/share/icons/${theme}/index.theme" \
  && ! -e "${HOME}/.local/share/icons/${theme}/index.theme" \
  && ! -e "${HOME}/.icons/${theme}/index.theme" ]]; then
  printf 'error: %s is not installed\n' "${theme}" >&2
  printf 'Install it with: yay -S --needed bibata-cursor-theme-bin\n' >&2
  exit 1
fi

# Keep GTK applications in sync with Hyprland's XCURSOR_* environment.
gsettings set org.gnome.desktop.interface cursor-theme "${theme}"
gsettings set org.gnome.desktop.interface cursor-size "${size}"

printf 'GTK cursor: %s, size %s\n' "${theme}" "${size}"
printf 'Hyprland uses the same XCursor theme and disables Hyprcursor.\n'
