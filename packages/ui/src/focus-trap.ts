const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function isFocusable(element: HTMLElement): boolean {
  if (element.tabIndex < 0) return false;
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true")
    return false;
  if (element.closest("[inert], [hidden]") || element.getAttribute("hidden") !== null) return false;
  if (element.closest('[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return true;
}

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(isFocusable);
}

export function attachModalFocusTrap(panel: HTMLElement, onDismiss: () => void): () => void {
  const previous = document.activeElement;
  const focusInitial = () => {
    const first = getFocusableElements(panel)[0];
    (first ?? panel).focus();
  };
  focusInitial();

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onDismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const items = getFocusableElements(panel);
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !panel.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (active === last || !panel.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("keydown", onKey, true);
  document.body.classList.add("ui-scroll-lock");
  return () => {
    document.removeEventListener("keydown", onKey, true);
    document.body.classList.remove("ui-scroll-lock");
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  };
}
