let state = JSON.parse(localStorage.getItem("fsg_state")) || { ctc: 0, inhand: 0, needs: 50, wants: 30, savings: 20, deductions: [] };
let allocationChart = null;
let planChart = null;

function formatCurrency(amount) {
  return "₹" + Math.round(Number(amount)).toLocaleString("en-IN");
}

function updateProgress(step) {
  document.getElementById("progressFill").style.width =
    ({ 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 }[step]) + "%";
}

function showStep(stepNum) {
  document.querySelectorAll(".step-card").forEach(card => card.classList.remove("active"));
  document.getElementById("step" + stepNum).classList.add("active");
  updateProgress(stepNum);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function calculateTax(ctc) {
  // New Regime (FY 2024-25)
  const newStdDed = 75000;
  let newTaxable = Math.max(0, ctc - newStdDed);
  let newTax = 0;
  
  if (newTaxable > 700000) { // Rebate 87A
    if (newTaxable > 1500000) {
      newTax += (newTaxable - 1500000) * 0.30;
      newTaxable = 1500000;
    }
    if (newTaxable > 1200000) {
      newTax += (newTaxable - 1200000) * 0.20;
      newTaxable = 1200000;
    }
    if (newTaxable > 1000000) {
      newTax += (newTaxable - 1000000) * 0.15;
      newTaxable = 1000000;
    }
    if (newTaxable > 700000) {
      newTax += (newTaxable - 700000) * 0.10;
      newTaxable = 700000;
    }
    if (newTaxable > 300000) {
      newTax += (newTaxable - 300000) * 0.05;
    }
  }

  // Old Regime (Simplified, assuming 1.5L 80C max)
  const oldStdDed = 50000;
  const max80C = 150000;
  let oldTaxable = Math.max(0, ctc - oldStdDed - max80C);
  let oldTax = 0;

  if (oldTaxable > 500000) { // Rebate 87A
    if (oldTaxable > 1000000) {
      oldTax += (oldTaxable - 1000000) * 0.30;
      oldTaxable = 1000000;
    }
    if (oldTaxable > 500000) {
      oldTax += (oldTaxable - 500000) * 0.20;
      oldTaxable = 500000;
    }
    if (oldTaxable > 250000) {
      oldTax += (oldTaxable - 250000) * 0.05;
    }
  }

  // Add 4% Health & Education Cess
  newTax = Math.round(newTax * 1.04);
  oldTax = Math.round(oldTax * 1.04);

  return {
    newTax,
    oldTax,
    recommended: newTax <= oldTax ? "New Regime" : "Old Regime",
    bestTax: Math.min(newTax, oldTax)
  };
}

function calculateDeductions(ctc) {
  const monthlyCTC = ctc / 12;
  const basic = monthlyCTC * 0.40;

  const employeePF = Math.round(Math.min(basic * 0.12, 1800));
  const employerPF = employeePF;
  const professionalTax = 200;

  const taxData = calculateTax(ctc);
  const monthlyTax = Math.round(taxData.bestTax / 12);

  const totalDeductions = employeePF + employerPF + professionalTax + monthlyTax;
  const inhand = Math.round(monthlyCTC - totalDeductions);

  return {
    ctc: Math.round(ctc),
    monthlyCTC: Math.round(monthlyCTC),
    basic: Math.round(basic),
    totalDeductions,
    inhand,
    taxData,
    deductions: [
      {
        name: "Employee PF",
        icon: "fa-piggy-bank",
        monthly: employeePF,
        desc: "12% of Basic Salary, capped at ₹1,800.",
        detail: `Basic Salary = 40% of Monthly CTC. Employee PF = 12% of Basic. This goes to your PF account.`
      },
      {
        name: "Employer PF",
        icon: "fa-hand-holding-usd",
        monthly: employerPF,
        desc: "Employer contribution included in CTC.",
        detail: "Employer PF is part of CTC but not credited to your bank. It goes to your PF account."
      },
      {
        name: "Professional Tax",
        icon: "fa-file-invoice",
        monthly: professionalTax,
        desc: "Estimated fixed state tax.",
        detail: "Professional Tax varies by state. Here we use ₹200/month as an educational estimate."
      },
      {
        name: "Income Tax (TDS)",
        icon: "fa-landmark",
        monthly: monthlyTax,
        desc: `Calculated via ${taxData.recommended}.`,
        detail: `Old Regime Tax: ₹${taxData.oldTax.toLocaleString("en-IN")}/yr. New Regime Tax: ₹${taxData.newTax.toLocaleString("en-IN")}/yr. The ${taxData.recommended} is automatically selected to maximize your in-hand salary (FY 2024-25 rates).`
      }
    ]
  };
}

function estimateCTCFromInhand(targetInhand) {
  let low = targetInhand * 12;
  let high = targetInhand * 12 * 2;

  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const result = calculateDeductions(mid);

    if (result.inhand < targetInhand) low = mid;
    else high = mid;
  }

  return Math.round(high);
}

function goToStep2() {
  const ctcInput = document.getElementById("ctc").value;
  const salaryInput = document.getElementById("salary").value;

  if (!ctcInput && !salaryInput) {
    alert("Please enter either CTC or monthly in-hand salary");
    return;
  }

  let result;

  if (ctcInput && Number(ctcInput) > 0) {
    result = calculateDeductions(Number(ctcInput));
  } else {
    const estimatedCTC = estimateCTCFromInhand(Number(salaryInput));
    result = calculateDeductions(estimatedCTC);
  }

  state.ctc = result.ctc;
  state.inhand = result.inhand;
  state.deductions = result.deductions;
  state.monthlyCTC = result.monthlyCTC;
  state.basic = result.basic;
  state.totalDeductions = result.totalDeductions;
  state.taxData = result.taxData;

  localStorage.setItem("fsg_state", JSON.stringify(state));

  renderDeductions();
  showStep(2);
}

