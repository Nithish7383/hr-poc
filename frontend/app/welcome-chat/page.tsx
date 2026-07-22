"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

/* ============================================================
   API config — same HR Assistant backend contract as
   HrAssistantWidget.tsx. Move to NEXT_PUBLIC_HR_ASSISTANT_API_URL
   before shipping so it isn't hardcoded to localhost.
============================================================ */

const HR_ASSISTANT_BASE_URL =
  process.env.NEXT_PUBLIC_HR_ASSISTANT_API_URL || "http://localhost:8000/hr-assistant";

type ChatSource = { document: string; chunk_id: string };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
};

async function askAssistant(
  question: string,
  conversationId: string | null
): Promise<{ conversation_id: string; answer: string; sources: ChatSource[] }> {
  const res = await fetch(`${HR_ASSISTANT_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employee_id: "public-welcome-link",
      question,
      conversation_id: conversationId,
    }),
  });

  if (!res.ok) {
    throw new Error(`HR Assistant request failed (${res.status})`);
  }

  return res.json();
}

/* ============================================================
   Suggested starter questions — grounds the empty state in real
   HR topics instead of a blank box, so a first-day hire knows
   what this thing is actually for.
============================================================ */

const STARTER_QUESTIONS = [
  "How many leave days do I get?",
  "What's the dress code?",
  "How do I set up my work laptop?",
  "What are the office hours?",
];

/* ============================================================
   Icons — consistent stroke style, viewBox 0 0 24 24
============================================================ */

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 8V4M9 4h6" />
      <circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

/* ============================================================
   Markdown styling for assistant replies
============================================================ */

const MARKDOWN_CLASSES =
  "prose prose-sm max-w-none " +
  "prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 " +
  "prose-headings:mt-2 prose-headings:mb-1.5 prose-headings:text-[15px] " +
  "prose-strong:font-semibold prose-strong:text-inherit " +
  "prose-p:leading-relaxed prose-li:leading-relaxed";

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#101d38] px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#101d38] text-[#f2c14e]">
        <BotIcon className="h-4 w-4" />
      </div>
      <div className="max-w-[78%] rounded-2xl rounded-tl-md border border-[#ECE6D8] bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm">
        <div className={MARKDOWN_CLASSES}>
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#101d38] text-[#f2c14e]">
        <BotIcon className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-[#ECE6D8] bg-white px-4 py-3.5 shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Public Welcome Chat page — no auth, no sidebar. Linked
   directly from the welcome email for a new hire's first day.
============================================================ */

export default function WelcomeChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendQuestion(question: string) {
    if (!question.trim() || loading) return;

    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const data = await askAssistant(question, conversationId);
      setConversationId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      setError("Couldn't reach the HR Assistant. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendQuestion(input);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FBF9F4]">
      {/* Header */}
      <div className="border-b border-[#ECE6D8] bg-[#101d38]">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-6 py-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#f2c14e]">
            <BotIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.15em] text-[#f2c14e]">
              WELCOME TO THE TEAM
            </p>
            <p className="mt-0.5 text-[18px] font-bold text-white">
              Hi, I'm your HR Assistant
            </p>
          </div>
        </div>
      </div>

      {/* Thread */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
        {messages.length === 0 && !loading && (
          <div className="m-auto flex max-w-sm flex-col items-center gap-5 text-center">
            <p className="text-sm text-gray-500">
              Ask me anything about company policy — leave, benefits, IT setup,
              and more. Here are a few to get you started:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendQuestion(q)}
                  className="rounded-full border border-[#ECE6D8] bg-white px-3.5 py-2 text-[13px] text-gray-700 shadow-sm transition-colors hover:border-[#101d38] hover:text-[#101d38]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {loading && <TypingIndicator />}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#ECE6D8] bg-white">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-6 py-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question…"
            disabled={loading}
            className="flex-1 rounded-full border border-[#ECE6D8] bg-[#FBF9F4] px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-[#101d38] focus:bg-white"
          />
          <button
            onClick={() => sendQuestion(input)}
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#101d38] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}