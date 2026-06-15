import type { TableRow } from "./database";

export type LuppWidget = TableRow<"widgets">;
export type WidgetType = "product_video" | "home_showcase" | "floating_video" | "collection_feed" | "stories_bar";
