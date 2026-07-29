local o = vim.opt

vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- Change this value to set the permanent default theme.
-- NVIM_THEME can override it for a single launch.
vim.g.dotfiles_theme = 'rose-pine-moon'

o.number = true
o.relativenumber = true
o.mouse = 'a'
o.termguicolors = true
o.signcolumn = 'yes'
o.breakindent = true
o.clipboard = 'unnamedplus'
o.undofile = true
o.backup = false
o.writebackup = false
o.swapfile = false
o.expandtab = true
o.shiftwidth = 4
o.tabstop = 4
o.softtabstop = 4
o.smartindent = true
o.ignorecase = true
o.smartcase = true
o.incsearch = true
o.hlsearch = true
o.completeopt = { 'menu', 'menuone', 'noselect' }
o.splitbelow = true
o.splitright = true
o.cursorline = false
o.wrap = false
o.scrolloff = 8
o.sidescrolloff = 8
o.updatetime = 250
o.timeoutlen = 300
o.laststatus = 3
o.showmode = false
o.conceallevel = 2

o.iskeyword:append('-')
