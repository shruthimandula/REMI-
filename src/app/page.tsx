"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { memoryStore } from "@/lib/memory-store";
import { runAgentLoop, demoScript } from "@/lib/agent";
import type {
  Customer,
  Ticket,
  AgentTrace,
  BriefingCard,
  ReplyDraft,
  FrustrationLevel,
  AnalyticsData,
} from "@/lib/types";

// ─── Navigation ──────────────────────────────────────────────────────────────

type Screen =
  | "inbox"
  | "chat"
  | "customer360"
  | "analytics"
  | "portal"
  | "about";

const NAV_ITEMS: { id: Screen; label: string; icon: string }[] = [
  { id: "inbox", label: "Inbox", icon: "📥" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "customer360", label: "360°", icon: "👤" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "portal", label: "Portal", icon: "🌐" },
  { id: "about", label: "About", icon: "ℹ️" },
];

// ─── Stagger helper ──────────────────────────────────────────────────────────

const stagger = (i: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.06, duration: 0.4 },
});

// ─── CountUp Component ───────────────────────────────────────────────────────

function CountUp({ end, duration = 2000, suffix = "" }: { end: number; duration?: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [end, duration]);
  return <span className="count-up">{count.toLocaleString()}{suffix}</span>;
}

// ─── Frustration Meter ───────────────────────────────────────────────────────

