import { View, div } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { appHome, checking, closeOverlay, exec, openOverlay, props, readTextFile, shared, theme, writeTextFile } from "herdr";

const GRADIENT = { gradient: ["#282d48", "#191c2c"], angle: 145 };
const FILE = () => `${appHome()}/layouts/alex-islands.json`;

function workBody(root) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.id === "work-body") found.push(node);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  }
  visit(root);
  if (found.length !== 1) throw new Error("Islands work-body was not found uniquely.");
  return found[0];
}

function node(root, id) {
  const found = [];
  function visit(n) {
    if (!n || typeof n !== "object") return;
    if (n.id === id) found.push(n);
    (n.children ?? []).forEach(visit);
  }
  visit(root);
  if (found.length !== 1) throw new Error(`Islands ${id} was not found uniquely.`);
  return found[0];
}

function setSpacing(root, gap, margin) {
  root.padding = margin;
  root.gap = gap;
  for (const id of ["sidebar", "work", "tabs-row", "work-body"]) node(root, id).gap = gap;
  node(root, "main").content.pane.gap = gap;
}

function setOpacity(root, opacity) {
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, "0");
  root.colors ??= {};
  for (const [key, fallback] of Object.entries({ chrome: "#1e2235", background: "#22263b", surface: "#252a40" })) {
    const old = root.colors[key];
    const rgb = typeof old === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(old) ? old.slice(0, 7) : fallback;
    root.colors[key] = rgb + alpha;
  }
  root.terminal_opacity = opacity;
}

function number(value, min, max, name) {
  if (!value.trim()) throw new Error(`${name} is required.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be ${min}–${max}.`);
  return n;
}

function validPath(path) {
  if (!path || /[\x00-\x1f\x7f]/.test(path) || !/\.(png|jpe?g|webp|gif)$/i.test(path)) {
    throw new Error("Choose a PNG, JPEG, WebP or GIF path without control characters.");
  }
}