function renderDeductions() {
  document.getElementById("ctcDisplay").textContent = formatCurrency(state.ctc) + "/year";
  document.getElementById("inhandDisplay").textContent = formatCurrency(state.inhand) + "/month";

  const grid = document.getElementById("deductionsGrid");

  grid.innerHTML = `
    <div class="info-box" style="grid-column: 1 / -1;">
      <i class="fas fa-calculator"></i>
      <p>
        <strong>Before Deduction:</strong> ${formatCurrency(state.monthlyCTC)}/month<br>
        <strong>Total Deductions:</strong> ${formatCurrency(state.totalDeductions)}/month<br>
        <strong>After Deduction / In-hand:</strong> ${formatCurrency(state.inhand)}/month<br><br>
        <strong>Formula:</strong> Monthly CTC - Employee PF - Employer PF - Professional Tax - TDS = In-hand
      </p>
    </div>
  `;

  grid.innerHTML += state.deductions.map((d, i) => `
    <div class="deduction-card active" onclick="toggleDeduction(${i})">
      <div class="deduction-header">
        <span class="deduction-name">
          <i class="fas ${d.icon}"></i> ${d.name}
        </span>
        <span class="deduction-amount">-${formatCurrency(d.monthly)}/mo</span>
      </div>
      <p class="deduction-desc">${d.desc}</p>
      <div class="deduction-detail">${d.detail}</div>
    </div>
  `).join("");
}

function toggleDeduction(index) {
  document.querySelectorAll(".deduction-card")[index].classList.toggle("active");
}

function goToStep3() {
  initChart();
  updateAllocation();
  showStep(3);
}

function initChart() {
  const ctx = document.getElementById("allocationChart").getContext("2d");
  if (allocationChart) allocationChart.destroy();

  allocationChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Needs", "Wants", "Savings"],
      datasets: [{
        data: [50, 30, 20],
        backgroundColor: ["#0d7377", "#f39c12", "#e74c3c"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: { legend: { display: false } }
    }
  });
}

function updateAllocation() {
  let needs = Number(document.getElementById("needsSlider").value);
  let wants = Number(document.getElementById("wantsSlider").value);
  let savings = 100 - needs - wants;

  if (savings < 10) {
    savings = 10;
    needs = 100 - wants - savings;
    document.getElementById("needsSlider").value = needs;
  }

  document.getElementById("savingsSlider").value = savings;

  state.needs = needs;
  state.wants = wants;
  state.savings = savings;

  localStorage.setItem("fsg_state", JSON.stringify(state));

  const needsAmount = state.inhand * needs / 100;
  const wantsAmount = state.inhand * wants / 100;
  const savingsAmount = state.inhand * savings / 100;

  document.getElementById("needsPercent").textContent = needs + "%";
  document.getElementById("wantsPercent").textContent = wants + "%";
  document.getElementById("savingsPercent").textContent = savings + "%";

  document.getElementById("needsAmount").textContent = formatCurrency(needsAmount);
  document.getElementById("wantsAmount").textContent = formatCurrency(wantsAmount);
  document.getElementById("savingsAmount").textContent = formatCurrency(savingsAmount);
  document.getElementById("chartAmount").textContent = formatCurrency(state.inhand);

  if (allocationChart) {
    allocationChart.data.datasets[0].data = [needs, wants, savings];
    allocationChart.update();
  }

  document.getElementById("tipText").textContent =
    `Saving ${formatCurrency(savingsAmount)} monthly can become ${formatCurrency(savingsAmount * 12)} in one year.`;
}

function goToStep4() {
  const monthlySavings = state.inhand * state.savings / 100;

  document.getElementById("simSavings").textContent = formatCurrency(monthlySavings);
  document.getElementById("simTotal").textContent = formatCurrency(monthlySavings * 6);

  const emergencyMonths = Math.round((monthlySavings * 6) / state.inhand * 10) / 10;
  document.getElementById("simEmergency").textContent = emergencyMonths + " months";

  // Month-by-month values
  document.getElementById("month1Transfer").textContent = formatCurrency(monthlySavings);
  document.getElementById("month1Buffer").textContent = formatCurrency(monthlySavings);
  document.getElementById("month1Total").textContent = formatCurrency(monthlySavings);

  document.getElementById("month2Total").textContent = formatCurrency(monthlySavings * 2);

  document.getElementById("month3Total").textContent = formatCurrency(monthlySavings * 3);
  const weeksOfRent = Math.round((monthlySavings * 3) / (state.inhand * state.needs / 100) * 4);
  document.getElementById("month3Weeks").textContent = weeksOfRent;

  document.getElementById("month4Total").textContent = formatCurrency(monthlySavings * 4);
  document.getElementById("month4Total2").textContent = formatCurrency(monthlySavings * 4);

  document.getElementById("month5Total").textContent = formatCurrency(monthlySavings * 5);
  document.getElementById("month5Total2").textContent = formatCurrency(monthlySavings * 5);

  document.getElementById("month6Total").textContent = formatCurrency(monthlySavings * 6);
  const finalEmergencyMonths = Math.round((monthlySavings * 6) / state.inhand * 10) / 10;
  document.getElementById("month6Months").textContent = finalEmergencyMonths;

  showStep(4);
}

