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
- NvChad v2.5 defaults with Base46 theming, NvChad UI, tabufline, NvDash, NvCheatsheet, terminal management, Telescope, autopairs, and indent guides.
- nvim-cmp completion with LuaSnip, friendly-snippets, and NvChad's completion defaults.
- Conform formatting on save where a formatter is available, plus manual formatting.
- Telescope pickers, nvim-tree file browsing, Which-Key, diagnostics, Fidget LSP progress, Comment.nvim, Gitsigns, Neogit, Diffview, and persistent sessions.

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

## NvChad UI and themes

The NvChad UI configuration lives in [chadrc.lua](home/.config/nvim/lua/chadrc.lua). NvChad's default `onedark` theme, tabufline, statusline, dashboard, cheatsheet, terminal UI, and colorify module are enabled.

Use these commands inside Neovim:

```vim
:NvCheatsheet
:Nvdash
```

Use `<leader>th` to open the NvChad theme picker. The current default is transparent:

```lua
vim.g.dotfiles_transparent = true
```

The repository setting is in [vim_config.lua](home/.config/nvim/lua/vim_config.lua), and the installed path is `~/.config/nvim/lua/vim_config.lua`:

```lua
vim.g.dotfiles_transparent = true
```

For one launch only, use `NVIM_TRANSPARENT=1 nvim`. Use `NVIM_TRANSPARENT=0 nvim` to override the permanent setting for one launch.

Use `NVIM_TRANSPARENT=0 nvim` for one launch with an opaque background.

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

The leader key is Space. This configuration now starts with NvChad's default mappings and adds the repository-specific mappings below. Press `<leader>ch` or run `:NvCheatsheet` for the generated in-editor reference.

### Core editing

| Key | Action |
| --- | --- |
| `<C-s>` | Save |
| `<leader>sn` | Save without triggering format-on-save |
| `<Esc>` | Clear search highlights |
| `<C-q>` | Quit the current window |
| `<C-c>` | Copy the whole file to the system clipboard (NvChad default) |
| `<leader>sa` | Select all |
| `<leader>rn` | Toggle relative line numbers (NvChad default) |
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
| `<C-n>` | Toggle the nvim-tree sidebar |
| `<leader>e` | Focus nvim-tree |
| `<leader>ef` | Find the current file in nvim-tree |
| `<leader>ff` | Find files with Telescope |
| `<leader>fa` | Find all files, including hidden and ignored files |
| `<leader>fw` | Search text in the project with Telescope |
| `<leader>fb` | Pick an open buffer |
| `<leader>fh` | Search Neovim help |
| `<leader>fo` | Browse recently opened files |
| `<leader>fz` | Search the current buffer |
| `<leader>th` | Open the NvChad theme picker |
| `<leader>ch` | Open the NvChad cheatsheet |
| `<leader>wK` | Show all Which-Key mappings |
| `<leader>wk` | Search Which-Key mappings |
| `<Tab>` / `<S-Tab>` | Next/previous buffer in the tabufline |
| `<leader>x` | Close the current buffer |
| `<leader>b` | Create a new buffer |
| `<C-h/j/k/l>` | Move between splits |
| `<leader>wv` / `<leader>wh` | Vertical/horizontal split |
| `<leader>we` | Equalize splits |
| `<leader>wx` | Close the current split |
| Arrow keys | Resize the current split |
| `<leader>to` / `<leader>tx` | Open/close a tab |
| `<leader>tn` / `<leader>tp` | Next/previous tab |

The top tabufline is primarily a buffer bar: opening another search result creates or switches to a buffer shown there, so you can move between files with `<Tab>` and `<S-Tab>`. Real Vim tab pages remain available through `<leader>to`, `<leader>tx`, `<leader>tn`, and `<leader>tp`.

The old `<leader>sf`, `<leader>sg`, and `<leader>sw` Snacks mappings were removed. Use `<leader>ff`, `<leader>fw`, and Telescope's other `f*` mappings instead.

### Terminals

| Key | Action |
| --- | --- |
| `<leader>h` | Open a new horizontal terminal |
| `<leader>v` | Open a new vertical terminal |
| `<A-h>` | Toggle a horizontal terminal |
| `<A-v>` | Toggle a vertical terminal |
| `<A-i>` | Toggle a floating terminal |
| `<leader>pt` | Pick a hidden terminal |

### LSP and diagnostics

These mappings appear when an LSP is attached to the current buffer.

| Key | Action |
| --- | --- |
| `gd` | Definitions picker |
| `gr` | References picker |
| `gI` | Implementations picker |
| `gD` | Declaration |
| `<leader>D` | Type definition (NvChad default) |
| `K` | Hover documentation |
| `<leader>ra` | Rename symbol (NvChad default) |
| `<leader>ws` | Workspace symbols |
| `<leader>ca` | Code action |
| `<leader>wa` / `<leader>wr` / `<leader>wl` | Add/remove/list workspace folders |
| `<leader>li` | Toggle inlay hints when supported |
| `<leader>fm` | Format the buffer (NvChad default) |
| `<leader>lf` | Format the buffer alias |
| `[d` / `]d` | Previous/next diagnostic |
| `<leader>d` | Open diagnostic details |
| `<leader>ds` | Send diagnostics to the location list (NvChad default) |
| `<leader>ls` | Document symbols picker |
| `<leader>ws` | Workspace symbols picker |
| `<leader>do` | Enable/disable diagnostics |

### Completion and snippets

| Key | Action |
| --- | --- |
| `<C-Space>` | Open completion |
| `<C-n>` / `<C-p>` | Next/previous completion item |
| `<CR>` | Accept the selected item |
| `<C-e>` | Close completion |
| `<C-d>` / `<C-f>` | Scroll completion documentation |
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
| `<leader>/` | Toggle a comment (NvChad default) |
| `<leader>g` | Open Neogit |
| `<leader>cm` | Browse Git commits with Telescope |
| `<leader>gt` | Browse Git status with Telescope |
| `<leader>qs` / `<leader>ql` | Save/load the session in Neovim's state directory |

### Keybinding migration notes

- `<leader>sf` became `<leader>ff` for file search.
- `<leader>sg` became `<leader>fw` for live grep.
- `<leader>e` now focuses nvim-tree. `<C-n>` toggles it.
- `<leader>h` and `<leader>v` now open NvChad terminals. Window splits moved to `<leader>wh` and `<leader>wv`.
- `<leader>ss` and `<leader>sl` became `<leader>qs` and `<leader>ql` so the `<leader>s` prefix remains available to NvChad search mappings.
- `<C-c>` now uses NvChad's copy-whole-file behavior. Use `<leader>sa` to select all.
- `<leader>rn` is NvChad's relative-number toggle. Rename with `<leader>ra`; the old custom `<leader>rn` rename alias is gone.
- `<leader>ds` is NvChad's diagnostic location list. Document symbols moved to `<leader>ls`.
- `<leader>th` remains available for the NvChad theme picker. Inlay hints moved to `<leader>li`.
- `<leader>/` is the NvChad comment toggle. The old Ctrl-based comment mappings were removed so `<C-c>` can keep NvChad's copy-file behavior.
- NvChad's tabufline now displays buffers and tab pages at the top of the editor.

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
