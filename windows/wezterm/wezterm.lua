local wezterm = require("wezterm")
local config = wezterm.config_builder()

config.color_scheme = "Catppuccin Mocha"
config.font = wezterm.font("JetBrains Mono", { weight = "Bold" })
config.font_size = 12

config.hide_tab_bar_if_only_one_tab = true
config.window_decorations = "RESIZE"

-- config.background = {
-- 	{
-- 		source = {
-- 			File = "C:\\Users\\aluci\\OneDrive\\Pictures\\mac-bg.jpg",
-- 		},
--
-- 		width = "100%",
-- 		height = "100%",
--
-- 		horizontal_align = "Center",
-- 		vertical_align = "Middle",
--
-- 		repeat_x = "NoRepeat",
-- 		repeat_y = "NoRepeat",
--
-- 		opacity = 0.85,
--
-- 		hsb = {
-- 			brightness = 0.2,
-- 			saturation = 0.85,
-- 		},
--
-- 		attachment = {
-- 			Parallax = 0.0,
-- 		},
-- 	},
-- }

config.bypass_mouse_reporting_modifiers = "ALT"

config.mouse_bindings = {
	{
		event = { Drag = { streak = 1, button = "Left" } },
		mods = "NONE",
		action = wezterm.action.StartWindowDrag,
	},
}

config.default_prog = {
	"wsl.exe",
	"-d",
	"Ubuntu",
	"--cd",
	"/home/alex/github",
}

return config