function goToStep5() {
  const monthlySavings = state.inhand * state.savings / 100;
  const needsAmount = state.inhand * state.needs / 100;
  const wantsAmount = state.inhand * state.wants / 100;

  // Set date
  const now = new Date();
  document.getElementById("planDate").textContent = now.toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric"
  });

  // Populate plan card values
  document.getElementById("planSalary").textContent = formatCurrency(state.inhand);
  document.getElementById("planNeeds").textContent = formatCurrency(needsAmount);
  document.getElementById("planWants").textContent = formatCurrency(wantsAmount);
  document.getElementById("planSavings").textContent = formatCurrency(monthlySavings);
  document.getElementById("planNeedsDesc").textContent = `${state.needs}%: Rent, food, transport`;
  document.getElementById("planWantsDesc").textContent = `${state.wants}%: Entertainment, dining`;
  document.getElementById("planSavingsDesc").textContent = `${state.savings}%: Emergency fund`;

  // 6-month projection
  document.getElementById("plan6MonthTotal").textContent = formatCurrency(monthlySavings * 6);
  const emergencyMonths = Math.round((monthlySavings * 6) / state.inhand * 10) / 10;
  document.getElementById("plan6MonthFund").textContent = emergencyMonths + " months";

  // Personalised insight
  const planInsight = document.getElementById("planInsight");
  if (state.savings >= 20) {
    planInsight.innerHTML = `<p><strong>Great job!</strong> Saving ${state.savings}% puts you ahead of most first-time earners. Keep this discipline for 2 years and you'll have a solid financial foundation.</p>`;
  } else if (state.savings >= 15) {
    planInsight.innerHTML = `<p><strong>Good start!</strong> You're saving ${state.savings}%. Try to push it to 20% in the next few months for a stronger safety net.</p>`;
  } else {
    planInsight.innerHTML = `<p><strong>Heads up:</strong> ${state.savings}% savings is a start. Consider cutting Wants slightly to build your emergency fund faster.</p>`;
  }

  // Doughnut chart
  const ctx = document.getElementById("planChart").getContext("2d");
  if (planChart) planChart.destroy();
  planChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Needs", "Wants", "Savings"],
      datasets: [{ data: [state.needs, state.wants, state.savings], backgroundColor: ["#0d7377", "#f39c12", "#e74c3c"], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { display: false } } }
  });

  // Navigate to Step 5
  showStep(5);

  // Celebratory confetti
  launchConfetti();

  // Financial health gauge
  const score = calculateHealthScore();
  setTimeout(() => animateGauge(score), 500);

  // Expense progress bars (uses current session state)
  renderExpenseProgress();

  // Growth chart and peer comparison
  setTimeout(() => renderGrowthChart(), 600);
  setTimeout(() => renderPeerComparison(), 800);

  // Animate salary counter
  setTimeout(() => {
    const planSalary = document.getElementById("planSalary");
    if (planSalary) animateCounter(planSalary, state.inhand, 1200);
  }, 400);

  // Sync with backend (silent - works offline too)
  savePlanToServer();
  fetchStats();
}

function downloadPlan() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const monthlySavings = state.inhand * state.savings / 100;
  
  doc.setFontSize(22);
  doc.setTextColor(13, 115, 119);
  doc.text("First Salary Guide - Financial Plan", 105, 20, { align: "center" });
  
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 105, 28, { align: "center" });
  
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text("Salary Breakdown", 20, 45);
  
  doc.autoTable({
    startY: 50,
    head: [["Category", "Amount (Annual)", "Amount (Monthly)"]],
    body: [
      ["CTC", formatCurrency(state.ctc), formatCurrency(state.monthlyCTC)],
      ["Tax (via " + state.taxData.recommended + ")", formatCurrency(state.taxData.bestTax), formatCurrency(state.taxData.bestTax / 12)],
      ["Total Deductions", formatCurrency(state.totalDeductions * 12), formatCurrency(state.totalDeductions)],
      ["In-Hand Salary", formatCurrency(state.inhand * 12), formatCurrency(state.inhand)]
    ],
    theme: 'striped',
    headStyles: { fillColor: [13, 115, 119] }
  });
  
  let finalY = doc.lastAutoTable.finalY + 15;
  
  doc.setFontSize(16);
  doc.text("Budget Allocation", 20, finalY);
  
  doc.autoTable({
    startY: finalY + 5,
    head: [["Category", "Percentage", "Monthly Budget"]],
    body: [
      ["Needs (Rent, Groceries, EMI)", `${state.needs}%`, formatCurrency(state.inhand * state.needs / 100)],
      ["Wants (Dining, Gadgets, Fun)", `${state.wants}%`, formatCurrency(state.inhand * state.wants / 100)],
      ["Savings (Emergency, Investing)", `${state.savings}%`, formatCurrency(monthlySavings)]
    ],
    theme: 'grid',
    headStyles: { fillColor: [13, 115, 119] }
  });
  
  finalY = doc.lastAutoTable.finalY + 15;
  
  doc.setFontSize(16);
  doc.text("6-Month Savings Projection", 20, finalY);
  
  doc.setFontSize(12);
  doc.text(`If you save ${formatCurrency(monthlySavings)} every month, in 6 months you will have:`, 20, finalY + 10);
  
  doc.setFontSize(14);
  doc.setTextColor(16, 185, 129);
  doc.text(`Total Saved: ${formatCurrency(monthlySavings * 6)}`, 20, finalY + 20);
  
  doc.save("my-first-salary-plan.pdf");
}

function sharePlan() {
  const monthlySavings = state.inhand * state.savings / 100;
  const text = `My First Salary Plan\n\nMonthly In-Hand: ${formatCurrency(state.inhand)}\nNeeds (${state.needs}%): ${formatCurrency(state.inhand * state.needs / 100)}\nWants (${state.wants}%): ${formatCurrency(state.inhand * state.wants / 100)}\nSavings (${state.savings}%): ${formatCurrency(monthlySavings)}\n\n6-Month Goal: ${formatCurrency(monthlySavings * 6)} saved!\n\nGenerated by First Salary Guide`;

  if (navigator.share) {
    navigator.share({ title: "My First Salary Plan", text: text })
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert("Plan copied to clipboard! Paste it anywhere to share.");
  }).catch(() => {
    alert("Could not copy. Here's your plan:\n\n" + text);
  });
}

