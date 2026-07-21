"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "../../lib/useAuth";

/* ============================================================
   API config — HR Assistant backend contract.
   Move this to an env var (NEXT_PUBLIC_HR_ASSISTANT_API_URL) before
   shipping so it isn't hardcoded to localhost.
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
  employeeId: string,
  question: string,
  conversationId: string | null
): Promise<{ conversation_id: string; answer: string; sources: ChatSource[] }> {
  const res = await fetch(`${HR_ASSISTANT_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employee_id: employeeId,
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
   Icon — same stroke style as the other Sidebar icons
   (viewBox 0 0 24 24, stroke="currentColor", strokeWidth="2")
============================================================ */

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/* ============================================================
   Small building blocks
============================================================ */

// Compact prose classes so headings/lists/bold render nicely inside
// the narrow chat bubble instead of using default browser spacing.
const MARKDOWN_CLASSES =
  "prose prose-sm max-w-none " +
  "prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 " +
  "prose-headings:mt-2 prose-headings:mb-1.5 prose-headings:text-[15px] " +
  "prose-strong:font-semibold prose-strong:text-inherit " +
  "prose-p:leading-relaxed prose-li:leading-relaxed";

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex max-w-[82%] flex-col gap-1.5 ${isUser ? "self-end" : "self-start"}`}>
      <div
        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "whitespace-pre-wrap rounded-br-sm bg-[#101d38] text-white"
            : "rounded-bl-sm border border-gray-200 bg-white text-gray-900"
        }`}
      >
        {isUser ? (
          message.content
        ) : (
          <div className={MARKDOWN_CLASSES}>
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   HrAssistantWidget — nav-item trigger (matches Sidebar's menu.map
   item styling exactly) + the slide-out chat drawer.

   Usage in Sidebar.tsx:
     <HrAssistantWidget collapsed={collapsed} />
   Place it inside <nav>, e.g. right after the "AI Insights" item.
============================================================ */

export default function HrAssistantWidget({ collapsed = false }: { collapsed?: boolean }) {
  const { user } = useAuth() as { user?: { employee_id?: string; id?: string } };
  const employeeId = user?.employee_id || user?.id || "";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const data = await askAssistant(employeeId, question, conversationId);
      setConversationId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      setError("Couldn't reach the HR Assistant. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSend();
  }

  return (
    <>
      {/* Nav-item trigger — same classes as the menu.map items in Sidebar */}
      <button
        onClick={() => setOpen(true)}
        title={collapsed ? "AI HR Assistant" : undefined}
        className={`
          flex
          w-full
          items-center
          ${collapsed ? "justify-center px-0" : "gap-3 px-4"}
          py-3
          rounded-lg
          text-sm
          mb-2
          transition-colors
          text-gray-300 hover:bg-[#243654] hover:text-white
        `}
      >
        <ChatIcon className="h-5 w-5 shrink-0" />
        {!collapsed && <span>AI HR Assistant</span>}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[1000] bg-[#101d38]/35"
        />
      )}

      {/* Slide-out drawer */}
      <div
        className={`
          fixed top-0 right-0 z-[1001]
          h-screen w-[380px] max-w-[90vw]
          flex flex-col
          border-l border-gray-200
          bg-[#fafafa]
          shadow-2xl
          transition-transform duration-200
          ${open ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-4">
          <div>
            <p className="text-[11px] tracking-widest text-yellow-500">HR SELF-SERVICE</p>
            <p className="mt-0.5 text-[15px] font-bold text-gray-900">AI HR Assistant</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Thread */}
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4">
          {messages.length === 0 && !loading && (
            <p className="m-auto max-w-[240px] text-center text-sm text-gray-500">
              Ask a question to get started — e.g. &ldquo;How many casual leaves do employees get?&rdquo;
            </p>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}

          {loading && <p className="self-start text-sm text-gray-500">Thinking…</p>}

          {error && <p className="self-start text-sm text-red-500">{error}</p>}

          <div ref={threadEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 border-t border-gray-200 bg-white p-3.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question"
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-[#101d38] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}