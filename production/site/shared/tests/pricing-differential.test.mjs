// Differential pricing test.
// The Worker recomputes every price and rejects any mismatch, so the engine
// must agree with the Worker's OWN calculateQuote (cut from the live source,
// not rewritten) for every combination a visitor can build:
//   dogs 1..10  x  5 yard sizes  x  7 non-empty area subsets  x  5 frequencies
//   = 1,750 combinations, both the price and allowed / not allowed.
import test from "node:test";
import assert from "node:assert/strict";
import { core, makeStore, AREA_SUBSETS, FREQUENCY_IDS, YARD_IDS } from "./helpers/make-store.mjs";
import { worker, widget, plain } from "./helpers/live-source.mjs";

function everyCombination(visit) {
  let count = 0;
  for (let dogs = 1; dogs <= 10; dogs += 1) {
    for (const yardSizeId of YARD_IDS) {
      for (const areaIds of AREA_SUBSETS) {
        for (const frequencyId of FREQUENCY_IDS) {
          count += 1;
          visit({ dogs, yardSizeId, areaIds, frequencyId });
        }
      }
    }
  }
  return count;
}

// One comparable word for a result: "invalid", "custom:<reasons>" or the price in cents.
function outcome(result) {
  if (!result.ok) return "invalid";
  if (result.custom) return "custom:" + plain(result.reasons).join(",");
  return String(result.priceCents);
}

test("calculateQuote agrees with the Worker on all 1,750 combinations", () => {
  const disagreements = [];
  const count = everyCombination((plan) => {
    const mine = core.calculateQuote(plan);
    const theirs = worker.calculateQuote({ dogs: String(plan.dogs), frequencyId: plan.frequencyId, yardSizeId: plan.yardSizeId, areaIds: plan.areaIds });
    if (outcome(mine) !== outcome(theirs)) disagreements.push(JSON.stringify(plan) + " engine=" + outcome(mine) + " worker=" + outcome(theirs));
  });
  assert.equal(count, 1750);
  assert.deepEqual(disagreements, []);
});

test("calculateQuote agrees with the live widget on all 1,750 combinations", () => {
  const disagreements = [];
  everyCombination((plan) => {
    const mine = core.calculateQuote(plan);
    const theirs = widget.calculateQuote({ dogCount: plan.dogs, frequency: plan.frequencyId, yardSize: plan.yardSizeId, areas: plan.areaIds });
    if (outcome(mine) !== outcome(theirs)) disagreements.push(JSON.stringify(plan) + " engine=" + outcome(mine) + " widget=" + outcome(theirs));
    // Line items too, wherever there is a price.
    if (mine.ok && !mine.custom) {
      assert.deepEqual(mine.lineItems.map((item) => [item.label, item.cents]), plain(theirs.lineItems).map((item) => [item.label, item.cents]));
      assert.equal(mine.lineItems.reduce((sum, item) => sum + item.cents, 0), mine.priceCents, "line items add up to the price");
    }
  });
  assert.deepEqual(disagreements, []);
});

test("frequencyOptions agrees with the Worker: allowed or not, and ONE exact price, for all 1,750 combinations", () => {
  const { store } = makeStore();
  const disagreements = [];
  let checked = 0;
  for (let dogs = 1; dogs <= 10; dogs += 1) {
    for (const yardSizeId of YARD_IDS) {
      for (const areaIds of AREA_SUBSETS) {
        // Set the three earlier answers the way an interface would.
        store.set({ frequency: "" });
        store.set({ dogCount: String(dogs), yardSize: yardSizeId, areas: areaIds });
        const options = store.frequencyOptions();
        assert.deepEqual(options.map((option) => option.id), FREQUENCY_IDS);
        for (const option of options) {
          checked += 1;
          const theirs = worker.calculateQuote({ dogs: String(dogs), frequencyId: option.id, yardSizeId, areaIds });
          const label = JSON.stringify({ dogs, yardSizeId, areaIds, frequencyId: option.id });
          // allowed / not allowed
          if (option.available !== theirs.ok) disagreements.push(label + " available=" + option.available + " worker.ok=" + theirs.ok);
          // an unavailable option always says why, in words
          if (!option.available && !option.reason) disagreements.push(label + " is unavailable without a reason");
          // the price: exact for a priced plan, absent for custom and unavailable
          const expected = theirs.ok && !theirs.custom ? theirs.priceCents : null;
          // "custom" as an OPTION never has a price; a 10+ dog plan on another
          // frequency is not available at all, so there is no third case.
          if (option.priceCents !== expected) disagreements.push(label + " price=" + option.priceCents + " worker=" + expected);
          if (expected !== null) {
            assert.equal(option.priceLabel, core.formatMoney(expected));
            assert.equal(option.priceText, core.formatMoney(expected) + " " + (option.id === "onetime" ? "base price" : "per visit"));
            assert.ok(!/\+\s*\$/.test(option.priceText), "never an add-on amount");
          } else {
            assert.equal(option.priceLabel, "");
            assert.equal(option.priceText, "");
          }
        }
      }
    }
  }
  assert.equal(checked, 1750);
  assert.deepEqual(disagreements, []);
});

