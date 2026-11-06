return {
  "mason-org/mason.nvim",
  opts = function(_, opts)
    opts.ensure_installed = vim.tbl_filter(function(tool)
      return tool ~= "codelldb"
    end, opts.ensure_installed or {})
  end,
  keys = {
    { "<leader>cm", false },
    { "<leader>cim", "<cmd>Mason<cr>", desc = "Mason" },
  },
}
