local M = {}

M.base46 = {
  theme = "jabuti",
  transparency = vim.g.dotfiles_transparent,
}

M.ui = {
  telescope = {
    style = 'borderless',
  },
  statusline = {
    theme = 'default',
    separator_style = 'round',
  },
  tabufline = {
    enabled = true,
    lazyload = false,
  },
}

M.nvdash = {
  load_on_startup = true,
}

M.term = {
  startinsert = true,
  base46_colors = true,
  winopts = {
    number = false,
    relativenumber = false,
  },
}

M.lsp = {
  signature = true,
}

M.cheatsheet = {
  theme = 'grid',
}

M.colorify = {
  enabled = true,
  mode = 'virtual',
  virt_text = '󱓻 ',
  highlight = { hex = true, lspvars = true },
}

return M
