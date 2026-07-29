return {
  {
    'stevearc/oil.nvim',
    opts = { view_options = { show_hidden = true } },
    keys = {
      { '-', '<cmd>Oil<cr>', desc = 'File browser' },
      { '<leader>e', '<cmd>Oil<cr>', desc = 'File browser' },
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