test("a store can only hold a frequency the Worker allows, for every dog and yard combination", () => {
  const { store } = makeStore();
  for (let dogs = 1; dogs <= 10; dogs += 1) {
    for (const yardSizeId of YARD_IDS) {
      for (const frequencyId of FREQUENCY_IDS) {
        store.set({ frequency: "" });
        store.set({ dogCount: String(dogs), yardSize: yardSizeId, areas: ["back"] });
        const result = store.set({ frequency: frequencyId });
        const theirs = worker.calculateQuote({ dogs: String(dogs), frequencyId, yardSizeId, areaIds: ["back"] });
        const label = JSON.stringify({ dogs, yardSizeId, frequencyId });
        if (theirs.ok) {
          assert.equal(store.getState().frequency, frequencyId, label + " should be accepted");
          assert.equal(store.quote().ready, true, label);
          assert.equal(store.quote().custom, theirs.custom, label);
          assert.equal(store.quote().priceCents, theirs.custom ? null : theirs.priceCents, label);
        } else {
          assert.notEqual(store.getState().frequency, frequencyId, label + " should be refused");
          assert.equal(result.rejected.length, 1, label);
          assert.ok(result.rejected[0].reason.length > 5, label + " is refused with a reason");
        }
      }
    }
  }
});

test("the check values in spec 5.4", () => {
  const all = ["back", "front", "side"];
  const rows = [
    [1, "weekly", "s", ["back"], 1999],
    [1, "twice", "s", ["back"], 1599],
    [1, "biweekly", "s", ["back"], 2999],
    [2, "weekly", "m", ["front"], 2649],
    [2, "weekly", "m", ["back", "front"], 2899],
    [2, "twice", "m", ["back", "front"], 2399],
    [2, "biweekly", "m", ["back", "front"], 3999],
    [5, "twice", "s", ["back"], 2199],
    [4, "biweekly", "xl", all, 5749],
    [9, "twice", "xl", all, 4499],
    [3, "onetime", "xl", all, 8999],
    [10, "onetime", "s", ["back"], 8999],
    [10, "custom", "s", ["back"], "custom"],
    [2, "custom", "over", ["back"], "custom"],
    [6, "weekly", "s", ["back"], "invalid"],
    [2, "onetime", "over", ["back"], "invalid"]
  ];
  for (const [dogs, frequencyId, yardSizeId, areaIds, expected] of rows) {
    const result = core.calculateQuote({ dogs, frequencyId, yardSizeId, areaIds });
    const got = !result.ok ? "invalid" : result.custom ? "custom" : result.priceCents;
    assert.equal(got, expected, [dogs, frequencyId, yardSizeId, areaIds.join("+")].join(" "));
  }
});

test("custom-estimate reasons match the Worker and a custom estimate never has a price", () => {
  const cases = [
    [{ dogs: 3, frequencyId: "custom", yardSizeId: "s", areaIds: ["back"] }, ["CUSTOM_BOOKING_SELECTED"]],
    [{ dogs: 10, frequencyId: "custom", yardSizeId: "s", areaIds: ["back"] }, ["CUSTOM_BOOKING_SELECTED", "DOG_COUNT_10_PLUS"]],
    [{ dogs: 2, frequencyId: "custom", yardSizeId: "over", areaIds: ["back"] }, ["CUSTOM_BOOKING_SELECTED", "YARD_OVER_ONE_ACRE"]],
    [{ dogs: 10, frequencyId: "custom", yardSizeId: "over", areaIds: ["back"] }, ["CUSTOM_BOOKING_SELECTED", "DOG_COUNT_10_PLUS", "YARD_OVER_ONE_ACRE"]]
  ];
  for (const [plan, reasons] of cases) {
    const mine = core.calculateQuote(plan);
    assert.equal(mine.custom, true);
    assert.equal(mine.priceCents, null);
    assert.deepEqual(mine.lineItems, []);
    assert.deepEqual(mine.reasons, reasons);
    assert.deepEqual(mine.reasons, plain(worker.calculateQuote(Object.assign({}, plan, { dogs: String(plan.dogs) })).reasons));
  }
});

