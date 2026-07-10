
# My Dotfiles Setup Guide

This guide is for setting up a brand new Windows computer.

The installer (`install.sh`) handles almost all of the Linux/WSL configuration, but there are still a few Windows and GitHub steps you must do manually.

---

# Step 1 – Windows (PowerShell)

Run PowerShell **as Administrator**.

Install WSL with Ubuntu:

```powershell
wsl --install -d Ubuntu
```

Install WezTerm:

```powershell
winget install --id wez.wezterm
```

Also install manually:

- Hack Nerd Font (Windows)
- Docker Desktop (optional)

Restart if Windows asks.

---

# Step 2 – Open Ubuntu

Launch Ubuntu once.

Create your Linux username and password.

I recommend using the same username on every machine.

---

# Step 3 – Install Git

Inside **Ubuntu / WSL**:

```bash
sudo apt update
sudo apt install -y git gh
```

---

# Step 4 – Login to GitHub

Still in WSL:

```bash
gh auth login
```

Choose:

- GitHub.com
- HTTPS
- Login with browser

Configure Git:

```bash
git config --global user.name "YOUR_GITHUB_USERNAME"
git config --global user.email "YOUR_EMAIL"
```

---

# Step 5 – Clone this repository

```bash
mkdir -p ~/github
cd ~/github

git clone https://github.com/YOUR_USERNAME/my-dotfiles.git
cd my-dotfiles
```

Replace `YOUR_USERNAME` with your GitHub username.

---

# Step 6 – Run the installer

Still inside **WSL**:

```bash
chmod +x install.sh
./install.sh
```

The installer will automatically:

- install Zsh
- install Neovim
- install Starship
- install Node via NVM
- install pnpm
- install Python tools
- install uv
- install Codex CLI
- install common development packages
- create symbolic links
- set Zsh as the default shell

When it finishes, either restart WezTerm or run:

```bash
exec zsh
```

---

# Step 7 – Copy the WezTerm configuration

Open **Windows PowerShell**.

Copy the config from WSL into the Windows location WezTerm reads:

```powershell
wsl cp ~/github/my-dotfiles/windows/wezterm/wezterm.lua /mnt/c/Users/<WindowsUser>/.wezterm.lua
```

Replace `<WindowsUser>` with your Windows username.

Restart WezTerm.

---

# Step 8 – Verify everything

Inside WSL:

```bash
echo $SHELL
echo $ZSH_VERSION

node --version
npm --version
pnpm --version

python3 --version
uv --version

codex --version
nvim --version
starship --version

git --version
gh auth status
```

Everything should print a version number.

---

# Step 9 – Sign into Codex

Run:

```bash
codex
```

Complete the browser login if prompted.

---

# Updating this repository

Whenever you change your dotfiles:

```bash
cd ~/github/my-dotfiles

git status
git add .
git commit -m "Describe the change"
git push
```

If you changed:

```
windows/wezterm/wezterm.lua
```

remember to copy it again to Windows:

```powershell
wsl cp ~/github/my-dotfiles/windows/wezterm/wezterm.lua /mnt/c/Users/<WindowsUser>/.wezterm.lua
```

and restart WezTerm.

---

# Notes

- Run `install.sh` **inside WSL**, never in Windows PowerShell.
- Do **not** run `source ~/.zshrc` from Bash.
- If needed, enter Zsh first:

```bash
zsh
source ~/.zshrc
```

Normally you won't need to source it manually because `exec zsh` or reopening WezTerm reloads it automatically.
