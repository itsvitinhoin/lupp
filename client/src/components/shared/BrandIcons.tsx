import React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal SVG brand marks for the commerce/marketing providers Luup talks
 * about. Deliberately simple geometry in each brand's color (not traced
 * trademarks) so they render crisply at chip sizes in both themes.
 * Resolve by free-form provider name via <BrandIcon brand="..." />.
 */

type IconProps = { className?: string };

function Svg({
  children,
  className,
  label,
}: IconProps & { children: React.ReactNode; label: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      className={cn("h-5 w-5 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

export function NuvemshopIcon({ className }: IconProps) {
  return (
    <Svg className={className} label="Nuvemshop">
      <path
        d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
        fill="#0050FF"
      />
    </Svg>
  );
}

export function ShopifyIcon({ className }: IconProps) {
  return (
    <Svg className={className} label="Shopify">
      <path
        d="M9 8V7a3 3 0 0 1 6 0v1"
        fill="none"
        stroke="#5E8E3E"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="4.5" y="8" width="15" height="12.5" rx="2.5" fill="#95BF47" />
      <path
        d="M9.8 16.2c.5.5 1.3.8 2.2.8 1.4 0 2.4-.7 2.4-1.9 0-2.2-3.9-1.7-3.9-3.4 0-.9.8-1.4 1.9-1.4.7 0 1.4.2 1.9.6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function TrayIcon({ className }: IconProps) {
  return (
    <Svg className={className} label="Tray">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#0F6BFF" />
      <path
        d="M6.5 11.5v2.5a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3v-2.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 6.5v6"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function UpzeroIcon({ className }: IconProps) {
  return (
    <Svg className={className} label="Upzero">
      <circle cx="12" cy="12" r="9.5" fill="#7C3AED" />
      <path
        d="M12 16.5v-9M8.5 11 12 7.5 15.5 11"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function GoogleIcon({ className }: IconProps) {
  // The four-color "G": one quadrant arc per brand color + the blue bar.
  return (
    <Svg className={className} label="Google">
      <g fill="none" strokeWidth="3">
        {/* Right side stays open above the bar — the G's signature gap. */}
        <path d="M12 4.5a7.5 7.5 0 0 1 5.3 2.2" stroke="#4285F4" />
        <path d="M12 4.5A7.5 7.5 0 0 0 4.5 12" stroke="#EA4335" />
        <path d="M4.5 12A7.5 7.5 0 0 0 12 19.5" stroke="#FBBC05" />
        <path d="M12 19.5A7.5 7.5 0 0 0 19.5 12" stroke="#34A853" />
      </g>
      <path d="M12 10.5h9v3h-9z" fill="#4285F4" />
    </Svg>
  );
}

export function MetaIcon({ className }: IconProps) {
  return (
    <Svg className={className} label="Meta">
      <g fill="none" stroke="#0081FB" strokeWidth="2.2">
        <ellipse cx="8.2" cy="12" rx="4.7" ry="5.5" />
        <ellipse cx="15.8" cy="12" rx="4.7" ry="5.5" />
      </g>
    </Svg>
  );
}

export function VtexIcon({ className }: IconProps) {
  return (
    <Svg className={className} label="VTEX">
      <path d="M2.5 5.5h7l2.5 5 2.5-5h7L12 21.5 2.5 5.5Z" fill="#F71963" />
      <path d="M9.5 5.5h5L12 10.5 9.5 5.5Z" fill="#FFB6CC" />
    </Svg>
  );
}

export function TiktokIcon({ className }: IconProps) {
  const note =
    "M14.5 4c.4 2.4 2.1 4 4.5 4.2v2.7c-1.7 0-3.2-.5-4.5-1.4v4.9a5.2 5.2 0 1 1-5.2-5.2c.3 0 .6 0 .9.1v2.8a2.5 2.5 0 1 0 1.6 2.3V4h2.7Z";
  return (
    <Svg className={className} label="TikTok">
      <path d={note} fill="#25F4EE" transform="translate(-0.7,-0.5)" />
      <path d={note} fill="#FE2C55" transform="translate(0.7,0.5)" />
      <path d={note} fill="#0A0A0A" className="dark:fill-white" />
    </Svg>
  );
}

export function WhatsappIcon({ className }: IconProps) {
  return (
    <Svg className={className} label="WhatsApp">
      <path
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z"
        fill="#25D366"
      />
      <path
        d="M8.2 8.6c.3 3.9 3.3 6.9 7.2 7.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="8.4" cy="8.4" r="1.5" fill="#fff" />
      <circle cx="15.6" cy="15.6" r="1.5" fill="#fff" />
    </Svg>
  );
}

const BRAND_MATCHERS: Array<{
  Icon: React.ComponentType<IconProps>;
  match: RegExp;
}> = [
  { Icon: NuvemshopIcon, match: /nuvemshop|tiendanube/ },
  { Icon: ShopifyIcon, match: /shopify/ },
  { Icon: TrayIcon, match: /tray/ },
  { Icon: UpzeroIcon, match: /up\s*zero|upzero/ },
  { Icon: GoogleIcon, match: /google/ },
  { Icon: MetaIcon, match: /meta|facebook/ },
  { Icon: VtexIcon, match: /vtex/ },
  { Icon: TiktokIcon, match: /tik\s*tok|tiktok/ },
  { Icon: WhatsappIcon, match: /whatsapp/ },
];

export function brandIconFor(name?: string | null) {
  if (!name) return null;
  const normalized = name.toLowerCase();
  return BRAND_MATCHERS.find(({ match }) => match.test(normalized))?.Icon ?? null;
}

/** Renders the brand mark matching a provider name, or nothing when unknown. */
export function BrandIcon({
  brand,
  className,
}: {
  brand?: string | null;
  className?: string;
}) {
  const Icon = brandIconFor(brand);
  return Icon ? <Icon className={className} /> : null;
}
