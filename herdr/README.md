# Personal Herdr configuration

This package contains personal layouts, themes, keybindings and mod source for
Herdr. The dotfiles Stow helper links `herdr-app/` into
`${XDG_CONFIG_HOME:-~/.config}/herdr-app`; preview with
`./setup/stow.sh --dry-run` before running `./setup/stow.sh`. Existing files
are not adopted or overwritten. Install Herdr separately and resolve conflicts
deliberately. Compatibility with future Herdr versions is not guaranteed.

The Islands layout uses a neutral canvas instead of the original private
wallpaper. Choose your own image in Appearance after installation. Settings,
credentials, account profiles, runtime state, caches, wallpapers, screenshots,
generated files and binaries are intentionally not included.

## Codex usage and accounts

The accounts and usage mods require Python 3 and CodexBar CLI **0.84.0** at
`~/.local/lib/codexbar-cli-0.84.0/codexbar`. Install the matching Linux CLI
release separately from the [v0.84.0 release](https://github.com/steipete/CodexBar/releases/tag/v0.84.0)
and verify the appropriate archive against its published SHA256SUMS. For
Linux x86_64 (glibc), the archive SHA-256 is
`724b0beb0d2769cfc6fc1558f2782b5b812eb73a140582b9716faf662adbaea0`.
Extract its contents into the stated directory, preserving its accompanying
resources; no binary is included here. These mods also require a working Codex CLI and network access for
signed-in profiles. The installation and authentication are not automated.

In Herdr, open **Workspace help & options → Codex accounts…**, add an alias,
and sign in to each newly created independent profile. Profiles and credentials
remain local and must be recreated on each machine. Existing default credentials
are not imported. Provider results depend on successful sign-in.

## Coordination skill

The optional skill is stored outside the Stow package at
`setup/herdr/skills/herdr-coordination`. After reviewing it, install it manually:

```sh
mkdir -p ~/.agents/skills
test ! -e ~/.agents/skills/herdr-coordination || { echo "Skill already exists; review it first" >&2; exit 1; }
cp -R setup/herdr/skills/herdr-coordination ~/.agents/skills/
```

Do not overwrite an existing skill without reviewing it first. The skill
requires Herdr's `hc`, Codex and Node, and is only for explicitly authorized
delegation; see its README for safety and operational limits.

## Attribution

Third-party Relevo and Over9K assets and source retain their accompanying
license and notice files in the relevant mod directories. Review those files
before redistribution. The remaining files are personal configuration; no
additional license is asserted here.
