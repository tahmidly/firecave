"use client";

import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CopyButton } from "./CopyButton";

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre({ children }) {
            const lang = isValidElement<{ className?: string }>(children)
              ? /language-([\w-]+)/.exec(children.props.className ?? "")?.[1]
              : undefined;
            return (
              <div className="my-4 overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1">
                  <span className="font-mono text-xs text-muted-foreground">{lang ?? "text"}</span>
                  <CopyButton text={textOf(children).replace(/\n$/, "")} label="Copy" />
                </div>
                <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">{children}</pre>
              </div>
            );
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