function resetApp() {
  state = { ctc: 0, inhand: 0, needs: 50, wants: 30, savings: 20, deductions: [] };

  document.getElementById("ctc").value = "";
  document.getElementById("salary").value = "";
  document.getElementById("needsSlider").value = 50;
  document.getElementById("wantsSlider").value = 30;
  document.getElementById("savingsSlider").value = 20;

  if (allocationChart) { allocationChart.destroy(); allocationChart = null; }
  if (planChart) { planChart.destroy(); planChart = null; }

  showStep(1);
}

updateProgress(1);

// ===== DARK MODE =====
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
}

// Load saved theme
if (localStorage.getItem("darkMode") === "true") {
  document.body.classList.add("dark-mode");
}

// ===== CONFETTI =====
function launchConfetti() {
  const canvas = document.getElementById("confettiCanvas");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ["#0d7377", "#14a085", "#f39c12", "#e74c3c", "#3498db", "#9b59b6", "#2ecc71", "#ffd700"];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      opacity: 1
    });
  }

  let frame = 0;
  const maxFrames = 180;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rotation += p.rotationSpeed;

      if (frame > maxFrames - 60) {
        p.opacity -= 0.016;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (frame < maxFrames) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  animate();
}

// ===== FINANCIAL HEALTH SCORE =====
function calculateHealthScore() {
  let score = 0;

  // Savings percentage (max 35 points)
  if (state.savings >= 30) score += 35;
  else if (state.savings >= 20) score += 30;
  else if (state.savings >= 15) score += 22;
  else if (state.savings >= 10) score += 15;
  else score += 5;

  // Needs percentage (max 25 points) - lower is better
  if (state.needs <= 50) score += 25;
  else if (state.needs <= 55) score += 20;
  else if (state.needs <= 60) score += 12;
  else score += 5;

  // Wants under control (max 20 points)
  if (state.wants <= 20) score += 20;
  else if (state.wants <= 30) score += 16;
  else if (state.wants <= 40) score += 10;
  else score += 3;

  // Emergency fund coverage (max 20 points)
  const monthlySavings = state.inhand * state.savings / 100;
  const monthsCovered = (monthlySavings * 6) / state.inhand;
  if (monthsCovered >= 1.5) score += 20;
  else if (monthsCovered >= 1) score += 15;
  else if (monthsCovered >= 0.5) score += 10;
  else score += 5;

  return Math.min(score, 100);
}

function drawGauge(score) {
  const canvas = document.getElementById("gaugeCanvas");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const centerX = w / 2;
  const centerY = h - 5;
  const radius = 85;

  ctx.clearRect(0, 0, w, h);

  // Background arc
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI);
  ctx.lineWidth = 16;
  ctx.strokeStyle = document.body.classList.contains("dark-mode") ? "#2a3545" : "#e1e8ed";
  ctx.lineCap = "round";
  ctx.stroke();

  // Score arc (animated)
  const scoreAngle = Math.PI + (score / 100) * Math.PI;
  let color;
  if (score >= 75) color = "#2ecc71";
  else if (score >= 50) color = "#f39c12";
  else color = "#e74c3c";

  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, "#e74c3c");
  gradient.addColorStop(0.5, "#f39c12");
  gradient.addColorStop(1, "#2ecc71");

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, scoreAngle);
  ctx.lineWidth = 16;
  ctx.strokeStyle = gradient;
  ctx.lineCap = "round";
  ctx.stroke();

  return color;
}

function animateGauge(targetScore) {
  let current = 0;
  const gaugeValue = document.getElementById("gaugeValue");
  const gaugeLabel = document.getElementById("gaugeLabel");

  const interval = setInterval(() => {
    current += 1;
    if (current > targetScore) {
      current = targetScore;
      clearInterval(interval);
    }

    drawGauge(current);
    gaugeValue.textContent = current;

    if (current >= 75) {
      gaugeLabel.textContent = "Excellent!";
      gaugeLabel.style.color = "#2ecc71";
    } else if (current >= 50) {
      gaugeLabel.textContent = "Good Start";
      gaugeLabel.style.color = "#f39c12";
    } else {
      gaugeLabel.textContent = "Needs Work";
      gaugeLabel.style.color = "#e74c3c";
    }
  }, 20);

  // Health tips
  const tips = [];
  if (state.savings < 20) tips.push('<div class="health-tip">Increase savings to at least 20% for a solid safety net</div>');
  if (state.wants > 30) tips.push('<div class="health-tip">Try cutting wants below 30%. Small sacrifices add up fast</div>');
  if (state.needs > 55) tips.push('<div class="health-tip">Your needs are high. Consider sharing rent or reducing utility costs</div>');
  if (state.savings >= 20) tips.push('<div class="health-tip">Great savings rate! You\'re building wealth faster than most</div>');
  if (tips.length === 0) tips.push('<div class="health-tip">Your financial plan is excellent! Keep it up!</div>');

  document.getElementById("healthTips").innerHTML = tips.join("");
}



// ===== AI CHATBOT =====
// API calls go through backend server for security
const API_BASE = window.location.origin;

function toggleChat() {
  const panel = document.getElementById("chatPanel");
  const fab = document.getElementById("chatFab");
  const fabIcon = document.getElementById("chatFabIcon");

  panel.classList.toggle("open");
  fab.classList.toggle("active");

  if (panel.classList.contains("open")) {
    fabIcon.className = "fas fa-times";
  } else {
    fabIcon.className = "fas fa-robot";
  }
}

function askSuggestion(btn) {
  const question = btn.textContent;
  addChatMessage(question, "user");
  document.getElementById("chatSuggestions").style.display = "none";
  showTyping();
  handleAIResponse(question);
}

function sendChat() {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (!msg) return;

  addChatMessage(msg, "user");
  input.value = "";
  showTyping();
  handleAIResponse(msg);
}

async function handleAIResponse(question) {
  let retries = 2;

  while (retries >= 0) {
    try {
      const response = await getGeminiResponse(question);
      removeTyping();
      addChatMessage(response, "bot");
      return;
    } catch (err) {
      if (err.message.includes("429") && retries > 0) {
        retries--;
        await new Promise(r => setTimeout(r, 2000 * (2 - retries)));
        continue;
      }
      console.log("Gemini API fallback:", err.message);
      removeTyping();
      const fallback = getAIResponse(question);
      addChatMessage(fallback, "bot");
      return;
    }
  }
}

