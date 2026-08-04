#!/usr/bin/env bash
set -Eeuo pipefail

# Run this script from any directory. All paths below are resolved from the
# repository containing the script, not from the caller's current directory.
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

node_version="${NODE_VERSION:-24.18.0}"
pnpm_version="${PNPM_VERSION:-11.11.0}"
codex_version="${CODEX_VERSION:-0.145.0}"
typescript_version="${TYPESCRIPT_VERSION:-7.0.2}"
tsx_version="${TSX_VERSION:-4.23.0}"
prettier_version="${PRETTIER_VERSION:-3.9.5}"
eslint_version="${ESLINT_VERSION:-10.6.0}"

echo "== Installing Ubuntu packages =="
sudo apt-get update
sudo apt-get install -y \
  ca-certificates \
  build-essential \
  tree-sitter-cli \
  curl \
  wget \
  unzip \
  zip \
  git \
  gh \
  zsh \
  neovim \
  ripgrep \
  fd-find \
  fzf \
  jq \
  stow \
  tree \
  shellcheck \
  zsh-autosuggestions \
  zsh-syntax-highlighting \
  python3 \
  python3-pip \
  python3-venv \
  python3-dev \
  pipx \
  sqlite3 \
  postgresql-client \
  redis-tools \
  lazygit \
  tmux \
  xclip

mkdir -p "$HOME/.local/bin" "$HOME/.config"
export PATH="$HOME/.local/bin:$PATH"

if command -v fdfind >/dev/null 2>&1; then
  ln -sfn "$(command -v fdfind)" "$HOME/.local/bin/fd"
fi

echo "== Checking Neovim =="
nvim --headless -u NONE \
  '+lua local v = vim.version(); assert(v.major > 0 or v.minor >= 11, "Neovim 0.11 or newer is required")' \
  +qa

echo "== Installing Starship =="
if ! command -v starship >/dev/null 2>&1; then
  curl -fsSL https://starship.rs/install.sh | sh -s -- -y
fi

echo "== Installing NVM and Node.js $node_version =="
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash
fi

# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm install "$node_version"
nvm alias default "$node_version"
nvm use "$node_version" >/dev/null

echo "== Installing Node.js tools =="
corepack enable
corepack install --global "pnpm@$pnpm_version"
npm install --global \
  "@openai/codex@$codex_version" \
  "typescript@$typescript_version" \
  "tsx@$tsx_version" \
  "prettier@$prettier_version" \
  "eslint@$eslint_version"

echo "== Installing uv =="
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi

echo "== Installing Herdr =="
if ! command -v herdr >/dev/null 2>&1; then
  curl -fsSL https://herdr.dev/install.sh | sh
fi

backup() {
  local target="$1"
  local backup_path

  if [ -e "$target" ] && [ ! -L "$target" ]; then
    backup_path="$target.backup.$(date +%Y%m%d%H%M%S)"
    while [ -e "$backup_path" ]; do
      backup_path="$target.backup.$(date +%Y%m%d%H%M%S%N)"
    done
    echo "Backing up $target to $backup_path"
    mv -- "$target" "$backup_path"
  fi
}

link_config() {
  local source="$1"
  local target="$2"

  mkdir -p "$(dirname -- "$target")"
  backup "$target"

  if [ -L "$target" ]; then
    if [ "$(readlink -- "$target")" = "$source" ]; then
      return
    fi
    unlink "$target"
  fi

  ln -s -- "$source" "$target"
}

echo "== Linking dotfiles =="
link_config "$repo_dir/home/.zshrc" "$HOME/.zshrc"
link_config "$repo_dir/home/.config/nvim" "$HOME/.config/nvim"
link_config "$repo_dir/home/.config/starship.toml" "$HOME/.config/starship.toml"
link_config "$repo_dir/herdr/config.toml" "$HOME/.config/herdr/config.toml"

echo "== Installing Neovim plugins and Mason tools =="
nvim --headless -u "$repo_dir/home/.config/nvim/init.lua" \
  '+Lazy! sync' \
  '+MasonToolsInstall' \
  +qa

chsh -s "$(command -v zsh)" "$USER" || true

echo
echo "Done. Restart your shell with: exec zsh"
echo "Default Neovim theme: Catppuccin"
echo "Permanent theme setting: home/.config/nvim/lua/vim_config.lua"
echo "Switch themes for one session with: NVIM_THEME=tokyonight nvim"
echo "Starship palette: Catppuccin Mocha"
echo "Copy windows/wezterm/wezterm.lua to your Windows home directory for WezTerm."
