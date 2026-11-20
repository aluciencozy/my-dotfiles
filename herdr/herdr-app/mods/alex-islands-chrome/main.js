import { View, div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { checking, layout, nextCommand, run, shared, theme } from "herdr";
import {
  RAIL_WIDTH, WIDTH_KEY, isIslandsRail,
  rememberExpandedWidth, sidebarWidth, toggleTarget
} from "./sidebar-state.js";

function readWidth() {
  try {
    return localStorage.getItem(WIDTH_KEY);
  } catch {
    return null;
  }
}

function rememberWidth(width) {
  const expanded = rememberExpandedWidth(width);
  if (expanded == null) return;
  try {
    localStorage.setItem(WIDTH_KEY, String(expanded));
  } catch {
    // A blocked storage write should not prevent the sidebar from resizing.
  }
}

export default class AlexIslandsChrome extends View {
  init(_props, cx) {
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "toggle") this.toggleSidebar();
      }
    });
  }

  currentWidth() {
    return sidebarWidth(layout());
  }

  toggleSidebar() {
    const width = this.currentWidth();
    const target = toggleTarget(shared("layout"), width, readWidth());
    if (!target) return;
    if (target.px === RAIL_WIDTH) rememberWidth(width);
    run("layout.resize", target);
  }

  button(id, icon, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.muted).hover((el) => el.bg(t.hover).text_color(t.foreground))
      .tooltip(label).accessibility_label(label)
      .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
      .on_click(action)
      .child(icon);
  }

  render() {
    const t = theme();
    const width = this.currentWidth();
    const collapsed = isIslandsRail(shared("layout"), width);
    const row = h_flex().id("alex-islands-chrome-root").size_full()
      .bg(t.chrome).pl(collapsed ? 8 : 14).pr(8).gap(4).items_center().text_size(13.5)
      .on_size_change((_size, _cx) => rememberWidth(this.currentWidth()));

    if (collapsed) {
      return row.justify_center()
        .child(this.button("sidebar-toggle", svg("mods/workspace-chrome/chevron-right.svg").size(15),
          "Expand sidebar", () => this.toggleSidebar()));
    }

    return row
      .child(h_flex().flex_1().gap(8).items_center()
        .child(image("frame/welcome/herdr.png").size(20).rounded(5))
        .child(div().font_semibold().text_color(t.foreground).child("Herdr")))
      .child(this.button("search", svg("mods/workspace-chrome/search.svg").size(15),
        "Open app palette", () => run("mod.open", { name: "picker" })))
      .child(this.button("sidebar-toggle", svg("mods/workspace-chrome/chevron-left.svg").size(15),
        "Collapse sidebar", () => this.toggleSidebar()));
  }
}