async function getGeminiResponse(question) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: question,
      context: {
        ctc: state.ctc || 0,
        inhand: state.inhand || 0,
        needs: state.needs || 50,
        wants: state.wants || 30,
        savings: state.savings || 20
      }
    })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.reply) throw new Error("Empty response");
  return data.reply;
}

function addChatMessage(text, type) {
  const container = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = "chat-msg " + type;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = "chat-msg bot typing";
  div.id = "typingIndicator";
  div.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTyping() {
  const typing = document.getElementById("typingIndicator");
  if (typing) typing.remove();
}

// Fallback rule-based responses (used when API fails)
function getAIResponse(question) {
  const q = question.toLowerCase();
  const salary = state.inhand || 0;
  const savings = state.savings || 20;
  const savingsAmt = salary * savings / 100;
  const needsAmt = salary * (state.needs || 50) / 100;

  if (q.includes("saving enough") || q.includes("save more")) {
    if (savings >= 25) return `You're saving ${savings}%, which is ${formatCurrency(savingsAmt)} every month. That's well above the recommended 20%. Most first-time earners don't get here until year two, so you're in a genuinely good position. Keep automating it and don't let lifestyle creep eat into it.`;
    if (savings >= 20) return `You're saving ${savings}%, which is ${formatCurrency(savingsAmt)} a month. That hits the standard benchmark most advisors recommend. In six months you'll have ${formatCurrency(savingsAmt * 6)} set aside, which gives you a real safety cushion.`;
    return `You're saving ${savings}% right now, which is ${formatCurrency(savingsAmt)} a month. The general advice is to get to at least 20%. Cutting your wants by ${20 - savings}% would add ${formatCurrency(salary * (20 - savings) / 100)} to savings without feeling like a big sacrifice.`;
  }

  if (q.includes("emi") || q.includes("loan")) {
    return `A good rule of thumb: keep all your EMIs below 30% of your take-home pay. For you that's ${formatCurrency(salary * 0.3)} a month. Before committing to any EMI, ask yourself if you could save up for it in three months instead. If the answer is yes, buying with cash almost always makes more sense.`;
  }

  if (q.includes("invest") || q.includes("mutual fund") || q.includes("sip")) {
    return `Before investing, make sure you have a three-month emergency fund in place. That is ${formatCurrency(salary * 3)} for you. Once that's done, a monthly SIP of around ${formatCurrency(Math.min(savingsAmt * 0.5, 5000))} in a Nifty 50 index fund is a solid, low-maintenance starting point. Don't put money in the market that you might need within the next three years.`;
  }

  if (q.includes("emergency") || q.includes("fund")) {
    return `An emergency fund should cover three to six months of your essential expenses. Your monthly needs come to roughly ${formatCurrency(needsAmt)}, so you're targeting ${formatCurrency(needsAmt * 3)} to ${formatCurrency(needsAmt * 6)}. At your current savings rate you'll hit the three-month mark in about ${Math.ceil(needsAmt * 3 / savingsAmt)} months. Keep this in a separate account so you're not tempted to dip into it.`;
  }

  if (q.includes("credit card")) {
    return `Credit cards can be useful but they're easy to misuse early in your career. Keep your spending below 30% of your credit limit, always pay the full statement amount before the due date, and set up auto-pay so you never miss it. One card is plenty to start. The moment you carry a balance, you're paying 36-42% interest. That wipes out any rewards or benefits.`;
  }

  if (q.includes("tax") || q.includes("tds")) {
    return `With your CTC of ${formatCurrency(state.ctc || salary * 12)} per year, it's worth looking at Section 80C. Instruments like PPF and ELSS can reduce your taxable income by up to ${formatCurrency(150000)}, saving you real money in tax. The standard deduction of ${formatCurrency(50000)} is applied automatically. Also check whether the old or new tax regime works better for you. The IT department's calculator makes this comparison straightforward.`;
  }

  if (q.includes("rent") || q.includes("house") || q.includes("flat")) {
    return `Try to keep rent under 30% of your in-hand salary. For you that's around ${formatCurrency(salary * 0.3)} a month. Sharing a flat is the single biggest way to free up money early in your career. Negotiate the deposit, and factor in commute costs when choosing a place. A cheaper flat closer to work often saves more overall than a nicer one further away.`;
  }

  if (q.includes("budget") || q.includes("50/30/20")) {
    return `The 50/30/20 split of Needs, Wants, and Savings is a solid framework for someone starting out. Based on your setup: Needs at ${state.needs}% is ${formatCurrency(needsAmt)}, Wants at ${state.wants}% is ${formatCurrency(salary * state.wants / 100)}, and Savings at ${savings}% is ${formatCurrency(savingsAmt)}. The key is automating that savings transfer on salary day before you have a chance to spend it.`;
  }

  if (q.includes("insurance") || q.includes("health")) {
    return `The three coverages worth having are health insurance, term life insurance if you have dependents, and personal accident cover. First check what your employer already provides. Most companies include group health cover. If not, a ${formatCurrency(500000)} individual health policy typically costs around ${formatCurrency(6000)} a year. Avoid ULIPs and endowment plans; the returns rarely justify the premiums.`;
  }

  return `Based on your salary of ${formatCurrency(salary)} a month, the most impactful thing you can do right now is automate your savings of ${formatCurrency(savingsAmt)} on the day your salary arrives. Then spend one week tracking every expense to spot where money quietly disappears. Those two habits together build more financial security than any single investment decision. Feel free to ask about investing, EMIs, budgeting, or anything else.`;
}

// ===== EXPENSE TRACKER =====
let expenses = JSON.parse(localStorage.getItem("expenses") || "[]");

function addExpense() {
  const desc = document.getElementById("expenseDesc").value.trim();
  const amount = Number(document.getElementById("expenseAmount").value);
  const category = document.getElementById("expenseCategory").value;

  if (!desc || !amount || amount <= 0) {
    alert("Please enter a description and valid amount");
    return;
  }

  if (state.inhand) {
    let budgetRatio = 0;
    if (category === "needs") budgetRatio = state.needs || 50;
    if (category === "wants") budgetRatio = state.wants || 30;
    if (category === "savings") budgetRatio = state.savings || 20;
    
    const budget = Math.round(state.inhand * budgetRatio / 100);
    const currentlySpent = expenses.filter(e => e.category === category).reduce((s, e) => s + e.amount, 0);
    
    if (currentlySpent + amount > budget) {
      alert(`Transaction Declined: This expense of ${formatCurrency(amount)} exceeds your ${budgetRatio}% budget limit for ${category.toUpperCase()}.`);
      return;
    }
  }

  expenses.push({
    id: Date.now(),
    desc,
    amount,
    category,
    date: new Date().toLocaleDateString("en-IN")
  });

  localStorage.setItem("expenses", JSON.stringify(expenses));

  document.getElementById("expenseDesc").value = "";
  document.getElementById("expenseAmount").value = "";

  renderExpenseProgress();
  renderExpenseList();
}

function deleteExpense(id) {
  expenses = expenses.filter(e => e.id !== id);
  localStorage.setItem("expenses", JSON.stringify(expenses));
  renderExpenseProgress();
  renderExpenseList();
}

function renderExpenseProgress() {
  if (!state.inhand) return;

  const needsBudget = Math.max(Math.round(state.inhand * state.needs / 100), 1);
  const wantsBudget = Math.max(Math.round(state.inhand * state.wants / 100), 1);
  const savingsBudget = Math.max(Math.round(state.inhand * state.savings / 100), 1);

  const needsSpent = expenses.filter(e => e.category === "needs").reduce((s, e) => s + e.amount, 0);
  const wantsSpent = expenses.filter(e => e.category === "wants").reduce((s, e) => s + e.amount, 0);
  const savingsSpent = expenses.filter(e => e.category === "savings").reduce((s, e) => s + e.amount, 0);

  const container = document.getElementById("expenseProgress");
  container.innerHTML = `
    <div class="expense-category">
      <div class="expense-cat-header">
        <span class="expense-cat-name"><span class="dot needs-dot"></span> Needs</span>
        <span class="expense-cat-amount">${formatCurrency(needsSpent)} / ${formatCurrency(needsBudget)}</span>
      </div>
      <div class="expense-bar">
        <div class="expense-bar-fill needs ${needsSpent > needsBudget ? 'over' : ''}" style="width: ${Math.min((needsSpent / needsBudget) * 100, 100)}%"></div>
      </div>
    </div>
    <div class="expense-category">
      <div class="expense-cat-header">
        <span class="expense-cat-name"><span class="dot wants-dot"></span> Wants</span>
        <span class="expense-cat-amount">${formatCurrency(wantsSpent)} / ${formatCurrency(wantsBudget)}</span>
      </div>
      <div class="expense-bar">
        <div class="expense-bar-fill wants ${wantsSpent > wantsBudget ? 'over' : ''}" style="width: ${Math.min((wantsSpent / wantsBudget) * 100, 100)}%"></div>
      </div>
    </div>
    <div class="expense-category">
      <div class="expense-cat-header">
        <span class="expense-cat-name"><span class="dot savings-dot"></span> Savings</span>
        <span class="expense-cat-amount">${formatCurrency(savingsSpent)} / ${formatCurrency(savingsBudget)}</span>
      </div>
      <div class="expense-bar">
        <div class="expense-bar-fill savings ${savingsSpent > savingsBudget ? 'over' : ''}" style="width: ${Math.min((savingsSpent / savingsBudget) * 100, 100)}%"></div>
      </div>
    </div>
  `;
}

function renderExpenseList() {
  const container = document.getElementById("expenseList");

  if (expenses.length === 0) {
    container.innerHTML = '<p class="no-expenses">No expenses logged yet. Start tracking!</p>';
    return;
  }

  const sorted = [...expenses].reverse();
  container.innerHTML = sorted.map(e => `
    <div class="expense-item">
      <div class="expense-item-left">
        <span class="expense-item-cat ${e.category}-tag">${e.category}</span>
        <span>${e.desc}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="expense-item-amount">${formatCurrency(e.amount)}</span>
        <button class="expense-item-delete" onclick="deleteExpense(${e.id})"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join("");
}

// Render existing expenses on load
if (expenses.length > 0) {
  renderExpenseList();
}

// ===== FLOATING PARTICLES =====
(function initParticles() {
  const canvas = document.getElementById("particlesCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let particles = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  for (let i = 0; i < 40; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 3 + 1,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      opacity: Math.random() * 0.5 + 0.1
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const isDark = document.body.classList.contains("dark-mode");

    particles.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = isDark
        ? `rgba(20, 160, 133, ${p.opacity})`
        : `rgba(13, 115, 119, ${p.opacity})`;
      ctx.fill();

      // Draw lines between nearby particles
      particles.forEach((p2, j) => {
        if (j <= i) return;
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = isDark
            ? `rgba(20, 160, 133, ${0.08 * (1 - dist / 120)})`
            : `rgba(13, 115, 119, ${0.1 * (1 - dist / 120)})`;
          ctx.stroke();
        }
      });
    });

    requestAnimationFrame(draw);
  }

  draw();
})();

// ===== SAVINGS GROWTH PROJECTION =====
let growthChart = null;

function renderGrowthChart() {
  const monthlySavings = state.inhand * state.savings / 100;
  const months = [0, 6, 12, 18, 24, 36, 48, 60];
  const labels = ["Now", "6mo", "1yr", "1.5yr", "2yr", "3yr", "4yr", "5yr"];
  const savingsOnly = months.map(m => monthlySavings * m);
  const withInterest = months.map(m => {
    // 7% annual return compounded monthly
    const rate = 0.07 / 12;
    if (m === 0) return 0;
    return Math.round(monthlySavings * ((Math.pow(1 + rate, m) - 1) / rate));
  });

  const ctx = document.getElementById("growthChart").getContext("2d");
  if (growthChart) growthChart.destroy();

  const isDark = document.body.classList.contains("dark-mode");

  growthChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "With 7% Returns (SIP)",
          data: withInterest,
          borderColor: "#14a085",
          backgroundColor: "rgba(20, 160, 133, 0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 8,
          borderWidth: 3
        },
        {
          label: "Savings Only",
          data: savingsOnly,
          borderColor: "#94a3b8",
          backgroundColor: "rgba(148, 163, 184, 0.05)",
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          borderWidth: 2,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: {
            color: isDark ? "#8a94a6" : "#5a5a7a",
            font: { family: "Inter", weight: 600, size: 12 },
            usePointStyle: true,
            pointStyle: "circle"
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ": " + formatCurrency(context.parsed.y);
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: v => formatCurrency(v),
            color: isDark ? "#8a94a6" : "#5a5a7a",
            font: { family: "Inter", size: 11 }
          },
          grid: { color: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" }
        },
        x: {
          ticks: {
            color: isDark ? "#8a94a6" : "#5a5a7a",
            font: { family: "Inter", weight: 600, size: 12 }
          },
          grid: { display: false }
        }
      }
    }
  });

  // Growth stats
  const container = document.getElementById("growthStats");
  const projections = [
    { label: "6 Months", value: withInterest[1] },
    { label: "1 Year", value: withInterest[2] },
    { label: "2 Years", value: withInterest[4] },
    { label: "5 Years", value: withInterest[7] }
  ];

  container.innerHTML = projections.map(p => `
    <div class="growth-stat">
      <span class="growth-stat-label">${p.label}</span>
      <span class="growth-stat-value">${formatCurrency(p.value)}</span>
    </div>
  `).join("");
}

// ===== PEER COMPARISON =====
function renderPeerComparison() {
  const container = document.getElementById("peerBars");
  const savings = state.savings;
  const needs = state.needs;

  // Simulated average data for similar salary range
  const avgSavings = 12; // Average Indian saves about 12%
  const avgNeeds = 58;

  const savingsPercentile = Math.min(Math.round((savings / 35) * 100), 99);

  container.innerHTML = `
    <div class="peer-bar-item">
      <span class="peer-bar-label">Your Savings</span>
      <div class="peer-bar-track">
        <div class="peer-bar-fill you" style="width: 0%" id="peerYouSavings">${savings}%</div>
      </div>
      <span class="peer-bar-value">${savings}%</span>
    </div>
    <div class="peer-bar-item">
      <span class="peer-bar-label">Avg. Indian</span>
      <div class="peer-bar-track">
        <div class="peer-bar-fill average" style="width: 0%" id="peerAvgSavings">${avgSavings}%</div>
      </div>
      <span class="peer-bar-value">${avgSavings}%</span>
    </div>
  `;

  // Animate bars
  setTimeout(() => {
    const youBar = document.getElementById("peerYouSavings");
    const avgBar = document.getElementById("peerAvgSavings");
    if (youBar) youBar.style.width = Math.min(savings / 40 * 100, 100) + "%";
    if (avgBar) avgBar.style.width = Math.min(avgSavings / 40 * 100, 100) + "%";
  }, 300);
}

// ===== VOICE INPUT =====
let isRecording = false;
let recognition = null;

function toggleVoice() {
  const btn = document.getElementById("voiceBtn");

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    alert("Voice input is not supported in this browser. Try Chrome!");
    return;
  }

  if (isRecording) {
    recognition.stop();
    btn.classList.remove("recording");
    isRecording = false;
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;

  btn.classList.add("recording");
  isRecording = true;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("chatInput").value = transcript;
    btn.classList.remove("recording");
    isRecording = false;
    sendChat();
  };

  recognition.onerror = () => {
    btn.classList.remove("recording");
    isRecording = false;
  };

  recognition.onend = () => {
    btn.classList.remove("recording");
    isRecording = false;
  };

  recognition.start();
}

// ===== ANIMATED NUMBER COUNTER =====
function animateCounter(element, target, duration = 1000) {
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(start + (target - eased) * eased * (target / target));

    element.textContent = formatCurrency(Math.round(target * eased));

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}



// ===== BACKEND INTEGRATION =====
async function savePlanToServer() {
  try {
    const response = await fetch(`${API_BASE}/api/save-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ctc: state.ctc,
        inhand: state.inhand,
        needs: state.needs,
        wants: state.wants,
        savings: state.savings,
        name: "User"
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`Plan saved. ID: ${data.id}, Total: ${data.totalGenerated}`);

      // Update plan counter
      const counter = document.getElementById("planCounter");
      if (counter) {
        counter.textContent = `${data.totalGenerated.toLocaleString()} plans generated`;
        counter.style.display = "block";
      }
    }
  } catch (err) {
    console.log("Plan save skipped (offline mode):", err.message);
  }
}

