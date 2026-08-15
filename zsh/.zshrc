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

# monitor brightness fix
monitor-fix() {
    hyprctl eval 'hl.monitor({
        output = "HDMI-A-1",
        mode = "1920x1080@144",
        position = "4340x0",
        scale = 1
    })'

    sleep 0.5

    hyprctl eval 'hl.monitor({
        output = "HDMI-A-1",
        mode = "1920x1080@165",
        position = "4340x0",
        scale = 1
    })'
}

alias starship-which='basename "$(dirname "$(readlink -f ~/.config/starship.toml)")"'
alias starship-omer='cd ~/github/dotfiles && stow -D starship-custom 2>/dev/null; stow starship-omer'
alias starship-custom='cd ~/github/dotfiles && stow -D starship-omer 2>/dev/null; stow starship-custom'
