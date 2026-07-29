local map = vim.keymap.set
local opts = { noremap = true, silent = true }

map({ 'n', 'v' }, '<Space>', '<Nop>', { silent = true })

map('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })
map('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
map('n', '<Esc>', '<cmd>nohlsearch<cr>', opts)
map('n', '<C-s>', '<cmd>write<cr>', opts)
map('n', '<leader>sn', '<cmd>noautocmd write<cr>', opts)
map('n', '<C-q>', '<cmd>quit<cr>', opts)
map('n', '<C-a>', 'ggVG', { desc = 'Select all' })
map('n', 'x', '"_x', opts)

map('n', '<C-d>', '<C-d>zz', opts)
map('n', '<C-u>', '<C-u>zz', opts)
map('n', 'n', 'nzzzv', opts)
map('n', 'N', 'Nzzzv', opts)

map('n', '<Up>', '<cmd>resize -2<cr>', opts)
map('n', '<Down>', '<cmd>resize +2<cr>', opts)
map('n', '<Left>', '<cmd>vertical resize -2<cr>', opts)
map('n', '<Right>', '<cmd>vertical resize +2<cr>', opts)

map('n', '<Tab>', '<cmd>bnext<cr>', opts)
map('n', '<S-Tab>', '<cmd>bprevious<cr>', opts)
map('n', '<C-i>', '<C-i>', opts)
map('n', '<leader>x', '<cmd>bd!<cr>', { desc = 'Close buffer' })
map('n', '<leader>b', '<cmd>enew<cr>', { desc = 'New buffer' })

map('n', '<leader>+', '<C-a>', { desc = 'Increment number' })
map('n', '<leader>-', '<C-x>', { desc = 'Decrement number' })

map('n', '<leader>v', '<C-w>v', { desc = 'Split vertically' })
map('n', '<leader>h', '<C-w>s', { desc = 'Split horizontally' })
map('n', '<leader>se', '<C-w>=', { desc = 'Equalize splits' })
map('n', '<leader>xs', '<cmd>close<cr>', { desc = 'Close split' })

map('n', '<C-h>', '<cmd>wincmd h<cr>', opts)
map('n', '<C-j>', '<cmd>wincmd j<cr>', opts)
map('n', '<C-k>', '<cmd>wincmd k<cr>', opts)
map('n', '<C-l>', '<cmd>wincmd l<cr>', opts)

map('n', '<leader>to', '<cmd>tabnew<cr>', { desc = 'New tab' })
map('n', '<leader>tx', '<cmd>tabclose<cr>', { desc = 'Close tab' })
map('n', '<leader>tn', '<cmd>tabnext<cr>', { desc = 'Next tab' })
map('n', '<leader>tp', '<cmd>tabprevious<cr>', { desc = 'Previous tab' })
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
map('n', '<leader>ss', function()
  vim.cmd('mksession! ' .. vim.fn.fnameescape(session_file))
  vim.notify('Session saved to ' .. session_file)
end, { desc = 'Save session' })
map('n', '<leader>sl', function()
  local ok, err = pcall(vim.cmd, 'source ' .. vim.fn.fnameescape(session_file))
  if not ok then
    vim.notify('No saved session: ' .. err, vim.log.levels.WARN)
  end
end, { desc = 'Load session' })

map('n', '<C-_>', 'gcc', { remap = true, desc = 'Toggle comment' })
map('n', '<C-c>', 'gcc', { remap = true, desc = 'Toggle comment' })
map('v', '<C-_>', 'gc', { remap = true, desc = 'Toggle comment' })
map('v', '<C-c>', 'gc', { remap = true, desc = 'Toggle comment' })
