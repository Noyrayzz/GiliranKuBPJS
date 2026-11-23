import type { ReactNode, SVGProps } from "react";

// Ikon garis 16px, stroke 1.5 berujung bulat (panduan: "Icons"). Satu set kecil, tanpa pustaka.
const PATHS: Record<string, ReactNode> = {
  arrowUpRight: <path d="M5 11 11 5M6 5h5v5" />,
  chevronRight: <path d="m6 4 4 4-4 4" />,
  chevronDown: <path d="m4 6 4 4 4-4" />,
  check: <path d="m3.5 8.5 3 3 6-7" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.2l2 1.3" />
    </>
  ),
  bell: <path d="M4 11.5h8l-1-1.5V7a3 3 0 0 0-6 0v3l-1 1.5ZM6.5 13.5a1.5 1.5 0 0 0 3 0" />,
  pill: (
    <>
      <rect x="2" y="5.25" width="12" height="5.5" rx="2.75" transform="rotate(-45 8 8)" />
      <path d="M6.2 9.8 9.8 6.2" />
    </>
  ),
  clipboard: (
    <>
      <rect x="3" y="3" width="10" height="11" rx="1.5" />
      <path d="M6 3V2h4v1M5.5 7.5h5M5.5 10.5h3" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M4 2.5V6a2.5 2.5 0 0 0 5 0V2.5M6.5 8.5V10a3 3 0 0 0 6 0v-.5" />
      <circle cx="12.5" cy="7.75" r="1.5" />
    </>
  ),
  qr: <path d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h1.75v1.75H9.5zM12 12h1.5v1.5H12z" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-1A1.5 1.5 0 0 0 9 3H4.5A1.5 1.5 0 0 0 3 4.5V9a1.5 1.5 0 0 0 1.5 1.5h1" />
    </>
  ),
  refresh: <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v2.75h-2.75" />,
  alert: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.5M8 11h.01" />
    </>
  ),
  x: <path d="m4 4 8 8M12 4l-8 8" />,
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3 13.5a5 5 0 0 1 10 0" />
    </>
  ),
  layers: <path d="m8 2.5 5.5 3L8 8.5l-5.5-3L8 2.5ZM2.5 8.5 8 11.5l5.5-3M2.5 11 8 14l5.5-3" />,
  shield: <path d="M8 2 3 4v4c0 3 2 5 5 6 3-1 5-3 5-6V4L8 2Z" />,
  list: <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />,
  plus: <path d="M8 3v10M3 8h10" />,
  logout: <path d="M6.5 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h2.5M10 5l3 3-3 3M13 8H6" />,
  megaphone: <path d="M3 6.5v3h2l5 3v-9L5 6.5H3ZM12.5 6.5a2.5 2.5 0 0 1 0 3" />,
  play: <path d="M5 3.5v9l7-4.5-7-4.5Z" />,
  flag: <path d="M4 14V2.5M4 3h7.5L10 5.5 11.5 8H4" />,
  box: <path d="M2.5 5 8 2.5 13.5 5v6L8 13.5 2.5 11V5ZM2.5 5 8 7.5 13.5 5M8 7.5v6" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5" />,
  edit: <path d="M3 13h2.5l7-7-2.5-2.5-7 7V13ZM9 4.5 11.5 7" />,
  download: <path d="M8 2.5v7M5 7l3 3 3-3M3 13h10" />,
  wifiOff: <path d="M2.5 6.5a8 8 0 0 1 3-1.7M13.5 6.5a8 8 0 0 0-3.5-2M5 9a4.5 4.5 0 0 1 2-1.1M11 9a4.5 4.5 0 0 0-1.3-.9M8 12h.01M2 2l12 12" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "", ...rest }: { name: IconName } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg viewBox="0 0 16 16" className={`icon ${className}`.trim()} aria-hidden="true" focusable="false" {...rest}>
      {PATHS[name]}
    </svg>
  );
}
