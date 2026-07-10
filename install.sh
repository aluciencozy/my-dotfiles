#!/usr/bin/env bash
set -e

echo "== Installing packages =="

sudo apt update
sudo apt install -y build-essential curl wget unzip zip git gh zsh neovim ripgrep fd-find fzf jq stow tree shellcheck zsh-autosuggestions zsh-syntax-highlighting python3 python3-pip python3-venv python3-dev pipx sqlite3 postgresql-client redis-tools lazygit xclip

mkdir -p ~/.local/bin
ln -sf "$(command -v fdfind)" ~/.local/bin/fd || true

echo "== Installing Starship =="
if ! command -v starship >/dev/null; then
  curl -sS https://starship.rs/install.sh | sh -s -- -y
fi

echo "== Installing NVM =="
export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install --lts
nvm alias default 'lts/*'
corepack enable
corepack prepare pnpm@latest --activate

npm install -g @openai/codex typescript tsx prettier eslint

curl -LsSf https://astral.sh/uv/install.sh | sh

mkdir -p ~/.config

backup() {
  if [ -e "$1" ] && [ ! -L "$1" ]; then
    mv "$1" "$1.backup.$(date +%s)"
  fi
}

backup ~/.zshrc
backup ~/.config/nvim
backup ~/.config/starship.toml

ln -snf "$PWD/home/.zshrc" ~/.zshrc
ln -snf "$PWD/home/.config/nvim" ~/.config/nvim
ln -snf "$PWD/home/.config/starship.toml" ~/.config/starship.toml

chsh -s "$(which zsh)" || true

echo
echo "Done!"
echo "Restart WezTerm or run: exec zsh"
echo "Remember to copy windows/wezterm/wezterm.lua to C:\Users\<user>\.wezterm.lua"
