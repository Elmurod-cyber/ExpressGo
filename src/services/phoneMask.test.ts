import assert from "node:assert/strict";
import test from "node:test";
import { cardPhoneApply, cardPhoneMask } from "./phoneMask";

test("akkaunt raqami qavs ichidan yoziladi va birinchi nol tushadi", () => {
  assert.equal(cardPhoneMask(""), "+998 (00) 000-00-00");
  assert.equal(cardPhoneApply("", "+998 (0·) ···-··-··"), "");
  assert.equal(cardPhoneApply("", "+998 (9·) ···-··-··"), "9");
  assert.equal(cardPhoneApply("9", "+998 (90) ···-··-··"), "90");
  assert.equal(cardPhoneApply("90", "+998 (90) 1··-··-··"), "901");
  assert.equal(cardPhoneApply("90", "+998 (90) 0··-··-··"), "900");
  assert.equal(cardPhoneMask("901112233"), "+998 (90) 111-22-33");
  assert.equal(cardPhoneApply("90", "+998 (9) 000-00-00"), "9");
});
