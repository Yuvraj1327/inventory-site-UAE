import { useEffect, useRef, useState } from "react";
import { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkle, PaperPlaneTilt, User } from "@phosphor-icons/react";

const SESSION = "main-session";
const SUGGESTIONS = [
  "How can I reduce my tax liability?",
  "What's my current profit margin?",
  "Explain accrual vs cash accounting",
  "How much do customers still owe me?",
];

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef();

  useEffect(() => {
    fetch(`${API}/chat/${SESSION}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.map((m) => ({ role: m.role, content: m.content }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: SESSION, message: q }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const p of parts) {
          const line = p.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const data = JSON.parse(line);
            if (data.delta) {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + data.delta };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: "Sorry, something went wrong. Please try again." };
        return copy;
      });
    }
    setStreaming(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]" data-testid="chat-page">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
          <Sparkle size={22} weight="duotone" />
        </div>
        <div>
          <h1 className="text-2xl tracking-tight" style={{ fontFamily: "Manrope" }}>AI Assistant</h1>
          <p className="text-xs text-muted-foreground">Ask about accounting, taxes or your business finances</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pr-1" data-testid="chat-messages">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
            <Sparkle size={44} weight="duotone" className="text-muted-foreground" />
            <p className="text-muted-foreground text-sm max-w-sm">Your AI accountant is ready. Try one of these:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} data-testid="suggestion-btn"
                  className="text-left text-sm px-4 py-3 rounded-lg border border-border bg-white hover:border-primary/50 hover:-translate-y-px transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="h-8 w-8 shrink-0 rounded-lg bg-accent flex items-center justify-center">
                <Sparkle size={16} weight="duotone" />
              </div>
            )}
            <div data-testid={`msg-${m.role}`} className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
            }`}>
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
            {m.role === "user" && (
              <div className="h-8 w-8 shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                <User size={16} weight="duotone" />
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="mt-4 flex gap-2">
        <Input
          data-testid="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask your AI accountant…"
          className="bg-white rounded-full px-5"
          disabled={streaming}
        />
        <Button onClick={() => send()} disabled={streaming || !input.trim()} data-testid="chat-send-btn"
          className="rounded-full shrink-0 h-10 w-10 p-0">
          <PaperPlaneTilt size={18} weight="fill" />
        </Button>
      </div>
    </div>
  );
}
