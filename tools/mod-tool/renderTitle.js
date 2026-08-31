// Renders a mini-game title banner PNG (e.g. "STROOP" -> Stroop Title.png) matching the visual
// style baked into public/UI/Ui Text File.psd's title text layer — a chunky yellow-to-orange
// gradient fill, a dark-red outside stroke, a hard offset "extrusion" shadow, a soft ambient
// shadow, and a subtle inner shade/highlight pair for dimensionality. Parameters below are
// transcribed directly off that layer's Layer Style dialog (Stroke/Inner Shadow x2/Gradient
// Overlay/Drop Shadow x2 panels) — not re-derived — so they should match Photoshop exactly. If
// the PSD's style ever changes, open the "stroop" layer's Layer Style dialog and update these to
// match, panel by panel.
//
// Uses Berlin Sans FB Bold, the exact font the PSD layer uses — this machine has it installed
// (it ships with Microsoft Office), so registerFont() below just points at the system file
// directly. Never copy/bundle that .ttf into the repo: it's a licensed commercial font. Only the
// *rendered pixels* (the PNG this produces) are project assets, exactly like exporting from
// Photoshop by hand would give you.
import { createCanvas, registerFont } from 'canvas';
import fs from 'node:fs';

const FONT_FAMILY = 'BerlinSansFB-Bold-ModTool';
const FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\BRLNSB.TTF',
  '/mnt/c/Windows/Fonts/BRLNSB.TTF',
];

let fontReady = false;
function ensureFont() {
  if (fontReady) return true;
  const path = FONT_CANDIDATES.find((p) => fs.existsSync(p));
  if (!path) return false;
  registerFont(path, { family: FONT_FAMILY });
  fontReady = true;
  return true;
}

// Gradient Overlay panel: ffea00 @ 21%, fe9d03 @ 82%, Angle 90°, Reverse checked (-> yellow top,
// orange bottom).
const GRADIENT_STOPS = [
  { offset: 0.21, color: 'rgb(255, 234, 0)' },
  { offset: 0.82, color: 'rgb(254, 157, 3)' },
];
// Stroke panel: Size 5px, Position Outside, color 590002.
const STROKE_COLOR = 'rgb(89, 0, 2)';
// Drop Shadow #1 (the hard "extrusion") panel: Blend Normal, Opacity 100%, color 890002,
// Distance 12px, Spread(Choke) 100%, Size 2px.
const EXTRUDE_COLOR = 'rgb(137, 0, 2)';
// Drop Shadow #2 (the soft ambient shadow) panel: Blend Multiply, Opacity 30%, color 000000,
// Distance 20px, Spread 0%, Size 6px.
const AMBIENT_COLOR = 'rgba(0, 0, 0, 0.3)';
// Inner Shadow #1 (shade) panel: color c24a1b, Opacity 70%, Angle -90° (not global light),
// Distance 4px, Size 0px.
const INNER_SHADE_COLOR = 'rgba(194, 74, 27, 0.7)';
// Inner Shadow #2 (highlight) panel: color fff9de, Opacity 100%, Angle 90° (not global light),
// Distance 4px, Size 0px.
const INNER_HIGHLIGHT_COLOR = 'rgba(255, 249, 222, 1)';

// Both drop shadows use Angle 90° with "Use Global Light" checked. Photoshop's angle dial is
// standard math convention (0°=right, 90°=up, increasing counterclockwise), so a 90° light
// source casts its shadow straight down — no horizontal lean at all.
const SHADOW_DX = 0;
const SHADOW_DY = 1;

// Every size below is defined at a 100px em-size baseline, then scaled together by SCALE — the
// existing exported PNGs (Stroop Title.png, Swipe.png) are 110px tall, not the PSD's native
// 100pt text size, so everything (stroke width, shadow distances/blur, padding) has to shrink
// together or the outline/shadow reads as too heavy for the letters.
const SCALE = 0.61;
const FONT_SIZE = 100 * SCALE;
const STROKE_WIDTH = 5 * SCALE; // total outside width; canvas draws it centered, see draw() for the x2 trick
const EXTRUDE_DISTANCE = 12 * SCALE;
const EXTRUDE_BLUR = 2 * SCALE;
const AMBIENT_DISTANCE = 20 * SCALE;
const AMBIENT_BLUR = 6 * SCALE;
const INNER_OFFSET = 4 * SCALE;
const PAD_X = 40 * SCALE;
const PAD_TOP = 34 * SCALE;
const PAD_BOTTOM = 46 * SCALE;

