#!/usr/bin/env bash

set -u

missing=0

check_command() {
  local command_name="$1"
  if command -v "${command_name}" >/dev/null 2>&1; then
    printf '[ok]      %s\n' "${command_name}"
  else
    printf '[missing] %s\n' "${command_name}"
    missing=1
  fi
}

printf 'Host: %s\nKernel: %s\nShell: %s\n\n' "$(hostname)" "$(uname -r)" "${SHELL:-unknown}"

printf 'Core restore tools\n'
for command_name in git stow zsh yay; do
  check_command "${command_name}"
done

printf '\nDevelopment and desktop tools\n'
for command_name in node npm python go rustc gh nvim tmux starship codex docker ghostty fc-match; do
  check_command "${command_name}"
done

printf '\nFont resolution\n'
if command -v fc-match >/dev/null 2>&1; then
  fc-match 'Dotfiles Mono'
  fc-match 'Dotfiles Mono:style=ExtraBold'
fi

printf '\nTheme assets\n'
for path in \
  "${HOME}/.local/share/themes/catppuccin-macchiato-lavender-standard+default" \
  "${HOME}/.local/share/icons/Catppuccin-SE/index.theme"; do
  if [[ -e "${path}" ]]; then
    printf '[ok]      %s\n' "${path}"
  else
    printf '[missing] %s\n' "${path}"
    missing=1
  fi
done

if [[ -e '/usr/share/icons/Bibata-Modern-Ice/index.theme' \
  || -e "${HOME}/.local/share/icons/Bibata-Modern-Ice/index.theme" \
  || -e "${HOME}/.icons/Bibata-Modern-Ice/index.theme" ]]; then
  printf '[ok]      Bibata-Modern-Ice\n'
else
  printf '[missing] Bibata-Modern-Ice\n'
  missing=1
fi

printf '\nDocker policy\n'
if command -v systemctl >/dev/null 2>&1 && command -v docker >/dev/null 2>&1; then
  docker_enabled="$(systemctl is-enabled docker.service 2>/dev/null || true)"
  docker_active="$(systemctl is-active docker.service 2>/dev/null || true)"
  printf 'enabled: %s\n' "${docker_enabled:-unknown}"
  printf 'active:  %s\n' "${docker_active:-unknown}"
  printf 'This repo intentionally does not enable or start Docker.\n'
fi

exit "${missing}"
