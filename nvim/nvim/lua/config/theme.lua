local M = {}
local path = (vim.env.XDG_CONFIG_HOME or (vim.env.HOME .. "/.config")) .. "/dotfiles-theme/current"
local schemes = {
  ["rose-pine"] = "rose-pine-main",
  ["rose-pine-moon"] = "rose-pine-moon",
  ["catppuccin-mocha"] = "catppuccin-mocha",
  vesper = "vesper",
}

function M.colorscheme()
  local ok, lines = pcall(vim.fn.readfile, path)
  local name = ok and vim.trim(lines[1] or "") or "rose-pine"
  return schemes[name] or "rose-pine-main"
end

function M.setup()
  local current = M.colorscheme()
  vim.api.nvim_create_autocmd({ "FocusGained", "VimResume", "TermClose" }, {
    group = vim.api.nvim_create_augroup("shared_theme", { clear = true }),
    nested = true,
    callback = function()
      local selected = M.colorscheme()
      if selected ~= current then
        local ok, err = pcall(vim.cmd.colorscheme, selected)
        if ok then
          current = selected
        else
          vim.notify("Could not switch theme: " .. tostring(err), vim.log.levels.ERROR)
        end
      end
    end,
  })
end

return M
