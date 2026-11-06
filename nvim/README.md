# Flutter in Neovim

The Flutter extra provides Dart completion, diagnostics, formatting on save,
Treesitter highlighting, tests through neotest, and Flutter Tools integrated with
the existing DAP debugger. Flutter Tools manages the Dart language server;
do not enable a second `dartls` instance.

## Install the SDK

Install the stable Flutter SDK using the
[official Linux instructions](https://docs.flutter.dev/install/manual).
Use a user-writable directory (for example `~/develop/flutter`), and add its
`bin` directory to your shell's PATH:

```sh
export PATH="$HOME/develop/flutter/bin:$PATH"
```

Persist that line in `~/.zshrc` if you use that location. Flutter includes Dart;
no separate Dart or Mason language-server installation is needed.
Restart your terminal, then check:

```sh
flutter --version
dart --version
flutter doctor -v
flutter devices
```

Restart Neovim after installing the SDK. Flutter Tools starts only when `flutter`
is on PATH; before that, opening Dart files shows an SDK installation reminder.

Install the platform tooling reported by `flutter doctor` for your target.
Android needs the Android SDK and a device or emulator; after installing its
command-line tools, accept licenses with `flutter doctor --android-licenses`.
iOS builds require macOS and Xcode, not this Linux machine.

## Use it

Restart Neovim and let Lazy install the new plugins (or run `:Lazy install`).
Open a Dart file inside a Flutter project with a `pubspec.yaml`.

| Key | Action |
| --- | --- |
| `<leader>cfc` | All Flutter commands |
| `<leader>cfr` | Run with debugging |
| `<leader>cfd` | Select a device |
| `<leader>cfe` | Launch an emulator |
| `<leader>cfh` | Hot reload |
| `<leader>cfR` | Hot restart |
| `<leader>cfq` | Stop the app |
| `<leader>cfo` | Toggle widget outline |
| `<leader>cfl` | Toggle logs |

Use your existing `<leader>d` mappings for breakpoints and stepping, and
`<leader>t` mappings for tests. `:FlutterPubGet` fetches project dependencies.
`:FlutterLspRestart` restarts the Dart language server.

For a smoke test, run `flutter create flutter_smoke`, open
`flutter_smoke/lib/main.dart`, select a device, and run the app. Check completion,
formatting on save, a breakpoint, hot reload, and `:LspInfo` (one Dart client).
