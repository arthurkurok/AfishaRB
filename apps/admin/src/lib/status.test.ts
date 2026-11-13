import { describe, expect, it } from "vitest";
import { statusBadge, statusText } from "./labels";
import { availableActions, buildStatusBody, coerceActionInput, dialogTitle, successMessage } from "./status";

const UFA = "Asia/Yekaterinburg";
const now = new Date("2026-11-02T10:00:00+05:00");
const future = "2026-11-10T19:00:00+05:00";

describe("доступные действия по статусу", () => {
  it("по плану: отменить, перенести, распродано", () => {
    expect(availableActions({ status: "scheduled", starts_at: future }, now)).toEqual([
      "cancel",
      "reschedule",
      "sold_out",
    ]);
  });

  it("отменён — только вернуть по плану", () => {
    expect(availableActions({ status: "cancelled", starts_at: future }, now)).toEqual(["restore"]);
  });

  it("распродан и отложен — можно вернуть, перенести, отменить", () => {
    expect(availableActions({ status: "sold_out", starts_at: future }, now)).toEqual([
      "restore",
      "reschedule",
      "cancel",
    ]);
    expect(availableActions({ status: "postponed", starts_at: future }, now)).toEqual([
      "reschedule",
      "restore",
      "cancel",
    ]);
  });

  it("перенесённый (старый) сеанс и прошедший — без действий", () => {
    expect(availableActions({ status: "rescheduled", starts_at: future }, now)).toEqual([]);
    expect(availableActions({ status: "ended", starts_at: future }, now)).toEqual([]);
    expect(availableActions({ status: "scheduled", starts_at: "2026-11-01T19:00:00+05:00" }, now)).toEqual([]);
  });

  it("длительное событие, которое ещё идёт, можно менять", () => {
    expect(
      availableActions(
        {
          status: "scheduled",
          starts_at: "2026-10-01T10:00:00+05:00",
          ends_at: "2026-12-01T18:00:00+05:00",
          is_range: true,
        },
        now,
      ),
    ).toEqual(["cancel", "reschedule", "sold_out"]);
  });
});

describe("тело запроса смены статуса", () => {
  it("отмена требует причину", () => {
    expect(buildStatusBody("cancel", { reason: "  " }, UFA, now)).toEqual({
      ok: false,
      errors: { reason: "Укажите причину отмены — её увидят подписчики" },
    });
    expect(buildStatusBody("cancel", { reason: " Болезнь артиста " }, UFA, now)).toEqual({
      ok: true,
      body: { status: "cancelled", reason: "Болезнь артиста" },
    });
  });

  it("причина не длиннее 300 символов", () => {
    const res = buildStatusBody("cancel", { reason: "а".repeat(301) }, UFA, now);
    expect(res.ok).toBe(false);
  });

  it("перенос: дата и время по Уфе → new_starts_at с +05:00", () => {
    expect(buildStatusBody("reschedule", { date: "2026-11-20", time: "18:30" }, UFA, now)).toEqual({
      ok: true,
      body: { status: "rescheduled", new_starts_at: "2026-11-20T18:30:00+05:00" },
    });
  });

  it("перенос в прошлое и без даты — ошибки", () => {
    const past = buildStatusBody("reschedule", { date: "2026-11-01", time: "18:30" }, UFA, now);
    expect(past).toEqual({ ok: false, errors: { date: "Новая дата должна быть в будущем" } });
    const empty = buildStatusBody("reschedule", {}, UFA, now);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(Object.keys(empty.errors).sort()).toEqual(["date", "time"]);
  });

  it("перенос без известной даты → postponed", () => {
    expect(buildStatusBody("reschedule", { dateUnknown: true, reason: "Ремонт зала" }, UFA, now)).toEqual({
      ok: true,
      body: { status: "postponed", reason: "Ремонт зала" },
    });
  });

  it("распродано и вернуть по плану", () => {
    expect(buildStatusBody("sold_out", {}, UFA, now)).toEqual({ ok: true, body: { status: "sold_out" } });
    expect(buildStatusBody("restore", {}, UFA, now)).toEqual({ ok: true, body: { status: "scheduled" } });
  });
});

describe("тексты", () => {
  it("каждое сообщение об успехе говорит про уведомление подписчиков", () => {
    for (const status of ["cancelled", "rescheduled", "postponed", "sold_out", "scheduled"] as const) {
      expect(successMessage({ status })).toContain("Подписчики получат уведомление");
    }
  });

  it("заголовки диалогов", () => {
    expect(dialogTitle("cancel")).toBe("Отменить сеанс");
    expect(dialogTitle("restore")).toBe("Вернуть сеанс по плану");
  });

  it("бейджи — из общего словаря, «по плану» без бейджа", () => {
    expect(statusBadge({ status: "scheduled" })).toBeNull();
    expect(statusBadge({ status: "cancelled" })).toEqual({ kind: "cancelled", label: "Отменено" });
    expect(statusBadge({ status: "scheduled", availability: "sold_out" })).toEqual({
      kind: "sold_out",
      label: "Билетов нет",
    });
    expect(statusBadge({ status: "scheduled", availability: "few_left" })?.kind).toBe("few_left");
    expect(statusText("postponed")).toBe("Перенесено, новая дата уточняется");
  });
});

describe("недоверенный ввод диалога", () => {
  it("нестроковые поля отбрасываются", () => {
    expect(coerceActionInput({ reason: ["x"], date: 1, dateUnknown: "yes" })).toEqual({
      reason: undefined,
      date: undefined,
      time: undefined,
      dateUnknown: false,
    });
    expect(buildStatusBody("cancel", coerceActionInput({ reason: 42 }), UFA, now).ok).toBe(false);
  });
});
