import assert from "node:assert/strict";
import test from "node:test";
import { addressInUzbek, addressQueries, addressScore, latinKey } from "./uzbekAddress";

test("kirill va lotin bitta manzil kalitiga tushadi", () => {
  assert.equal(latinKey("Шаҳрихон"), latinKey("Shahrixon"));
  assert.equal(latinKey("чожа"), latinKey("Cho'ja"));
  const queries = addressQueries("Шаҳрихон");
  assert.equal(queries[0], "Шаҳрихон");
  assert.equal(latinKey(queries[1] ?? ""), "shahrixon");
  assert.ok(addressScore(latinKey("shahrixn"), latinKey("Shahrixon")) > 0);
  assert.ok(addressScore(latinKey("Andijon"), latinKey("Андижан")) > 0);
});

test("ruscha olish manzili o'zbekcha yoziladi", () => {
  assert.equal(addressInUzbek("Шахриханский район, улица Амира Темура"), "Shahrixon tumani, Amir Temur ko'chasi");
  assert.equal(addressInUzbek("Андижанская область"), "Andijon viloyati");
  assert.equal(addressInUzbek("Mustaqillik Street, Shahrikhan District"), "Mustaqillik ko'chasi, Shahrixon tumani");
});
