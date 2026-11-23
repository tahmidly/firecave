/**
 * Firecave mark as a standalone SVG string, shared by the in-app <Logo> and the app-icon generator.
 * A violet tile, a dark cave mouth with a bright rim, and a campfire burning inside it.
 */
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="fc-bg" x1="8" y1="4" x2="56" y2="62" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#a78bfa"/>
      <stop offset="0.45" stop-color="#7c3aed"/>
      <stop offset="1" stop-color="#3b0f8c"/>
    </linearGradient>
    <radialGradient id="fc-gloss" cx="20" cy="8" r="40" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fc-cave" x1="32" y1="17" x2="32" y2="52" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1a0b3d"/>
      <stop offset="1" stop-color="#2b1263"/>
    </linearGradient>
    <radialGradient id="fc-glow" cx="32" cy="44" r="16" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f0abfc" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#f0abfc" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fc-flame" x1="32" y1="25" x2="32" y2="49" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fdf4ff"/>
      <stop offset="0.45" stop-color="#f5d0fe"/>
      <stop offset="1" stop-color="#e879f9"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#fc-bg)"/>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#fc-gloss)"/>
  <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="15.25" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.5"/>
  <path d="M13 52V35a19 19 0 0 1 38 0v17Z" fill="url(#fc-cave)"/>
  <path d="M13 52V35a19 19 0 0 1 38 0v17" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="32" cy="46" rx="15" ry="9" fill="url(#fc-glow)"/>
  <path d="M32 25.5c1.2 4.3 6.8 7.3 6.8 13.6A6.8 6.8 0 0 1 32 46a6.8 6.8 0 0 1-6.8-6.9c0-3.3 1.9-5.4 3.4-6.7.2 2 1 3.4 2.2 3.9-.4-4 .4-7.5 1.2-10.8Z" fill="url(#fc-flame)"/>
  <path d="M32 35.5c.7 1.9 3 3.1 3 5.6a3 3 0 0 1-6 0c0-1.6.9-2.6 1.6-3.2.1 1 .5 1.6 1 1.8-.1-1.6.1-2.9.4-4.2Z" fill="#ffffff"/>
  <path d="M24.5 49.5 39.5 46M24.5 46l15 3.5" stroke="#f5d0fe" stroke-opacity="0.9" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;
