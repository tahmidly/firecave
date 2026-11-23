"use client";

import { Bug, FileSearch, FlaskConical, Lightbulb, Map, PenLine, Languages, Brain } from "lucide-react";
import { Logo } from "@/components/Logo";

const CHAT_SUGGESTIONS = [
  { icon: Lightbulb, title: "Brainstorm ideas", prompt: "Help me brainstorm ideas for a side project I can build in a weekend." },
  { icon: PenLine, title: "Draft a message", prompt: "Help me write a clear, friendly email asking a colleague for a status update." },
  { icon: Brain, title: "Explain a concept", prompt: "Explain how HTTP caching works, with a simple analogy." },
  { icon: Languages, title: "Translate or polish", prompt: "Polish this text so it reads naturally and concisely: " },
];

const CODE_SUGGESTIONS = [
  { icon: Map, title: "Explain this codebase", prompt: "Give me a high-level tour of this project: structure, entry points and key modules." },
  { icon: Bug, title: "Find and fix a bug", prompt: "Look for likely bugs or error-prone code in this project and propose fixes." },
  { icon: FlaskConical, title: "Write tests", prompt: "Suggest and write tests for the least-covered important code in this project." },
  { icon: FileSearch, title: "Review recent changes", prompt: "Review the most recent changes in this project and point out any problems." },
];

export function Welcome({ mode, cwd, onPick }: { mode: "chat" | "code"; cwd: string | null; onPick: (prompt: string) => void }) {
  const suggestions = mode === "chat" ? CHAT_SUGGESTIONS : CODE_SUGGESTIONS;
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center">
      <Logo className="size-10 rounded-[10px]" />
      <h1 className="mt-5 text-[20px] font-medium tracking-tight">{mode === "chat" ? "How can I help?" : "What are we building?"}</h1>
      <p className="mt-1 text-[13px] text-faint">
        {mode === "chat" ? (
          "A plain conversation: no file or command access. Switch to Code to work on a project."
        ) : cwd ? (
          <>
            Working in <span className="font-mono text-foreground">{cwd}</span>
          </>
        ) : (
          "Pick a project folder below, or just start chatting."
        )}
      </p>
      <div className="mt-6 grid w-full grid-cols-1 gap-1 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.prompt)}
            className="group flex items-start gap-2.5 rounded-[8px] p-3 text-left transition-colors hover:bg-accent"
          >
            <s.icon className="mt-0.5 size-4 shrink-0 text-faint group-hover:text-primary" />
            <div>
              <div className="text-[13px] font-medium">{s.title}</div>
              <div className="mt-0.5 line-clamp-2 text-[12px] text-faint">{s.prompt}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
