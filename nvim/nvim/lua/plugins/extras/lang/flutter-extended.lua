local prefix = "<leader>cf"

return {
  { import = "lazyvim.plugins.extras.lang.dart" },
  {
    "neovim/nvim-lspconfig",
    opts = {
      -- Flutter Tools owns dartls; do not start a second language server.
      setup = {
        dartls = function()
          return true
        end,
      },
    },
  },
  {
    "nvim-flutter/flutter-tools.nvim",
    ft = "dart",
    dependencies = { "nvim-lua/plenary.nvim", "mfussenegger/nvim-dap" },
    opts = function()
      return {
        debugger = { enabled = true },
        lsp = {
          capabilities = require("blink.cmp").get_lsp_capabilities(),
        },
      }
    end,
    config = function(_, opts)
      -- Flutter Tools initializes DAP even when debugging is disabled.
      if vim.fn.executable("flutter") == 0 then
        vim.notify("Install the Flutter SDK and add flutter to PATH, then restart Neovim.", vim.log.levels.WARN)
        return
      end
      require("flutter-tools").setup(opts)
    end,
    keys = {
      { prefix .. "c", "<cmd>FlutterCommands<cr>", desc = "Flutter Commands" },
      { prefix .. "r", "<cmd>FlutterRun<cr>", desc = "Run Flutter" },
      { prefix .. "d", "<cmd>FlutterDevices<cr>", desc = "Flutter Devices" },
      { prefix .. "e", "<cmd>FlutterEmulators<cr>", desc = "Flutter Emulators" },
      { prefix .. "h", "<cmd>FlutterReload<cr>", desc = "Flutter Hot Reload" },
      { prefix .. "R", "<cmd>FlutterRestart<cr>", desc = "Flutter Hot Restart" },
      { prefix .. "q", "<cmd>FlutterQuit<cr>", desc = "Quit Flutter" },
      { prefix .. "o", "<cmd>FlutterOutlineToggle<cr>", desc = "Flutter Outline" },
      { prefix .. "l", "<cmd>FlutterLogToggle<cr>", desc = "Flutter Logs" },
    },
  },
  {
    "folke/which-key.nvim",
    opts = {
      spec = {
        { prefix, group = "flutter" },
      },
    },
  },
}
