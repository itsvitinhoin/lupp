import { z } from "zod";

/**
 * Loose row schemas for endpoints that mirror PostgREST row shapes back to
 * the SPA. Only identity essentials are declared; `.loose()` lets the rest of
 * the row pass through the serializer untouched (same pattern as the widget
 * bootstrap's response schema).
 */

export const StoreRowSchema = z
  .object({ id: z.string(), name: z.string(), slug: z.string() })
  .loose();

export const VideoRowSchema = z
  .object({ id: z.string(), store_id: z.string(), title: z.string() })
  .loose();

export const ProductRowSchema = z
  .object({ id: z.string(), store_id: z.string(), name: z.string() })
  .loose();

export const CommentRowSchema = z
  .object({ id: z.string(), video_id: z.string(), body: z.string() })
  .loose();

export const WidgetRowSchema = z
  .object({ id: z.string(), store_id: z.string(), type: z.string() })
  .loose();

export const SubscriptionRowSchema = z
  .object({ id: z.string(), store_id: z.string(), status: z.string() })
  .loose();

export const IntegrationRowSchema = z
  .object({ id: z.string(), store_id: z.string(), provider: z.string() })
  .loose();

export const CouponRowSchema = z.object({ id: z.string(), code: z.string() }).loose();

// Projection presets vary (full/trend/feedbacks), so no key is required.
export const AnalyticsEventRowSchema = z.object({}).loose();
