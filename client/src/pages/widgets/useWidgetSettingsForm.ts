import React from "react";

export type WidgetSettingsForm = {
  launcherLabel: string;
  launcherPosition: string;
  launcherAccent: string;
  launcherBackground: string;
  launcherTextColor: string;
  launcherFont: string;
  launcherSize: string;
  launcherModel: string;
  excludePaths: string;
  homeExperienceEnabled: boolean;
  homeOrdering: string;
  fixedVideo: boolean;
  allowClose: boolean;
  randomizeThumbnail: boolean;
  customInstallmentsEnabled: boolean;
  customInstallmentsCount: string;
  customInstallmentsInterestFree: boolean;
  customPixDiscountEnabled: boolean;
  customPixDiscountPercent: string;
  customPaymentNote: string;
  carouselEnabled: boolean;
  carouselTitle: string;
  carouselDescription: string;
  carouselBeforeHeading: string;
  carouselDesktopCount: string;
  carouselMobileCount: string;
};

export type SetWidgetSettingsField = <K extends keyof WidgetSettingsForm>(
  key: K,
  value: WidgetSettingsForm[K],
) => void;

const defaultForm: WidgetSettingsForm = {
  launcherLabel: "VIDEO DO PRODUTO",
  launcherPosition: "bottom-left",
  launcherAccent: "#176BFF",
  launcherBackground: "#0F172A",
  launcherTextColor: "#ffffff",
  launcherFont: "Inter, system-ui, sans-serif",
  launcherSize: "74",
  launcherModel: "circular",
  excludePaths: "/checkout\n/carrinho\n/cart",
  homeExperienceEnabled: true,
  homeOrdering: "manual",
  fixedVideo: false,
  allowClose: true,
  randomizeThumbnail: false,
  customInstallmentsEnabled: false,
  customInstallmentsCount: "6",
  customInstallmentsInterestFree: true,
  customPixDiscountEnabled: false,
  customPixDiscountPercent: "0",
  customPaymentNote: "",
  carouselEnabled: true,
  carouselTitle: "Descubra cada detalhe e Compre",
  carouselDescription: "",
  carouselBeforeHeading: "Com Capa",
  carouselDesktopCount: "12",
  carouselMobileCount: "6",
};

export function asSettings(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function pathsFromText(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pathsToText(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).join("\n") : "";
}

/**
 * Single source of truth for the widget personalization form: one state
 * object for every field, hydration from the saved floating widget row and
 * the plan-based carousel auto-disable, plus the `buildLauncherSettings`
 * payload builder (server contract — key names must not change).
 */
export function useWidgetSettingsForm({
  floatingWidget,
  canUseHorizontalFeed,
}: {
  floatingWidget: Record<string, any> | null;
  canUseHorizontalFeed: boolean;
}) {
  const [form, setForm] = React.useState<WidgetSettingsForm>(defaultForm);

  const setField = React.useCallback<SetWidgetSettingsField>((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  React.useEffect(() => {
    if (!floatingWidget) return;
    const settings = asSettings(floatingWidget.settings);
    const appearance = asSettings(settings.appearance);
    const display = asSettings(settings.display);
    const commerce = asSettings(settings.commerce);
    const carousel = asSettings(settings.carousel);

    setForm({
      launcherPosition: String(appearance.position || "bottom-left"),
      launcherAccent: String(appearance.accent_color || "#176BFF"),
      launcherBackground: String(appearance.background_color || "#0F172A"),
      launcherTextColor: String(appearance.text_color || "#ffffff"),
      launcherLabel: String(appearance.label ?? "VIDEO DO PRODUTO"),
      launcherFont: String(
        appearance.font_family || "Inter, system-ui, sans-serif",
      ),
      launcherSize: String(appearance.bubble_size || "74"),
      launcherModel: String(appearance.model || "circular"),
      fixedVideo: Boolean(appearance.fixed_video),
      allowClose: appearance.allow_close !== false,
      randomizeThumbnail: Boolean(appearance.randomize_thumbnail),
      excludePaths:
        pathsToText(display.exclude_paths) || "/checkout\n/carrinho\n/cart",
      homeExperienceEnabled: display.home_experience_enabled !== false,
      homeOrdering: String(display.home_ordering || "manual"),
      customInstallmentsEnabled: Boolean(commerce.custom_installments_enabled),
      customInstallmentsCount: String(
        commerce.custom_installments_count || "6",
      ),
      customInstallmentsInterestFree:
        commerce.custom_installments_interest_free !== false,
      customPixDiscountEnabled: Boolean(commerce.custom_pix_discount_enabled),
      customPixDiscountPercent: String(
        commerce.custom_pix_discount_percent || "0",
      ),
      customPaymentNote: String(commerce.custom_payment_note || ""),
      carouselEnabled: carousel.enabled !== false,
      carouselTitle: String(carousel.title || "Descubra cada detalhe e Compre"),
      carouselDescription: String(carousel.description || ""),
      carouselBeforeHeading: String(carousel.before_heading || "Com Capa"),
      carouselDesktopCount: String(carousel.max_items || "12"),
      carouselMobileCount: String(carousel.mobile_max_items || "6"),
    });
  }, [floatingWidget?.id, floatingWidget?.updated_at]);

  React.useEffect(() => {
    if (!canUseHorizontalFeed && form.carouselEnabled) {
      setForm((prev) => ({ ...prev, carouselEnabled: false }));
    }
  }, [canUseHorizontalFeed, form.carouselEnabled]);

  const buildLauncherSettings = (currentSettings: Record<string, any>) => ({
    ...currentSettings,
    appearance: {
      accent_color: form.launcherAccent,
      allow_close: form.allowClose,
      background_color: form.launcherBackground,
      bubble_size: Number(form.launcherSize) || 74,
      fixed_video: form.fixedVideo,
      font_family: form.launcherFont,
      label: form.launcherLabel,
      model: form.launcherModel,
      position: form.launcherPosition,
      randomize_thumbnail: form.randomizeThumbnail,
      text_color: form.launcherTextColor,
    },
    display: {
      exclude_paths: pathsFromText(form.excludePaths),
      hide_without_videos: false,
      home_experience_enabled: form.homeExperienceEnabled,
      home_ordering: form.homeOrdering,
      include_paths: [],
      mode: "all",
      product_mode: "linked_or_all",
    },
    commerce: {
      custom_installments_enabled: form.customInstallmentsEnabled,
      custom_installments_count: Number(form.customInstallmentsCount) || 1,
      custom_installments_interest_free: form.customInstallmentsInterestFree,
      custom_pix_discount_enabled: form.customPixDiscountEnabled,
      custom_pix_discount_percent: Number(form.customPixDiscountPercent) || 0,
      custom_payment_note: form.customPaymentNote.trim(),
    },
    carousel: {
      enabled: canUseHorizontalFeed && form.carouselEnabled,
      title: form.carouselTitle.trim() || "Descubra cada detalhe e Compre",
      description: form.carouselDescription.trim(),
      before_heading: form.carouselBeforeHeading.trim() || "Com Capa",
      max_items: Number(form.carouselDesktopCount) || 12,
      mobile_max_items: Number(form.carouselMobileCount) || 6,
    },
  });

  return { form, setField, buildLauncherSettings };
}
