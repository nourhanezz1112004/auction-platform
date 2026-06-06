// apps/web/src/pages/AdminDisputePanel.tsx
// Admin UI to view AI dispute analysis and action resolutions.
// Shows the full case timeline, evidence, and AI recommendation.
// Admin can approve or override the AI recommendation.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient as axios } from "@/api/client";

const AI = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";
const ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY ?? "";

interface DisputeTicket {
  id: string;
  userId: string;
  auctionId: string;
  status: string;
  escalationReason: string;
  createdAt: string;
  conversationJson: Array<{ content: string }>;
  user: { name: string; email: string };
}

interface DisputeAnalysis {
  case_summary: string;
  timeline: Array<{ time: string; event: string; entity: string; details: Record<string, any> }>;
  key_facts: string[];
  recommended_resolution: string;
  confidence: string;
  reasoning: string;
  evidence_for_buyer: string[];
  evidence_for_seller: string[];
}

const RESOLUTION_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  refund_buyer:      { label: "Refund buyer",        color: "bg-blue-600",   desc: "Issue full refund — seller at fault" },
  release_to_seller: { label: "Release to seller",   color: "bg-green-600",  desc: "Transaction legitimate — release funds" },
  partial_refund:    { label: "Partial refund",      color: "bg-amber-600",  desc: "Item not as described — partial settlement" },
  escalate:          { label: "Escalate to legal",   color: "bg-red-600",    desc: "Complex case — requires legal review" },
};

function useTickets() {
  return useQuery<DisputeTicket[]>({
    queryKey: ["dispute-tickets"],
    queryFn: () =>
      axios.get("/api/support/tickets?status=open").then(r => r.data),
    refetchInterval: 60_000,
  });
}

