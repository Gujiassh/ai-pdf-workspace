"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import type { Citation } from "@/lib/chat/types";
import { getLocatorSummary } from "@/lib/evidence/types";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

const citationReferencePattern = /\[(\d+)\]/g;
const citationLinkPattern = /^citation:(\d+)$/;

function splitTextNode(node: MarkdownNode, citationByReference: Map<number, Citation>): MarkdownNode[] {
  if (!node.value) {
    return [node];
  }

  const nextNodes: MarkdownNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationReferencePattern.exec(node.value)) !== null) {
    const referenceNumber = Number(match[1]);
    const citation = citationByReference.get(referenceNumber);
    if (!citation) {
      continue;
    }

    const textBefore = node.value.slice(lastIndex, match.index);
    if (textBefore) {
      nextNodes.push({ type: "text", value: textBefore });
    }
    nextNodes.push({
      type: "link",
      url: `citation:${referenceNumber}`,
      children: [{ type: "text", value: match[0] }],
    });
    lastIndex = match.index + match[0].length;
  }

  citationReferencePattern.lastIndex = 0;
  if (nextNodes.length === 0) {
    return [node];
  }

  const textAfter = node.value.slice(lastIndex);
  if (textAfter) {
    nextNodes.push({ type: "text", value: textAfter });
  }
  return nextNodes;
}

function transformCitationReferences(node: MarkdownNode, citationByReference: Map<number, Citation>): void {
  if (!node.children || node.type === "link" || node.type === "linkReference" || node.type === "code" || node.type === "inlineCode") {
    return;
  }

  const nextChildren: MarkdownNode[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      nextChildren.push(...splitTextNode(child, citationByReference));
    } else {
      transformCitationReferences(child, citationByReference);
      nextChildren.push(child);
    }
  }
  node.children = nextChildren;
}

function remarkInlineCitations(citations: Citation[]) {
  const citationByReference = new Map(
    citations.map((citation) => [citation.citationIndex + 1, citation]),
  );

  return (tree: MarkdownNode) => {
    transformCitationReferences(tree, citationByReference);
  };
}

function safeUrlTransform(url: string): string | null {
  if (citationLinkPattern.test(url)) {
    return url;
  }

  if (!/^https?:\/\//i.test(url)) {
    return null;
  }

  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

type ChatMarkdownProps = {
  content: string;
  citations: Citation[];
  onCitationClick: (citation: Citation) => void;
};

export function ChatMarkdown({ content, citations, onCitationClick }: ChatMarkdownProps) {
  const citationByReference = useMemo(
    () => new Map(citations.map((citation) => [citation.citationIndex + 1, citation])),
    [citations],
  );
  const citationPlugin = useMemo(() => () => remarkInlineCitations(citations), [citations]);

  return (
    <div className="chat-markdown min-w-0 break-words text-sm leading-7 text-zinc-700 dark:text-zinc-300">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, citationPlugin]}
        skipHtml
        urlTransform={safeUrlTransform}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-5 text-lg font-bold leading-7 text-zinc-950 first:mt-0 dark:text-zinc-50">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-5 text-base font-bold leading-7 text-zinc-950 first:mt-0 dark:text-zinc-50">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-4 text-sm font-bold leading-6 text-zinc-950 first:mt-0 dark:text-zinc-50">{children}</h3>,
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-emerald-500/60 pl-3 text-zinc-500 dark:border-emerald-400/50 dark:text-zinc-400">{children}</blockquote>,
          strong: ({ children }) => <strong className="font-semibold text-zinc-950 dark:text-zinc-100">{children}</strong>,
          em: ({ children }) => <em className="text-zinc-600 dark:text-zinc-400">{children}</em>,
          del: ({ children }) => <del className="text-zinc-500 dark:text-zinc-500">{children}</del>,
          hr: () => <hr className="my-4 border-zinc-200 dark:border-zinc-800" />,
          pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-[11px] leading-5 text-zinc-100 shadow-xs">{children}</pre>,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className?.includes("language-"));
            return (
              <code
                {...props}
                className={isBlock
                  ? "font-mono text-[11px] leading-5 text-zinc-100"
                  : "rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"}
              >
                {children}
              </code>
            );
          },
          table: ({ children }) => <table className="my-3 w-full border-collapse text-left text-[11px]">{children}</table>,
          th: ({ children }) => <th className="border border-zinc-200 bg-zinc-100 px-2 py-1.5 font-semibold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">{children}</th>,
          td: ({ children }) => <td className="border border-zinc-200 px-2 py-1.5 align-top dark:border-zinc-800">{children}</td>,
          a: ({ href, children, node, ...props }) => {
            void node;
            const match = href ? citationLinkPattern.exec(href) : null;
            const citation = match ? citationByReference.get(Number(match[1])) : undefined;
            if (citation) {
              return (
                <button
                  type="button"
                  data-citation-index={citation.citationIndex}
                  onClick={() => onCitationClick(citation)}
                  disabled={!citation.sourceAvailable}
                  aria-label={`Open ${citation.assetTitle}, ${getLocatorSummary(citation.locator)}`}
                  className="mx-0.5 inline-flex min-w-[1.5rem] items-center justify-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 align-baseline text-[10px] font-bold leading-4 text-amber-800 transition hover:border-amber-400 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-500 dark:border-amber-900/80 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:border-amber-600 dark:hover:bg-amber-950"
                >
                  {children}
                </button>
              );
            }

            if (!href) {
              return <span>{children}</span>;
            }

            return (
              <a
                {...props}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-900 dark:text-emerald-400 dark:decoration-emerald-900 dark:hover:text-emerald-300"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
