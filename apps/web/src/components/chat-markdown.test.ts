import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Citation } from "@/lib/chat/types";

import { ChatMarkdown } from "./chat-markdown";

const citations: Citation[] = [
  {
    id: "citation-1",
    citationIndex: 0,
    documentId: "document-1",
    documentName: "guide.pdf",
    pageNumber: 2,
    snippet: "First source",
  },
  {
    id: "citation-2",
    citationIndex: 1,
    documentId: "document-1",
    documentName: "guide.pdf",
    pageNumber: 4,
    snippet: "Second source",
  },
  {
    id: "citation-3",
    citationIndex: 2,
    documentId: "document-2",
    documentName: "appendix.pdf",
    pageNumber: 8,
    snippet: "Third source",
  },
];

function render(content: string, onCitationClick: (citation: Citation) => void = () => undefined) {
  return renderToStaticMarkup(
    createElement(ChatMarkdown, { content, citations, onCitationClick }),
  );
}

test("assistant markdown renders common structure and GFM content", () => {
  const html = render("# Heading\n\n**bold** and *italic*\n\n- one\n- two\n\n| key | value |\n| --- | --- |\n| a | b |");

  assert.match(html, /<h1[^>]*>Heading<\/h1>/);
  assert.match(html, /<strong[^>]*>bold<\/strong>/);
  assert.match(html, /<em[^>]*>italic<\/em>/);
  assert.match(html, /<ul[^>]*>/);
  assert.match(html, /<table[^>]*>/);
});

test("only known plain-text references become citation buttons", () => {
  const html = render("Answer [1] and [3], but keep [4] as text. Inline code `[3]` and a link [3](https://example.com).");

  assert.equal((html.match(/data-citation-index=/g) ?? []).length, 2);
  assert.match(html, /data-citation-index="0"/);
  assert.match(html, /data-citation-index="2"/);
  assert.match(html, /keep \[4\] as text/);
  assert.match(html, /<code[^>]*>\[3\]<\/code>/);
  assert.match(html, /<a[^>]*href="https:\/\/example\.com"/);
  assert.match(html, /aria-label="Open appendix\.pdf, page 8"/);
});

test("citation buttons carry the exact 0-based citation index", () => {
  const html = render("Source [3].");

  assert.match(html, /data-citation-index="2"/);
  assert.match(html, /aria-label="Open appendix\.pdf, page 8"/);
});

test("external markdown links are restricted to http and https", () => {
  const html = render(
    "[docs](https://example.com) [bad](javascript:alert(1)) [mail](mailto:test@example.com) [relative](/docs)",
  );

  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noreferrer noopener"/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /mailto:/i);
  assert.doesNotMatch(html, /href="\/docs"/);
});