function FrustrationMeter({ level }: { level: FrustrationLevel }) {
  const pct = (level / 10) * 100;
  const color =
    level <= 3
      ? "var(--frustration-low)"
      : level <= 6
        ? "var(--frustration-medium)"
        : level <= 8
          ? "var(--frustration-high)"
          : "var(--frustration-critical)";

  return (
    <div className="frustration-meter">
      <motion.div
        className="frustration-fill"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ background: `linear-gradient(90deg, ${color}88, ${color})` }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        }}
      >
        {level}/10
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function RemiApp() {
  const [screen, setScreen] = useState<Screen>("inbox");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [agentTrace, setAgentTrace] = useState<AgentTrace | null>(null);
  const [briefingCard, setBriefingCard] = useState<BriefingCard | null>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [demoActive, setDemoActive] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [agentMode, setAgentMode] = useState<"assist" | "autopilot">("assist");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Command palette - focus search
        document.getElementById("cmd-search")?.focus();
      }
      if (screen === "inbox") {
        if (e.key === "j") {
          // Next ticket
        }
        if (e.key === "k") {
          // Previous ticket
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen]);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const openTicket = useCallback(
    (ticket: Ticket) => {
      setSelectedCustomerId(ticket.customerId);
      setSelectedTicketId(ticket.id);
      setChatMessages(
        ticket.messages.map((m) => ({ role: m.role, content: m.content }))
      );
      // Generate briefing card
      const card = memoryStore.generateBriefingCard(ticket.customerId);
      setBriefingCard(card);
      setAgentTrace(null);
      setReplyDraft(null);
      setScreen("chat");
    },
    []
  );

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || !selectedCustomerId || !selectedTicketId) return;

    const message = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "customer", content: message }]);
    setIsProcessing(true);

    try {
      const result = await runAgentLoop(selectedCustomerId, selectedTicketId, message);
      setAgentTrace(result.trace);
      setBriefingCard(result.briefing);
      setReplyDraft(result.reply);

      if (agentMode === "autopilot" && result.reply) {
        setChatMessages((prev) => [
          ...prev,
          { role: "agent", content: result.reply.content },
        ]);
        setToast(`Memory updated: ${result.trace.memoryItemsCreated} new items`);
      }
    } catch {
      setToast("Error processing message");
    } finally {
      setIsProcessing(false);
    }
  }, [chatInput, selectedCustomerId, selectedTicketId, agentMode]);

  const sendReply = useCallback(() => {
    if (!replyDraft) return;
    setChatMessages((prev) => [
      ...prev,
      { role: "agent", content: replyDraft.content },
    ]);
    setReplyDraft(null);
    if (agentTrace) {
      setToast(
        `Memory updated: ${agentTrace.memoryItemsCreated} new items`
      );
    }
  }, [replyDraft, agentTrace]);

  const openCustomer360 = useCallback((customerId: string) => {
    setSelectedCustomerId(customerId);
    setScreen("customer360");
  }, []);

  // ── Demo Mode ────────────────────────────────────────────────────────────

  const startDemo = useCallback(() => {
    setDemoActive(true);
    setDemoStep(0);
    // Open Priya's latest ticket
    const priyaTicket = memoryStore.getTicket("TKT-4845");
    if (priyaTicket) {
      openTicket(priyaTicket);
    }

    // Run demo script
    demoScript.forEach((step, i) => {
      setTimeout(() => {
        setDemoStep(i);
        if (step.role === "customer" || step.role === "agent") {
          setChatMessages((prev) => [
            ...prev,
            { role: step.role, content: step.content },
          ]);
        }
        if (step.role === "agent") {
          // Generate trace for agent message
          runAgentLoop("CUST-1001", "TKT-4845", "demo").then((result) => {
            setAgentTrace(result.trace);
            setBriefingCard(result.briefing);
            setToast(`Memory updated: ${result.trace.memoryItemsCreated} new items`);
          });
        }
        if (i === demoScript.length - 1) {
          setTimeout(() => setDemoActive(false), 2000);
        }
      }, step.delay);
    });
  }, [openTicket]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <header
        className="glass-specular"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          background: "rgba(10, 10, 15, 0.8)",
          backdropFilter: "blur(24px) saturate(160%)",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <motion.div
            style={{
              fontSize: 24,
              fontFamily: "'Sora', sans-serif",
              fontWeight: 700,
              background: "linear-gradient(135deg, var(--aurora-indigo), var(--aurora-violet), var(--aurora-teal))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              cursor: "pointer",
            }}
            onClick={() => setScreen("inbox")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Remi
          </motion.div>
          <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Support that remembers.
          </span>
          <span className="badge badge-accent" style={{ fontSize: 11, padding: "2px 8px" }}>
            Team Zenith
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            id="cmd-search"
            type="text"
            placeholder="Search... (⌘K)"
            className="glass-input"
            style={{ width: 240, padding: "8px 14px", fontSize: 13 }}
          />
          <motion.button
            className={`glass-btn ${demoActive ? "glass-btn-danger" : "glass-btn-primary"}`}
            onClick={demoActive ? () => setDemoActive(false) : startDemo}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {demoActive ? "⏹ Stop Demo" : "▶ Demo Mode"}
          </motion.button>
        </div>
      </header>

      {/* ── Demo Narration Bar ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {demoActive && demoScript[demoStep]?.role === "narrator" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              padding: "10px 24px",
              background: "rgba(99, 102, 241, 0.08)",
              borderBottom: "1px solid rgba(99, 102, 241, 0.2)",
              fontSize: 14,
              color: "var(--text-accent)",
              textAlign: "center",
            }}
          >
            {demoScript[demoStep]?.content}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ── Floating Dock (sidebar) ──────────────────────────────────────── */}
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "16px 8px",
            gap: 4,
          }}
        >
          <div className="dock" style={{ flexDirection: "column" }}>
            {NAV_ITEMS.map((item) => (
              <motion.button
                key={item.id}
                className={`dock-item ${screen === item.id ? "active" : ""}`}
                onClick={() => setScreen(item.id)}
                whileHover={{ scale: 1.15, y: -2 }}
                whileTap={{ scale: 0.95 }}
                title={item.label}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
              </motion.button>
            ))}
          </div>
        </nav>

        {/* ── Screen Content ───────────────────────────────────────────────── */}
        <main style={{ flex: 1, padding: "16px 16px 16px 0", overflow: "auto" }}>
          <AnimatePresence mode="wait">
            {screen === "inbox" && (
              <InboxScreen
                key="inbox"
                onOpenTicket={openTicket}
                onOpenCustomer={openCustomer360}
              />
            )}
            {screen === "chat" && (
              <ChatScreen
                key="chat"
                customerId={selectedCustomerId}
                ticketId={selectedTicketId}
                chatMessages={chatMessages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onSend={handleSendMessage}
                isProcessing={isProcessing}
                agentTrace={agentTrace}
                briefingCard={briefingCard}
                replyDraft={replyDraft}
                onSendReply={sendReply}
                agentMode={agentMode}
                setAgentMode={setAgentMode}
                chatEndRef={chatEndRef}
                onOpenCustomer={openCustomer360}
              />
            )}
            {screen === "customer360" && (
              <Customer360Screen
                key="c360"
                customerId={selectedCustomerId}
                onOpenTicket={openTicket}
              />
            )}
            {screen === "analytics" && <AnalyticsScreen key="analytics" />}
            {screen === "portal" && (
              <PortalScreen
                key="portal"
                customerId={selectedCustomerId || "CUST-1001"}
              />
            )}
            {screen === "about" && <AboutScreen key="about" />}
          </AnimatePresence>
        </main>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer
        style={{
          padding: "12px 24px",
          borderTop: "1px solid var(--glass-border)",
          textAlign: "center",
          fontSize: 12,
          color: "var(--text-tertiary)",
        }}
      >
        Built by Team Zenith
      </footer>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
          >
            🧠 {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// INBOX SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function InboxScreen({
  onOpenTicket,
  onOpenCustomer,
}: {
  onOpenTicket: (t: Ticket) => void;
  onOpenCustomer: (id: string) => void;
}) {
  const openTickets = memoryStore.getOpenTickets();
  const allCustomers = memoryStore.getAllCustomers();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Open Tickets", value: openTickets.length, icon: "📥" },
          { label: "Critical", value: openTickets.filter((t) => t.priority === "critical").length, icon: "🔴" },
          { label: "SLA Warning", value: openTickets.filter((t) => t.slaStatus === "warning").length, icon: "⚠️" },
          { label: "Customers", value: allCustomers.length, icon: "👥" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            className="glass glass-specular"
            style={{ padding: 20 }}
            {...stagger(i)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Sora', sans-serif" }}>
                  <CountUp end={stat.value} duration={1000} />
                </div>
              </div>
              <div style={{ fontSize: 28 }}>{stat.icon}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Ticket List */}
      <motion.div className="glass" style={{ padding: 0, overflow: "hidden" }} {...stagger(4)}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--glass-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Ticket Inbox</h2>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Sorted by SLA + frustration · J/K to navigate · ⌘K to search
          </span>
        </div>

        <div style={{ maxHeight: "calc(100vh - 320px)", overflow: "auto" }}>
          {openTickets.map((ticket, i) => {
            const customer = memoryStore.getCustomer(ticket.customerId);
            const affective = memoryStore.recallAffective(ticket.customerId);
            return (
              <motion.div
                key={ticket.id}
                onClick={() => onOpenTicket(ticket)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                {...stagger(i + 5)}
              >
                <div className={`priority-dot priority-${ticket.priority}`} />
                <div
                  className="avatar avatar-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenCustomer(ticket.customerId);
                  }}
                >
                  {customer?.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{ticket.subject}</span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{ticket.id}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    {customer?.name} · {ticket.category}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {affective && affective.frustrationLevel >= 6 && (
                    <span className="chip chip-failed" style={{ textDecoration: "none" }}>
                      😤 {affective.frustrationLevel}/10
                    </span>
                  )}
                  <span className={`chip chip-sla-${ticket.slaStatus}`}>
                    {ticket.slaStatus === "breached"
                      ? "SLA BREACHED"
                      : ticket.slaStatus === "warning"
                        ? "SLA WARNING"
                        : "Within SLA"}
                  </span>
                  <span className={`chip chip-status-${ticket.status}`}>
                    {ticket.status}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAT SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function ChatScreen({
  customerId,
  ticketId,
  chatMessages,
  chatInput,
  setChatInput,
  onSend,
  isProcessing,
  agentTrace,
  briefingCard,
  replyDraft,
  onSendReply,
  agentMode,
  setAgentMode,
  chatEndRef,
  onOpenCustomer,
}: {
  customerId: string | null;
  ticketId: string | null;
  chatMessages: { role: string; content: string }[];
  chatInput: string;
  setChatInput: (v: string) => void;
  onSend: () => void;
  isProcessing: boolean;
  agentTrace: AgentTrace | null;
  briefingCard: BriefingCard | null;
  replyDraft: ReplyDraft | null;
  onSendReply: () => void;
  agentMode: "assist" | "autopilot";
  setAgentMode: (m: "assist" | "autopilot") => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onOpenCustomer: (id: string) => void;
}) {
  const customer = customerId ? memoryStore.getCustomer(customerId) : null;
  const ticket = ticketId ? memoryStore.getTicket(ticketId) : null;

  if (!customer || !ticket) {
    return (
      <motion.div
        className="glass"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--text-secondary)",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Select a ticket to start</h2>
        <p style={{ fontSize: 14 }}>Open a ticket from the Inbox to begin chatting.</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, height: "calc(100vh - 140px)" }}
    >
      {/* ── Left: Chat + Briefing ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
        {/* Briefing Card */}
        {briefingCard && (
          <motion.div
            className={`glass glass-specular glow-edge ${briefingCard.frustrationLevel >= 7 ? "glow-edge-danger" : briefingCard.frustrationLevel <= 3 ? "glow-edge-success" : ""
              }`}
            style={{ padding: 20 }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 1 }}>
                  10-Second Briefing
                </div>
                <h3 style={{ fontSize: 16, marginTop: 4 }}>{briefingCard.customerName}</h3>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {briefingCard.plan} plan · {briefingCard.whoTheyAre.split('.')[0]}
                </div>
              </div>
              <FrustrationMeter level={briefingCard.frustrationLevel} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
              <div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginBottom: 4 }}>What failed</div>
                {briefingCard.whatFailed.length > 0 ? (
                  briefingCard.whatFailed.map((f, i) => (
                    <div key={i} className="chip chip-failed" style={{ display: "block", marginBottom: 4 }}>
                      {f.split(' — ')[0]}
                    </div>
                  ))
                ) : (
                  <span style={{ color: "var(--text-tertiary)" }}>Nothing yet</span>
                )}
              </div>
              <div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginBottom: 4 }}>What worked</div>
                {briefingCard.whatWorked.length > 0 ? (
                  briefingCard.whatWorked.slice(0, 3).map((w, i) => (
                    <div key={i} className="chip chip-success" style={{ display: "block", marginBottom: 4 }}>
                      {w.split(' (')[0]}
                    </div>
                  ))
                ) : (
                  <span style={{ color: "var(--text-tertiary)" }}>Nothing yet</span>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 12, fontSize: 13 }}>
              <strong style={{ color: "var(--text-accent)" }}>Next move:</strong>{" "}
              <span style={{ color: "var(--text-secondary)" }}>{briefingCard.nextMove}</span>
            </div>
          </motion.div>
        )}

        {/* Chat Messages */}
        <div
          className="glass"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: 0,
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--glass-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                className="avatar avatar-sm"
                style={{ cursor: "pointer" }}
                onClick={() => onOpenCustomer(customer.id)}
              >
                {customer.avatar}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{customer.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {ticket.id} · {ticket.subject}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className={`glass-btn ${agentMode === "assist" ? "glass-btn-primary" : ""}`}
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={() => setAgentMode("assist")}
              >
                🎯 Assist
              </button>
              <button
                className={`glass-btn ${agentMode === "autopilot" ? "glass-btn-primary" : ""}`}
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={() => setAgentMode("autopilot")}
              >
                🤖 Autopilot
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {chatMessages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "agent" ? "flex-start" : "flex-end",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "12px 16px",
                    borderRadius: msg.role === "agent" ? "16px 16px 16px 4px" : "16px 16px 4px 16px",
                    background:
                      msg.role === "agent"
                        ? "rgba(99, 102, 241, 0.1)"
                        : "rgba(255, 255, 255, 0.06)",
                    border: `1px solid ${msg.role === "agent"
                        ? "rgba(99, 102, 241, 0.2)"
                        : "rgba(255, 255, 255, 0.08)"
                      }`,
                    fontSize: 14,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content.split('\n').map((line, li) => {
                    if (line.includes('~~') && line.includes('~~')) {
                      const parts = line.split(/~~(.*?)~~/g);
                      return (
                        <div key={li}>
                          {parts.map((part, pi) =>
                            pi % 2 === 1 ? (
                              <span key={pi} style={{ textDecoration: "line-through", color: "#fca5a5" }}>
                                {part}
                              </span>
                            ) : (
                              <span key={pi}>{part}</span>
                            )
                          )}
                        </div>
                      );
                    }
                    if (line.startsWith('✓ **')) {
                      return (
                        <div key={li} style={{ color: "#86efac" }}>
                          {line.replace(/\*\*/g, '')}
                        </div>
                      );
                    }
                    if (line.startsWith('•') || line.startsWith('✗')) {
                      return <div key={li} style={{ paddingLeft: 8 }}>{line}</div>;
                    }
                    if (line.startsWith('*') && line.endsWith('*')) {
                      return (
                        <div key={li} style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: 12, marginTop: 8 }}>
                          {line.replace(/\*/g, '')}
                        </div>
                      );
                    }
                    return <div key={li}>{line || '\u00A0'}</div>;
                  })}
                </div>
              </motion.div>
            ))}
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ display: "flex", gap: 6, padding: "12px 0" }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--aurora-indigo)",
                    }}
                    animate={{ y: [0, -8, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.6,
                      delay: i * 0.15,
                    }}
                  />
                ))}
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Reply Copilot */}
          {replyDraft && agentMode === "assist" && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              style={{
                padding: 16,
                borderTop: "1px solid var(--glass-border)",
                background: "rgba(99, 102, 241, 0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>AI Reply Copilot</span>
                  <span className="badge badge-memory-safe">✓ Memory-Safe</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    Cites: {replyDraft.memoryCitations.join(', ')}
                  </div>
                </div>
              </div>
              <div
                style={{
                  padding: 12,
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.6,
                  marginBottom: 12,
                  maxHeight: 200,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {replyDraft.content}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="glass-btn glass-btn-primary" onClick={onSendReply}>
                  ✉ Send Reply
                </button>
                <button className="glass-btn" onClick={() => { }}>
                  ✏️ Edit
                </button>
              </div>
            </motion.div>
          )}

          {/* Input */}
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--glass-border)",
              display: "flex",
              gap: 8,
            }}
          >
            <input
              className="glass-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSend()}
              placeholder="Type a customer message to test Remi's memory..."
              disabled={isProcessing}
            />
            <button
              className="glass-btn glass-btn-primary"
              onClick={onSend}
              disabled={isProcessing || !chatInput.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Agent Reasoning Panel ──────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
        {/* Agent Reasoning Trace */}
        <div
          className="glass"
          style={{ flex: 1, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--glass-border)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            🧠 Agent Reasoning
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {agentTrace ? (
              agentTrace.steps.map((step, i) => (
                <motion.div
                  key={i}
                  className="reasoning-step"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="reasoning-icon">
                    {step.type === "identify"
                      ? "🔍"
                      : step.type === "recall"
                        ? "🧠"
                        : step.type === "reason"
                          ? "💭"
                          : step.type === "act"
                            ? "⚡"
                            : step.type === "respond"
                              ? "💬"
                              : "📝"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, textTransform: "capitalize" }}>
                      {step.type}
                      {step.tool && (
                        <span style={{ fontSize: 11, color: "var(--aurora-indigo)", marginLeft: 6 }}>
                          → {step.tool}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {step.description}
                    </div>
                    {step.toolOutput && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: "6px 10px",
                          background: "rgba(255,255,255,0.03)",
                          borderRadius: 8,
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          maxHeight: 80,
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {step.toolOutput}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
                      {step.durationMs}ms
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--text-tertiary)",
                  fontSize: 13,
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 32 }}>🧠</span>
                <span>Agent trace will appear here</span>
                <span style={{ fontSize: 11 }}>
                  Send a message to see the reasoning loop
                </span>
              </div>
            )}
            {agentTrace && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  background: "rgba(34, 197, 94, 0.08)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#86efac",
                }}
              >
                Total: {agentTrace.totalDurationMs}ms · Created {agentTrace.memoryItemsCreated} memories · Updated {agentTrace.memoryItemsUpdated}
              </motion.div>
            )}
          </div>
        </div>

        {/* Memory Layers */}
        {customerId && (
          <MemoryLayersPanel customerId={customerId} />
        )}
      </div>
    </motion.div>
  );
}

