/* ------------ CONFIG ------------ */
const GEMINI_API_KEY = "AIzaSyAWNO9wExNWVlWB9s1ti03mLz-IZkZwIa0"; // 테스트용으로만 직접 넣기
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

/* DOM 참조 */
const searchBtn    = document.getElementById("searchBtn");
const analyzeBtn   = document.getElementById("analyzeBtn");
const resultsPanel = document.getElementById("resultsPanel");
const sceneSection = document.getElementById("sceneSection");

let selectedWork = null;

/* ------------ UTIL ------------ */
function sanitize(str) {
  return (str || "").trim().slice(0, 2000);
}

function showToast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  document.getElementById("toast-container").appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => el.remove(), 3000);
}

/* ------------ GEMINI 호출 ------------ */
async function callGemini(promptText) {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key is not set.");
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }]
      }
    ]
  };

  const res = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Empty response from Gemini");

  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
    throw new Error("Invalid JSON from Gemini");
  }
}

/* ------------ PROMPTS ------------ */
function buildIdentificationPrompt() {
  const title = sanitize(document.getElementById("title").value);
  const metadata = sanitize(document.getElementById("metadata").value);

  return `
You are "Re:frame", an AI that identifies visual works (film/anime/drama).
Return ONLY a JSON object in this schema. No markdown, no explanation text:

{
  "work_confirmation": {
    "candidates": [
      {
        "title": "string",
        "year": "string or null",
        "medium": "film/anime/drama",
        "director_or_studio": "string or null",
        "region": "string or null",
        "matching_rationale": "short reason"
      }
    ],
    "ask_user_to_confirm": "Which work did you mean?"
  }
}

User input:
- Title/keywords: "${title}"
- Metadata: "${metadata}"
  `;
}

function buildAnalysisPrompt() {
  // 🔹 여기: 하나의 textarea(sceneInput)만 사용
  const sceneCombined = sanitize(document.getElementById("sceneInput").value);
  const lang  = document.getElementById("answerLanguage").value;

  let langInstruction = "Respond in the same language as the user's description or question.";
  if (lang === "en") langInstruction = "Respond in natural, fluent English.";
  else if (lang === "ko") langInstruction = "Respond in natural, fluent Korean.";
  else if (lang === "ja") langInstruction = "Respond in natural, fluent Japanese.";
  else if (lang === "vi") langInstruction = "Respond in natural, fluent Vietnamese.";

  return `
You are "Re:frame", specialising in visual storytelling analysis.

${langInstruction}

The user has already confirmed the work:
${JSON.stringify(selectedWork)}

The user wrote (scene + thoughts + question in one field):
"${sceneCombined}"

Write a single, coherent AI interpretation of this scene.
You may draw on possible creator intent, typical community readings, and your own symbolic/thematic reading,
but DO NOT separate them. Just give one unified explanation.

Return ONLY a JSON object like this (no markdown, no prose outside JSON):

{
  "analysis": {
    "ai_interpretation": "one or more paragraphs of your unified explanation of the scene"
  },
  "reflective_prompt": "one short question for the user to think about after reading your interpretation"
}
  `;
}

/* ------------ SEARCH HANDLER ------------ */
searchBtn.addEventListener("click", async () => {
  const title = document.getElementById("title").value.trim();
  if (!title) {
    showToast("Enter a title first.", "error");
    return;
  }

  selectedWork = null;
  analyzeBtn.disabled = true;
  sceneSection.classList.add("hidden");
  sceneSection.classList.remove("show");

  resultsPanel.innerHTML = `
    <div class="glass-card info-card">
      <h3>Searching for your work…</h3>
      <p style="color:var(--secondary-text);">
        Looking up likely matches based on your title and metadata.
      </p>
    </div>
  `;

  try {
    const resp = await callGemini(buildIdentificationPrompt());
    if (!resp?.work_confirmation?.candidates?.length) {
      resultsPanel.innerHTML = `
        <div class="glass-card info-card">
          <h3>No works found</h3>
          <p style="color:var(--secondary-text);">
            Try adding year, director, studio, or fixing typos.
          </p>
        </div>
      `;
      return;
    }

    const confirmationData = resp.work_confirmation;
    renderCandidates(confirmationData);
  } catch (e) {
    console.error(e);
    showToast(`Error while searching: ${e.message}`, "error");
    resultsPanel.innerHTML = `
      <div class="glass-card info-card">
        <h3>Search error</h3>
        <p style="color:var(--secondary-text);">
          Something went wrong while looking up the work.
        </p>
      </div>
    `;
  }
});

