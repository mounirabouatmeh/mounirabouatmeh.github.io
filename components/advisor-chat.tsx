"use client";

import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AIMessage } from "@/components/ai-message";
import { TripWorkspace } from "@/components/trip-workspace";

function textFromParts(parts: readonly { type: string; text?: string }[]) {
  return parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
}

export function AdvisorChat() {
  const [input, setInput] = useState("");
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, stop } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
  }

  return (
    <div className="advisor-shell">
      <section className="chat-panel">
        <div className="chat-header">
          <div><p className="eyebrow dark">Cuberence advisor</p><h1>What trip are we solving?</h1></div>
          <span className="model-chip">Luna</span>
        </div>

        <div className="conversation" role="log" aria-live="polite">
          {messages.length === 0 ? (
            <div className="welcome-card"><span className="assistant-mark">C</span><div><h2>Start with the client's travel intent.</h2><p>For example: “My clients are flying from YUL to BEY in October, staying 7–10 nights, and are open to a short European stopover.”</p></div></div>
          ) : (
            messages.map((message) => {
              const text = textFromParts(message.parts);
              if (!text) return null;
              return <div key={message.id} className={`message-row ${message.role}`}>{message.role === "assistant" && <span className="assistant-mark small">C</span>}<div className="message-bubble">{message.role === "assistant" ? <AIMessage>{text}</AIMessage> : text}</div></div>;
            })
          )}

          {busy && <div className="live-status"><span className="pulse-dot" /><span>{status === "submitted" ? "Understanding the trip…" : "Preparing the next step…"}</span></div>}
        </div>

        <form className="composer" onSubmit={submit}>
          <textarea aria-label="Message Cuberence" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Describe the client's trip, constraints, or what you want to compare…" rows={3} />
          <div className="composer-footer"><span>Live Discovery and Pricing tools connect in the next stage.</span>{busy ? <button type="button" className="send-button secondary-send" onClick={() => stop()}>Stop</button> : <button type="submit" className="send-button" disabled={!input.trim()}>Send</button>}</div>
        </form>
      </section>

      <TripWorkspace messages={messages} />
    </div>
  );
}
