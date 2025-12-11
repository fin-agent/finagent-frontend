import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public');
const iconsDir = join(publicDir, 'icons');

// Icon sizes needed for PWA
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Create a simple but striking icon programmatically
async function generateIcon(size) {
  const padding = Math.round(size * 0.12);
  const innerSize = size - padding * 2;

  // Create the icon with SVG
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f1014"/>
          <stop offset="100%" style="stop-color:#0a0a0c"/>
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#00ff88"/>
          <stop offset="100%" style="stop-color:#00d4ff"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="${size * 0.02}" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- Background -->
      <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="url(#bg)"/>

      <!-- Border -->
      <rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}"
            rx="${size * 0.08}" fill="none" stroke="#2a2d35" stroke-width="${size * 0.006}"/>

      <!-- Trading chart line -->
      <polyline
        points="${padding + innerSize * 0.15},${padding + innerSize * 0.75}
                ${padding + innerSize * 0.35},${padding + innerSize * 0.55}
                ${padding + innerSize * 0.45},${padding + innerSize * 0.65}
                ${padding + innerSize * 0.65},${padding + innerSize * 0.35}
                ${padding + innerSize * 0.85},${padding + innerSize * 0.2}"
        fill="none"
        stroke="url(#accent)"
        stroke-width="${size * 0.04}"
        stroke-linecap="round"
        stroke-linejoin="round"
        filter="url(#glow)"
      />

      <!-- End point highlight -->
      <circle cx="${padding + innerSize * 0.85}" cy="${padding + innerSize * 0.2}"
              r="${size * 0.04}" fill="#00d4ff" filter="url(#glow)"/>

      <!-- Corner accents -->
      <path d="${padding},${padding + innerSize * 0.15} L${padding},${padding} L${padding + innerSize * 0.15},${padding}"
            fill="none" stroke="#00ff88" stroke-width="${size * 0.015}" stroke-linecap="round" opacity="0.7"/>
      <path d="${size - padding},${size - padding - innerSize * 0.15} L${size - padding},${size - padding} L${size - padding - innerSize * 0.15},${size - padding}"
            fill="none" stroke="#00ff88" stroke-width="${size * 0.015}" stroke-linecap="round" opacity="0.7"/>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(iconsDir, `icon-${size}x${size}.png`));

  console.log(`Generated icon-${size}x${size}.png`);
}

// Generate Apple touch icon (needs to be square without transparency for best results)
async function generateAppleTouchIcon() {
  const size = 180;
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#0f1014"/>
          <stop offset="100%" style="stop-color:#0a0a0c"/>
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#00ff88"/>
          <stop offset="100%" style="stop-color:#00d4ff"/>
        </linearGradient>
      </defs>

      <!-- Solid background for Apple -->
      <rect width="${size}" height="${size}" fill="#0a0a0c"/>

      <!-- Trading chart -->
      <polyline
        points="30,135 54,99 72,117 108,63 144,36"
        fill="none"
        stroke="url(#accent)"
        stroke-width="8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- End point -->
      <circle cx="144" cy="36" r="8" fill="#00d4ff"/>

      <!-- Corner accents -->
      <path d="M15,40 L15,15 L40,15" fill="none" stroke="#00ff88" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
      <path d="M165,140 L165,165 L140,165" fill="none" stroke="#00ff88" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, 'apple-touch-icon.png'));

  console.log('Generated apple-touch-icon.png');
}

// Generate favicon
async function generateFavicon() {
  const size = 32;
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="6" fill="#0a0a0c"/>
      <polyline
        points="6,24 12,16 16,20 22,10 26,6"
        fill="none"
        stroke="#00ff88"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="26" cy="6" r="3" fill="#00d4ff"/>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, 'favicon.png'));

  // Also create ico-style favicon
  await sharp(Buffer.from(svg))
    .resize(32, 32)
    .png()
    .toFile(join(publicDir, 'favicon-32x32.png'));

  const svg16 = `
    <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" rx="3" fill="#0a0a0c"/>
      <polyline
        points="3,12 6,8 8,10 11,5 13,3"
        fill="none"
        stroke="#00ff88"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="13" cy="3" r="1.5" fill="#00d4ff"/>
    </svg>
  `;

  await sharp(Buffer.from(svg16))
    .png()
    .toFile(join(publicDir, 'favicon-16x16.png'));

  console.log('Generated favicons');
}

async function main() {
  // Ensure icons directory exists
  await mkdir(iconsDir, { recursive: true });

  // Generate all icon sizes
  for (const size of sizes) {
    await generateIcon(size);
  }

  // Generate Apple touch icon
  await generateAppleTouchIcon();

  // Generate favicons
  await generateFavicon();

  console.log('\nAll icons generated successfully!');
}

main().catch(console.error);
