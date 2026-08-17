-- Output-aware configuration shared by every machine. Specific desktop rules
-- win when those outputs exist; the wildcard is the safe laptop/unknown fallback.
-- Keep the wildcard last and do not replace this file during laptop restores.
hl.monitor({
	output = "HDMI-A-1",
	mode = "1920x1080@165.0",
	position = "2560x247",
	scale = 1,
})

hl.monitor({
	output = "DP-1",
	mode = "2560x1440@200.0",
	position = "0x0",
	scale = 1,
})

-- Laptop display and any other monitor without a specific rule.
hl.monitor({
	output = "",
	mode = "preferred",
	position = "auto",
	scale = "auto",
})
