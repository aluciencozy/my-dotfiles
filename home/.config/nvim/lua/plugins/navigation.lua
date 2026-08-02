return {
  {
    'nvim-tree/nvim-tree.lua',
    keys = {
      { '<leader>ef', '<cmd>NvimTreeFindFile<cr>', desc = 'Find current file in tree' },
    },
    opts = {
      view = {
        side = 'left',
        width = 30,
      },
      renderer = {
        group_empty = true,
      },
      filters = {
        dotfiles = false,
      },
      update_focused_file = {
        enable = true,
        update_root = false,
      },
      sync_root_with_cwd = true,
      diagnostics = {
        enable = true,
      },
      git = {
        enable = true,
      },
    },
  },
}
