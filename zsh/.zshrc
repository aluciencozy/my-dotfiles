# Prevent CachyOS's cached Powerlevel10k prompt from flashing before Starship.
typeset -g POWERLEVEL9K_INSTANT_PROMPT=off
source /usr/share/cachyos-zsh-config/cachyos-config.zsh

# CachyOS loads Powerlevel10k unconditionally. Keep its shell plugins and
# aliases, but remove its prompt hooks so Starship is the only prompt engine.
if (( $+functions[prompt_powerlevel9k_teardown] )); then
  prompt_powerlevel9k_teardown
fi

source /usr/share/nvm/init-nvm.sh

setopt prompt_subst

if (( $+commands[zoxide] )); then
  eval "$(zoxide init zsh)"
fi

if (( $+commands[atuin] )); then
  eval "$(atuin init zsh)"
fi

eval "$(starship init zsh)"

alias starship-which='basename "$(dirname "$(readlink -f ~/.config/starship.toml)")"'
alias starship-omer='cd ~/github/dotfiles && stow -D starship-custom 2>/dev/null; stow starship-omer'
alias starship-custom='cd ~/github/dotfiles && stow -D starship-omer 2>/dev/null; stow starship-custom'

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
