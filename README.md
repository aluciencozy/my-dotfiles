# Dotfiles

Personal recovery snapshot for CachyOS/Arch + Hyprland, shared by an NVIDIA desktop and a Microsoft Surface Laptop 5. GNU Stow manages the configuration links; `packages/` records installed packages.

The setup helpers are small, safe to rerun, and do not adopt or overwrite existing files. They do not change the bootloader, enable services, or start Docker.

## Prerequisites

Start with a working CachyOS/Arch installation, network access, `sudo`, and Git.

```sh
sudo pacman -Syu --needed base-devel git stow zsh nvm
git clone https://github.com/aluciencozy/my-dotfiles.git ~/github/dotfiles
cd ~/github/dotfiles
```

CachyOS already provides Oh My Zsh; do not install it again. Select Zsh as the login shell if needed, then log out and back in:

```sh
chsh -s /bin/zsh
```

On CachyOS, install `yay` if it is missing. On plain Arch, build `yay` from the AUR instead.

```sh
command -v yay || sudo pacman -S --needed yay
```

## Fresh restore

Use this order on a new machine; the detailed sections below explain each step and the machine-specific choices:

```sh
# 1. Review and install the applicable package manifests.
# 2. Preview and create configuration links.
./setup/stow.sh --dry-run
./setup/stow.sh

# 3. Rebuild fonts, install the release-only icons, and apply themes.
./setup/fonts.sh
./setup/icons.sh --install
./setup/gtk.sh
./setup/cursor.sh

# 4. Link the active Zen profile, then verify the restore.
./setup/zen.sh "/absolute/path/from/about:support"
./setup/check.sh
```

Surface kernel setup remains a separate, deliberate step; it is never run by these helpers.

## Packages

The manifests are snapshots, not universal machine profiles. `pacman-explicit.txt` contains CachyOS, NVIDIA desktop, Intel, gaming, and kernel packages. Review hardware-specific entries before using it on another machine:

```sh
rg '^(linux|nvidia|lib32-nvidia|opencl-nvidia|intel-|cachyos-)' packages/pacman-explicit.txt
less packages/pacman-explicit.txt
less packages/aur-explicit.txt
```

After review, restore the applicable packages:

```sh
sudo pacman -S --needed - < packages/pacman-explicit.txt
yay -S --needed - < packages/aur-explicit.txt
```

At minimum, the themed desktop expects `qt6ct`, `kvantum`, `kvantum-qt5`, `ttf-jetbrains-mono-nerd`, and the AUR package `bibata-cursor-theme-bin`. Node/npm come from `nvm`; this repo does not install a second Oh My Zsh on CachyOS.

Docker is intentionally installed but stopped and disabled. No setup helper changes that policy.

## Stow

Most packages target `~/.config` through `.stowrc`. `zsh` and the bundled GTK theme target `$HOME`. Preview, then apply:

```sh
./setup/stow.sh --dry-run
./setup/stow.sh
```

The helper uses `--no-folding`, so it creates links for files inside configuration directories instead of replacing whole directories with links. It never uses `--adopt` or deletes conflicts. Resolve any reported existing file deliberately, then rerun it.

Manual equivalent:

```sh
stow --no-folding atuin bat btop cava fastfetch fd fontconfig gh-dash ghostty git gtk \
  hypr kitty kvantum lazydocker lazygit nvim pacseek rofi starship swaync \
  television tmux waybar wiremix yazi
stow --no-folding --target="$HOME" gtk-theme zsh
```

`cursor-theme/` is retained as a legacy snapshot but is not part of the active restore. The current cursor is Bibata.

## Desktop and laptop monitors

`hypr/hypr/monitors.lua` is output-aware:

- `DP-1` and `HDMI-A-1` get the desktop's fixed modes and coordinates when connected.
- `eDP-1` and unknown outputs use `preferred`, automatic position, and automatic scale.

The wildcard fallback stays last, so both machines share the same clean file. Do not regenerate or edit `monitors.lua` for the laptop. The Surface scale is intentionally automatic.

Waybar has the same shared-config approach: `waybar/scripts/start` loads `config-$(hostname).jsonc` and `style-$(hostname).css` only when both exist, otherwise it uses the defaults. The existing laptop override expects hostname `alex-laptop`.

## Fonts

Ghostty requests `Dotfiles Mono` with `ExtraBold`. That name is a Fontconfig alias for JetBrainsMono Nerd Font, so stow `fontconfig` before judging terminal or Starship weights:

```sh
sudo pacman -S --needed ttf-jetbrains-mono-nerd
./setup/fonts.sh
fc-match "Dotfiles Mono"
fc-match "Dotfiles Mono:style=ExtraBold"
```

Both matches should report JetBrainsMono Nerd Font; the second should select ExtraBold. If directory text in Starship looks heavier than typed text or the Git branch, check this first. A fallback such as `Noto Sans Mono Regular` is a Fontconfig problem, not a Starship styling problem.

GTK uses `Dotfiles Mono 10`. In `qt6ct`, use `JetBrainsMono Nerd Font` for the Qt UI font.

## GTK, Qt, icons, and cursor

The active look is Catppuccin Macchiato + Lavender.

### Catppuccin-SE icons

