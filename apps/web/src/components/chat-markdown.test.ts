import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Citation } from "@/lib/chat/types";
import { ChatMarkdown } from "./chat-markdown";

const sourceVersions = {
  parserVersion: "parser-v1",
  processingGeneration: 1,
  representationId: "representation-1",
  indexVersion: 1,
};

const citations: Citation[] = [2, 4, 8].map((pageNumber, index) => ({
  id: `citation-${index + 1}`,
  citationIndex: index,
  assetId: index < 2 ? "asset-1" : "asset-2",
  assetKind: "pdf",
  assetTitle: index < 2 ? "guide.pdf" : "appendix.pdf",
  sourceAvailable: true,
  excerpt: `Source ${index + 1}`,
  locator: { kind: "pdf_page", version: 1, pageNumber },
  sourceVersions,
}));

function render(content: string, onCitationClick: (citation: Citation) => void = () => undefined) {
  return renderToStaticMarkup(createElement(ChatMarkdown, { content, citations, onCitationClick }));
}

test("assistant markdown renders common structure and GFM content", () => {
  const html = render("# Heading\n\n**bold** and *italic*\n\n- one\n- two\n\n| key | value |\n| --- | --- |\n| a | b |");
  assert.match(html, /<h1[^>]*>Heading<\/h1>/);
  assert.match(html, /<strong[^>]*>bold<\/strong>/);
  assert.match(html, /<em[^>]*>italic<\/em>/);
  assert.match(html, /<ul[^>]*>/);
  assert.match(html, /<table[^>]*>/);
});

test("soft line breaks render as explicit breaks for question options", () => {
  const html = render("**单选题**：需求分析主要起什么作用？\nA. 替代设计\nB. 起桥梁作用\n答案：B");
  assert.match(html, /作用？<br\/>\s*A\. 替代设计/);
  assert.match(html, /替代设计<br\/>\s*B\. 起桥梁作用/);
});

test("only known plain-text references become citation buttons", () => {
  const html = render("Answer [1] and [3], but keep [4] as text. Inline code `[3]` and a link [3](https://example.com).");
  assert.equal((html.match(/data-citation-index=/g) ?? []).length, 2);
  assert.match(html, /data-citation-index="0"/);
  assert.match(html, /data-citation-index="2"/);
  assert.match(html, /keep \[4\] as text/);
  assert.match(html, /<code[^>]*>\[3\]<\/code>/);
  assert.match(html, /aria-label="Open appendix\.pdf, PDF p\.8"/);
});

test("external markdown links are restricted to http and https", () => {
  const html = render("[docs](https://example.com) [bad](javascript:alert(1)) [mail](mailto:test@example.com) [relative](/docs)");
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noreferrer noopener"/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /mailto:/i);
  assert.doesNotMatch(html, /href="\/docs"/);
});
