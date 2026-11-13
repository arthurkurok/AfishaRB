import { notFound } from "next/navigation";

/** Любой неизвестный адрес внутри сайта — 404 с шапкой и подвалом. */
export default function CatchAll() {
  notFound();
}
