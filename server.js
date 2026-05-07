const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = 3456;

// ===== Config =====
const GEMINI_API_KEY = "AIzaSyBmXhNuXVi2mPVcDaiPV_0mWclEYwHEKoo";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
const DATA_DIR = path.join(__dirname, "data");
const PLANS_FILE = path.join(DATA_DIR, "plans.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize plans file
if (!fs.existsSync(PLANS_FILE)) {
  fs.writeFileSync(PLANS_FILE, JSON.stringify({ plans: [], totalGenerated: 0 }));
}

// ===== Middleware =====
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(__dirname));

// Request logging
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ===== Helper: Read/Write plans =====
function readPlans() {
  try {
    return JSON.parse(fs.readFileSync(PLANS_FILE, "utf-8"));
  } catch {
    return { plans: [], totalGenerated: 0 };
  }
}

function writePlans(data) {
  fs.writeFileSync(PLANS_FILE, JSON.stringify(data, null, 2));
}

// ===== API Routes =====

// POST /api/chat — Gemini API Proxy
app.post("/api/chat", async (req, res) => {
  try {
    const { message, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const systemPrompt = `You are "Money Mentor", a friendly and expert financial advisor for young Indians who just got their first salary. 

USER'S FINANCIAL PROFILE:
- Annual CTC: ₹${(context?.ctc || 0).toLocaleString("en-IN")}
- Monthly In-Hand Salary: ₹${(context?.inhand || 0).toLocaleString("en-IN")}
- Budget Split: Needs ${context?.needs || 50}%, Wants ${context?.wants || 30}%, Savings ${context?.savings || 20}%
- Monthly Savings: ₹${Math.round((context?.inhand || 0) * (context?.savings || 20) / 100).toLocaleString("en-IN")}

RULES:
- Give personalized advice using their ACTUAL salary numbers above
- Keep responses concise (3-5 sentences max)
- Use Indian context (₹, Indian tax laws, Indian investment options like PPF, ELSS, Nifty 50)
- Be encouraging but realistic
- Never recommend specific stocks or risky investments
- Add practical, actionable tips
- Use simple language, no jargon
- Add relevant emoji sparingly for friendliness`;

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemPrompt },
            { text: message }
          ]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 250,
          topP: 0.9
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Gemini API error (${response.status}):`, errText);
      return res.status(response.status).json({ error: "AI service temporarily unavailable" });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({ error: "Empty AI response" });
    }

    res.json({ reply: text.trim() });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/save-plan — Save a user's financial plan
app.post("/api/save-plan", (req, res) => {
  try {
    const { ctc, inhand, needs, wants, savings, name } = req.body;

    if (!inhand) {
      return res.status(400).json({ error: "Salary data is required" });
    }

    const db = readPlans();
    const plan = {
      id: uuidv4().slice(0, 8),
      name: name || "Anonymous",
      ctc: ctc || 0,
      inhand,
      needs: needs || 50,
      wants: wants || 30,
      savings: savings || 20,
      createdAt: new Date().toISOString(),
      healthScore: Math.min(
        (savings >= 20 ? 30 : savings >= 10 ? 15 : 5) +
        (needs <= 50 ? 25 : needs <= 60 ? 12 : 5) +
        (wants <= 30 ? 20 : wants <= 40 ? 10 : 3) + 20,
        100
      )
    };

    db.plans.push(plan);
    db.totalGenerated++;
    writePlans(db);

    console.log(`✅ Plan saved: ${plan.id} (Total: ${db.totalGenerated})`);

    res.json({
      id: plan.id,
      totalGenerated: db.totalGenerated,
      shareUrl: `/plan/${plan.id}`
    });
  } catch (err) {
    console.error("Save plan error:", err.message);
    res.status(500).json({ error: "Failed to save plan" });
  }
});

// GET /api/plan/:id — Get a saved plan
app.get("/api/plan/:id", (req, res) => {
  try {
    const db = readPlans();
    const plan = db.plans.find(p => p.id === req.params.id);

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/stats — Get app statistics
app.get("/api/stats", (req, res) => {
  try {
    const db = readPlans();

    const avgSavings = db.plans.length > 0
      ? Math.round(db.plans.reduce((s, p) => s + p.savings, 0) / db.plans.length)
      : 20;

    const avgHealth = db.plans.length > 0
      ? Math.round(db.plans.reduce((s, p) => s + (p.healthScore || 0), 0) / db.plans.length)
      : 0;

    res.json({
      totalPlans: db.totalGenerated,
      activePlans: db.plans.length,
      avgSavingsRate: avgSavings,
      avgHealthScore: avgHealth
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Serve index.html for plan share links
app.get("/plan/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   🚀 First Salary Guide Server Running      ║");
  console.log(`║   📍 http://localhost:${PORT}                   ║`);
  console.log("║   🤖 AI Chatbot: Gemini API Connected       ║");
  console.log("║   💾 Data: ./data/plans.json                ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
});
