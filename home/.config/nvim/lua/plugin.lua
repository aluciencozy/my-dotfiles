local lazypath = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
if not vim.uv.fs_stat(lazypath) then
  vim.fn.system({ 'git', 'clone', '--filter=blob:none',
    'https://github.com/folke/lazy.nvim.git', '--branch=stable', lazypath })
end
vim.opt.rtp:prepend(lazypath)

require('lazy').setup({
  {
    'NvChad/NvChad',
    branch = 'v2.5',
    lazy = false,
    import = 'nvchad.plugins',
  },
  { import = 'plugins' },
}, {
  defaults = { lazy = true },
  install = { colorscheme = { 'nvchad' } },
  ui = {
    border = 'rounded',
  },
  performance = {
    rtp = {
      disabled_plugins = {
        '2html_plugin',
        'getscript',
        'getscriptPlugin',
        'gzip',
        'logipat',
        'netrw',
        'netrwPlugin',
        'netrwSettings',
        'netrwFileHandlers',
        'matchit',
        'tar',
        'tarPlugin',
        'rrhelper',
        'spellfile_plugin',
        'vimball',
        'vimballPlugin',
        'zip',
        'zipPlugin',
        'tutor',
        'rplugin',
        'syntax',
        'synmenu',
        'optwin',
        'compiler',
        'bugreport',
        'ftplugin',
      },
    },
  },
})

for _, module in ipairs({ 'defaults', 'statusline' }) do
  local cache_file = vim.g.base46_cache .. module
  if vim.fn.filereadable(cache_file) == 1 then
    dofile(cache_file)
  end
end
