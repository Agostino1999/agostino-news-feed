import test from "node:test";
import assert from "node:assert/strict";

import { extractFeedImage, sanitizeFeedImageUrl } from "./feed-images.mjs";

test("estrae le immagini già presenti nel feed senza richieste aggiuntive", () => {
  const xml = '<item><media:thumbnail url="https://cdn.example.com/thumb.jpg?width=320&amp;height=180"/></item>';
  assert.equal(extractFeedImage(xml), "https://cdn.example.com/thumb.jpg?width=320&height=180");
});

test("usa l'immagine incorporata nella descrizione e rifiuta URL insicuri", () => {
  assert.equal(
    extractFeedImage('<description><![CDATA[<img src="https://cdn.example.com/photo.avif">]]></description>'),
    "https://cdn.example.com/photo.avif"
  );
  assert.equal(sanitizeFeedImageUrl("javascript:alert(1)"), "");
});
