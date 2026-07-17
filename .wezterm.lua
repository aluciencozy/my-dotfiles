local wezterm = require("wezterm")
local config = wezterm.config_builder()

config.color_scheme = "rose-pine-moon"
config.font = wezterm.font("JetBrains Mono", { weight = "Bold" })
config.font_size = 15.0

config.hide_tab_bar_if_only_one_tab = true
config.window_decorations = "RESIZE"

config.window_background_opacity = 0.80
config.win32_system_backdrop = "Acrylic"

config.default_prog = {
  "wsl.exe",
  "-d",
  "Ubuntu",
  "/home/alex/.local/bin/herdr",
}

config.keys = {}

config.bypass_mouse_reporting_modifiers = "ALT"

config.mouse_bindings = {
  {
    event = { Drag = { streak = 1, button = "Left" } },
    mods = "NONE",
    action = wezterm.action.StartWindowDrag,
  },
}

return config