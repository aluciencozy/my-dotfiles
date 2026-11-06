# Neovim

LazyVim with Snacks search, LazyGit, Yazi, and language support. Run tests,
debuggers, and AI tools in the terminal.

Use `theme rose-pine`, `theme rose-pine-moon`, `theme catppuccin-mocha`, or
`theme vesper` in your shell to switch the shared CLI theme. Neovim refreshes
on focus and stays transparent. All three theme plugins remain installed.

Shortcuts are listed in [keymaps.md](keymaps.md), one per line. Space is the
leader key. File and text searches use the project root, falling back to the
current directory. The list covers global shortcuts and language-specific
shortcuts; picker and completion controls are marked separately. This is not a
full list of built-in Vim commands or plugin-internal menus.

After changing plugins, restart Neovim and run `:Lazy clean` to remove unused
downloads. Use `:Lazy` to manage plugins, `:LazyExtras` for extras, and `:Mason`
to manage language tools.

For Flutter, install the [SDK](https://docs.flutter.dev/install/manual), add its
`bin` directory to PATH, and run `flutter doctor -v`. Flutter Tools manages the
Dart language server; do not start another `dartls`. Use `:FlutterPubGet` for
dependencies and `:FlutterLspRestart` to restart the server.

Next: find a more minimal replacement for Yazi.
