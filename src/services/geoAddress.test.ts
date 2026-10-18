import assert from "node:assert/strict";
import test from "node:test";
import { addressInUzbek } from "./uzbekAddress";

test("ruscha olish manzili o'zbekcha yoziladi", () => {
  assert.equal(addressInUzbek("Шахриханский район, улица Амира Темура"), "Shahrixon tumani, Amir Temur ko'chasi");
  assert.equal(addressInUzbek("Андижанская область"), "Andijon viloyati");
  assert.equal(addressInUzbek("Mustaqillik Street, Shahrikhan District"), "Mustaqillik ko'chasi, Shahrixon tumani");
});
