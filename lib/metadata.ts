import type { Metadata } from "next";

const APP_NAME = "Tri-Star Pickleball";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://tristarpickleball.com";
const DEFAULT_OG_IMAGE = "/TriStarPB-dark-Photoroom.png";

/**
 * Build a consistent `Metadata` object for any route.
 *
 * Usage in a server component:
 *
 *   export async function generateMetadata({ params }): Promise<Metadata> {
 *     const { name } = await fetchGroup(params.slug);
 *     return pageMetadata({
 *       title: name,
 *       description: `Ladder standings and sign-ups for ${name}.`,
 *       path: `/groups/${params.slug}`,
 *     });
 *   }
 *
 * Every field has a sensible default pulled from the root layout.
 * - `title` gets suffixed with " — Tri-Star Pickleball" unless already present.
 * - `path` is used for the canonical URL so shared links resolve cleanly.
 * - `image` defaults to the brand hero image.
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
  type = "website",
}: {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article" | "profile";
}): Metadata {
  const fullTitle = title.includes(APP_NAME) ? title : `${title} — ${APP_NAME}`;
  const url = path ? `${APP_URL}${path.startsWith("/") ? path : "/" + path}` : APP_URL;
  const ogImage = image ?? DEFAULT_OG_IMAGE;
  const desc = description ?? "Pickleball ladder league platform";

  return {
    title: fullTitle,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description: desc,
      url,
      siteName: APP_NAME,
      type,
      images: [{ url: ogImage, alt: fullTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: desc,
      images: [ogImage],
    },
  };
}
