import { useState } from "react";
import axios from "axios";

const AI_BASE = (import.meta as any).env?.VITE_AI_SERVICE_URL || "http://localhost:8000";

const categories = [
  {
    id: "fraud", label: "Fraud & Trust", arabicLabel: "الحماية والثقة", icon: "🛡",
    features: [
      { id: "fraud-score", name: "Fraud Score", desc: "Score a bid for fraud probability using XGBoost neural model", endpoint: "POST /fraud/score", call: () => axios.post(`${AI_BASE}/fraud/score`, { user_id: "demo-user-1", auction_id: "demo-auction-1", bid_amount: 5000, current_price: 4000, category: "watches" }) },
      { id: "anti-bot", name: "Anti-Bot Shield", desc: "Detect automated bidding scripts via behavioral fingerprinting", endpoint: "POST /ai/anti-bot", call: () => axios.post(`${AI_BASE}/ai/anti-bot`, { user_id: "demo-user-1", auction_id: "demo-auction-1", bid_amount: 5000, ip_address: "192.168.1.1", session_duration_seconds: 120, bids_in_last_minute: 1, time_to_bid_ms: 3200 }) },
      { id: "shill", name: "Shill Network", desc: "Map bidder relationships to detect coordinated fraud rings", endpoint: "GET /fraud/shill-network", call: () => axios.get(`${AI_BASE}/fraud/shill-network/demo-auction-1`) },
    ],
  },
  {
    id: "pricing", label: "Pricing Intelligence", arabicLabel: "ذكاء التسعير", icon: "◈",
    features: [
      { id: "price-predict", name: "Price Prediction", desc: "Predict final hammer price using historical auction data", endpoint: "POST /predict/price", call: () => axios.post(`${AI_BASE}/predict/price`, { reserve_price: 3000, starting_price: 1000, category: "watches", condition: "good", duration_hours: 168, end_dow: 6, end_hour: 20, bid_count: 5 }) },
      { id: "reserve", name: "Reserve Suggestion", desc: "Recommend optimal reserve price for maximum seller outcome", endpoint: "POST /ai/reserve-suggestion", call: () => axios.post(`${AI_BASE}/ai/reserve-suggestion`, { title: "Leica M3 Camera", category: "cameras", condition: "excellent", starting_price: 1500 }) },
      { id: "price-suggest", name: "Smart Price Suggest", desc: "Auto-fill starting price when creating a new listing", endpoint: "POST /listing/price-suggest", call: () => axios.post(`${AI_BASE}/listing/price-suggest`, { title: "Vintage Omega Speedmaster", category: "watches", condition: "good" }) },
    ],
  },
  {
    id: "search", label: "Search & Discovery", arabicLabel: "البحث والاستكشاف", icon: "◎",
    features: [
      { id: "semantic", name: "Semantic Search", desc: "384-dim vector search via Sentence Transformers and pgvector", endpoint: "POST /search/semantic", call: () => axios.post(`${AI_BASE}/search/semantic`, { query: "vintage Swiss chronograph 1960s", limit: 5 }) },
      { id: "categorize", name: "Auto Categorize", desc: "NLP model classifies new listings into correct auction categories", endpoint: "POST /listing/auto-categorize", call: () => axios.post(`${AI_BASE}/listing/auto-categorize`, { title: "Canon AE-1 35mm Film Camera", description: "Classic SLR camera from 1976, fully functional" }) },
      { id: "recommend", name: "Recommendations", desc: "Collaborative filtering suggests similar lots", endpoint: "POST /predict/recommendations", call: () => axios.post(`${AI_BASE}/predict/recommendations`, { item_id: "demo-auction-1", user_id: "demo-user-1", limit: 5 }) },
    ],
  },
  {
    id: "demand", label: "Market Intelligence", arabicLabel: "ذكاء السوق", icon: "◉",
    features: [
      { id: "heatmap", name: "Demand Heatmap", desc: "Real-time category demand scoring across the entire platform", endpoint: "GET /demand/heatmap", call: () => axios.get(`${AI_BASE}/demand/heatmap`) },
      { id: "forecast", name: "Category Forecast", desc: "7-day demand forecast per category using time-series modeling", endpoint: "GET /demand/category/watches", call: () => axios.get(`${AI_BASE}/demand/category/watches`) },
      { id: "timing", name: "Optimal Timing", desc: "Best auction end-time for maximum bidder engagement", endpoint: "POST /timing/optimal-end-time", call: () => axios.post(`${AI_BASE}/timing/optimal-end-time`, { category: "watches", condition: "good", starting_price: 1000, reserve_price: 3000 }) },
    ],
  },
  {
    id: "insights", label: "Buyer & Seller AI", arabicLabel: "رؤى البائع والمشتري", icon: "◆",
    features: [
      { id: "seller", name: "Seller Insights", desc: "Revenue trends, best-performing categories, optimal listing strategy", endpoint: "POST /insights/seller", call: () => axios.post(`${AI_BASE}/insights/seller`, { seller_id: "demo-seller-1", period_days: 30, language: "en" }) },
      { id: "buyer", name: "Buyer Insights", desc: "Spend patterns, category affinity, win rate analysis", endpoint: "POST /insights/buyer", call: () => axios.post(`${AI_BASE}/insights/buyer`, { buyer_id: "demo-user-1", period_days: 30 }) },
      { id: "reputation", name: "Reputation Score", desc: "Composite trust score from bid history and payment behavior", endpoint: "POST /reputation/score", call: () => axios.post(`${AI_BASE}/reputation/score`, { user_id: "demo-user-1" }) },
    ],
  },
  {
    id: "live", label: "Live Auction AI", arabicLabel: "ذكاء المزاد الحي", icon: "◐",
    features: [
      { id: "momentum", name: "Bid Momentum", desc: "Real-time bid pace indicator — accelerating, stable, or cooling", endpoint: "GET /live/momentum/{id}", call: () => axios.get(`${AI_BASE}/live/momentum/demo-auction-1`) },
      { id: "liveprice", name: "Price Forecast", desc: "Predict final hammer price as auction progressively unfolds", endpoint: "GET /live/price-forecast/{id}", call: () => axios.get(`${AI_BASE}/live/price-forecast/demo-auction-1`) },
      { id: "autobid", name: "Auto-Bid Strategy", desc: "Recommend optimal max bid ceiling and increment for user budget", endpoint: "POST /autobidder/strategy", call: () => axios.post(`${AI_BASE}/autobidder/strategy`, { user_id: "demo-user-1", auction_id: "demo-auction-1", max_budget: 10000, strategy: "conservative" }) },
    ],
  },
  {
    id: "support", label: "AI Support & Admin", arabicLabel: "الدعم الذكي", icon: "◇",
    features: [
      { id: "chat", name: "Claude Support Chat", desc: "Stateful AI support with live PostgreSQL context injection per session", endpoint: "POST /support/chat", call: () => axios.post(`${AI_BASE}/support/chat`, { user_id: "demo-user-1", messages: [{ content: "How do I place a bid?" }] }) },
      { id: "health", name: "Platform Health", desc: "Live model status, fallback modes, and AI service uptime dashboard", endpoint: "GET /admin/platform-health", call: () => axios.get(`${AI_BASE}/admin/platform-health`) },
      { id: "dispute", name: "Dispute Analysis", desc: "AI mediator analyzes buyer/seller disputes and recommends resolution", endpoint: "POST /dispute/analyse", call: () => axios.post(`${AI_BASE}/dispute/analyse`, { auction_id: "demo-auction-1", dispute_reason: "Item not as described — photos show damage not in listing", filed_by: "buyer", claimant_id: "demo-user-1" }) },
    ],
  },
];

