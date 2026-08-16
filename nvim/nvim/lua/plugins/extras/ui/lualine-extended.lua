return {
  "nvim-lualine/lualine.nvim",
  opts = function(_, opts)
    opts.options.component_separators = { left = "", right = "" }
    opts.options.section_separators = { left = "", right = "" }
    opts.options.theme = "catppuccin-nvim"

    opts.sections.lualine_a = {
      {
        "mode",
        icon = "",
        fmt = function(text, context)
          return string.sub(text, 1, 3)
        end,
      },
    }
    opts.sections.lualine_c[4] = {
      LazyVim.lualine.pretty_path({
        filename_hl = "Bold",
        modified_hl = "MatchParen",
        directory_hl = "Conceal",
      }),
    }

    opts.sections.lualine_y = { "progress" }
    opts.sections.lualine_z = {
      { "location", separator = "" },
      {
        function()
          return ""
        end,
        padding = { left = 0, right = 1 },
      },
    }
    opts.extensions = false
  end,
}
