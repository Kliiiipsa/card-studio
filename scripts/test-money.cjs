/*
 * Автотесты денежной логики. Запускаются перед КАЖДОЙ сборкой (package.json:
 * build), то есть сломанное зачисление не доедет до прода: сборка упадёт.
 * Вручную: node scripts/test-money.cjs
 *
 * Без базы и без сети: код зачисления грузится с подменёнными зависимостями
 * (журнал в памяти, платёж из сценария), правила сверки — чистая функция.
 *
 * Появились после 06.11.2026: повторная проверка платежа от 23.09 (записан
 * по старой схеме, бонус внутри суммы) выдала клиенту бонус 500 генов второй
 * раз. Сценарий «старая схема» теперь зафиксирован тестом.
 *
 * ПРАВИЛО: меняешь, как деньги или гены пишутся в журнал, — добавь сюда
 * сценарий на повторную обработку записей, сделанных ПО СТАРОЙ схеме.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.join(__dirname, "..");

/** Загрузить TS-модуль проекта, подменив его импорты. */
function load(rel, mocks = {}) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(rel);
  const req = (id) => {
    if (id in mocks) return mocks[id];
    if (id.startsWith("@/") || id === "server-only") {
      throw new Error(`test-money: нет подмены для импорта ${id} в ${rel}`);
    }
    return require(id);
  };
  new Function("exports", "require", "module", js)(m.exports, req, m);
  return m.exports;
}

const DAY = 86400000;
const ago = (ms) => new Date(Date.now() - ms);

/* ============================ зачисление платежа ============================ */

function payment(id, sparks, bonus, extra = {}) {
  return {
    id,
    status: "succeeded",
    paid: true,
    amount: { value: `${sparks}.00`, currency: "RUB" },
    metadata: {
      email: "client@example.ru",
      sparks: String(sparks),
      bonus: String(bonus),
      ...extra,
    },
  };
}

/** Прогнать verifyAndCredit на журнале в памяти. */
async function credit({ ledger = [], balance = 0, pay, promoOk = true, refereeBonus = 0 }) {
  const rows = new Map(ledger.map((r) => [r.reference, { ...r }]));
  let bal = balance;
  const calls = { promo: 0, referral: 0 };
  const { verifyAndCredit } = load("src/core/billing/yookassa-credit.ts", {
    "@/core/billing/billing": {
      applyTx: async (a) => {
        if (rows.has(a.reference)) return { balance: bal, applied: false };
        rows.set(a.reference, {
          reference: a.reference,
          amount: a.amount,
          type: a.type,
          createdAt: new Date(),
        });
        bal += a.amount;
        return { balance: bal, applied: true };
      },
      getBalance: async () => bal,
      getTxByReference: async (ref) => {
        const r = rows.get(ref);
        return r ? { amount: r.amount, type: r.type, createdAt: r.createdAt } : null;
      },
    },
    "@/core/billing/yookassa": { getPayment: async () => pay },
    "@/core/billing/promo": {
      markTopupBonusUsed: async () => {
        calls.promo++;
        return promoOk;
      },
    },
    "@/core/referrals/referrals": {
      rewardOnPayment: async () => {
        calls.referral++;
        return { refereeBonus };
      },
    },
  });
  const res = await verifyAndCredit(pay.id);
  const sum = (ref) => rows.get(ref)?.amount ?? null;
  return { res, calls, balance: bal, rows, sum };
}

test("новый платёж: пополнение и бонус двумя строками", async () => {
  const r = await credit({ pay: payment("p1", 1000, 100) });
  assert.equal(r.sum("yk-p1"), 1000);
  assert.equal(r.sum("yk-p1:bonus"), 100);
  assert.equal(r.balance, 1100);
  assert.deepEqual(
    { credited: r.res.credited, stale: r.res.stale, sparksTotal: r.res.sparksTotal },
    { credited: true, stale: false, sparksTotal: 1100 },
  );
});

test("тот же платёж повторно через минуту (вебхук + страница): ничего не задваивается", async () => {
  const r = await credit({
    balance: 1100,
    ledger: [
      { reference: "yk-p1", amount: 1000, type: "topup", createdAt: ago(60000) },
      { reference: "yk-p1:bonus", amount: 100, type: "bonus", createdAt: ago(59000) },
    ],
    pay: payment("p1", 1000, 100),
  });
  assert.equal(r.balance, 1100);
  assert.equal(r.rows.size, 2);
  assert.equal(r.res.stale, false);
  // странице есть что показать: «зачислено 1100»
  assert.equal(r.res.sparksTotal, 1100);
});

test("сбой посередине: пополнение записано, бонус нет — повтор дописывает бонус один раз", async () => {
  const r = await credit({
    balance: 1000,
    ledger: [{ reference: "yk-p1", amount: 1000, type: "topup", createdAt: ago(60000) }],
    pay: payment("p1", 1000, 100),
  });
  assert.equal(r.sum("yk-p1:bonus"), 100);
  assert.equal(r.balance, 1100);
});