function fontString() {
  return `${FONT_SIZE}px "${FONT_FAMILY}"`;
}

// Draws the plain stroke+fill silhouette (no gradient, no inner shading) in a single solid
// color — used for the two drop-shadow passes, which only care about the shape's silhouette.
function drawSilhouette(ctx, text, x, y, color) {
  ctx.font = fontString();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = STROKE_WIDTH * 2;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

export function renderTitlePng(text) {
  if (!ensureFont()) {
    throw new Error(
      `Berlin Sans FB Bold not found at any of: ${FONT_CANDIDATES.join(', ')}. ` +
        'It ships with Microsoft Office/Windows — install Office, or add another install path to FONT_CANDIDATES in renderTitle.js.'
    );
  }

  // Measure first on a scratch canvas so the real canvas can be sized to the actual text.
  const scratch = createCanvas(10, 10).getContext('2d');
  scratch.font = fontString();
  const metrics = scratch.measureText(text);
  const textWidth = metrics.width;

  const width = Math.ceil(textWidth + PAD_X * 2 + EXTRUDE_DISTANCE + AMBIENT_BLUR);
  const height = Math.ceil(FONT_SIZE + PAD_TOP + PAD_BOTTOM);
  const x = PAD_X;
  const y = PAD_TOP + FONT_SIZE * 0.78; // baseline offset for this font's cap-height proportions

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Soft ambient shadow — offset, blurred, low opacity, drawn first (furthest back).
  ctx.save();
  ctx.shadowColor = AMBIENT_COLOR;
  ctx.shadowBlur = AMBIENT_BLUR;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  drawSilhouette(ctx, text, x + SHADOW_DX * AMBIENT_DISTANCE, y + SHADOW_DY * AMBIENT_DISTANCE, 'rgba(0,0,0,0.001)');
  ctx.restore();

  // 2. Hard "extrusion" shadow — the chunky offset duplicate that reads as a 3D drop.
  ctx.save();
  ctx.shadowColor = EXTRUDE_COLOR;
  ctx.shadowBlur = EXTRUDE_BLUR;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  drawSilhouette(ctx, text, x + SHADOW_DX * EXTRUDE_DISTANCE, y + SHADOW_DY * EXTRUDE_DISTANCE, EXTRUDE_COLOR);
  ctx.restore();

  // 3. Outside stroke — draw a fat centered stroke first; the fill drawn on top covers the
  // inner half, leaving only the outer half visible (the standard canvas "outside stroke" trick).
  ctx.font = fontString();
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = STROKE_WIDTH * 2;
  ctx.strokeText(text, x, y);

  // 4. Gradient fill.
  const gradient = ctx.createLinearGradient(0, PAD_TOP, 0, PAD_TOP + FONT_SIZE * 0.8);
  GRADIENT_STOPS.forEach((stop) => gradient.addColorStop(stop.offset, stop.color));
  ctx.fillStyle = gradient;
  ctx.fillText(text, x, y);

  // 5. Inner shade + highlight. A real inner shadow only tints a thin band at one edge of the
  // glyph, not the whole face — naively fillText-ing a shifted copy at high opacity paints the
  // *entire* letter and washes out the gradient underneath. Instead: draw the glyph twice on a
  // scratch canvas (once at its normal position, once offset by a few px) and punch the offset
  // copy OUT of the first with 'destination-out' — what's left is exactly the sliver of the
  // glyph the offset copy doesn't cover, i.e. the thin edge band. Tint that sliver with
  // 'source-in', then composite it onto the main canvas.
  function drawInnerEdge(offsetX, offsetY, color) {
    const edge = createCanvas(width, height);
    const ectx = edge.getContext('2d');
    ectx.font = fontString();
    ectx.textBaseline = 'alphabetic';
    ectx.fillStyle = '#000';
    ectx.fillText(text, x, y);
    ectx.globalCompositeOperation = 'destination-out';
    ectx.fillText(text, x + offsetX, y + offsetY);
    ectx.globalCompositeOperation = 'source-in';
    ectx.fillStyle = color;
    ectx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(edge, 0, 0);
    ctx.restore();
  }

  drawInnerEdge(-INNER_OFFSET * SHADOW_DX, -INNER_OFFSET * SHADOW_DY, INNER_SHADE_COLOR);
  drawInnerEdge(INNER_OFFSET * SHADOW_DX, INNER_OFFSET * SHADOW_DY, INNER_HIGHLIGHT_COLOR);

  return canvas.toBuffer('image/png');
}

export function fontAvailable() {
  return ensureFont();
}
