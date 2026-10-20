import assert from "node:assert/strict";
import test from "node:test";
import { cardPhoneApplyAt, cardPhoneCaretAt, cardPhoneMask, cardPhoneValue, cardSlotAt } from "./phoneMask";

function typeHole(digits: string, ch: string): string {
  const value = cardPhoneValue(digits);
  const at = value.indexOf("\u2007");
  return value.slice(0, at) + ch + value.slice(at + 1);
}

test("akkaunt raqami qavs ichidan yoziladi va birinchi nol tushadi", () => {
  assert.equal(cardPhoneMask(""), "+998 (00) 000-00-00");
  assert.deepEqual(cardPhoneApplyAt("", typeHole("", "0"), 0), { digits: "", slot: 0 });
  assert.deepEqual(cardPhoneApplyAt("", typeHole("", "9"), 0), { digits: "9", slot: 1 });
  assert.deepEqual(cardPhoneApplyAt("9", typeHole("9", "0"), 1), { digits: "90", slot: 2 });
  assert.deepEqual(cardPhoneApplyAt("90", typeHole("90", "1"), 2), { digits: "901", slot: 3 });
  assert.deepEqual(cardPhoneApplyAt("90", typeHole("90", "0"), 2), { digits: "900", slot: 3 });
  assert.equal(cardPhoneMask("901112233"), "+998 (90) 111-22-33");
  const full = cardPhoneValue("901112233");
  assert.deepEqual(cardPhoneApplyAt("901112233", full.slice(0, 10) + "5" + full.slice(11), 2), { digits: "905112233", slot: 3 });
  const typed = cardPhoneValue("901");
  assert.deepEqual(cardPhoneApplyAt("901", typed.slice(0, 10) + typed.slice(11), 3), { digits: "90", slot: 2 });
  assert.equal(cardSlotAt(6), 0);
  assert.equal(cardSlotAt(10), 2);
  assert.equal(cardSlotAt(18), 8);
  assert.deepEqual(cardPhoneCaretAt(2), { start: 10, end: 10 });
});
