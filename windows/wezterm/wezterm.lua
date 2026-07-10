local wezterm = require("wezterm")

local config = wezterm.config_builder()

config.default_domain = 'WSL:Ubuntu'
config.color_scheme = "rose-pine-moon"
config.font = wezterm.font("JetBrains Mono", { weight = 'Bold' })
config.font_size = 15.0
config.window_background_opacity = 0.8
config.macos_window_background_blur = 50
config.hide_tab_bar_if_only_one_tab = true
config.window_decorations = "RESIZE"

config.leader = { key = 'Space', mods = 'CTRL', timeout_milliseconds = 1000 }

config.keys = {
  -- FIXED: SplitHorizontal actually splits side-by-side (creating a vertical boundary line like '|')
  -- FIXED: SplitVertical splits top-and-bottom (creating a horizontal boundary line like '-')
  { key = '-', mods = 'LEADER', action = wezterm.action.SplitVertical { domain = 'CurrentPaneDomain' } },
  { key = '\\', mods = 'LEADER', action = wezterm.action.SplitHorizontal { domain = 'CurrentPaneDomain' } },

  -- Fast vim-style pane navigation (Alt + hjkl - NO leader needed)
  { key = 'h', mods = 'ALT', action = wezterm.action.ActivatePaneDirection 'Left' },
  { key = 'j', mods = 'ALT', action = wezterm.action.ActivatePaneDirection 'Down' },
  { key = 'k', mods = 'ALT', action = wezterm.action.ActivatePaneDirection 'Up' },
  { key = 'l', mods = 'ALT', action = wezterm.action.ActivatePaneDirection 'Right' },

  -- Standard OS shortcuts (Since you have WSL, make sure you are on macOS using WezTerm to connect to it. 
  -- If you are running WezTerm directly on Windows, change 'CMD' to 'CTRL|SHIFT' for these two actions)
  { key = 't', mods = 'CTRL|SHIFT', action = wezterm.action.SpawnTab 'CurrentPaneDomain' },
  { key = 'w', mods = 'CTRL|SHIFT', action = wezterm.action.CloseCurrentPane { confirm = true } },
}

return config
