import assert from "node:assert/strict";
import test from "node:test";
import { editCardPhone, formatCardPhone } from "./phoneMask";

test("akkaunt raqamida qavs va chiziq yozilgach chiqadi", () => {
  assert.equal(formatCardPhone(""), "+998 ");
  assert.equal(editCardPhone("+998 0", "+998 "), "+998 ");
  assert.equal(formatCardPhone("9"), "+998 (9");
  assert.equal(formatCardPhone("90"), "+998 (90)");
  assert.equal(formatCardPhone("901"), "+998 (90) 1");
  assert.equal(formatCardPhone("90111"), "+998 (90) 111");
  assert.equal(formatCardPhone("901112"), "+998 (90) 111-2");
  assert.equal(formatCardPhone("9011122"), "+998 (90) 111-22");
  assert.equal(formatCardPhone("901112233"), "+998 (90) 111-22-33");
  assert.equal(editCardPhone("+998 (90) 11122", "+998 (90) 111-22"), "+998 (90) 111-2");
  assert.equal(formatCardPhone("900"), "+998 (90) 0");
});
