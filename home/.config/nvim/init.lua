vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '
vim.g.base46_cache = vim.fn.stdpath('data') .. '/base46/'
vim.g.dotfiles_transparent = vim.env.NVIM_TRANSPARENT ~= '0'

require('plugin')
require('vim_config')
require('keys')
