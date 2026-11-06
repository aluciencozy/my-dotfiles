return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      diagnostics = {
        virtual_text = {
          current_line = true,
        },
      },
      codelens = {
        enabled = false,
      },
      inlay_hints = {
        enabled = false,
      },
      servers = {
        clangd = {
          mason = false,
        },
        ["*"] = {
          keys = {
            { "E", vim.diagnostic.open_float, desc = "Line Diagnostics" },
          },
        },
      },
    },
  },
}
