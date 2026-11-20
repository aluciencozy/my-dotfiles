// Relevo chevrons, unchanged and renamed; see RELEVO-NOTICE and RELEVO-LICENSE.
import { svg } from "gpui-kit";
export const islandsRadius = (islands, otherwise) => islands ? 0 : otherwise;
export const chevron = (open, color) => svg(`mods/alex-usage/relevo-chevron-${open ? "down" : "right"}.svg`).size(14).flex_none().text_color(color);
