import { lightTheme, radius } from "@csa/design-tokens";

/**
 * The tab icon, generated from the tokens.
 *
 * Not a checked-in bitmap and not a hex in a file: the ground and its ink come
 * from `brand.solid`, which is the logo's own pairing (#FFFFFF on the red
 * measured off the CSA mark), and the corner radius comes from the radius
 * scale. If the brand token moves, this moves with it.
 *
 * It is a token-built wordmark, NOT CSA's actual logo artwork — this repo has
 * no licence to ship that, and the prototype should not imply it does.
 */
export function GET(): Response {
  const { ground, ink } = lightTheme.brand.solid;
  const side = 64;
  const corner = Math.round((radius.card / 40) * side);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side}" height="${side}">`,
    `<rect width="${side}" height="${side}" rx="${corner}" fill="${ground}"/>`,
    `<text x="50%" y="50%" dy="0.36em" text-anchor="middle" fill="${ink}"`,
    ` font-family="system-ui, sans-serif" font-size="26" font-weight="700" letter-spacing="-0.5">CSA</text>`,
    `</svg>`,
  ].join("");

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=3600",
    },
  });
}
