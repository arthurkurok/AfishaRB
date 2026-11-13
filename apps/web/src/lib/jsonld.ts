/**
 * JSON-LD schema.org/Event для паспорта события (03-functional-spec §1.5 п. 10).
 * Один Event на каждый сеанс (рекомендация поисковиков для повторяющихся событий), не больше 20.
 */
import type { EventDetail, OccurrenceStatus } from "@afisha/contract";
import { money } from "./format";

const EVENT_STATUS: Record<OccurrenceStatus, string> = {
  scheduled: "https://schema.org/EventScheduled",
  rescheduled: "https://schema.org/EventRescheduled",
  postponed: "https://schema.org/EventPostponed",
  cancelled: "https://schema.org/EventCancelled",
  sold_out: "https://schema.org/EventScheduled",
  unverified: "https://schema.org/EventScheduled",
  ended: "https://schema.org/EventScheduled",
};

export function eventStatusUrl(status: OccurrenceStatus): string {
  return EVENT_STATUS[status];
}

export function eventJsonLd(event: EventDetail, pageUrl: string): Record<string, unknown> {
  const images = [event.image, ...event.images].filter(Boolean).map((i) => i!.url);
  const min = money(event.price.min);
  const max = money(event.price.max);
  const occurrences = event.occurrences.slice(0, 20);
  const graph = occurrences.map((o) => {
    const node: Record<string, unknown> = {
      "@type": "Event",
      "@id": `${pageUrl}#${o.id}`,
      name: event.title,
      description: event.summary,
      url: pageUrl,
      startDate: o.starts_at,
      eventStatus: eventStatusUrl(o.status),
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      inLanguage: event.languages.length ? event.languages : undefined,
      typicalAgeRange: `${event.age_rating}-`,
      isAccessibleForFree: event.price.is_free || undefined,
      image: images.length ? [...new Set(images)] : undefined,
    };
    if (o.ends_at) node.endDate = o.ends_at;
    if (o.status === "rescheduled" && o.previous_starts_at) node.previousStartDate = o.previous_starts_at;
    if (o.venue) {
      node.location = {
        "@type": "Place",
        name: o.venue.name,
        address: o.venue.address
          ? {
              "@type": "PostalAddress",
              streetAddress: o.venue.address,
              addressRegion: "Республика Башкортостан",
              addressCountry: "RU",
            }
          : undefined,
        geo: o.venue.geo
          ? { "@type": "GeoCoordinates", latitude: o.venue.geo[0], longitude: o.venue.geo[1] }
          : undefined,
      };
    }
    if (event.organization) node.organizer = { "@type": "Organization", name: event.organization };
    const availability =
      o.status === "sold_out" || o.availability === "sold_out"
        ? "https://schema.org/SoldOut"
        : o.availability === "few_left"
          ? "https://schema.org/LimitedAvailability"
          : "https://schema.org/InStock";
    if (event.price.is_free) {
      node.offers = { "@type": "Offer", price: 0, priceCurrency: "RUB", availability, url: pageUrl };
    } else if (min !== null || max !== null) {
      node.offers = {
        "@type": min !== null && max !== null && max > min ? "AggregateOffer" : "Offer",
        ...(min !== null && max !== null && max > min ? { lowPrice: min, highPrice: max } : { price: min ?? max }),
        priceCurrency: "RUB",
        availability,
        url: o.ticket_url ?? event.ticket_url ?? pageUrl,
      };
    }
    return node;
  });
  return { "@context": "https://schema.org", "@graph": graph };
}

/** Сериализация для <script type="application/ld+json">: экранируем «<», чтобы нельзя было закрыть тег. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
