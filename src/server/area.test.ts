import assert from "node:assert/strict";
import test from "node:test";
import { listingArea, matchesArea, placeByName, placeFromPoint } from "./places";

test("GPS yaqin shaharni oladi, uzoq nuqtani olmaydi", () => {
  const shahrixon = placeFromPoint(40.713, 72.057);
  assert.equal(shahrixon?.id, "shahrixon");
  assert.equal(placeFromPoint(39.0, 64.0), null);
});

test("e'lon matni va koordinata hudud beradi", () => {
  assert.deepEqual(listingArea("Shahrixon bozori"), { region: "Andijon", district: "Shahrixon" });
  assert.deepEqual(listingArea("noma'lum joy"), { region: "", district: "" });
  assert.equal(listingArea("markaz", 41.3, 69.24).district, "Toshkent");
});

test("lenta tanlangan tuman bo'yicha, boshqa tuman tushmaydi", () => {
  const place = placeByName("Shahrixon") ?? null;
  assert.equal(matchesArea(place, "Andijon", "Shahrixon"), true);
  assert.equal(matchesArea(place, "Andijon", ""), true);
  assert.equal(matchesArea(place, "Andijon", "Asaka"), false);
  assert.equal(matchesArea(null, "Andijon", "Shahrixon"), false);
});
