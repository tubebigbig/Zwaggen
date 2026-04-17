import type { SVGProps } from 'react';

const base = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconSave = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>
);
export const IconFolder = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z" /></svg>
);
export const IconFile = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
);
export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></svg>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
);
export const IconSend = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M20 6 9 17l-5-5" /></svg>
);
export const IconAlert = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
);
export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const IconCube = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.27 6.96 8.73 5.05 8.73-5.05M12 22V12" /></svg>
);
export const IconGlobe = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
);
export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);
export const IconList = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
);
export const IconChevronLeft = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="m15 18-6-6 6-6" /></svg>
);
export const IconChevronRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="m9 18 6-6-6-6" /></svg>
);
export const IconChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const IconPanelLeft = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></svg>
);
export const IconPanelRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /></svg>
);
export const IconClipboard = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="9" y="2" width="6" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>
);
