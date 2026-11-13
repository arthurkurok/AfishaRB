/** Промежуточная схема события — единая для всех коннекторов (docs/06-data.md §3). */
import type { CategoryCode, TagCode } from "@afisha/contract";
import type { ImageInfo } from "../../db/schema.js";

export type NVenue = {
  externalId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
  municipalityId: string | null;
  municipalityTitle: string | null;
  cultureLocaleId: number | null;
  externalIds: Record<string, unknown>;
};

export type NOrganization = {
  externalId: string;
  name: string;
  shortName: string | null;
  externalIds: Record<string, unknown>;
};

export type NSession = {
  externalId: string;
  venueExternalId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  isRange: boolean;
  ticketUrl: string | null;
};

export type NormalizedEvent = {
  sourceId: string;
  externalId: string;
  title: string;
  summary: string;
  descriptionHtml: string;
  categories: CategoryCode[];
  tags: TagCode[];
  sourceGenres: string[];
  ageRating: number | null;
  priceMin: string | null;
  priceMax: string | null;
  isFree: boolean;
  pushkinCard: boolean;
  accessible: boolean;
  isPermanent: boolean;
  ticketUrl: string | null;
  images: ImageInfo[];
  organization: NOrganization | null;
  venues: NVenue[];
  sessions: NSession[];
  sourceUrl: string | null;
  sourceUpdatedAt: Date | null;
  languages: string[];
};
