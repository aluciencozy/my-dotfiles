# Add personal executables to PATH
export PATH="$HOME/.local/bin:$PATH"

# Google Cloud SDK
if [ -d "$HOME/google-cloud-sdk/bin" ]; then
  export PATH="$HOME/google-cloud-sdk/bin:$PATH"
fi

# Default editor
export EDITOR="nvim"
export VISUAL="nvim"

# Command history
HISTFILE="$HOME/.zsh_history"
HISTSIZE=10000
SAVEHIST=10000

setopt HIST_IGNORE_DUPS
setopt SHARE_HISTORY
setopt AUTO_CD

# Completion
autoload -Uz compinit
compinit

# Zsh plugins installed through apt
source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh
source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# Accept autosuggestion with Ctrl+F
bindkey '^f' autosuggest-accept

# General aliases
alias ..='cd ..'
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
alias cls='clear'
alias w='exec powershell.exe -NoExit -Command "cd ~"'

# Git aliases
alias add='git add .'
alias push='git push'
alias pull='git pull'
alias m='git switch main'
alias pre='git switch pre-prod'
alias gs='git status'
alias gd='git diff'
alias gl='git log --oneline --graph --decorate'
alias gb='git branch'
alias gf='git fetch origin'

# Ubuntu names fd as fdfind
alias fd='fdfind'

# Start Starship
eval "$(starship init zsh)"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

gc() {
  git commit -m "$*"
}
