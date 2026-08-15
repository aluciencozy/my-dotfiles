# Dotfiles

Configuration directories are kept flat in this repository and linked into
`~/.config` with GNU Stow:

```sh
stow .
```

Zsh is the exception because `.zshrc` belongs directly in the home directory:

```sh
stow --target=~ zsh
```

To remove the links:

```sh
stow --delete .
stow --delete --target=~ zsh
```