// ─── Memory Layers Panel ─────────────────────────────────────────────────────

function MemoryLayersPanel({ customerId }: { customerId: string }) {
  const stats = memoryStore.getMemoryStats(customerId);
  const layers = [
    { name: "Episodic", count: stats.episodic, icon: "📖", color: "var(--aurora-indigo)" },
    { name: "Semantic", count: stats.semantic, icon: "🌐", color: "var(--aurora-teal)" },
    { name: "Procedural", count: stats.procedural, icon: "⚙️", color: "var(--aurora-violet)" },
    { name: "Affective", count: stats.affective, icon: "💜", color: "var(--aurora-magenta)" },
  ];

  return (
    <div className="glass" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Memory Layers</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {layers.map((layer) => (
          <div
            key={layer.name}
            style={{
              padding: "10px 12px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 12,
              borderLeft: `3px solid ${layer.color}`,
            }}
          >
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {layer.icon} {layer.name}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{layer.count}</div>
          </div>
        ))}
      </div>
      {stats.failedSolutions > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            background: "rgba(239, 68, 68, 0.08)",
            borderRadius: 8,
            fontSize: 12,
            color: "#fca5a5",
          }}
        >
          ⚠️ {stats.failedSolutions} failed solution{stats.failedSolutions > 1 ? "s" : ""} in ledger
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CUSTOMER 360 SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function Customer360Screen({
  customerId,
  onOpenTicket,
}: {
  customerId: string | null;
  onOpenTicket: (t: Ticket) => void;
}) {
  const [selectedTab, setSelectedTab] = useState<"overview" | "tickets" | "memory">("overview");
  const customer = customerId ? memoryStore.getCustomer(customerId) : null;

  if (!customer) {
    return (
      <motion.div className="glass" style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>👤</div>
        <h2>Select a customer</h2>
        <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
          Click a customer avatar from the Inbox to view their 360° profile.
        </p>
      </motion.div>
    );
  }

  const customerTickets = memoryStore.getTicketsForCustomer(customer.id);
  const affective = memoryStore.recallAffective(customer.id);
  const semantic = memoryStore.recallSemantic(customer.id);
  const episodic = memoryStore.recallEpisodic(customer.id);
  const procedural = memoryStore.recallProcedural(customer.id);
  const failed = memoryStore.getFailedSolutions(customer.id);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* Header */}
      <motion.div className="glass glass-specular" style={{ padding: 24 }} {...stagger(0)}>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <div className="avatar avatar-lg">{customer.avatar}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22 }}>{customer.name}</h2>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              {customer.email} · {customer.plan} plan · Since {customer.joinedDate}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Lifetime Value</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-accent)" }}>
              ${customer.lifetimeValue.toLocaleString()}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["overview", "tickets", "memory"] as const).map((tab) => (
          <button
            key={tab}
            className={`glass-btn ${selectedTab === tab ? "glass-btn-primary" : ""}`}
            onClick={() => setSelectedTab(tab)}
            style={{ textTransform: "capitalize" }}
          >
            {tab === "overview" ? "👤 " : tab === "tickets" ? "🎫 " : "🧠 "}
            {tab}
          </button>
        ))}
      </div>

      {selectedTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Environment */}
          <motion.div className="glass" style={{ padding: 20 }} {...stagger(1)}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>🖥️ Environment Fingerprint</h3>
            {Object.entries(customer.environment).map(([key, value]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13 }}>
                <span style={{ color: "var(--text-tertiary)", textTransform: "capitalize" }}>{key.replace(/([A-Z])/g, ' $1')}</span>
                <span>{value}</span>
              </div>
            ))}
          </motion.div>

          {/* Affective */}
          <motion.div className="glass" style={{ padding: 20 }} {...stagger(2)}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>💜 Frustration Trajectory</h3>
            {affective ? (
              <>
                <FrustrationMeter level={affective.frustrationLevel} />
                <div style={{ marginTop: 12 }}>
                  {affective.frustrationTrajectory.map((point, i) => (
                    <div
                      key={i}
                      className="memory-thread"
                      style={{ padding: "8px 0 8px 24px", position: "relative" }}
                    >
                      <div className="memory-dot" style={{
                        background: point.level >= 7 ? "var(--frustration-critical)" : point.level >= 4 ? "var(--frustration-medium)" : "var(--frustration-low)",
                        boxShadow: `0 0 8px ${point.level >= 7 ? "var(--frustration-critical)" : point.level >= 4 ? "var(--frustration-medium)" : "var(--frustration-low)"}`,
                      }} />
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: "var(--text-tertiary)" }}>{point.timestamp.split('T')[0]}</span>
                        {" "}— Level {point.level}: {point.trigger}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>No affective data</span>
            )}
          </motion.div>

          {/* Communication Style */}
          <motion.div className="glass" style={{ padding: 20 }} {...stagger(3)}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>🗣️ Communication Style</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Channel", value: customer.communicationStyle.preferredChannel },
                { label: "Technical Level", value: customer.communicationStyle.technicalLevel },
                { label: "Preferred Tone", value: customer.communicationStyle.preferredTone },
                { label: "Language", value: customer.communicationStyle.language },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-tertiary)" }}>{item.label}</span>
                  <span className="chip chip-success" style={{ textDecoration: "none" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Semantic Memory */}
          <motion.div className="glass" style={{ padding: 20 }} {...stagger(4)}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>🌐 Semantic Memory</h3>
            {semantic.map((s) => (
              <div key={s.id} style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-tertiary)" }}>{s.key}</span>
                  <span className="chip" style={{ background: "rgba(99,102,241,0.1)", color: "var(--aurora-indigo)", border: "1px solid rgba(99,102,241,0.2)", fontSize: 10 }}>
                    {Math.round(s.confidence * 100)}%
                  </span>
                </div>
                <div style={{ marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </motion.div>
        </div>
      )}

      {selectedTab === "tickets" && (
        <motion.div className="glass" style={{ padding: 0, overflow: "hidden" }} {...stagger(1)}>
          {customerTickets.map((ticket) => (
            <div
              key={ticket.id}
              onClick={() => onOpenTicket(ticket)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div className={`priority-dot priority-${ticket.priority}`} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{ticket.subject}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {ticket.id} · {ticket.createdAt.split('T')[0]} · {ticket.category}
                </div>
              </div>
              <span className={`chip chip-status-${ticket.status}`}>{ticket.status}</span>
            </div>
          ))}
        </motion.div>
      )}

      {selectedTab === "memory" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <motion.div className="glass" style={{ padding: 20 }} {...stagger(1)}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>📖 Episodic Memory</h3>
            {episodic.map((e) => (
              <div key={e.id} className="memory-thread" style={{ padding: "8px 0 8px 24px", position: "relative" }}>
                <div className="memory-dot" />
                <div style={{ fontSize: 12 }}>
                  <strong>{e.event}</strong>
                  <div style={{ color: "var(--text-secondary)", marginTop: 2 }}>→ {e.outcome}</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 2 }}>{e.ticketId} · {e.timestamp.split('T')[0]}</div>
                </div>
              </div>
            ))}
          </motion.div>

          <motion.div className="glass" style={{ padding: 20 }} {...stagger(2)}>
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>⚙️ Procedural Memory</h3>
            {procedural.map((p) => (
              <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={p.outcome === 'success' ? 'chip chip-success' : 'chip chip-failed'}>
                    {p.outcome === 'success' ? '✓' : '✗'} {p.step}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  {p.ticketId} · {p.category} {p.context ? `· ${p.context}` : ''}
                </div>
              </div>
            ))}

            {failed.length > 0 && (
              <>
                <h4 style={{ fontSize: 13, marginTop: 16, marginBottom: 8, color: "#fca5a5" }}>
                  🚫 Failed Solutions Ledger
                </h4>
                {failed.map((f) => (
                  <div key={f.id} style={{ padding: "6px 0", fontSize: 12 }}>
                    <div className="chip chip-failed">{f.step}</div>
                    <div style={{ color: "var(--text-tertiary)", marginTop: 2, fontSize: 11 }}>
                      {f.failureReason}
                    </div>
                  </div>
                ))}
              </>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function AnalyticsScreen() {
  const data = memoryStore.getAnalytics();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 20 }}>📊 Analytics Dashboard</h2>
        <span className="chip" style={{
          background: "rgba(245, 158, 11, 0.1)",
          color: "#fcd34d",
          border: "1px solid rgba(245, 158, 11, 0.3)",
        }}>
          ⚠️ Simulated demo data
        </span>
      </div>

      {/* Key Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Time Saved", value: data.timeSavedMinutes, suffix: " min", icon: "⏱️", highlight: true },
          { label: "Memory Hits", value: data.memoryHits, icon: "🧠" },
          { label: "Repeat Q's Prevented", value: data.repeatQuestionsPrevented, icon: "🛡️" },
          { label: "Satisfaction", value: data.customerSatisfaction, suffix: "%", icon: "😊" },
        ].map((metric, i) => (
          <motion.div
            key={metric.label}
            className={`glass glass-specular ${metric.highlight ? "glow-edge glow-edge-success" : ""}`}
            style={{ padding: 20 }}
            {...stagger(i)}
          >
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>
              {metric.icon} {metric.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'Sora', sans-serif" }}>
              <CountUp end={metric.value} duration={2000} suffix={metric.suffix || ""} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Tickets Over Time */}
        <motion.div className="glass" style={{ padding: 20 }} {...stagger(4)}>
          <h3 style={{ fontSize: 14, marginBottom: 16 }}>Tickets Over Time</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
            {data.ticketsOverTime.map((point, i) => {
              const maxCount = Math.max(...data.ticketsOverTime.map(p => p.count));
              const height = (point.count / maxCount) * 100;
              return (
                <motion.div
                  key={point.date}
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  style={{
                    flex: 1,
                    background: "linear-gradient(to top, var(--aurora-indigo), var(--aurora-violet))",
                    borderRadius: "6px 6px 0 0",
                    position: "relative",
                    minHeight: 4,
                  }}
                >
                  <div style={{
                    position: "absolute",
                    top: -20,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    {point.count}
                  </div>
                  <div style={{
                    position: "absolute",
                    bottom: -18,
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: 10,
                    color: "var(--text-tertiary)",
                    whiteSpace: "nowrap",
                  }}>
                    {point.date.split('-')[1]}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Memory Utilization */}
        <motion.div className="glass" style={{ padding: 20 }} {...stagger(5)}>
          <h3 style={{ fontSize: 14, marginBottom: 16 }}>Memory Layer Utilization</h3>
          {data.memoryUtilization.map((layer, i) => (
            <div key={layer.layer} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span>{layer.layer}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{layer.count} items · {layer.hitRate}% hit rate</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${layer.hitRate}%` }}
                  transition={{ delay: i * 0.15, duration: 0.8 }}
                  style={{
                    height: "100%",
                    borderRadius: 3,
                    background: [
                      "var(--aurora-indigo)",
                      "var(--aurora-teal)",
                      "var(--aurora-violet)",
                      "var(--aurora-magenta)",
                    ][i],
                  }}
                />
              </div>
            </div>
          ))}
        </motion.div>

        {/* Top Categories */}
        <motion.div className="glass" style={{ padding: 20 }} {...stagger(6)}>
          <h3 style={{ fontSize: 14, marginBottom: 16 }}>Top Categories</h3>
          {data.topCategories.map((cat, i) => {
            const maxCount = Math.max(...data.topCategories.map(c => c.count));
            return (
              <div key={cat.category} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 12, width: 80, color: "var(--text-secondary)" }}>{cat.category}</span>
                <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(cat.count / maxCount) * 100}%` }}
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                    style={{
                      height: "100%",
                      borderRadius: 4,
                      background: "linear-gradient(90deg, var(--aurora-indigo), var(--aurora-violet))",
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, width: 24, textAlign: "right" }}>{cat.count}</span>
              </div>
            );
          })}
        </motion.div>

        {/* Resolution Stats */}
        <motion.div className="glass" style={{ padding: 20 }} {...stagger(7)}>
          <h3 style={{ fontSize: 14, marginBottom: 16 }}>Resolution Metrics</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'Sora', sans-serif" }}>
                <CountUp end={data.avgResolutionTime} duration={1500} suffix=" min" />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Avg Resolution</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'Sora', sans-serif", color: "var(--aurora-teal)" }}>
                <CountUp end={data.avgFrustrationReduction * 10} duration={1500} suffix="%" />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Frustration Reduction</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'Sora', sans-serif" }}>
                {data.resolvedTickets}/{data.totalTickets}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Resolved</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'Sora', sans-serif", color: "var(--aurora-violet)" }}>
                <CountUp end={data.memoryHits} duration={1500} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Memory Hits</div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PORTAL SCREEN (Customer-facing)
// ═════════════════════════════════════════════════════════════════════════════

function PortalScreen({ customerId }: { customerId: string }) {
  const customer = memoryStore.getCustomer(customerId);
  const semantic = memoryStore.recallSemantic(customerId);
  const tickets = memoryStore.getTicketsForCustomer(customerId);

  if (!customer) {
    return <div className="glass" style={{ padding: 40, textAlign: "center" }}>Select a customer first</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        maxWidth: 640,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <motion.div className="glass glass-specular" style={{ padding: 24, textAlign: "center" }} {...stagger(0)}>
        <div className="avatar avatar-lg" style={{ margin: "0 auto 12px" }}>{customer.avatar}</div>
        <h2 style={{ fontSize: 20 }}>{customer.name}</h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{customer.plan} plan · {customer.email}</p>
      </motion.div>

      {/* We Remember Panel */}
      <motion.div className="glass glow-edge glow-edge-success" style={{ padding: 20 }} {...stagger(1)}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>🧠 We Remember</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
          Here is what we know about you. You can view, correct, or delete any item.
        </p>
        {semantic.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{s.category} · {s.key}</div>
              <div style={{ fontSize: 14, marginTop: 2 }}>{s.value}</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="glass-btn" style={{ padding: "4px 8px", fontSize: 11 }}>✏️</button>
              <button className="glass-btn glass-btn-danger" style={{ padding: "4px 8px", fontSize: 11 }}>🗑️</button>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Support History */}
      <motion.div className="glass" style={{ padding: 20 }} {...stagger(2)}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>📋 Your Support History</h3>
        {tickets.slice(0, 5).map((ticket) => (
          <div
            key={ticket.id}
            style={{
              padding: "12px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14 }}>{ticket.subject}</span>
              <span className={`chip chip-status-${ticket.status}`}>{ticket.status}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
              {ticket.id} · {ticket.createdAt.split('T')[0]}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Privacy Controls */}
      <motion.div className="glass" style={{ padding: 20 }} {...stagger(3)}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>🔒 Privacy Controls</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          All data shown is synthetic for this demo. In production, you have full control.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="glass-btn">📥 Export My Data</button>
          <button className="glass-btn glass-btn-danger">🗑️ Delete All Data</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ABOUT SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function AboutScreen() {
  const members = [
    { name: "Rupa Hasini", role: "Team Lead" },
    { name: "Pravallika", role: "Frontend" },
    { name: "Shruthi", role: "Backend" },
    { name: "Madhurima", role: "AI Integrator" },
    { name: "Tasneem", role: "Deployment & Integration" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        maxWidth: 800,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Hero */}
      <motion.div
        className="glass glass-specular glow-edge"
        style={{ padding: 40, textAlign: "center" }}
        {...stagger(0)}
      >
        <motion.div
          style={{
            fontSize: 48,
            fontFamily: "'Sora', sans-serif",
            fontWeight: 700,
            background: "linear-gradient(135deg, var(--aurora-indigo), var(--aurora-violet), var(--aurora-teal))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 8,
          }}
        >
          Remi
        </motion.div>
        <p style={{ fontSize: 18, color: "var(--text-secondary)", marginBottom: 4 }}>
          Support that remembers.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          AI Customer Support Agent
        </p>
      </motion.div>

      {/* Team */}
      <motion.div className="glass" style={{ padding: 24 }} {...stagger(1)}>
        <h2 style={{ fontSize: 20, marginBottom: 20, textAlign: "center" }}>
          Meet Team Zenith
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {members.map((member, i) => (
            <motion.div
              key={member.name}
              className="glass-elevated"
              style={{
                padding: 20,
                textAlign: "center",
                borderRadius: 20,
              }}
              {...stagger(i + 2)}
              whileHover={{ scale: 1.03, y: -2 }}
            >
              <div
                className="avatar avatar-lg"
                style={{ margin: "0 auto 12px" }}
              >
                {member.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{member.name}</div>
              {member.role && (
                <span className="badge badge-leader" style={{ marginTop: 6, display: "inline-block" }}>
                  {member.role}
                </span>
              )}
            </motion.div>
          ))}
        </div>
        <p
          style={{
            textAlign: "center",
            marginTop: 20,
            fontSize: 13,
            color: "var(--text-tertiary)",
          }}
        >
          Built with care by Team Zenith.
        </p>
      </motion.div>

      {/* Credits */}
      <motion.div className="glass" style={{ padding: 24 }} {...stagger(2)}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Credits</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          Started from{" "}
          <a
            href="https://github.com/siddhartha3066/customer-support-memory-agent"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-accent)", textDecoration: "underline" }}
          >
            siddhartha3066/customer-support-memory-agent
          </a>
          . Remi substantially extends it: new Next.js frontend, four-layer memory, Failed-Solutions Ledger, frustration engine, agent reasoning trace, customer portal and analytics.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12, lineHeight: 1.8 }}>
          New code is credited to Team Zenith. The original LICENSE file is preserved untouched.
        </p>
      </motion.div>

      {/* Links */}
      <motion.div className="glass" style={{ padding: 24 }} {...stagger(3)}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Links</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a
            href="https://github.com/RupaHasini-04/remi"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-btn glass-btn-primary"
          >
            GitHub Repository
          </a>
          <a
            href="https://hackwithhyderabad.netlify.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-btn"
          >
            Live Demo
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}