/* ------------ RENDER CANDIDATES ------------ */
function renderCandidates(confirmationData) {
  const html = `
    <div class="glass-card">
      <h2>${confirmationData.ask_user_to_confirm || "Which work did you mean?"}</h2>
      <div id="candidatesList" style="margin-top:1rem;display:flex;flex-direction:column;gap:.75rem;">
        ${confirmationData.candidates
          .map(c => {
            const yearText = c.year ? " (" + c.year + ")" : "";
            const metaLine =
              (c.medium || "work") + (c.director_or_studio ? " | " + c.director_or_studio : "");
            const encoded = encodeURIComponent(JSON.stringify(c));
            return `
              <div class="candidate-card" data-candidate="${encoded}">
                <div class="candidate-info">
                  <h4 style="margin:0 0 4px 0;color:#fff;">${c.title}${yearText}</h4>
                  <p style="margin:0;font-size:.85rem;color:var(--secondary-text);">
                    ${metaLine}
                  </p>
                  <p style="margin:.25rem 0 0;font-size:.8rem;color:var(--secondary-text);">
                    ${c.matching_rationale || ""}
                  </p>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
  resultsPanel.innerHTML = html;

  document.querySelectorAll(".candidate-card").forEach(el => {
    el.addEventListener("click", () => confirmWork(el));
  });
}

/* ------------ CONFIRM WORK → STEP2 표시 ------------ */
function confirmWork(el) {
  const encoded = el.getAttribute("data-candidate");
  try {
    selectedWork = JSON.parse(decodeURIComponent(encoded));
  } catch (e) {
    console.error("Failed to parse candidate data", e);
    showToast("Internal parse error.", "error");
    return;
  }

  document.querySelectorAll(".candidate-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");

  sceneSection.classList.remove("hidden");
  requestAnimationFrame(() => sceneSection.classList.add("show"));

  analyzeBtn.disabled = false;
  showToast(`Selected: ${selectedWork.title}`, "info");
}

/* ------------ ANALYZE HANDLER ------------ */
analyzeBtn.addEventListener("click", async () => {
  if (!selectedWork) {
    showToast("Select a work first.", "error");
    return;
  }
  // 🔹 여기: sceneInput만 검사
  const desc = document.getElementById("sceneInput").value.trim();
  if (!desc) {
    showToast("Describe the scene and your question.", "error");
    return;
  }

  resultsPanel.innerHTML = `
    <div class="glass-card info-card">
      <h3>Analyzing your scene…</h3>
      <p style="color:var(--secondary-text);">
        Generating a unified AI interpretation of your scene.
      </p>
    </div>
  `;

  try {
    const resp = await callGemini(buildAnalysisPrompt());
    renderAnalysis(resp);
  } catch (e) {
    console.error(e);
    showToast(`Error while analyzing: ${e.message}`, "error");
    resultsPanel.innerHTML = `
      <div class="glass-card info-card">
        <h3>Analysis error</h3>
        <p style="color:var(--secondary-text);">
          Something went wrong while analyzing this scene.
        </p>
      </div>
    `;
  }
});

/* ------------ RENDER ANALYSIS (AI 단일 모드) ------------ */
function renderAnalysis(d) {
  const analysis = d.analysis || {};
  const aiInterpretation = analysis.ai_interpretation || "";
  const prompt = d.reflective_prompt || "What feeling lingered most for you after this scene?";

  resultsPanel.innerHTML = "";

  resultsPanel.insertAdjacentHTML(
    "beforeend",
    `<div class="glass-card result-card">
       <h3>AI Interpretation</h3>
       <p>${aiInterpretation || "<em>No interpretation available.</em>"}</p>
     </div>`
  );

  resultsPanel.insertAdjacentHTML(
    "beforeend",
    `<div class="glass-card result-card reflective-prompt">
       <p>${prompt}</p>
     </div>`
  );
}
