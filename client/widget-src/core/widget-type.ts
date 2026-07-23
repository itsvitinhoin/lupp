// Lupp widget – widgetType classification. Pure string-in/boolean-out so it
// stays trivially testable (see render/carousel.spec.ts for the pattern).

export function isHomeCarouselWidgetType(widgetType: string): boolean {
  return (
    widgetType === "home_carousel" ||
    widgetType === "horizontal_feed" ||
    widgetType === "home_video_carousel"
  );
}

export function isCarouselWidgetType(widgetType: string): boolean {
  return (
    isHomeCarouselWidgetType(widgetType) ||
    widgetType === "carousel" ||
    widgetType === "video_carousel"
  );
}

export function isFloatingWidgetType(widgetType: string): boolean {
  return widgetType === "floating_launcher" || widgetType === "floating_video";
}

// Every carousel variant and the floating launcher collapse onto the same
// server-side widget row type — the launcher-vs-embedded-home-carousel
// distinction is a *display*-time decision (display.show_home_carousel),
// not a different dashboard widget row. See resolveWidgetConfig/
// mappedWidgetType in server/src/http/widget/bootstrap.ts (kept in lockstep
// with this function by name).
export function mapToServerWidgetType(widgetType: string): string {
  if (isFloatingWidgetType(widgetType) || isCarouselWidgetType(widgetType)) {
    return "floating_video";
  }
  return widgetType;
}