test("СТАРАЯ СХЕМА (инцидент 06.11.2026): платёж с бонусом внутри суммы не получает бонус второй раз", async () => {
  const r = await credit({
    balance: 50,
    ledger: [{ reference: "yk-old", amount: 3500, type: "topup", createdAt: ago(44 * DAY) }],
    pay: payment("old", 3000, 500),
  });
  assert.equal(r.balance, 50, "баланс не должен измениться");
  assert.equal(r.sum("yk-old:bonus"), null, "строки бонуса быть не должно");
  assert.equal(r.res.stale, true);
  assert.equal(r.res.sparksTotal, 0, "странице нечего показывать как «зачислено»");
  assert.equal(r.calls.referral, 0, "реферальные к старому платежу не начисляются");
});

test("старая схема, записанная минуту назад: бонус внутри суммы — тоже не достраиваем", async () => {
  const r = await credit({
    balance: 3500,
    ledger: [{ reference: "yk-old", amount: 3500, type: "topup", createdAt: ago(60000) }],
    pay: payment("old", 3000, 500),
  });
  assert.equal(r.balance, 3500);
  assert.equal(r.sum("yk-old:bonus"), null);
});

test("новая схема, но платёж закрыт 10 дней назад: ничего не дописываем", async () => {
  const r = await credit({
    balance: 50,
    ledger: [{ reference: "yk-x", amount: 1000, type: "topup", createdAt: ago(10 * DAY) }],
    pay: payment("x", 1000, 100),
  });
  assert.equal(r.balance, 50);
  assert.equal(r.sum("yk-x:bonus"), null);
  assert.equal(r.res.stale, true);
});

test("старый платёж с промокодом: промокод не расходуется", async () => {
  const r = await credit({
    balance: 50,
    ledger: [{ reference: "yk-p", amount: 1300, type: "topup", createdAt: ago(50 * DAY) }],
    pay: payment("p", 1000, 300, { promoCode: "PLUS", promoBonus: "200" }),
  });
  assert.equal(r.calls.promo, 0);
  assert.equal(r.balance, 50);
});

test("новый платёж с промокодом: бонус пакета и промокода одной строкой", async () => {
  const r = await credit({
    pay: payment("np", 1000, 220, { promoCode: "PLUS12", promoBonus: "120" }),
  });
  assert.equal(r.sum("yk-np"), 1000);
  assert.equal(r.sum("yk-np:bonus"), 220);
  assert.equal(r.calls.promo, 1);
});

test("промокод уже израсходован другим платежом: только бонус пакета", async () => {
  const r = await credit({
    promoOk: false,
    pay: payment("np2", 1000, 220, { promoCode: "PLUS12", promoBonus: "120" }),
  });
  assert.equal(r.sum("yk-np2:bonus"), 100);
});

test("платёж не оплачен: ничего не зачисляется", async () => {
  const pay = { ...payment("pend", 1000, 100), status: "pending", paid: false };
  const r = await credit({ pay });
  assert.equal(r.rows.size, 0);
  assert.equal(r.res.credited, false);
  assert.equal(r.res.stale, false);
});

test("чужой платёж без наших metadata: ошибка, а не зачисление вслепую", async () => {
  const pay = { ...payment("alien", 1000, 0), metadata: {} };
  await assert.rejects(() => credit({ pay }));
});

/* =============================== сверка денег =============================== */

const rules = load("src/core/billing/audit-rules.ts");
const NOW = Date.parse("2026-11-06T12:00:00.000Z");
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
let seq = 1;
const row = (type, amount, reference, msAgo, email = "client@example.ru") => ({
  id: seq++,
  email,
  amount,
  type,
  reference,
  createdAt: iso(msAgo),
});
const paid = (id, sparks, bonus, msAgo, email = "client@example.ru") => ({
  id,
  amountRub: sparks,
  paidAt: iso(msAgo),
  email,
  sparks,
  bonus,
});
function audit(over) {
  const recent = over.recent ?? [];
  const topupsByRef = { ...(over.topupsByRef ?? {}) };
  for (const r of recent) if (r.type === "topup" && r.reference) topupsByRef[r.reference] ??= r;
  return rules.auditLedger({
    nowMs: NOW,
    windowStartMs: NOW - 7 * DAY,
    recent,
    topupsByRef,
    balanceIssues: over.balanceIssues ?? [],
    payments: over.payments === undefined ? [] : over.payments,
  });
}
const codes = (f) => f.map((x) => x.code).sort();

test("сверка: правильно зачисленный платёж расхождений не даёт", () => {
  const f = audit({
    recent: [row("topup", 1000, "yk-a", 3600e3), row("bonus", 100, "yk-a:bonus", 3600e3)],
    payments: [paid("a", 1000, 100, 3600e3)],
  });
  assert.deepEqual(f, []);
});

