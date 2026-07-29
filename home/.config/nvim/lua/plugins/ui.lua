local selected = vim.env.NVIM_THEME or vim.g.dotfiles_theme or 'rose-pine-moon'
local lualine_themes = {
  ['rose-pine'] = 'rose-pine',
  ['rose-pine-moon'] = 'rose-pine',
  tokyonight = 'tokyonight',
  ['catppuccin-mocha'] = 'catppuccin',
  nord = 'nord',
}

return {
  {
    'folke/which-key.nvim',
    lazy = false,
    opts = {
      delay = 200,
      spec = {
        { '<leader>s', group = 'Search' },
        { '<leader>t', group = 'Tabs and hints' },
        { '<leader>w', group = 'Workspace' },
        { '<leader>l', group = 'LSP and formatting' },
      },
    },
  },
  {
    'nvim-lualine/lualine.nvim',
    event = 'VeryLazy',
    dependencies = { 'nvim-tree/nvim-web-devicons' },
    opts = function()
      return {
        options = {
          theme = lualine_themes[selected] or 'rose-pine',
          component_separators = '',
          section_separators = '',
          globalstatus = true,
        },
        sections = {
          lualine_a = { 'mode' },
          lualine_b = { 'branch', 'diff', 'diagnostics' },
          lualine_c = { { 'filename', path = 1 } },
          lualine_x = { 'encoding', 'fileformat', 'filetype' },
          lualine_y = { 'progress' },
          lualine_z = { 'location' },
        },
      }
    end,
  },
}
