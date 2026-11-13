import type { MetadataRoute } from "next";

/** Рабочее место сотрудников не индексируется. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
