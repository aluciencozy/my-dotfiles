local disabled = {
  { "akinsho/bufferline.nvim" },
  { "MagicDuck/grug-far.nvim" },
  { "iamcco/markdown-preview.nvim" },
  { "MeanderingProgrammer/render-markdown.nvim" },
  { "mfussenegger/nvim-dap" },
  { "mfussenegger/nvim-dap-python" },
  { "nvim-neotest/neotest" },
  { "nvim-neo-tree/neo-tree.nvim" },
  { "folke/flash.nvim" },
  { "folke/todo-comments.nvim" },
  { "folke/noice.nvim" },
  { "folke/trouble.nvim" },
  { "folke/tokyonight.nvim" },
  { "linux-cultist/venv-selector.nvim" },
  { "folke/persistence.nvim" },
}

for i, plugin in ipairs(disabled) do
  plugin.enabled = false
end

return disabled
