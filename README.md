# Dotfiles

Personal recovery snapshot for a CachyOS/Arch + Hyprland setup. Packages are recorded in `packages/`; GNU Stow manages the configs.

## Prerequisites

A working network connection, `sudo`, and `git`. The manifests target CachyOS and this machine's hardware; on plain Arch or different hardware, review the CachyOS, NVIDIA, and Intel packages before installing.

## Fresh install

1. Clone the repo.

   ```sh
   git clone https://github.com/aluciencozy/my-dotfiles.git ~/github/dotfiles
   cd ~/github/dotfiles
   ```

2. Install the native packages, then the AUR packages.

   ```sh
   sudo pacman -Syu --needed - < packages/pacman-explicit.txt
   yay -S --needed - < packages/aur-explicit.txt
   ```

3. Stow the configs. `.stowrc` already targets `~/.config`; the second command handles the packages that belong in `$HOME`.

   ```sh
   stow atuin bat btop cava fastfetch fd fontconfig gh-dash ghostty git gtk \
     hypr kitty kvantum lazydocker lazygit nvim pacseek rofi starship swaync \
     television tmux waybar wiremix yazi
   stow --target="$HOME" cursor-theme gtk-theme zsh
   ```

4. Complete the relevant manual setup below. The monitor config applies the fixed desktop layout when those outputs are connected and falls back to automatic placement on other machines.

## Manual setup

- Install [Catppuccin-SE icons](https://github.com/ljmill/catppuccin-icons) into `~/.local/share/icons`, then apply the bundled themes:

  ```sh
  ./setup/cursor.sh
  ./setup/gtk.sh
  ```

- Build Bat's theme cache and install the external CLI plugins:

  ```sh
  bat cache --build
  gh extension install dlvhdr/gh-dash
  git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
  ~/.tmux/plugins/tpm/bin/install_plugins
  ```

- For Zen, find the active profile directory in `about:support`, then run:

  ```sh
  ZEN_PROFILE="/absolute/path/to/profile"
  stow --target="$ZEN_PROFILE" browser
  ```

- Install Adwaita for Steam with Catppuccin Macchiato:

  ```sh
  git clone https://github.com/tkashkin/Adwaita-for-Steam ~/github/Adwaita-for-Steam
  (cd ~/github/Adwaita-for-Steam && ./install.py -c catppuccin-macchiato)
  ```

- If needed, make Zsh the login shell: `chsh -s /bin/zsh`.

## Updating

```sh
yay -Syu
pacman -Qqen > packages/pacman-explicit.txt
pacman -Qqem > packages/aur-explicit.txt
```
