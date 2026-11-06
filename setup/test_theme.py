"""Run with python3 -m unittest discover -s setup -p test_theme.py."""

import configparser
from pathlib import Path
import runpy
import subprocess
import tempfile
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[1]
THEME = runpy.run_path(str(ROOT / "theme/.local/bin/theme"))


class ThemeTests(unittest.TestCase):
    def test_all_themes_preserve_settings_and_render_valid_configs(self):
        for name in THEME["THEMES"]:
            with self.subTest(theme=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                for source in (
                    "ghostty/ghostty/config.ghostty", "lazygit/lazygit/config.yml", "bat/bat/config",
                    "starship/starship.toml", "btop/btop/btop.conf", f"theme/.config/dotfiles-theme/palettes/{name}",
                ):
                    target = root / source
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text((ROOT / source).read_text())
                outputs = THEME["render"](root, name)
                self.assertEqual(outputs[root / "theme/.config/dotfiles-theme/current"], name + "\n")
                original = (root / "ghostty/ghostty/config.ghostty").read_text()
                self.assertEqual(
                    THEME["replace"](original, r"^theme = .*$", "theme = ignored"),
                    THEME["replace"](outputs[root / "ghostty/ghostty/config.ghostty"], r"^theme = .*$", "theme = ignored"),
                )
                self.assertIn("scrollHeight: 4", outputs[root / "lazygit/lazygit/config.yml"])
                self.assertIn("command: delta", outputs[root / "lazygit/lazygit/config.yml"])
                self.assertIn('format = """$directory$character"""', outputs[root / "starship/starship.toml"])
                for target in ("starship/starship.toml", "yazi/yazi/theme.toml"):
                    tomllib.loads(outputs[root / target])
                delta = configparser.ConfigParser()
                delta.read_string(outputs[root / "git/git/themes/shared.gitconfig"])
                self.assertEqual(delta['delta "shared"']["syntax-theme"], "ansi")
                THEME["write_outputs"](outputs)
                style = subprocess.run(
                    ["git", "config", "--file", str(root / "git/git/themes/shared.gitconfig"),
                     "--get", "delta.shared.minus-style"], capture_output=True, text=True, check=True,
                ).stdout.strip()
                self.assertRegex(style, r"^#[0-9a-fA-F]{6} #[0-9a-fA-F]{6}$")
                self.assertEqual(THEME["render"](root, name), outputs, "reapplying must be idempotent")

    def test_ambiguous_settings_fail_before_writes(self):
        with self.assertRaises(ValueError):
            THEME["replace"]("theme = A\ntheme = B\n", r"^theme = .*$", "theme = C")

    def test_writes_preserve_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target, link = root / "target", root / "link"
            target.write_text("old")
            link.symlink_to(target)
            THEME["write_outputs"]({link: "new"})
            self.assertTrue(link.is_symlink())
            self.assertEqual(target.read_text(), "new")


if __name__ == "__main__":
    unittest.main()
