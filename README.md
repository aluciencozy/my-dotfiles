# My Dotfiles

WSL-focused dotfiles for Zsh, Neovim, Starship, Herdr, and Windows WezTerm.
The Neovim setup is inspired primarily by [Hendrik's dotfiles](https://github.com/hendrikmi/dotfiles), with a few useful ideas from [Tony's Neovim config](https://github.com/tonybanters/nvim).

This repository deliberately avoids macOS-specific configuration and F-key mappings.

## Repository layout

```text
home/.zshrc                         -> ~/.zshrc
home/.config/nvim/                  -> ~/.config/nvim
home/.config/starship.toml          -> ~/.config/starship.toml
herdr/config.toml                   -> ~/.config/herdr/config.toml
windows/wezterm/wezterm.lua         Windows WezTerm config
```

There is only one WezTerm config in the repository now. It is intentionally not hidden: `windows/wezterm/wezterm.lua`. The old root `.wezterm.lua` was removed. Because WezTerm runs on Windows, the installer does not symlink this file into WSL; copy it to `%USERPROFILE%\\.wezterm.lua` from Windows instead.

The empty `.nvimlog` file was also removed.

## Install on WSL

From PowerShell, install WSL, Ubuntu, and WezTerm if needed:

```powershell
wsl --install -d Ubuntu
winget install --id wez.wezterm
```

Inside Ubuntu:

```bash
mkdir -p ~/github
cd ~/github
git clone https://github.com/YOUR_USERNAME/my-dotfiles.git
cd my-dotfiles
gh auth login
chmod +x install.sh
./install.sh
exec zsh
```

`install.sh` is safe to run again. Real files at the symlink targets are moved to timestamped `.backup.*` files before links are created. The links it manages are:

```text
~/.zshrc                         -> this repo/home/.zshrc
~/.config/nvim                   -> this repo/home/.config/nvim
~/.config/starship.toml          -> this repo/home/.config/starship.toml
~/.config/herdr/config.toml      -> this repo/herdr/config.toml
```

The installer includes the packages and tools already present in this environment:

- Ubuntu packages: Neovim, Git, GitHub CLI, Zsh, tmux, lazygit, ripgrep, fd, fzf, jq, stow, tree, tree-sitter-cli, shellcheck, Python, pipx, SQLite, PostgreSQL client, Redis tools, xclip, build tools, and the Zsh plugins.
- Starship, NVM, Node.js 24.18.0, pnpm 11.11.0, uv, and Herdr.
- Global npm tools: `@openai/codex@0.145.0`, `typescript@7.0.2`, `tsx@4.23.0`, `prettier@3.9.5`, and `eslint@10.6.0`.
- Neovim plugins, Treesitter parsers, LSP servers, formatters, completion sources, and snippets through lazy.nvim and Mason.

The Node and npm versions can be overridden when reinstalling:

```bash
NODE_VERSION=24.18.0 PNPM_VERSION=11.11.0 ./install.sh
```

After linking the Neovim config, the installer runs lazy.nvim synchronization and `MasonToolsInstall` so the editor dependencies do not require a separate manual setup.

## Neovim IDE features

- Treesitter highlighting, indentation, incremental selection, function/class/parameter textobjects, and movement between functions and classes.
- LSP configuration through native Neovim 0.11 APIs, nvim-lspconfig, Mason, and Mason LSP config.
- Servers for Lua, TypeScript/JavaScript, CSS, HTML, JSON, YAML, Bash, Docker, Docker Compose, Python, Ruff, Rust, SQL, and Terraform.
- nvim-cmp completion with LuaSnip and friendly-snippets.
- Conform formatting on save where a formatter is available, plus manual formatting.
- Snacks pickers, nvim-tree file browsing, lualine, Which-Key, diagnostics, Fidget LSP progress, Comment.nvim, Gitsigns, Neogit, Diffview, and persistent sessions.

Treesitter uses its stable `master` branch because this machine has Neovim 0.11.6. Hendrik's current `main` branch requires Neovim 0.12 or newer. The feature set and parser list are still based on his setup.

### Rust

Rust buffers use `rust_analyzer` for completion, diagnostics, navigation, code actions, and inlay hints. The server is installed through Mason on startup, and the Rust Treesitter parser is included in the parser list. Conform uses the Rust toolchain's `rustfmt` on save.

Make sure the Rust toolchain has the formatter and Clippy components:

```bash
rustup component add rustfmt clippy
```

If the server has not installed yet, run this inside Neovim:

```vim
:MasonInstall rust-analyzer
```

## Theme switching

Rose Pine Moon is the permanent default. The repository setting is in [vim_config.lua](home/.config/nvim/lua/vim_config.lua). After installation, the same file is available at `~/.config/nvim/lua/vim_config.lua`:

```lua
vim.g.dotfiles_theme = 'rose-pine-moon'
```

Change that value to one of these supported themes:

```text
rose-pine-moon
tokyonight
catppuccin-mocha
nord
```

All four theme plugins are loaded, so these commands switch themes immediately for the current Neovim session:

```vim
:colorscheme rose-pine-moon
:colorscheme tokyonight
:colorscheme catppuccin-mocha
:colorscheme nord
```

`:colorscheme` changes only the current session. To make a choice permanent, edit `vim.g.dotfiles_theme` in `vim_config.lua`. Environment variables are optional shortcuts that override the Lua default for one launch:

```bash
NVIM_THEME=tokyonight nvim
NVIM_THEME=catppuccin-mocha nvim
```

Neovim now uses a transparent background by default. The repository setting is in [vim_config.lua](home/.config/nvim/lua/vim_config.lua), and the installed path is `~/.config/nvim/lua/vim_config.lua`:

```lua
vim.g.dotfiles_transparent = true
```

For one launch only, use `NVIM_TRANSPARENT=1 nvim`. Use `NVIM_TRANSPARENT=0 nvim` to override the permanent setting for one launch.

If a newly added theme is not installed yet, run `:Lazy sync` once.

## Starship theme

Starship is now using a Rose Pine Moon palette. Its active palette is one line in [starship.toml](home/.config/starship.toml), or `~/.config/starship.toml` after installation:

```toml
palette = "rose_pine_moon"
```

Change it to `palette = "nord"` to switch back to the included Nord palette. The prompt uses separate Rose Pine roles for directory, Git, language, and status colors instead of mapping most sections to blue. Restart the shell with `exec zsh` after changing it.

## Herdr theme

Herdr uses its built-in Rose Pine theme without custom color overrides. The repository config is [herdr/config.toml](herdr/config.toml), and the installed path is `~/.config/herdr/config.toml`. Reload a running Herdr session after changes:

```bash
herdr server reload-config
```

## Neovim keybindings

The leader key is Space. These mappings use letters, punctuation, Ctrl, Alt, and normal Vim keys only. No F keys are required.

### Core editing

| Key | Action |
| --- | --- |
| `<C-s>` | Save |
| `<leader>sn` | Save without triggering format-on-save |
| `<Esc>` | Clear search highlights |
| `<C-q>` | Quit the current window |
| `<C-a>` | Select all |
| `jk` or `kj` | Leave insert mode |
| `<C-d>` / `<C-u>` | Scroll down/up and center |
| `n` / `N` | Next/previous search result and center |
| `<leader>lw` | Toggle line wrapping |
| `<leader>j` | Replace the word under the cursor repeatedly |
| `<leader>y` / `<leader>Y` | Yank selection/line to the system clipboard |
| `Alt-j` / `Alt-k` | Move selected text down/up |
| `p` in visual mode | Paste without replacing the yank register |

### Files, search, buffers, and windows

| Key | Action |
| --- | --- |
| `-` or `<leader>e` | Toggle the nvim-tree sidebar |
| `<leader>ef` | Find the current file in nvim-tree |
| `<leader>sf` | Find files |
| `<leader>sg` | Search text in the project |
| `<leader>sw` | Search the word under the cursor |
| `<leader>sh` | Search help tags |
| `<leader>/` | Search the current buffer |
| `<leader>sb` or `<leader><Tab>` | Pick a buffer |
| `<leader>so` | Recent files |
| `<leader>sr` | Resume the last picker |
| `<leader>sd` | Pick diagnostics |
| `<Tab>` / `<S-Tab>` | Next/previous buffer |
| `<leader>x` | Close the current buffer |
| `<leader>b` | Create a new buffer |
| `<C-h/j/k/l>` | Move between splits |
| `<leader>v` / `<leader>h` | Vertical/horizontal split |
| `<leader>se` | Equalize splits |
| `<leader>xs` | Close the current split |
| Arrow keys | Resize the current split |
| `<leader>to` / `<leader>tx` | Open/close a tab |
| `<leader>tn` / `<leader>tp` | Next/previous tab |

### LSP and diagnostics

These mappings appear when an LSP is attached to the current buffer.

| Key | Action |
| --- | --- |
| `gd` | Definitions picker |
| `gr` | References picker |
| `gI` | Implementations picker |
| `gD` | Declaration |
| `K` | Hover documentation |
| `<leader>D` | Type definitions picker |
| `<leader>ds` | Document symbols |
| `<leader>ws` | Workspace symbols |
| `<leader>rn` | Rename symbol |
| `<leader>ca` | Code action |
| `<leader>wa` / `<leader>wr` / `<leader>wl` | Add/remove/list workspace folders |
| `<leader>th` | Toggle inlay hints when supported |
| `<leader>lf` | Format the buffer |
| `[d` / `]d` | Previous/next diagnostic |
| `<leader>d` | Open diagnostic details |
| `<leader>q` | Send diagnostics to the location list |
| `<leader>do` | Enable/disable diagnostics |

### Completion and snippets

| Key | Action |
| --- | --- |
| `<C-Space>` | Open completion |
| `<C-j>` / `<C-k>` | Next/previous completion item |
| `<CR>` | Accept the selected item |
| `<C-e>` | Close completion |
| `<Tab>` / `<S-Tab>` | Select completion or move through a snippet |
| `<C-l>` / `<C-h>` | Move forward/backward through a snippet |

### Treesitter, comments, Git, and sessions

| Key | Action |
| --- | --- |
| `af` / `if` | Select around/inside a function |
| `ac` / `ic` | Select around/inside a class |
| `aa` / `ia` | Select around/inside a parameter |
| `]m` / `[m` | Next/previous function |
| `]]` / `[[` | Next/previous class |
| `gnn`, `grn`, `grc`, `grm` | Treesitter incremental selection |
| `<C-_>` or `<C-c>` | Toggle a comment |
| `<leader>g` | Open Neogit |
| `<leader>ss` / `<leader>sl` | Save/load the session in Neovim's state directory |

## WezTerm on Windows

From PowerShell, copy the one repository config to the Windows path WezTerm reads:

```powershell
wsl cp ~/github/my-dotfiles/windows/wezterm/wezterm.lua /mnt/c/Users/<WindowsUser>/.wezterm.lua
```

The Windows config uses Rose Pine Moon, Ctrl-Space as its leader, Alt-h/j/k/l for pane movement, and Ctrl-Shift-t/w for tabs and pane closing. Windows-specific symlink behavior is intentionally left outside the WSL installer.

## Verify and update

Useful checks after installation:

```bash
command -v zsh nvim node pnpm python3 uv herdr
nvim --version
nvim +checkhealth
gh auth status
git diff --check
```

Inside Neovim, use `:Lazy`, `:Mason`, `:LspInfo`, and `:checkhealth` to inspect managed plugins, tools, attached servers, and health checks.

To update the repository:

```bash
git status
git add home herdr install.sh README.md windows
git commit -m "Update WSL development environment"
git push
```

If the Windows WezTerm file changes, copy it to Windows again and restart WezTerm.