async function fetchStats() {
  try {
    const response = await fetch(`${API_BASE}/api/stats`);
    if (response.ok) {
      const stats = await response.json();
      const counter = document.getElementById("planCounter");
      if (counter && stats.totalPlans > 0) {
        counter.textContent = `${stats.totalPlans.toLocaleString()} plans generated | Avg savings: ${stats.avgSavingsRate}%`;
        counter.style.display = "block";
      }
    }
  } catch (err) {
    // Silently fail - works without backend too
  }
}

// ===== GOAL TRACKER =====
let goals = JSON.parse(localStorage.getItem('fsg_goals')) || [];

function saveGoals() {
  localStorage.setItem('fsg_goals', JSON.stringify(goals));
  renderGoals();
}

function addGoal() {
  const nameInput = document.getElementById("goalName");
  const amountInput = document.getElementById("goalAmount");
  
  if (!nameInput.value || !amountInput.value) {
    alert("Please enter both goal name and amount");
    return;
  }
  
  goals.push({
    id: Date.now(),
    name: nameInput.value,
    target: Number(amountInput.value)
  });
  
  nameInput.value = "";
  amountInput.value = "";
  saveGoals();
}

function removeGoal(id) {
  goals = goals.filter(g => g.id !== id);
  saveGoals();
}

