return {
  "folke/which-key.nvim",
  opts = function(_, opts)
    opts.icons = vim.tbl_deep_extend("force", opts.icons or {}, {
      group = "",
    })
    opts.spec = vim.tbl_filter(function(item)
      return item[1] ~= "<leader>d" and item[1] ~= "<leader>dp"
    end, opts.spec or {})
    table.insert(opts.spec, { "<leader>ci", group = "info", icon = " " })
  end,
}
