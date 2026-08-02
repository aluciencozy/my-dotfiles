require('nvchad.mappings')

local map = vim.keymap.set
local opts = { noremap = true, silent = true }

-- Keep the NvChad defaults as the base. These are the custom additions and
-- intentional overrides for this dotfiles repository.
map('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })
map('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
map('n', '<Esc>', '<cmd>nohlsearch<cr>', opts)
map('n', '<C-s>', '<cmd>write<cr>', opts)
map('n', '<leader>sn', '<cmd>noautocmd write<cr>', opts)
map('n', '<C-q>', '<cmd>quit<cr>', opts)
map('n', '<leader>sa', 'ggVG', { desc = 'Select all' })
map('n', 'x', '"_x', opts)

map('n', '<C-d>', '<C-d>zz', opts)
map('n', '<C-u>', '<C-u>zz', opts)
map('n', 'n', 'nzzzv', opts)
map('n', 'N', 'Nzzzv', opts)

map('n', '<Up>', '<cmd>resize -2<cr>', opts)
map('n', '<Down>', '<cmd>resize +2<cr>', opts)
map('n', '<Left>', '<cmd>vertical resize -2<cr>', opts)
map('n', '<Right>', '<cmd>vertical resize +2<cr>', opts)

-- NvChad owns <Tab>, <S-Tab>, <leader>x, and <leader>b for buffers.
-- Window splits use the <leader>w group so NvChad can keep <leader>h/v for terminals.
map('n', '<leader>wv', '<C-w>v', { desc = 'Split vertically' })
map('n', '<leader>wh', '<C-w>s', { desc = 'Split horizontally' })
map('n', '<leader>we', '<C-w>=', { desc = 'Equalize splits' })
map('n', '<leader>wx', '<cmd>close<cr>', { desc = 'Close split' })

map('n', '<C-h>', '<cmd>wincmd h<cr>', opts)
map('n', '<C-j>', '<cmd>wincmd j<cr>', opts)
map('n', '<C-k>', '<cmd>wincmd k<cr>', opts)
map('n', '<C-l>', '<cmd>wincmd l<cr>', opts)

map('n', '<leader>to', '<cmd>tabnew<cr>', { desc = 'New tab page' })
map('n', '<leader>tx', '<cmd>tabclose<cr>', { desc = 'Close tab page' })
map('n', '<leader>tn', '<cmd>tabnext<cr>', { desc = 'Next tab page' })
map('n', '<leader>tp', '<cmd>tabprevious<cr>', { desc = 'Previous tab page' })
map('n', '<leader>lw', '<cmd>set wrap!<cr>', { desc = 'Toggle line wrapping' })

map('i', 'jk', '<Esc>', opts)
map('i', 'kj', '<Esc>', opts)
map('v', '<', '<gv', opts)
map('v', '>', '>gv', opts)
map('v', '<A-j>', ":m '>+1<cr>gv=gv", opts)
map('v', '<A-k>', ":m '<-2<cr>gv=gv", opts)
map('v', 'p', '"_dP', { desc = 'Paste without replacing register' })

map('n', '<leader>j', '*``cgn', { desc = 'Replace word under cursor' })
map({ 'n', 'v' }, '<leader>y', '"+y', { desc = 'Yank to system clipboard' })
map('n', '<leader>Y', '"+Y', { desc = 'Yank line to system clipboard' })

local diagnostics_active = true
map('n', '<leader>do', function()
  diagnostics_active = not diagnostics_active
  vim.diagnostic.enable(diagnostics_active)
  vim.notify('Diagnostics ' .. (diagnostics_active and 'enabled' or 'disabled'))
end, { desc = 'Toggle diagnostics' })

map('n', '[d', function()
  vim.diagnostic.jump({ count = -1, float = true })
end, { desc = 'Previous diagnostic' })
map('n', ']d', function()
  vim.diagnostic.jump({ count = 1, float = true })
end, { desc = 'Next diagnostic' })
map('n', '<leader>d', vim.diagnostic.open_float, { desc = 'Open diagnostic' })
map('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Diagnostics list' })

local session_file = vim.fn.stdpath('state') .. '/session.vim'
vim.fn.mkdir(vim.fn.stdpath('state'), 'p')
map('n', '<leader>qs', function()
  vim.cmd('mksession! ' .. vim.fn.fnameescape(session_file))
  vim.notify('Session saved to ' .. session_file)
end, { desc = 'Save session' })
map('n', '<leader>ql', function()
  local ok, err = pcall(vim.cmd, 'source ' .. vim.fn.fnameescape(session_file))
  if not ok then
    vim.notify('No saved session: ' .. err, vim.log.levels.WARN)
  end
end, { desc = 'Load session' })

map('n', '<leader>lf', function()
  require('conform').format({ async = true, lsp_format = 'fallback' })
end, { desc = 'Format buffer' })
