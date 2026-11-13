import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("«Пульс культуры»", () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, "ministry");
  });

  test("показатели, период, табличный вид и сортировка", async ({ page }) => {
    await page.goto("/");
    const kpi = page.getByRole("region", { name: "Ключевые показатели", exact: true });
    await expect(kpi.getByText("Событий в афише")).toBeVisible();
    await expect(kpi.getByText("Охват муниципалитетов")).toBeVisible();

    await page.getByRole("navigation", { name: "Период" }).getByRole("link", { name: "7 дней" }).click();
    await expect(page).toHaveURL(/days=7/);
    await expect(page.getByRole("link", { name: "7 дней" })).toHaveAttribute("aria-current", "page");

    const supply = page.getByRole("region", { name: "Предложение по муниципалитетам", exact: true });
    await expect(supply.getByRole("list").first()).toBeVisible();
    await supply.getByRole("button", { name: "Таблица" }).click();
    await expect(supply.getByRole("table")).toBeVisible();
    await expect(supply.getByRole("columnheader", { name: "Пушкинская карта" })).toBeVisible();

    const quality = page.getByRole("region", { name: "Качество данных учреждений", exact: true });
    const indexHeader = quality.getByRole("columnheader", { name: /Индекс полноты/ });
    await expect(indexHeader).toHaveAttribute("aria-sort", "ascending");
    await indexHeader.getByRole("button").click();
    await expect(indexHeader).toHaveAttribute("aria-sort", "descending");

    await expect(page.getByRole("region", { name: "Спрос без предложения", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Здоровье источников", exact: true })).toContainText("Культура.РФ");
  });

  test("экспорт таблицы «Спрос без предложения» в CSV", async ({ page }) => {
    await page.goto("/?days=30");
    const region = page.getByRole("region", { name: "Спрос без предложения", exact: true });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      region.getByRole("link", { name: "Скачать «Спрос без предложения» в CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^pulse-demand-gaps-30d-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = readFileSync((await download.path())!, "utf8");
    expect(text.startsWith("﻿Где;Что искали;С детьми;Запросов без результата;Пример запроса\r\n")).toBe(true);
  });

  test("неизвестная таблица — 404, без входа — на логин", async ({ page, request }) => {
    expect((await page.request.get("/pulse/export/unknown?days=30")).status()).toBe(404);
    const anon = await request.get("/pulse/export/supply?days=30", { maxRedirects: 0 });
    expect(anon.status()).toBe(307);
  });
});
