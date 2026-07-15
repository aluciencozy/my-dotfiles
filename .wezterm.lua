local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- Your aesthetic setups
config.color_scheme = "rose-pine-moon"
config.font = wezterm.font("JetBrains Mono", { weight = 'Bold' })
config.font_size = 15.0
config.window_background_opacity = 0.8
config.macos_window_background_blur = 50
config.hide_tab_bar_if_only_one_tab = true
config.window_decorations = "RESIZE"

config.initial_cols = 180
config.initial_rows = 41

-- Automatically boot straight into Herdr inside WSL Ubuntu
config.default_prog = { "wsl.exe", "-d", "Ubuntu", "/home/alex/.local/bin/herdr" }

-- Kept empty so WezTerm lets Herdr handle all your splits and tabs
config.keys = {}

return config