function renderGoals() {
  const list = document.getElementById("goalsList");
  if (!list) return;
  
  const monthlySavings = (state.inhand || 0) * (state.savings || 20) / 100;
  
  if (goals.length === 0) {
    list.innerHTML = `<div style="text-align: center; color: var(--text-light); font-style: italic;">No goals set yet. Start dreaming!</div>`;
    return;
  }
  
  list.innerHTML = goals.map(goal => {
    let monthsNeeded = "N/A";
    let progressHtml = "";
    
    if (monthlySavings > 0) {
      const months = Math.ceil(goal.target / monthlySavings);
      monthsNeeded = `${months} months`;
      
      progressHtml = `
        <div style="margin-top: 10px; width: 100%; height: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden;">
          <div style="width: ${Math.min(100, (monthlySavings * 100) / goal.target)}%; height: 100%; background: var(--primary); transition: width 0.5s;"></div>
        </div>
        <div style="font-size: 11px; color: var(--text-light); margin-top: 4px;">Time to reach: ${monthsNeeded} at current savings rate</div>
      `;
    }
    
    return `
      <div style="background: var(--card-bg); padding: 15px; border-radius: var(--radius-sm); border: 1px solid var(--border); display: flex; flex-direction: column; position: relative;">
        <button onclick="removeGoal(${goal.id})" style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: #e74c3c; cursor: pointer;"><i class="fas fa-times"></i></button>
        <div style="font-weight: 600; color: var(--text);">${goal.name}</div>
        <div style="font-size: 18px; font-weight: 700; color: var(--primary); margin-top: 5px;">₹${goal.target.toLocaleString('en-IN')}</div>
        ${progressHtml}
      </div>
    `;
  }).join('');
}

