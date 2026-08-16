local palette = require("catppuccin.palettes").get_palette("macchiato")
local prefix = "<leader>b"

return {
  "akinsho/bufferline.nvim",
  keys = {
    { prefix .. "S", "<cmd>BufferLineSortByDirectory<cr>", desc = "Sort By Directory" },
    { prefix .. "s", "<cmd>BufferLineSortByExtension<cr>", desc = "Sort By Extensions" },
    { prefix .. "<", "<cmd>BufferLineMovePrev<cr>", desc = "Move buffer prev" },
    { prefix .. ">", "<cmd>BufferLineMoveNext<cr>", desc = "Move buffer next" },
  },
  opts = function(_, opts)
    opts.options.modified_icon = ""
    opts.options.color_icons = true
    opts.options.separator_style = "thin"
    local theme = require("catppuccin.special.bufferline").get_theme({
      styles = { "italic", "bold" },
      custom = {
        all = {
          fill = {
            bg = palette.base,
          },
          separator_selected = {
            bg = palette.base,
            fg = palette.mantle,
          },
          separator = {
            bg = palette.mantle,
            fg = palette.mantle,
          },
          tab_separator = {
            bg = palette.mantle,
            fg = palette.mantle,
          },
          tab_selected = {
            bg = palette.base,
          },
          tab_separator_selected = {
            bg = palette.base,
            fg = palette.mantle,
          },
        },
      },
    })
    opts.highlights = function()
      local highlights = theme()
      for _, highlight in pairs(highlights) do
        highlight.bg = palette.base
      end
      for _, separator in ipairs({
        "separator",
        "separator_visible",
        "separator_selected",
        "tab_separator",
        "tab_separator_selected",
      }) do
        highlights[separator].fg = palette.base
      end
      highlights.group_label = { bg = palette.base }
      return highlights
    end
  end,
}