The `ljmill/catppuccin-icons` main branch does not contain the installable icon theme; its `assets/` directory is only project artwork. The actual theme is the `Catppuccin-SE.tar.bz2` release asset.

Check only, or explicitly opt into the release download:

```sh
./setup/icons.sh
./setup/icons.sh --install
```

The installer prints the network action, validates archive paths, installs only into `~/.local/share/icons/Catppuccin-SE`, and refuses to overwrite an existing path. To install manually, extract that release asset so this file exists:

```text
~/.local/share/icons/Catppuccin-SE/index.theme
```

### Apply GTK and cursor settings

```sh
./setup/gtk.sh
./setup/cursor.sh
```

`gtk.sh` verifies the bundled GTK theme and Catppuccin-SE before setting the theme, icon theme, `Dotfiles Mono 10`, and dark color scheme. `cursor.sh` verifies Bibata before setting GTK to `Bibata-Modern-Ice` at size 24.

Hyprland exports the same `XCURSOR_THEME` and `XCURSOR_SIZE`; `cursor.enable_hyprcursor = false` intentionally uses the XCursor theme. Do not apply the old Catppuccin cursor script/config.

### Qt and Kvantum

```sh
sudo pacman -S --needed qt6ct kvantum kvantum-qt5
```

Hyprland exports `QT_QPA_PLATFORMTHEME=qt6ct`. Open `qt6ct`, select the `kvantum` style, choose `JetBrainsMono Nerd Font` if desired, and apply. The stowed Kvantum config selects `catppuccin-macchiato-lavender`.

## Zen Browser

Install Zen, open `about:support`, and copy the **Profile Directory** for the active profile. Close Zen before linking files:

```sh
yay -S --needed zen-browser-bin
./setup/zen.sh "/absolute/path/to/Default (release)"
```

With exactly one `*.Default*` directory, `./setup/zen.sh` can discover it. Otherwise it lists candidates and requires an explicit path. The helper creates these exact links and refuses to overwrite existing files:

```text
<profile>/chrome/userChrome.css
<profile>/chrome/userContent.css
<profile>/chrome/zen-themes.css
<profile>/user.js
```

`<profile>/chrome` must be a real directory. A `chrome/chrome -> repo/browser/chrome` nesting is wrong; the helper detects and refuses a directory symlink so that mistake is not repeated.

### Betterfox preferences

`browser/user.js` is a Betterfox-based preference set, not merely appearance theming. Read it before enabling it. Zen applies `user.js` preferences at startup, so changing the same preference in `about:config` can be overwritten on the next launch.

The file already enables:

```text
toolkit.legacyUserProfileCustomizations.stylesheets = true
```

Restart Zen after linking so the preferences and CSS load.

### Stylus userstyles (optional)

Install the Stylus extension and import the Catppuccin userstyles `import.json`. In Stylus, use:

- Patch CSP to allow style assets: **on**
- Patch CSP only on matching sites: **on**
- Circumvent CSP `style-src` with adopted stylesheets: **off**

## Surface Laptop 5 (optional)

Keep this section separate from the shared restore. The current laptop uses `linux-surface` daily and `linux-cachyos` as a fallback; setup was performed with Secure Boot off.

Follow the current [linux-surface Arch installation guide](https://github.com/linux-surface/linux-surface/wiki/Installation-and-Setup#arch) to import/sign its repository key, add the repository, and install:

```sh
sudo pacman -Syu
sudo pacman -S linux-surface linux-surface-headers iptsd
```

Do not remove `linux-cachyos`; confirm the bootloader retains entries for both kernels. This repo intentionally does not edit bootloader configuration or silently change the default kernel.

After reboot, verify the daily kernel and touchscreen daemon:

```sh
uname -r
systemctl status 'iptsd@dev-hidraw4.service'
```

The known-good daily kernel during the laptop restore was `6.19.8-arch1-3-surface`. The `dev-hidraw4` instance is hardware discovery state and may change; inspect `systemctl --type=service | rg iptsd` if needed. IPTSD provides the touchscreen input processing.

Secure Boot was off during this setup. If enabling it later, follow the linux-surface and Arch Secure Boot documentation deliberately; do not install/enroll keys blindly.

## Remaining one-time setup

```sh
bat cache --build
gh extension install dlvhdr/gh-dash
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
~/.tmux/plugins/tpm/bin/install_plugins
```

Run the non-mutating verification report at any time:

```sh
./setup/check.sh
```

It checks core restore tools, development commands, font resolution, theme assets, and reports Docker state without changing it.

## Troubleshooting

### swaync starts twice

Hyprland autostarts `swaync`. If a separate user service also exists and fails or races, disable only that duplicate unit:

```sh
systemctl --user disable --now swaync.service
systemctl --user reset-failed swaync.service
```

This is troubleshooting, not a required setup step.

### Quick verification

```sh
./setup/check.sh
hyprctl monitors
gsettings get org.gnome.desktop.interface gtk-theme
gsettings get org.gnome.desktop.interface icon-theme
gsettings get org.gnome.desktop.interface cursor-theme
fc-match "Dotfiles Mono:style=ExtraBold"
```

## Updating package snapshots

```sh
yay -Syu
pacman -Qqen > packages/pacman-explicit.txt
pacman -Qqem > packages/aur-explicit.txt
```

Review the resulting diff, especially hardware and kernel packages, before committing it.