// Ensure goals render when Step 4 is shown
const _originalGoToStep4 = goToStep4;
goToStep4 = function() {
  _originalGoToStep4();
  renderGoals();
};

// ===== ONBOARDING TOUR =====
function startTour() {
  if (localStorage.getItem('fsg_tour_done')) return;
  
  const driver = window.driver.js.driver;
  const tourObj = driver({
    showProgress: true,
    steps: [
      { element: '.theme-toggle', popover: { title: 'Dark Mode', description: 'Switch between light and dark themes anytime.', side: "left", align: 'start' }},
      { element: '#ctc', popover: { title: 'Your Package', description: 'Enter your Annual CTC here.', side: "top", align: 'start' }},
      { element: '#salary', popover: { title: 'Or In-Hand Salary', description: 'If you only know your monthly take-home, enter it here instead.', side: "top", align: 'start' }},
      { element: '#chatFab', popover: { title: 'Meet Money Mentor', description: 'Have questions? Ask our AI financial advisor anytime!', side: "top", align: 'end' }}
    ],
    onDestroyStarted: () => {
      localStorage.setItem('fsg_tour_done', 'true');
      tourObj.destroy();
    }
  });
  
  setTimeout(() => tourObj.drive(), 1000);
}

// Start tour on load
document.addEventListener('DOMContentLoaded', startTour);

// ===== EMAIL PDF FEATURE =====
function showEmailModal() {
  document.getElementById('emailModal').style.display = 'flex';
  document.getElementById('emailStatus').style.display = 'none';
}

function closeEmailModal() {
  document.getElementById('emailModal').style.display = 'none';
}

async function sendEmailPlan() {
  const emailInput = document.getElementById('userEmail').value;
  const statusEl = document.getElementById('emailStatus');
  const loader = document.getElementById('emailLoader');
  const btn = document.getElementById('sendEmailBtn');

  if (!emailInput || !emailInput.includes('@')) {
    statusEl.innerText = "Please enter a valid email.";
    statusEl.style.color = "var(--error)";
    statusEl.style.display = "block";
    return;
  }

  statusEl.style.display = 'none';
  loader.style.display = 'inline-block';
  btn.disabled = true;

  try {
    // Generate PDF base64 using jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    
    // We'll capture the plan card as an image for the email PDF
    const planCard = document.getElementById("planCard");
    const originalBorder = planCard.style.border;
    const originalShadow = planCard.style.boxShadow;
    const originalBg = planCard.style.background;
    planCard.style.border = "none";
    planCard.style.boxShadow = "none";
    planCard.style.background = "#ffffff";
    planCard.style.color = "#1e293b";

    const canvas = await html2canvas(planCard, { scale: 2, useCORS: true });
    
    planCard.style.border = originalBorder;
    planCard.style.boxShadow = originalShadow;
    planCard.style.background = originalBg;
    planCard.style.color = "";

    const imgData = canvas.toDataURL("image/png");
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    doc.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    const pdfBase64 = doc.output('datauristring');

    const response = await fetch("http://localhost:3456/api/email-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput, pdfBase64 })
    });

    const data = await response.json();

    if (response.ok) {
      statusEl.innerText = data.message || "Email sent successfully!";
      statusEl.style.color = "var(--success)";
      setTimeout(closeEmailModal, 2000);
    } else {
      throw new Error(data.error || "Failed to send email");
    }
  } catch (err) {
    statusEl.innerText = err.message || "Something went wrong.";
    statusEl.style.color = "var(--error)";
  } finally {
    statusEl.style.display = "block";
    loader.style.display = 'none';
    btn.disabled = false;
  }
}
