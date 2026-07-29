return {
  {
    'folke/which-key.nvim',
    lazy = false,
    opts = { delay = 3000 },
  },
  {
    'nvim-lualine/lualine.nvim',
    event = 'VeryLazy',
    dependencies = { 'nvim-tree/nvim-web-devicons' },
    opts = function()
      local theme = vim.env.NVIM_THEME == 'tokyonight' and 'tokyonight' or 'rose-pine'
      return {
        options = {
          theme = theme,
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
