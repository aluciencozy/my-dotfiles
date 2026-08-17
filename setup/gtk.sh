#!/usr/bin/env bash

set -euo pipefail

readonly theme='catppuccin-macchiato-lavender-standard+default'
readonly icons='Catppuccin-SE'
readonly font='Dotfiles Mono 10'

if ! command -v gsettings >/dev/null 2>&1; then
  printf 'error: gsettings is required (install glib2)\n' >&2
  exit 1
fi

if [[ ! -d "${HOME}/.local/share/themes/${theme}" ]]; then
  printf 'error: GTK theme is not installed: %s\n' "${theme}" >&2
  printf 'Run ./setup/stow.sh first (it stows gtk-theme into HOME).\n' >&2
  exit 1
fi

if [[ ! -f "${HOME}/.local/share/icons/${icons}/index.theme" ]]; then
  printf 'error: icon theme is not installed: %s\n' "${icons}" >&2
  printf 'Run ./setup/icons.sh for safe installation instructions.\n' >&2
  exit 1
fi

# GNOME / general GTK settings
gsettings set org.gnome.desktop.interface gtk-theme "$theme"
gsettings set org.gnome.desktop.interface icon-theme "$icons"
gsettings set org.gnome.desktop.interface font-name "$font"
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'

# Nemo is a Cinnamon application, so keep Cinnamon in sync too.
if [[ "$(gsettings writable org.cinnamon.desktop.interface gtk-theme 2>/dev/null || true)" == 'true' ]]; then
  gsettings set org.cinnamon.desktop.interface gtk-theme "$theme"
fi

printf 'GTK theme: %s\nIcon theme: %s\nFont: %s\n' "$theme" "$icons" "$font"
