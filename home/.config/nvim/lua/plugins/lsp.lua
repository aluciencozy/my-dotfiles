local servers = {
  lua_ls = {
    settings = {
      Lua = {
        completion = { callSnippet = 'Replace' },
        runtime = { version = 'LuaJIT' },
        workspace = {
          checkThirdParty = false,
          library = vim.api.nvim_get_runtime_file('', true),
        },
        diagnostics = {
          globals = { 'vim' },
          disable = { 'missing-fields' },
        },
        format = { enable = false },
      },
    },
  },
  ts_ls = {},
  cssls = {},
  html = { filetypes = { 'html', 'twig', 'hbs' } },
  jsonls = {},
  yamlls = {},
  bashls = {},
  dockerls = {},
  docker_compose_language_service = {},
  pyright = {},
  ruff = {},
  sqlls = {},
  terraformls = {},
}

local formatters_by_ft = {
  lua = { 'stylua' },
  javascript = { 'prettier' },
  javascriptreact = { 'prettier' },
  typescript = { 'prettier' },
  typescriptreact = { 'prettier' },
  json = { 'prettier' },
  jsonc = { 'prettier' },
  css = { 'prettier' },
  html = { 'prettier' },
  markdown = { 'prettier' },
  yaml = { 'prettier' },
  python = { 'ruff_format' },
  sh = { 'shfmt' },
  bash = { 'shfmt' },
}

return {
  {
    'stevearc/conform.nvim',
    event = { 'BufReadPre', 'BufNewFile' },
    opts = {
      formatters_by_ft = formatters_by_ft,
      format_on_save = function(bufnr)
        if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
          return
        end
        return { timeout_ms = 500, lsp_format = 'fallback' }
      end,
    },
    keys = {
      {
        '<leader>lf',
        function()
          require('conform').format({ async = true, lsp_format = 'fallback' })
        end,
        mode = { 'n', 'v' },
        desc = 'Format buffer',
      },
    },
  },
  {
    'neovim/nvim-lspconfig',
    dependencies = {
      { 'mason-org/mason.nvim', opts = {} },
      {
        'mason-org/mason-lspconfig.nvim',
        opts = {
          ensure_installed = vim.tbl_keys(servers),
          automatic_enable = false,
        },
      },
      {
        'WhoIsSethDaniel/mason-tool-installer.nvim',
        opts = {
          ensure_installed = { 'stylua', 'prettier', 'shfmt', 'ruff' },
        },
      },
      {
        'j-hui/fidget.nvim',
        opts = {
          notification = { window = { winblend = 0 } },
        },
      },
      'hrsh7th/cmp-nvim-lsp',
    },
    config = function()
      vim.diagnostic.config({
        severity_sort = true,
        float = { border = 'rounded', source = 'if_many' },
        underline = { severity = vim.diagnostic.severity.ERROR },
        signs = {
          text = {
            [vim.diagnostic.severity.ERROR] = '󰅚',
            [vim.diagnostic.severity.WARN] = '󰀪',
            [vim.diagnostic.severity.INFO] = '󰋽',
            [vim.diagnostic.severity.HINT] = '󰌶',
          },
        },
        virtual_text = { spacing = 4, source = 'if_many' },
      })

      vim.api.nvim_create_autocmd('LspAttach', {
        group = vim.api.nvim_create_augroup('user-lsp-attach', { clear = true }),
        callback = function(event)
          local function map(keys, func, desc)
            vim.keymap.set('n', keys, func, {
              buffer = event.buf,
              desc = 'LSP: ' .. desc,
            })
          end

          map('gd', function() Snacks.picker.lsp_definitions() end, 'Goto definition')
          map('gr', function() Snacks.picker.lsp_references() end, 'Goto references')
          map('gI', function() Snacks.picker.lsp_implementations() end, 'Goto implementation')
          map('<leader>D', function() Snacks.picker.lsp_type_definitions() end, 'Type definition')
          map('<leader>ds', function() Snacks.picker.lsp_symbols() end, 'Document symbols')
          map('<leader>ws', function() Snacks.picker.lsp_workspace_symbols() end, 'Workspace symbols')
          map('<leader>rn', vim.lsp.buf.rename, 'Rename')
          map('<leader>ca', vim.lsp.buf.code_action, 'Code action')
          map('K', vim.lsp.buf.hover, 'Hover documentation')
          map('gD', vim.lsp.buf.declaration, 'Goto declaration')
          map('<leader>wa', vim.lsp.buf.add_workspace_folder, 'Add workspace folder')
          map('<leader>wr', vim.lsp.buf.remove_workspace_folder, 'Remove workspace folder')
          map('<leader>wl', function()
            print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
          end, 'List workspace folders')

          local client = vim.lsp.get_client_by_id(event.data.client_id)
          if client and client:supports_method(vim.lsp.protocol.Methods.textDocument_inlayHint) then
            map('<leader>th', function()
              local enabled = vim.lsp.inlay_hint.is_enabled({ bufnr = event.buf })
              vim.lsp.inlay_hint.enable(not enabled, { bufnr = event.buf })
            end, 'Toggle inlay hints')
          end

          if client and client:supports_method(vim.lsp.protocol.Methods.textDocument_documentHighlight) then
            local highlight_group = vim.api.nvim_create_augroup('user-lsp-highlight', { clear = false })
            vim.api.nvim_create_autocmd({ 'CursorHold', 'CursorHoldI' }, {
              buffer = event.buf,
              group = highlight_group,
              callback = vim.lsp.buf.document_highlight,
            })
            vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
              buffer = event.buf,
              group = highlight_group,
              callback = vim.lsp.buf.clear_references,
            })
            vim.api.nvim_create_autocmd('LspDetach', {
              group = vim.api.nvim_create_augroup('user-lsp-detach', { clear = true }),
              callback = function(detach_event)
                vim.lsp.buf.clear_references()
                vim.api.nvim_clear_autocmds({ group = highlight_group, buffer = detach_event.buf })
              end,
            })
          end
        end,
      })

      local capabilities = require('cmp_nvim_lsp').default_capabilities()
      for server, config in pairs(servers) do
        local server_config = vim.tbl_deep_extend('force', {}, config)
        server_config.capabilities = vim.tbl_deep_extend(
          'force',
          {},
          capabilities,
          server_config.capabilities or {}
        )

        local ok, err = pcall(function()
          vim.lsp.config(server, server_config)
          vim.lsp.enable(server)
        end)
        if not ok then
          vim.notify('Could not configure ' .. server .. ': ' .. err, vim.log.levels.WARN)
        end
      end
    end,
  },
}
