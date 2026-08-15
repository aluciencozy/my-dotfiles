#!/usr/bin/env bash

set -e

theme='catppuccin-macchiato-lavender-standard+default'
icons='Catppuccin-SE'
font='Maple Mono NF 10'

# GNOME / general GTK settings
gsettings set org.gnome.desktop.interface gtk-theme "$theme"
gsettings set org.gnome.desktop.interface icon-theme "$icons"
gsettings set org.gnome.desktop.interface font-name "$font"
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'

# Nemo is a Cinnamon application, so keep Cinnamon in sync too.
if gsettings writable org.cinnamon.desktop.interface gtk-theme >/dev/null 2>&1; then
  gsettings set org.cinnamon.desktop.interface gtk-theme "$theme"
fi
