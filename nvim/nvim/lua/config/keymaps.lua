local map = vim.keymap.set
local o = vim.opt

-- Disable LazyVim bindings
map("n", "<leader>fT", "<Nop>")
pcall(vim.keymap.del, "n", "<leader>l")
pcall(vim.keymap.del, "n", "<leader>L")
pcall(vim.keymap.del, "n", "<leader>dpp")
pcall(vim.keymap.del, "n", "<leader>dph")

-- Identation
map("n", "<", "<<", { desc = "Deindent" })
map("n", ">", ">>", { desc = "Indent" })

-- Save without formatting
map({ "n", "i" }, "<A-s>", "<cmd>noautocmd w<CR>", { desc = "Save Without Formatting" })

-- Increment/decrement
map("n", "+", "<C-a>")
map("n", "-", "<C-x>")

-- Custom Ctrl+A
map("n", "<C-a>", "ggVG", { desc = "Select all " })

-- Toggle statusline
map("n", "<leader>uS", function()
  if o.laststatus:get() == 0 then
    o.laststatus = 4
  else
    o.laststatus = 0
  end
end, { desc = "Toggle Statusline" })

-- Plugin Info
map("n", "<leader>cif", "<cmd>LazyFormatInfo<cr>", { desc = "Formatting" })
map("n", "<leader>cic", "<cmd>ConformInfo<cr>", { desc = "Conform" })
local linters = function()
  local linters_attached = require("lint").linters_by_ft[vim.bo.filetype]
  local buf_linters = {}

  if not linters_attached then
    LazyVim.warn("No linters attached", { title = "Linter" })
    return
  end

  for _, linter in pairs(linters_attached) do
    table.insert(buf_linters, linter)
  end

  local unique_client_names = table.concat(buf_linters, ", ")
  local linters = string.format("%s", unique_client_names)

  LazyVim.notify(linters, { title = "Linter" })
end
map("n", "<leader>ciL", linters, { desc = "Lint" })
map("n", "<leader>cir", "<cmd>LazyRoot<cr>", { desc = "Root" })

-- Copy whole text to clipboard
map("n", "<C-c>", ":%y+<CR>", { desc = "Copy Whole Text to Clipboard", silent = true })

-- Delete and change without yanking
map({ "n", "x" }, "<A-d>", '"_d', { desc = "Delete Without Yanking" })
map({ "n", "x" }, "<A-c>", '"_c', { desc = "Change Without Yanking" })

-- Dashboard
map("n", "<leader>fd", function()
  if LazyVim.has("snacks.nvim") then
    Snacks.dashboard()
  elseif LazyVim.has("alpha-nvim") then
    require("alpha").start(true)
  elseif LazyVim.has("dashboard-nvim") then
    vim.cmd("Dashboard")
  end
end, { desc = "Dashboard" })

-- Spelling
map("n", "<leader>!", "zg", { desc = "Add Word to Dictionary" })
map("n", "<leader>@", "zug", { desc = "Remove Word from Dictionary" })

-- Terminal Stuff
if not LazyVim.has("floaterm.nvim") or not LazyVim.has("toggleterm.nvim") then
  local lazyterm = function()
    Snacks.terminal(nil, { size = { width = 0.8, height = 0.8 }, cwd = LazyVim.root() })
  end
  map("n", "<leader>ft", lazyterm, { desc = "Terminal (Root Dir)" })
  map("n", "<leader>fT", function()
    Snacks.terminal(nil, { size = { width = 0.8, height = 0.8 }, cwd = vim.fn.getcwd() })
  end, { desc = "Terminal (cwd)" })
  map("n", [[<c-\>]], lazyterm, { desc = "Terminal (Root Dir)" })
  map("t", [[<c-\>]], "<cmd>close<cr>", { desc = "Hide Terminal" })
end

-- Center when scrolling
if Snacks.scroll.enabled then
  map("n", "<C-d>", function()
    vim.wo.scrolloff = 999
    vim.defer_fn(function()
      vim.wo.scrolloff = 8
    end, 500)
    return "<c-d>"
  end, { expr = true })

  map("n", "<C-u>", function()
    vim.wo.scrolloff = 999
    vim.defer_fn(function()
      vim.wo.scrolloff = 8
    end, 500)
    return "<c-u>"
  end, { expr = true })
end

-- Select first option for spelling
map("n", "<leader>S", "1z=", { desc = "Spelling (First Option)" })

map("n", "<S-down>", "<cmd>execute 'move .+' . v:count1<cr>==", { desc = "Move Down" })
map("n", "<S-up>", "<cmd>execute 'move .-' . (v:count1 + 1)<cr>==", { desc = "Move Up" })
map("i", "<S-down>", "<esc><cmd>m .+1<cr>==gi", { desc = "Move Down" })
map("i", "<S-up>", "<esc><cmd>m .-2<cr>==gi", { desc = "Move Up" })
map("v", "<S-down>", ":<C-u>execute \"'<,'>move '>+\" . v:count1<cr>gv=gv", { desc = "Move Down" })
map("v", "<S-up>", ":<C-u>execute \"'<,'>move '<-\" . (v:count1 + 1)<cr>gv=gv", { desc = "Move Up" })

map("n", "<A-Up>", "<cmd>resize +2<cr>", { desc = "Increase Window Height" })
map("n", "<A-Down>", "<cmd>resize -2<cr>", { desc = "Decrease Window Height" })
map("n", "<A-Left>", "<cmd>vertical resize -2<cr>", { desc = "Decrease Window Width" })
map("n", "<A-Right>", "<cmd>vertical resize +2<cr>", { desc = "Increase Window Width" })

-- Incremental Selection
map({ "n", "x", "o" }, "<A-o>", function()
  if vim.treesitter.get_parser(nil, nil, { error = false }) then
    require("vim.treesitter._select").select_parent(vim.v.count1)
  else
    vim.lsp.buf.selection_range(vim.v.count1)
  end
end, { desc = "Select parent treesitter node or outer incremental lsp selections" })

map({ "n", "x", "o" }, "<A-i>", function()
  if vim.treesitter.get_parser(nil, nil, { error = false }) then
    require("vim.treesitter._select").select_child(vim.v.count1)
  else
    vim.lsp.buf.selection_range(-vim.v.count1)
  end
end, { desc = "Select child treesitter node or inner incremental lsp selections" })
