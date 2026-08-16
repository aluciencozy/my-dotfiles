# Dotfiles

My personal CachyOS / Hyprland dotfiles.

Configurations are managed with [GNU Stow](https://www.gnu.org/software/stow/) and linked into `~/.config`.

## Structure

Most directories in this repository are individual Stow packages.

For example:

```text
hypr/
└── hypr/
    └── hyprland.lua

waybar/
└── waybar/
    └── config.jsonc

ghostty/
└── ghostty/
    └── config.ghostty
```

With `~/.config` as the Stow target, these become:

```text
~/.config/hypr/hyprland.lua
~/.config/waybar/config.jsonc
~/.config/ghostty/config.ghostty
```

## Stowing configs

Run commands from the repository root.

Stow individual packages:

```sh
stow hypr
stow waybar
stow ghostty
stow nvim
stow rofi
stow swaync
stow tmux
stow gh-dash git lazygit btop bat fd yazi lazydocker wiremix pacseek cava
```

Multiple packages can also be stowed at once:

```sh
stow hypr waybar ghostty nvim rofi swaync tmux
stow gh-dash git lazygit btop bat fd yazi lazydocker wiremix pacseek cava
```

The repository `.stowrc` sets the default target to:

```text
~/.config
```

### Zsh

Zsh is the exception because `.zshrc` belongs directly in the home directory:

```sh
stow --target="$HOME" zsh
```

### Starship

There are two Starship configurations. Only one should be stowed at a time:

```sh
stow starship-custom
```

or:

```sh
stow starship-omer
```

## Removing configs

Unstow an individual package:

```sh
stow -D hypr
```

Multiple packages:

```sh
stow -D hypr waybar ghostty
```

For Zsh:

```sh
stow -D --target="$HOME" zsh
```

## Restowing configs

If links need to be recreated:

```sh
stow -R hypr
```

or for Zsh:

```sh
stow -R --target="$HOME" zsh
```

## Other directories

`packages/` contains snapshots of explicitly installed Pacman and AUR packages.

`setup/` contains one-time setup scripts and is not intended to be stowed.

## Terminal tools

The repository also manages Catppuccin Macchiato configurations for:

- `gh dash`, Git/delta, and Lazygit
- btop, bat, fd, and Yazi
- Lazydocker, Wiremix, Pacseek, and Cava

After stowing `bat`, rebuild its syntax/theme cache once:

```sh
bat cache --build
```

`gh-dash` is installed as a GitHub CLI extension rather than a Pacman package:

```sh
gh extension install dlvhdr/gh-dash
```