export default class Appearance extends View {
  init(_p, cx) {
    this.role = props()?.role || (props()?.overlay ? "settings" : "button");
    this.message = "";
    this.ready = false;
    this.busy = false;
    if (this.role !== "settings") return;
    this.path = InputState.new({ placeholder: "Image path, or leave empty for gradient" });
    this.opacity = InputState.new({ placeholder: "0 to 1" });
    this.gap = InputState.new({ placeholder: "0 to 32" });
    this.padding = InputState.new({ placeholder: "0 to 32" });
    if (checking()) return;
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(FILE());
        if (!text) throw new Error("Islands layout is missing.");
        const root = JSON.parse(text);
        workBody(root);
        this.originalBackground = JSON.stringify(root.background ?? null);
        this.path.set_value(root.background?.image || "");
        this.opacity.set_value(String(root.terminal_opacity ?? 1));
        this.gap.set_value(String(root.gap ?? 0));
        this.padding.set_value(String(root.padding ?? 0));
        this.originalColors = JSON.stringify([root.colors?.chrome, root.colors?.background, root.colors?.surface]);
        this.original = {
          path: this.path.value(), opacity: this.opacity.value(),
          gap: this.gap.value(), padding: this.padding.value()
        };
        this.ready = true;
      } catch (e) { this.message = `Could not load appearance: ${String(e)}`; }
      cx.notify();
    });
  }

  dismiss() {
    if (props()?.overlay) closeOverlay(props().overlay);
  }

  browse(cx) {
    if (checking() || this.busy) return;
    this.busy = true;
    this.message = "Choose an image, or cancel.";
    cx.spawn(async (cx) => {
      try {
        const result = await exec("kdialog", ["--getopenfilename", "", "Images (*.png *.jpg *.jpeg *.webp *.gif)"], { timeout: 600000 });
        if (result.code === 0) {
          const path = result.stdout.replace(/\r?\n$/, "");
          validPath(path);
          if (!path.startsWith("/")) throw new Error("The chooser did not return an absolute path.");
          this.path.set_value(path);
          this.message = "Image selected. Apply copies external images into Herdr backgrounds.";
        } else {
          this.message = "Selection cancelled.";
        }
      } catch (e) { this.message = `Chooser unavailable: ${String(e)}. Enter a path instead.`; }
      this.busy = false;
      cx.notify();
    });
  }

  apply(cx) {
    if (checking() || !this.ready || this.busy) return;
    const values = { path: this.path.value(), opacity: this.opacity.value(), gap: this.gap.value(), padding: this.padding.value() };
    this.busy = true;
    this.message = "Applying…";
    cx.spawn(async (cx) => {
      try {
        if (shared("layout") !== "alex-islands") throw new Error("Switch back to Islands before applying.");
        const opacity = number(values.opacity, 0, 1, "Opacity");
        const gap = number(values.gap, 0, 32, "Island gap");
        const padding = number(values.padding, 0, 32, "Outer margin");
        if (values.path) validPath(values.path);
        const text = await readTextFile(FILE());
        if (!text) throw new Error("Islands layout is missing.");
        const root = JSON.parse(text);
        workBody(root);
        // Refuse overlapping changes rather than silently overwrite another editor.
        if (values.path !== this.original.path && JSON.stringify(root.background ?? null) !== this.originalBackground) throw new Error("Background changed elsewhere; reopen Appearance.");
        if (values.opacity !== this.original.opacity && (String(root.terminal_opacity ?? 1) !== this.original.opacity || JSON.stringify([root.colors?.chrome, root.colors?.background, root.colors?.surface]) !== this.originalColors)) throw new Error("Opacity changed elsewhere; reopen Appearance.");
        if (values.gap !== this.original.gap && String(root.gap ?? 0) !== this.original.gap) throw new Error("Gap changed elsewhere; reopen Appearance.");
        if (values.padding !== this.original.padding && String(root.padding ?? 0) !== this.original.padding) throw new Error("Margin changed elsewhere; reopen Appearance.");
        let image = values.path;
        if (image !== this.original.path && image) {
          if (!image.startsWith("/") && image.split("/").some((part) => part === ".." || part === "")) throw new Error("Use an absolute image path or a path relative to Herdr's home.");
          const source = image.startsWith("/") ? image : `${appHome()}/${image}`;
          const readable = await exec("test", ["-f", source]);
          if (readable.code !== 0) throw new Error("Image path is not an existing regular file.");
          if (image.startsWith("/")) {
            const dir = `${appHome()}/backgrounds/alex-appearance`;
            const mk = await exec("mkdir", ["-p", "--", dir]);
            if (mk.code !== 0) throw new Error("Could not create the backgrounds directory.");
            const real = await exec("realpath", ["-e", "--", dir]);
            if (real.code !== 0 || real.stdout.replace(/\n$/, "") !== dir) throw new Error("Background directory must not be a symlink.");
            const ext = image.match(/\.[a-z]+$/i)[0].toLowerCase();
            const name = `image-${Date.now()}-${Math.floor(Math.random() * 1000000000)}${ext}`;
            const copy = await exec("cp", ["--update=none-fail", "--", image, `${dir}/${name}`]);
            if (copy.code !== 0) throw new Error("Could not copy the selected image.");
            image = `backgrounds/alex-appearance/${name}`;
          }
          root.background = { image, fit: "cover" };
        } else if (values.path !== this.original.path) {
          root.background = GRADIENT;
        }
        if (values.opacity !== this.original.opacity) setOpacity(root, opacity);
        if (values.gap !== this.original.gap || values.padding !== this.original.padding) setSpacing(root, gap, padding);
        await writeTextFile(FILE(), `${JSON.stringify(root, null, 2)}\n`, text);
        this.path.set_value(image);
        this.original = { ...values, path: image };
        this.originalBackground = JSON.stringify(root.background ?? null);
        this.originalColors = JSON.stringify([root.colors?.chrome, root.colors?.background, root.colors?.surface]);
        this.message = "Applied to Islands. Changes reload live.";
      } catch (e) { this.message = `Not applied: ${String(e)}`; }
      this.busy = false;
      cx.notify();
    });
  }

  button(id, label, action, t) {
    return div().id(id).role("button").px(10).py(6).rounded(6).bg(t.raised)
      .text_color(t.foreground).hover((s) => s.bg(t.hover)).on_click(action).child(label);
  }

  field(label, state, t) {
    return v_flex().gap(3).child(div().text_color(t.muted).text_size(11).child(label))
      .child(Input.new(state).w_full().h(28).px(7).rounded(5).bg(t.background).text_color(t.foreground));
  }

  render() {
    const t = theme();
    if (this.role !== "settings") return h_flex().size_full().items_center().justify_center().bg(t.chrome)
      .child(this.button("appearance-open", "Appearance", () => openOverlay({
        mod: "alex-appearance", props: { role: "settings" }, kind: "dialog", width: 520, height: 430
      }), t));
    return v_flex().size_full().p(16).gap(9).bg(t.popover).text_size(12).text_color(t.foreground)
      .child(h_flex().items_center().justify_between()
        .child(div().font_semibold().child("Islands appearance"))
        .child(this.button("appearance-close", "Close", () => this.dismiss(), t)))
      .child(div().text_size(10).text_color(t.dim).child("Only the alex-islands layout is changed. Empty image restores the gradient."))
      .child(h_flex().items_center().gap(8)
        .child(div().flex_1().child(this.field("Background image path", this.path, t)))
        .child(this.button("appearance-browse", "Browse…", (_e, cx) => this.browse(cx), t)))
      .child(div().text_size(10).text_color(t.dim).child("Absolute local path, or path relative to Herdr home. External images are copied on Apply."))
      .child(h_flex().gap(10)
        .child(div().flex_1().child(this.field("Surface opacity (0–1)", this.opacity, t)))
        .child(div().flex_1().child(this.field("Island gap (0–32)", this.gap, t)))
        .child(div().flex_1().child(this.field("Outer margin (0–32)", this.padding, t))))
      .child(div().text_size(10).text_color(t.dim).child("Gap separates islands and split panes; margin surrounds the layout. Dialogs and highlights may remain opaque."))
      .child(div().flex_1().text_size(11).text_color(t.muted).child(this.message))
      .child(this.button("appearance-apply", this.busy ? "Working…" : "Apply", (_e, cx) => this.apply(cx), t));
  }
}
