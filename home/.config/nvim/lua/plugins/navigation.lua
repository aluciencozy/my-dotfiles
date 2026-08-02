return {
  {
    'nvim-tree/nvim-tree.lua',
    dependencies = { 'nvim-tree/nvim-web-devicons' },
    cmd = {
      'NvimTreeToggle',
      'NvimTreeOpen',
      'NvimTreeFindFile',
    },
    keys = {
      { '-', '<cmd>NvimTreeToggle<cr>', desc = 'Toggle file tree' },
      { '<leader>e', '<cmd>NvimTreeToggle<cr>', desc = 'Toggle file tree' },
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
  {
    'folke/snacks.nvim',
    priority = 1000,
    lazy = false,
    opts = {
      picker = { enabled = true },
      notifier = { enabled = true },
      input = { enabled = true },
    },
    keys = {
      { '<leader>sf', function() Snacks.picker.files() end, desc = 'Find files' },
      { '<leader>sg', function() Snacks.picker.grep() end, desc = 'Search text' },
      { '<leader>sw', function() Snacks.picker.grep_word() end, desc = 'Search word' },
      { '<leader>sh', function() Snacks.picker.help() end, desc = 'Help tags' },
      { '<leader>sb', function() Snacks.picker.buffers() end, desc = 'Buffers' },
      { '<leader>sd', function() Snacks.picker.diagnostics() end, desc = 'Diagnostics' },
      { '<leader>sr', function() Snacks.picker.resume() end, desc = 'Resume picker' },
      { '<leader>so', function() Snacks.picker.recent() end, desc = 'Recent files' },
      { '<leader>/', function() Snacks.picker.lines() end, desc = 'Search open buffer' },
      { '<leader><tab>', function() Snacks.picker.buffers() end, desc = 'Switch buffer' },
    },
  },
}