test("сверка ловит инцидент 06.11.2026: бонус к платежу 44-дневной давности", () => {
  const old = row("topup", 3500, "yk-old", 44 * DAY);
  const f = audit({
    recent: [row("bonus", 500, "yk-old:bonus", 600e3)],
    topupsByRef: { "yk-old": old },
  });
  assert.deepEqual(codes(f), ["late-reward"]);
  assert.equal(f[0].severity, "crit");
  assert.equal(f[0].key, "late-reward:yk-old:bonus");
});

test("сверка: реферальные к давнему платежу — тоже расхождение", () => {
  const old = row("topup", 1000, "yk-r", 30 * DAY);
  const f = audit({
    recent: [row("bonus", 100, "ref-pay:r", 600e3, "friend@example.ru")],
    topupsByRef: { "yk-r": old },
  });
  assert.deepEqual(codes(f), ["late-reward"]);
});

test("сверка: бонус к платежу, которого нет в журнале", () => {
  const f = audit({ recent: [row("bonus", 100, "yk-ghost:bonus", 600e3)] });
  assert.deepEqual(codes(f), ["reward-without-topup"]);
});

test("сверка: оплата прошла, гены не зачислены (после 20 минут ожидания)", () => {
  assert.deepEqual(codes(audit({ payments: [paid("lost", 1000, 100, 30 * 60e3)] })), [
    "paid-not-credited",
  ]);
  // пять минут назад — ещё ждём вебхук, тревоги нет
  assert.deepEqual(audit({ payments: [paid("fresh", 1000, 100, 5 * 60e3)] }), []);
});

test("сверка: зачислено не столько, сколько оплачено", () => {
  const f = audit({
    recent: [row("topup", 3000, "yk-m", 3600e3)],
    payments: [paid("m", 1000, 0, 3600e3)],
  });
  assert.deepEqual(codes(f), ["topup-amount-mismatch"]);
});

test("сверка: зачислено не тому, кто платил", () => {
  const f = audit({
    recent: [row("topup", 1000, "yk-w", 3600e3, "other@example.ru")],
    payments: [paid("w", 1000, 0, 3600e3)],
  });
  assert.deepEqual(codes(f), ["topup-amount-mismatch"]);
});

test("сверка: бонус больше обещанного в платеже", () => {
  const f = audit({
    recent: [row("topup", 1000, "yk-b", 3600e3), row("bonus", 500, "yk-b:bonus", 3600e3)],
    payments: [paid("b", 1000, 100, 3600e3)],
  });
  assert.deepEqual(codes(f), ["bonus-over-promised"]);
});

test("сверка: пополнение без успешного платежа в ЮKassa", () => {
  const f = audit({ recent: [row("topup", 1000, "yk-fake", 3600e3)], payments: [] });
  assert.deepEqual(codes(f), ["topup-without-payment"]);
});

test("сверка: пополнение не через ЮKassa — предупреждение", () => {
  const f = audit({ recent: [row("topup", 500, "demo-topup-1", 3600e3)] });
  assert.deepEqual(codes(f), ["topup-not-from-payment"]);
  assert.equal(f[0].severity, "warn");
});

test("сверка: крупный разовый подарок, ручные корректировки владельца не считаются", () => {
  assert.deepEqual(codes(audit({ recent: [row("bonus", 5000, "promo:X:a", 3600e3)] })), [
    "big-gift",
  ]);
  assert.deepEqual(audit({ recent: [row("admin", 5000, null, 3600e3)] }), []);
  assert.deepEqual(audit({ recent: [row("welcome", 25, "welcome:a", 3600e3)] }), []);
});

test("сверка: баланс не равен сумме журнала и баланс в минусе", () => {
  const f = audit({
    balanceIssues: [
      { email: "a@example.ru", balance: 600, ledgerSum: 100 },
      { email: "b@example.ru", balance: -12, ledgerSum: -12 },
    ],
  });
  assert.deepEqual(codes(f), ["balance-mismatch", "negative-balance"]);
  assert.equal(
    f.find((x) => x.code === "balance-mismatch").key,
    "balance-mismatch:a@example.ru:500",
  );
});

test("сверка: ЮKassa не ответила — платежи не сверяем, остальное работает", () => {
  const old = row("topup", 3500, "yk-old", 44 * DAY);
  const f = audit({
    recent: [row("topup", 1000, "yk-n", 3600e3), row("bonus", 500, "yk-old:bonus", 600e3)],
    topupsByRef: { "yk-old": old },
    payments: null,
  });
  assert.deepEqual(codes(f), ["late-reward"]);
});

test("сверка: платёж старше окна и чужие платежи не трогаем", () => {
  const f = audit({
    payments: [
      paid("ancient", 1000, 100, 9 * DAY),
      { ...paid("alien", 1000, 0, 3600e3), email: null, sparks: 0 },
    ],
  });
  assert.deepEqual(f, []);
});

test("ключ расхождения стабилен между прогонами", () => {
  const mk = () =>
    audit({
      recent: [{ ...row("bonus", 500, "yk-old:bonus", 600e3), id: 777 }],
      topupsByRef: { "yk-old": { ...row("topup", 3500, "yk-old", 44 * DAY), id: 5 } },
    })[0].key;
  assert.equal(mk(), mk());
});
