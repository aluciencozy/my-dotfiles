local selected = vim.env.NVIM_THEME or 'rose-pine'
if selected ~= 'rose-pine' and selected ~= 'tokyonight' then
  selected = 'rose-pine'
end

local function is_selected(name)
  return selected == name
end

local transparent = vim.env.NVIM_TRANSPARENT == '1'

return {
  {
    'rose-pine/neovim',
    name = 'rose-pine',
    lazy = not is_selected('rose-pine'),
    priority = 1000,
    config = function()
      if not is_selected('rose-pine') then
        return
      end

      require('rose-pine').setup({
        dark_variant = 'moon',
        dim_inactive_windows = false,
        extend_background_behind_borders = false,
        styles = {
          italic = false,
          transparency = transparent,
        },
      })

      vim.cmd.colorscheme('rose-pine')
      local palette = require('rose-pine.palette')
      vim.api.nvim_set_hl(0, 'SnacksPickerDir', { fg = palette.subtle })
    end,
  },
  {
    'folke/tokyonight.nvim',
    name = 'tokyonight',
    lazy = not is_selected('tokyonight'),
    priority = 1000,
    config = function()
      if not is_selected('tokyonight') then
        return
      end

      require('tokyonight').setup({
        style = 'moon',
        transparent = transparent,
        styles = {
          comments = { italic = false },
          keywords = { italic = false },
        },
      })
      vim.cmd.colorscheme('tokyonight')
    end,
  },
}