function FeatureCard({ feature }: { feature: any }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setStatus("loading");
    setResult(null);
    try {
      const res = await feature.call();
      setResult(res.data);
      setStatus("success");
    } catch (e: any) {
      setResult(e?.response?.data || { error: e.message });
      setStatus("error");
    }
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e8e4de", borderRadius: "2px", padding: "28px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "18px", fontWeight: 600, color: "#1a2e1a", marginBottom: "6px" }}>{feature.name}</div>
        <div style={{ fontSize: "13px", color: "#6b7755", lineHeight: 1.6, fontStyle: "italic" }}>{feature.desc}</div>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#2d5a27", background: "#f0f4ec", padding: "6px 10px", borderRadius: "2px" }}>{feature.endpoint}</div>
      <button onClick={run} disabled={status === "loading"} style={{ background: status === "loading" ? "#f5f2ed" : "#1a2e1a", border: "none", borderRadius: "2px", padding: "10px 20px", color: status === "loading" ? "#999" : "#f5f2ed", fontSize: "11px", fontWeight: 600, cursor: status === "loading" ? "not-allowed" : "pointer", letterSpacing: "0.12em", textTransform: "uppercase", alignSelf: "flex-start" }}>
        {status === "loading" ? "Running..." : "▶  Test Endpoint"}
      </button>
      {result && (
        <div style={{ background: status === "success" ? "#f0f4ec" : "#fdf0f0", border: `1px solid ${status === "success" ? "#c8d8c0" : "#f0c0c0"}`, borderRadius: "2px", padding: "14px", maxHeight: "180px", overflowY: "auto" }}>
          <div style={{ fontSize: "10px", color: status === "success" ? "#2d5a27" : "#a02020", marginBottom: "8px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {status === "success" ? "✓  Response" : "✗  Error"}
          </div>
          <pre style={{ fontSize: "11px", color: "#3a3a3a", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace", lineHeight: 1.6 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function AIDashboard() {
  const [active, setActive] = useState("fraud");
  const current = categories.find(c => c.id === active)!;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f2ed", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ borderBottom: "1px solid #e0dbd3", padding: "32px 48px", background: "#faf8f5" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ fontSize: "11px", color: "#8a7e6e", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "10px" }}>◆ BidSpace — Neural Intelligence Layer</div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "36px", fontWeight: 600, color: "#1a2e1a", margin: "0 0 6px 0" }}>AI Engine Dashboard</h1>
          <p style={{ fontSize: "14px", color: "#6b7755", margin: 0, fontStyle: "italic" }}>40+ live AI endpoints — test each in real-time below</p>
        </div>
      </div>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 48px" }}>
        <div style={{ display: "flex", gap: "48px", paddingTop: "40px" }}>
          <div style={{ width: "200px", flexShrink: 0 }}>
            <div style={{ fontSize: "10px", color: "#8a7e6e", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>Categories</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setActive(cat.id)} style={{ background: active === cat.id ? "#1a2e1a" : "transparent", border: "none", borderRadius: "2px", padding: "10px 14px", display: "flex", flexDirection: "column", cursor: "pointer", textAlign: "left", width: "100%" }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: active === cat.id ? "#f5f2ed" : "#3a3a2a" }}>{cat.icon} {cat.label}</div>
                  <div style={{ fontSize: "10px", color: active === cat.id ? "#a8c4a0" : "#8a7e6e", marginTop: "2px" }}>{cat.arabicLabel}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: "28px", paddingBottom: "20px", borderBottom: "1px solid #e0dbd3" }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "26px", fontWeight: 600, color: "#1a2e1a", margin: "0 0 4px 0" }}>{current.label}</h2>
              <div style={{ fontSize: "13px", color: "#8a7e6e", fontStyle: "italic" }}>{current.arabicLabel}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px", paddingBottom: "60px" }}>
              {current.features.map(f => <FeatureCard key={f.id} feature={f} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIDashboard;