test("missing or malformed plan input is rejected the same way the Worker rejects it", () => {
  const bad = [
    {},
    { dogs: 0, frequencyId: "weekly", yardSizeId: "s", areaIds: ["back"] },
    { dogs: 11, frequencyId: "weekly", yardSizeId: "s", areaIds: ["back"] },
    { dogs: 2.5, frequencyId: "weekly", yardSizeId: "s", areaIds: ["back"] },
    { dogs: "", frequencyId: "weekly", yardSizeId: "s", areaIds: ["back"] },
    { dogs: 2, frequencyId: "monthly", yardSizeId: "s", areaIds: ["back"] },
    { dogs: 2, frequencyId: "weekly", yardSizeId: "xxl", areaIds: ["back"] },
    { dogs: 2, frequencyId: "weekly", yardSizeId: "s", areaIds: [] },
    { dogs: 2, frequencyId: "weekly", yardSizeId: "s", areaIds: ["garage"] },
    { dogs: 2, frequencyId: "weekly", yardSizeId: "s", areaIds: ["back", "garage"] },
    { dogs: 2, frequencyId: "weekly", yardSizeId: "s", areaIds: "back" },
    { dogs: 2, frequencyId: "weekly", yardSizeId: "s" }
  ];
  for (const plan of bad) {
    assert.equal(core.calculateQuote(plan).ok, false, JSON.stringify(plan));
    assert.equal(worker.calculateQuote(plan).ok, false, "worker: " + JSON.stringify(plan));
    assert.ok(core.calculateQuote(plan).errors.every((error) => error.field && error.message));
  }
  // The area adder depends only on how many areas, not which.
  for (const pair of [["back", "front"], ["back", "side"], ["front", "side"]]) {
    assert.equal(core.calculateQuote({ dogs: 2, frequencyId: "weekly", yardSizeId: "s", areaIds: pair }).areaAddCents, 250);
  }
});

test("line items appear only in the final quote and follow spec 5.5", () => {
  const { store } = makeStore();
  store.set({ dogCount: "2", yardSize: "m", areas: ["back", "front"], frequency: "weekly" });
  assert.deepEqual(store.quote().lineItems, [
    { label: "Weekly · 2 dogs", cents: 2249, amount: "$22.49" },
    { label: "Back yard + Front yard", cents: 250, amount: "$2.50" },
    { label: "Up to ¼ acre", cents: 400, amount: "$4.00" }
  ]);
  assert.equal(store.quote().priceText, "$28.99 per visit");
  // No adder lines when the adders are zero.
  store.set({ yardSize: "s", areas: ["back"], dogCount: "1" });
  assert.deepEqual(store.quote().lineItems, [{ label: "Weekly · 1 dog", cents: 1999, amount: "$19.99" }]);
  // One-time: one line, the base price, the 30-minute facts.
  store.set({ frequency: "onetime", yardSize: "xl", areas: ["back", "front", "side"] });
  const oneTime = store.quote();
  assert.deepEqual(oneTime.lineItems, [{ label: "One-time cleanup · first 30 minutes", cents: 8999, amount: "$89.99" }]);
  assert.equal(oneTime.priceText, "$89.99 base price");
  assert.deepEqual(oneTime.oneTime, { baseCents: 8999, includedMinutes: 30, extraPerMinuteCents: 100, summary: "The first 30 minutes are included. Additional labor is $1 per minute." });
  // Custom: no price, no lines.
  store.set({ frequency: "custom" });
  const custom = store.quote();
  assert.equal(custom.ready, true);
  assert.equal(custom.custom, true);
  assert.equal(custom.priceCents, null);
  assert.equal(custom.priceLabel, "");
  assert.deepEqual(custom.lineItems, []);
  assert.deepEqual(custom.customReasons, ["CUSTOM_BOOKING_SELECTED"]);
  // The options themselves never carry line items or adders.
  for (const option of store.frequencyOptions()) {
    assert.equal(Object.prototype.hasOwnProperty.call(option, "lineItems"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(option, "addCents"), false);
  }
});
