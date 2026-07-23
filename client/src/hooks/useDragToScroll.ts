import React from "react";

const DRAG_THRESHOLD_PX = 4;
const SUPPRESS_CLICK_MS = 200;

/**
 * Adds click-and-drag horizontal scrolling to a container via mouse only —
 * touch input already scrolls an overflow-x-auto container natively, so
 * this never attaches touch listeners and can't fight that behavior.
 * Suppresses the click that would otherwise fire on whatever's under the
 * cursor immediately after an actual drag (not a plain click), so dragging
 * across a button/card doesn't accidentally trigger it. Returns a ref to
 * attach to the scrollable element.
 */
export function useDragToScroll<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let isPointerDown = false;
    let hasMoved = false;
    let startX = 0;
    let startScrollLeft = 0;
    let previousUserSelect = "";
    let suppressClickUntil = 0;

    function onPointerMove(event: MouseEvent) {
      if (!isPointerDown || !element) return;
      const deltaX = event.clientX - startX;
      if (!hasMoved) {
        if (Math.abs(deltaX) < DRAG_THRESHOLD_PX) return;
        hasMoved = true;
        element.style.cursor = "grabbing";
        previousUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = "none";
      }
      event.preventDefault();
      element.scrollLeft = startScrollLeft - deltaX;
    }

    function onPointerUp() {
      if (!isPointerDown) return;
      isPointerDown = false;
      document.removeEventListener("mousemove", onPointerMove);
      document.removeEventListener("mouseup", onPointerUp);
      if (element) element.style.cursor = "grab";
      if (!hasMoved) return;
      hasMoved = false;
      document.body.style.userSelect = previousUserSelect;
      suppressClickUntil = Date.now() + SUPPRESS_CLICK_MS;
    }

    function onMouseDown(event: MouseEvent) {
      if (event.button !== 0 || !element) return;
      isPointerDown = true;
      hasMoved = false;
      startX = event.clientX;
      startScrollLeft = element.scrollLeft;
      document.addEventListener("mousemove", onPointerMove, { passive: false });
      document.addEventListener("mouseup", onPointerUp);
    }

    function onClickCapture(event: MouseEvent) {
      if (Date.now() < suppressClickUntil) {
        event.stopPropagation();
        event.preventDefault();
      }
    }

    element.style.cursor = "grab";
    element.addEventListener("mousedown", onMouseDown);
    element.addEventListener("click", onClickCapture, true);
    return () => {
      element.removeEventListener("mousedown", onMouseDown);
      element.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("mousemove", onPointerMove);
      document.removeEventListener("mouseup", onPointerUp);
    };
  }, []);

  return ref;
}
