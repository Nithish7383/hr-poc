"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "../../lib/useAuth";
import Sidebar from "../components/Sidebar";

/* ============================================================
   Design tokens (matches workforce_overview_revamp_ForReview.html /
   the Workforce Overview dashboard, kept identical here)
============================================================ */

const T = {
  navy: "#0d1730",
  amber: "#c9791f",
  border: "#e6e8ee",
  bg: "#f5f6f9",
  text: "#111827",
  muted: "#6b7280",
  blue: "#3b6fe0",
  red: "#e0473b",
};

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

async function ingestDocuments(): Promise<void> {
  const res = await fetch(`${HR_ASSISTANT_BASE_URL}/ingest`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error(`Ingest failed (${res.status})`);
  }
}

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
   Small building blocks
============================================================ */

function SourcePill({ source }: { source: ChatSource }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        color: T.muted,
        background: "#fff",
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        padding: "3px 9px",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
      title={`chunk: ${source.chunk_id}`}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: T.blue,
          flexShrink: 0,
        }}
      />
      {source.document}
    </span>
  );
}

function Avatar({ isUser }: { isUser: boolean }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: 0.2,
        background: isUser ? T.border : T.navy,
        color: isUser ? T.text : "#fff",
      }}
      aria-hidden="true"
    >
      {isUser ? "You" : "HR"}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
        gap: 10,
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
      }}
    >
      <Avatar isUser={isUser} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div
          style={{
            background: isUser ? T.navy : "#fff",
            color: isUser ? "#fff" : T.text,
            border: isUser ? "none" : `1px solid ${T.border}`,
            padding: "11px 15px",
            borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            fontSize: 14,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            boxShadow: isUser
              ? "0 1px 2px rgba(13, 23, 48, 0.16)"
              : "0 1px 2px rgba(17, 24, 39, 0.04)",
          }}
        >
          {message.content}
        </div>

        {!isUser && message.sources && message.sources.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {message.sources.map((s) => (
              <SourcePill key={s.chunk_id} source={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Avatar isUser={false} />
      <div
        style={{
          background: "#fff",
          border: `1px solid ${T.border}`,
          borderRadius: "14px 14px 14px 4px",
          padding: "12px 16px",
          display: "flex",
          gap: 4,
          alignItems: "center",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: T.muted,
              opacity: 0.5,
              animation: `hrAssistantPulse 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes hrAssistantPulse {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 0.9; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

/* ============================================================
   HR Assistant Chat Page
============================================================ */

export default function HrAssistantPage() {
  const { user } = useAuth() as { user?: { employee_id?: string; id?: string } };
  const employeeId = user?.employee_id || user?.id || "";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);

  // Ingest documents once on page load so the knowledge base
  // exists before the first /chat call.
  useEffect(() => {
    async function initializeAssistant() {
      try {
        await ingestDocuments();
        setReady(true);
      } catch (err) {
        console.error(err);
        setError("Failed to initialize HR Assistant.");
      }
    }

    initializeAssistant();
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    if (!ready) {
      setError("HR Assistant is still loading. Please wait...");
      return;
    }

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

  const suggestions = [
    "How many casual leaves do I get?",
    "What documents do I need to submit?",
    "How do I request remote work?",
  ];

  return (
    <Sidebar>
      <div style={{ minHeight: "100vh", background: T.bg, padding: "26px 32px" }}>
        {/* Header */}
        <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: T.navy,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <span style={{ color: T.amber, fontSize: 17, fontWeight: 700 }}>HR</span>
          </div>

          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, color: T.amber, fontWeight: 700 }}>
              HR SELF-SERVICE
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: "2px 0 4px", color: T.text }}>
              AI HR Assistant
            </h1>
            <div style={{ fontSize: 13.5, color: T.muted }}>
              Ask about leave, policy, benefits, and other HR questions.
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: ready ? "#22a06b" : T.amber,
                transition: "background 0.2s ease",
              }}
            />
            <span style={{ fontSize: 12.5, color: T.muted }}>
              {ready ? "Assistant ready" : "Setting up…"}
            </span>
          </div>
        </div>

        {/* Chat card */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            maxWidth: 760,
            display: "flex",
            flexDirection: "column",
            height: "68vh",
            boxShadow: "0 1px 3px rgba(17, 24, 39, 0.05), 0 8px 24px rgba(17, 24, 39, 0.04)",
            overflow: "hidden",
          }}
        >
          {/* Thread */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {messages.length === 0 && !loading && (
              <div
                style={{
                  margin: "auto",
                  textAlign: "center",
                  maxWidth: 380,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    fontWeight: 700,
                    color: T.navy,
                  }}
                >
                  HR
                </div>

                <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>
                  {ready
                    ? "Ask a question to get started, or try one of these:"
                    : "Setting up the HR Assistant…"}
                </div>

                {ready && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        style={{
                          background: T.bg,
                          border: `1px solid ${T.border}`,
                          borderRadius: 8,
                          padding: "9px 14px",
                          fontSize: 13,
                          color: T.text,
                          textAlign: "left",
                          cursor: "pointer",
                          transition: "border-color 0.15s ease, background 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = T.blue;
                          e.currentTarget.style.background = "#fff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = T.border;
                          e.currentTarget.style.background = T.bg;
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}

            {loading && <TypingIndicator />}

            {error && (
              <div
                style={{
                  alignSelf: "flex-start",
                  fontSize: 13,
                  color: T.red,
                  background: "#fdf0ee",
                  border: "1px solid #f6d3cd",
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                {error}
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              display: "flex",
              gap: 10,
              padding: 16,
              borderTop: `1px solid ${T.border}`,
              background: "#fbfbfc",
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={ready ? "Ask a question…" : "Loading…"}
              disabled={loading || !ready}
              // colorScheme + explicit color/background override Tailwind's
              // preflight `color-scheme: light dark`, which otherwise makes
              // the browser render native input text/caret in white on
              // OS dark-mode, invisible against this input's white background.
              style={{
                colorScheme: "light",
                flex: 1,
                border: `1px solid ${inputFocused ? T.blue : T.border}`,
                borderRadius: 8,
                padding: "10px 13px",
                fontSize: 14,
                outline: "none",
                background: "#fff",
                color: T.text,
                boxShadow: inputFocused ? `0 0 0 3px rgba(59, 111, 224, 0.12)` : "none",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !ready || !input.trim()}
              style={{
                background: T.navy,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading || !ready || !input.trim() ? "not-allowed" : "pointer",
                opacity: loading || !ready || !input.trim() ? 0.5 : 1,
                transition: "opacity 0.15s ease",
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </Sidebar>
  );
}