function useDisputeAnalysis(ticket: DisputeTicket | null) {
  return useQuery<DisputeAnalysis>({
    queryKey: ["dispute-analysis", ticket?.id],
    queryFn: () =>
      fetch(`${AI}/dispute/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
        body: JSON.stringify({
          auction_id:     ticket!.auctionId,
          dispute_reason: ticket!.escalationReason ?? "Customer support escalation",
          filed_by:       "buyer",
          claimant_id:    ticket!.userId,
        }),
      }).then(r => r.json()),
    enabled: !!ticket?.auctionId,
    staleTime: 10 * 60_000,
  });
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high:   "text-green-700 bg-green-50",
  medium: "text-amber-700 bg-amber-50",
  low:    "text-red-700 bg-red-50",
};

export function AdminDisputePanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<DisputeTicket | null>(null);
  const [resolution, setResolution] = useState<string>("");

  const { data: tickets, isLoading } = useTickets();
  const { data: analysis, isLoading: analysing } = useDisputeAnalysis(selected);

  // Pre-fill resolution from AI recommendation
  const effectiveResolution = resolution || analysis?.recommended_resolution || "";

  const resolve = useMutation({
    mutationFn: ({ ticketId, res }: { ticketId: string; res: string }) =>
      axios.patch(`/api/support/tickets/${ticketId}/resolve`, { resolution: res }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispute-tickets"] });
      setSelected(null);
      setResolution("");
    },
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Dispute resolution</h1>
        {tickets && (
          <span className="text-sm text-neutral-500">
            {tickets.length} open ticket{tickets.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex gap-6">
        {/* Ticket list */}
        <div className="w-72 flex-shrink-0 space-y-2">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-neutral-100 animate-pulse" />
            ))
          ) : tickets?.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
              <div className="text-3xl mb-2">✓</div>
              <div className="text-sm text-neutral-500">No open disputes</div>
            </div>
          ) : tickets?.map(ticket => (
            <button
              key={ticket.id}
              onClick={() => { setSelected(ticket); setResolution(""); }}
              className={`w-full text-left rounded-xl border p-3 transition-all ${
                selected?.id === ticket.id
                  ? "border-neutral-900 bg-neutral-50"
                  : "border-neutral-200 bg-white hover:border-neutral-400"
              }`}
            >
              <div className="text-xs font-medium text-neutral-700 truncate">
                {ticket.user.name}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5 truncate">
                {ticket.escalationReason ?? "Support escalation"}
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">
                {new Date(ticket.createdAt).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>

        {/* Analysis panel */}
        {selected ? (
          <div className="flex-1 min-w-0 space-y-4">
            {/* Ticket header */}
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-medium">{selected.user.name}</div>
                  <div className="text-sm text-neutral-500">{selected.user.email}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                  Open
                </span>
              </div>
              <div className="text-sm text-neutral-700 bg-neutral-50 rounded-lg p-3">
                {selected.escalationReason ?? "Escalated from support chat"}
              </div>
            </div>

            {/* AI Analysis */}
            {analysing ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
                <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin mx-auto mb-3" />
                <div className="text-sm text-neutral-500">AI analysing case…</div>
              </div>
            ) : analysis ? (
              <>
                {/* Case summary */}
                <div className="rounded-xl border border-neutral-200 bg-white p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="text-sm font-medium">AI case summary</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_COLOR[analysis.confidence]}`}>
                      {analysis.confidence} confidence
                    </span>
                  </div>
                  <p className="text-sm text-neutral-700 leading-relaxed">{analysis.case_summary}</p>
                </div>

                {/* Key facts */}
                <div className="rounded-xl border border-neutral-200 bg-white p-5">
                  <div className="text-sm font-medium mb-3">Key facts</div>
                  <ul className="space-y-1.5">
                    {analysis.key_facts.map((fact, i) => (
                      <li key={i} className="text-sm text-neutral-600 flex gap-2">
                        <span className="text-neutral-400 flex-shrink-0">·</span>
                        <span>{fact}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Evidence */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="text-xs font-medium text-blue-800 mb-2">Evidence for buyer</div>
                    {analysis.evidence_for_buyer.length ? (
                      <ul className="space-y-1">
                        {analysis.evidence_for_buyer.map((e, i) => (
                          <li key={i} className="text-xs text-blue-700 flex gap-1.5">
                            <span>+</span><span>{e}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <div className="text-xs text-blue-600">None found</div>}
                  </div>
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <div className="text-xs font-medium text-green-800 mb-2">Evidence for seller</div>
                    {analysis.evidence_for_seller.length ? (
                      <ul className="space-y-1">
                        {analysis.evidence_for_seller.map((e, i) => (
                          <li key={i} className="text-xs text-green-700 flex gap-1.5">
                            <span>+</span><span>{e}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <div className="text-xs text-green-600">None found</div>}
                  </div>
                </div>

                {/* Timeline */}
                <div className="rounded-xl border border-neutral-200 bg-white p-5">
                  <div className="text-sm font-medium mb-3">Audit timeline</div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {analysis.timeline.slice(0, 20).map((t, i) => (
                      <div key={i} className="flex gap-3 text-xs">
                        <span className="text-neutral-400 flex-shrink-0 w-32 tabular-nums">
                          {t.time ? new Date(t.time).toLocaleTimeString() : "—"}
                        </span>
                        <span className="font-mono text-neutral-600">{t.event}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resolution */}
                <div className="rounded-xl border border-neutral-200 bg-white p-5">
                  <div className="text-sm font-medium mb-1">AI recommendation</div>
                  <div className="text-xs text-neutral-500 mb-4">{analysis.reasoning}</div>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {Object.entries(RESOLUTION_LABELS).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => setResolution(key)}
                        className={`rounded-lg border p-3 text-left transition-all ${
                          effectiveResolution === key
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 hover:border-neutral-400"
                        }`}
                      >
                        <div className="text-xs font-medium">{val.label}</div>
                        <div className={`text-[11px] mt-0.5 ${effectiveResolution === key ? "text-neutral-300" : "text-neutral-500"}`}>
                          {val.desc}
                        </div>
                        {analysis.recommended_resolution === key && (
                          <div className={`text-[10px] mt-1 font-medium ${effectiveResolution === key ? "text-green-300" : "text-green-600"}`}>
                            ✦ AI recommends
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => resolve.mutate({ ticketId: selected.id, res: effectiveResolution })}
                    disabled={!effectiveResolution || resolve.isPending}
                    className="w-full py-3 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 transition-colors"
                  >
                    {resolve.isPending
                      ? "Resolving…"
                      : `Apply: ${RESOLUTION_LABELS[effectiveResolution]?.label ?? "Select resolution"}`}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex-1 rounded-xl border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 text-sm">
            Select a ticket to view AI analysis
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDisputePanel;
