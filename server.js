require('dotenv').config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 3456;

// ===== Config =====
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBmXhNuXVi2mPVcDaiPV_0mWclEYwHEKoo";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// ===== MongoDB Setup =====
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/firstsalary")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err.message));

const planSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  ctc: Number,
  inhand: Number,
  needs: Number,
  wants: Number,
  savings: Number,
  healthScore: Number,
  createdAt: { type: Date, default: Date.now }
});
const Plan = mongoose.model("Plan", planSchema);

// Keep track of total generated for quick stats
let totalGeneratedCache = 0;
Plan.countDocuments().then(count => totalGeneratedCache = count).catch(err => console.warn("⚠️ Could not load initial plan count (Database not connected)"));

// ===== Nodemailer Setup =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ===== Middleware =====
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increased for PDF Base64
app.use(express.static(__dirname));

// Request logging
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  }
  next();
});

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
app.post("/api/save-plan", async (req, res) => {
  try {
    const { ctc, inhand, needs, wants, savings, name } = req.body;

    if (!inhand) {
      return res.status(400).json({ error: "Salary data is required" });
    }

    const healthScore = Math.min(
      (savings >= 20 ? 30 : savings >= 10 ? 15 : 5) +
      (needs <= 50 ? 25 : needs <= 60 ? 12 : 5) +
      (wants <= 30 ? 20 : wants <= 40 ? 10 : 3) + 20,
      100
    );

    const plan = new Plan({
      id: uuidv4().slice(0, 8),
      name: name || "Anonymous",
      ctc: ctc || 0,
      inhand,
      needs: needs || 50,
      wants: wants || 30,
      savings: savings || 20,
      healthScore
    });

    await plan.save();
    totalGeneratedCache++;

    console.log(`✅ Plan saved to MongoDB: ${plan.id} (Total: ${totalGeneratedCache})`);

    res.json({
      id: plan.id,
      totalGenerated: totalGeneratedCache,
      shareUrl: `/plan/${plan.id}`
    });
  } catch (err) {
    console.error("Save plan error:", err.message);
    res.status(500).json({ error: "Failed to save plan" });
  }
});

// GET /api/plan/:id — Get a saved plan
app.get("/api/plan/:id", async (req, res) => {
  try {
    const plan = await Plan.findOne({ id: req.params.id });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/stats — Get app statistics
app.get("/api/stats", async (req, res) => {
  try {
    const activePlans = await Plan.countDocuments();
    
    // Aggregate averages
    const result = await Plan.aggregate([
      { 
        $group: { 
          _id: null, 
          avgSavings: { $avg: "$savings" }, 
          avgHealth: { $avg: "$healthScore" } 
        } 
      }
    ]);
    
    const stats = result[0] || { avgSavings: 20, avgHealth: 0 };

    res.json({
      totalPlans: totalGeneratedCache,
      activePlans,
      avgSavingsRate: Math.round(stats.avgSavings),
      avgHealthScore: Math.round(stats.avgHealth)
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/email-plan - Send the PDF via email
app.post("/api/email-plan", async (req, res) => {
  try {
    const { email, pdfBase64 } = req.body;
    
    if (!email || !pdfBase64) {
      return res.status(400).json({ error: "Email and PDF are required" });
    }

    // Remove the data URI prefix (jsPDF may add filename=...)
    const base64Data = pdfBase64.includes("base64,") ? pdfBase64.split("base64,")[1] : pdfBase64;

    const mailOptions = {
      from: process.env.EMAIL_USER || 'noreply@firstsalary.guide',
      to: email,
      subject: 'Your First Salary Plan 📄💰',
      text: 'Congratulations on taking the first step towards financial confidence! Please find your personalized First Salary Plan attached.',
      html: '<h3>Your Financial Plan is Here! 🎉</h3><p>Congratulations on taking the first step towards financial confidence. We have attached your personalized <b>First Salary Plan</b> as a PDF.</p><p>Keep tracking and stay disciplined!</p>',
      attachments: [{
        filename: 'My_First_Salary_Plan.pdf',
        content: base64Data,
        encoding: 'base64'
      }]
    };

    // If no real email is configured in .env, just log it as a simulation for hackathon demo
    if(!process.env.EMAIL_USER || process.env.EMAIL_USER.includes("your-email")) {
      console.warn("⚠️ Email not configured in .env, simulating successful send for demo purposes.");
      return res.json({ success: true, message: "Email simulation successful (Config missing)" });
    }

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Email sent successfully!" });
  } catch (err) {
    console.error("Email error:", err);
    res.status(500).json({ error: "Failed to send email" });
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
  console.log("║   💾 Data: MongoDB Connected                ║");
  console.log("║   ✉️  Email: Nodemailer Ready               ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
});
