# ---------------------------------------------------------
# CachyOS / Oh My Zsh
# ---------------------------------------------------------

# Prevent CachyOS's Powerlevel10k instant prompt from flashing
# before Starship.
typeset -g POWERLEVEL9K_INSTANT_PROMPT=off

source /usr/share/cachyos-zsh-config/cachyos-config.zsh

# CachyOS loads Powerlevel10k. Keep its shell plugins and aliases,
# but remove the prompt so Starship is the only prompt engine.
if (( $+functions[prompt_powerlevel9k_teardown] )); then
  prompt_powerlevel9k_teardown
fi


# ---------------------------------------------------------
# Environment
# ---------------------------------------------------------

export PATH="$HOME/.local/bin:$PATH"

export EDITOR="nvim"
export VISUAL="nvim"

# Google Cloud SDK, when installed manually here.
if [[ -d "$HOME/google-cloud-sdk/bin" ]]; then
  export PATH="$HOME/google-cloud-sdk/bin:$PATH"
fi


# ---------------------------------------------------------
# Node
# ---------------------------------------------------------

source /usr/share/nvm/init-nvm.sh


# ---------------------------------------------------------
# Shell behavior
# ---------------------------------------------------------

setopt AUTO_CD

# Case-insensitive completion.
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'

# Accept the current autosuggestion.
bindkey '^f' autosuggest-accept

# Search history based on what has already been typed.
bindkey '^[[A' history-substring-search-up
bindkey '^[[B' history-substring-search-down

# Vim-style shell editing
bindkey -v
KEYTIMEOUT=1

# Ctrl+F accepts autosuggestion while typing
bindkey -M viins '^F' autosuggest-accept

# ---------------------------------------------------------
# Navigation
# ---------------------------------------------------------

alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'

alias cls='clear'
alias c='clear'


# ---------------------------------------------------------
# Files
# ---------------------------------------------------------

# Use modern tools when they're installed without replacing
# fundamental Unix commands like `cat`.
if (( $+commands[eza] )); then
  alias l='eza -la --icons --git'
  alias ll='eza -la --icons --git'
  alias lt='eza --tree --level=2 --icons --git'
  alias ltree='eza --tree --level=2 --icons --git'
else
  alias l='ls -CF'
  alias ll='ls -alF'
fi

if (( $+commands[yazi] )); then
  alias y='yazi'
fi


# ---------------------------------------------------------
# Git
# ---------------------------------------------------------

# Git
alias lg='lazygit'
alias m='git switch main'
alias pre='git switch pre-prod'


# ---------------------------------------------------------
# Docker
# ---------------------------------------------------------

alias dco='docker compose'
alias dps='docker ps'
alias dpa='docker ps -a'
alias dx='docker exec -it'
alias ld='lazydocker'


# ---------------------------------------------------------
# FZF helpers
# ---------------------------------------------------------

# Prefer fd over find for FZF's file list.
if (( $+commands[fd] )); then
  export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
fi

# Fuzzy-select a file and open it in Neovim.
fv() {
  local file

  file="$(
    fd --type f --hidden --exclude .git 2>/dev/null |
      fzf
  )" || return

  [[ -n "$file" ]] && nvim "$file"
}

# Fuzzy-select a directory and cd into it.
fcd() {
  local dir

  dir="$(
    fd --type d --hidden --exclude .git 2>/dev/null |
      fzf
  )" || return

  [[ -n "$dir" ]] && cd "$dir"
}


# ---------------------------------------------------------
# Modern shell tools
# ---------------------------------------------------------

if (( $+commands[zoxide] )); then
  eval "$(zoxide init zsh)"
fi

if (( $+commands[atuin] )); then
  eval "$(atuin init zsh)"
fi


# ---------------------------------------------------------
# Prompt
# ---------------------------------------------------------

eval "$(starship init zsh)"


# ---------------------------------------------------------
# Machine-specific helpers
# ---------------------------------------------------------

# Work around Sceptre monitor brightness bug by toggling refresh rate.
# The current position, scale, resolution, and refresh rate are preserved.
monitor-fix() {
    local output="HDMI-A-1"
    local width height x y scale refresh

    read -r width height x y scale refresh < <(
        hyprctl monitors -j | python3 -c '
import json
import sys

name = "HDMI-A-1"
monitor = next(
    (m for m in json.load(sys.stdin) if m["name"] == name),
    None,
)

if monitor is None:
    raise SystemExit(1)

print(
    monitor["width"],
    monitor["height"],
    monitor["x"],
    monitor["y"],
    monitor["scale"],
    monitor["refreshRate"],
)
'
    )

    if [[ -z "$width" ]]; then
        echo "monitor-fix: $output not found"
        return 1
    fi

    local resolution="${width}x${height}"
    local position="${x}x${y}"

    # Temporarily drop to 144 Hz.
    hyprctl eval "hl.monitor({
        output = \"$output\",
        mode = \"${resolution}@144\",
        position = \"$position\",
        scale = $scale
    })" >/dev/null

    sleep 0.5

    # Restore the refresh rate/configuration that was active before.
    hyprctl eval "hl.monitor({
        output = \"$output\",
        mode = \"${resolution}@${refresh}\",
        position = \"$position\",
        scale = $scale
    })" >/dev/null
}
