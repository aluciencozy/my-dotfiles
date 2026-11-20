export const ISLANDS_LAYOUT = "alex-islands";
export const SIDEBAR_ID = "sidebar";
export const WIDTH_KEY = "alex-islands.expanded-sidebar-width";
export const TOGGLE_COMMAND = "alex-islands-chrome.toggle";

export const RAIL_WIDTH = 64;
export const DEFAULT_EXPANDED_WIDTH = 268;
export const MIN_EXPANDED_WIDTH = 160;
export const MAX_EXPANDED_WIDTH = 480;

export function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function sidebarWidth(root) {
  const width = findNode(root, SIDEBAR_ID)?.size?.px;
  return Number.isFinite(width) ? width : Infinity;
}

export function isNarrow(width) {
  return Number.isFinite(width) && width < MIN_EXPANDED_WIDTH;
}

export function isIslandsRail(layoutName, width) {
  return layoutName === ISLANDS_LAYOUT && isNarrow(width);
}

export function rememberExpandedWidth(width) {
  if (!Number.isFinite(width) || width < MIN_EXPANDED_WIDTH) return null;
  return Math.round(Math.max(MIN_EXPANDED_WIDTH, Math.min(MAX_EXPANDED_WIDTH, width)));
}

export function restoreExpandedWidth(value) {
  if (value == null || String(value).trim() === "") return DEFAULT_EXPANDED_WIDTH;
  const width = Number(value);
  if (!Number.isFinite(width) || width < MIN_EXPANDED_WIDTH) return DEFAULT_EXPANDED_WIDTH;
  return Math.round(Math.max(MIN_EXPANDED_WIDTH, Math.min(MAX_EXPANDED_WIDTH, width)));
}

export function toggleTarget(layoutName, width, savedWidth) {
  if (layoutName !== ISLANDS_LAYOUT) return null;
  return {
    id: SIDEBAR_ID,
    px: isIslandsRail(layoutName, width) ? restoreExpandedWidth(savedWidth) : RAIL_WIDTH
  };
}
