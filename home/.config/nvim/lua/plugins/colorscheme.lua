local selected = vim.env.NVIM_THEME or vim.g.dotfiles_theme or 'rose-pine-moon'

local supported = {
  ['rose-pine'] = true,
  ['rose-pine-moon'] = true,
  tokyonight = true,
  ['catppuccin-mocha'] = true,
  nord = true,
}

if not supported[selected] then
  selected = 'rose-pine-moon'
end

local transparent = vim.env.NVIM_TRANSPARENT == '1'
local rose_pine_selected = selected == 'rose-pine' or selected == 'rose-pine-moon'

return {
  {
    'rose-pine/neovim',
    name = 'rose-pine',
    lazy = false,
    priority = 1000,
    config = function()
      require('rose-pine').setup({
        dark_variant = 'moon',
        dim_inactive_windows = false,
        extend_background_behind_borders = false,
        styles = {
          italic = false,
          transparency = transparent,
        },
      })

      if rose_pine_selected then
        vim.cmd.colorscheme('rose-pine')
        local palette = require('rose-pine.palette')
        vim.api.nvim_set_hl(0, 'SnacksPickerDir', { fg = palette.subtle })
      end
    end,
  },
  {
    'folke/tokyonight.nvim',
    name = 'tokyonight',
    lazy = false,
    priority = 1000,
    config = function()
      require('tokyonight').setup({
        style = 'moon',
        transparent = transparent,
        styles = {
          comments = { italic = false },
          keywords = { italic = false },
        },
      })

      if selected == 'tokyonight' then
        vim.cmd.colorscheme('tokyonight')
      end
    end,
  },
  {
    'catppuccin/nvim',
    name = 'catppuccin',
    lazy = false,
    priority = 1000,
    config = function()
      require('catppuccin').setup({
        flavour = 'mocha',
        transparent_background = transparent,
        integrations = {
          cmp = true,
          gitsigns = true,
          snacks = true,
        },
      })

      if selected == 'catppuccin-mocha' then
        vim.cmd.colorscheme('catppuccin-mocha')
      end
    end,
  },
  {
    'shaunsingh/nord.nvim',
    name = 'nord',
    lazy = false,
    priority = 1000,
    config = function()
      vim.g.nord_contrast = true
      vim.g.nord_borders = false
      vim.g.nord_disable_background = transparent

      if selected == 'nord' then
        vim.cmd.colorscheme('nord')
      end
    end,
  },
}
