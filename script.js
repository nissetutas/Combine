document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM laddad');

  // ===== Globalt tillstånd =====
  let players = [];
  let scores = {};
  let turns = []; // global historik
  let perPlayerTurns = {}; // { namn: [ {score, prev, after, type} ] }
  let turnIndex = 0;
  let startPoints = 301;
  let leaderboard = {}; // namn -> vinster
  let currentPlayersKey = ""; // används för att avgöra om nya spelare valts
  let playType = "individual"; // "individual" eller "teams"
  let teams = [];              // används bara om playType = teams
  let teamScores = {};         // lagets poäng
  let teamTurnIndex = 0;       // vilket lag har turen
  let teamPlayerIndices = {};  // { "Lag 1": playerTurnIndex, "Lag 2": playerTurnIndex, ... }
  let perTeamTurns = {}; // { "Lag 1": [ {score, prev, after, type} ] }

  // ===== Hjälp =====
  const $ = (s) => document.querySelector(s);
  const startView = $("#start");
  const gameView = $("#game");
  const els = {
    start: $("#start"),
    game: $("#game"),
    names: $("#names"),
    mode: $("#mode"),
    startBtn: $("#startBtn"),
    legTitle: $("#legTitle"),
    turnHint: $("#turnHint"),
    players: $("#players"),
    score: $("#score"),
    okBtn: $("#okBtn"),
    undoBtn: $("#undoBtn"),
    againBtn: $("#againBtn"),
    newBtn: $("#newBtn"),
    top10Start: $("#top10"),
    top10Game: $("#top10Game"),
    themeLightBtn: $("#themeLightBtn"),
    themeDarkBtn: $("#themeDarkBtn"),
    infoBox: $("#infoBox"),
  };
  const playTypeSelect = document.getElementById("playType");
  const teamHint = document.getElementById("teamHint");

  // ===== Info Box Logic =====
  const infoBoxContent = {
    welcome: `
      <h3>Välkommen!</h3>
      <p>Denna app hjälper dig att hålla koll på poängen i dartspel.</p>
      <p>När du startar en match kan du välja att skriva in resultatet direkt eller trycka på 🎯-ikonen för att registrera varje pil separat.</p>
      <p>Lycka till och ha kul!</p>
    `,
    '301/501': `
      <h3>Dart 301/501 med dubbel ut</h3>
      <ul>
        <li><strong>Start:</strong> 301 eller 501 poäng, målet är exakt 0.</li>
        <li><strong>Kast:</strong> Tre pilar per omgång, poäng dras från totalen.</li>
        <li><strong>Dubbel ut:</strong> Sista kastet måste vara en dubbel eller bullseye för att vinna.</li>
        <li><strong>Bust:</strong> Om poängen blir under 2 (1 eller lägre) eller 0 utan dubbel/bullseye, återställs poängen (BUST).</li>
        <li><strong>Vinst:</strong> Först till exakt 0 med dubbel eller bullseye vinner.</li>
      </ul>
    `
  };

  function updateInfoBox(mode) {
    if (mode === '301' || mode === '501') {
      els.infoBox.innerHTML = infoBoxContent['301/501'];
    } else {
      els.infoBox.innerHTML = infoBoxContent.welcome;
    }
  }

  els.mode.addEventListener('change', (e) => {
    const selectedMode = e.target.value;
    updateInfoBox(selectedMode);
    els.startBtn.disabled = selectedMode === "";
  });

  // Disable start button initially
  els.startBtn.disabled = true;

  // ===== Tema & enkel persistens =====
  try {
    const savedTheme = localStorage.getItem("dart_theme") || "light"; // Ändrat till "light" som standard
    setTheme(savedTheme);
  } catch (e) {
    console.error("Error accessing localStorage:", e);
  }

  function setTheme(t) {
    if (t === "light") {
      document.body.classList.add("light");
    } else {
      document.body.classList.remove("light");
    }
    localStorage.setItem("dart_theme", t);
  }

  // ===== Tema-knappar =====
  els.themeLightBtn.addEventListener("click", () => setTheme("light"));
  els.themeDarkBtn.addEventListener("click", () => setTheme("dark"));

  // ===== Startknapp =====
  els.startBtn.addEventListener("click", () => {
    startPoints = parseInt($("#mode").value, 10);
    players = els.names.value
      .split(",")
      .map(n => n.trim())
      .filter(n => n !== "");

    if (players.length === 0) {
      alert("Skriv in minst ett namn för att starta spelet!");
      return;
    }

    scores = {};
    teamScores = {};
    perPlayerTurns = {};
    perTeamTurns = {};
    teams = [];
    teamPlayerIndices = {};

    if (playType === "individual") {
      players.forEach(p => {
        scores[p] = startPoints;
        perPlayerTurns[p] = [];
      });
    } else {
      for (let i = 0; i < players.length; i += 2) {
        const lag = players.slice(i, i + 2);
        teams.push(lag);
      }
      console.log("Teams formed:", teams);
      teams.forEach((lag, i) => {
        const lagNamn = "Lag " + (i + 1);
        teamScores[lagNamn] = startPoints;
        perTeamTurns[lagNamn] = [];
        teamPlayerIndices[lagNamn] = 0;
      });
    }

    renderPlayers();
    els.legTitle.textContent = `Spel: ${startPoints}`;
    turnIndex = 0;
    teamTurnIndex = 0;
    els.start.classList.add("hidden");
    els.game.classList.remove("hidden");
    updateTurnHint(); // Lägg till detta anrop för att uppdatera hint-texten direkt
  });

  // ===== Rendering =====
  function renderPlayers() {
    els.players.innerHTML = "";
    console.log("Rendering players:", { players, teams, scores, teamScores });

    if (playType === "individual") {
      players.forEach((p, index) => {
        const score = scores[p] !== undefined ? scores[p] : startPoints;
        const avg = calcAvg(p);
        const formattedAvg = isNaN(avg) ? "0" : avg.toFixed(1);
        const checkout = checkoutText(score) || "–";
        const div = document.createElement("div");
        div.className = `player card${index === turnIndex ? " active" : ""}`;
        div.innerHTML = `
          <div class="row1">
            <span class="name">${p}</span>
            <span class="score">${score}</span>
          </div>
          <div class="row2">
            <span class="checkouts">Ut: ${checkout}</span>
            <span class="average">Snitt: ${formattedAvg}</span>
          </div>
        `;
        els.players.appendChild(div);
      });
    } else {
      teams.forEach((lag, i) => {
        const lagNamn = "Lag " + (i + 1);
        const score = teamScores[lagNamn] !== undefined ? teamScores[lagNamn] : startPoints;
        const avg = calcTeamAvg(lagNamn);
        const formattedAvg = isNaN(avg) ? "0" : avg.toFixed(1);
        const checkout = checkoutText(score) || "–";
        const div = document.createElement("div");
        div.className = `player card${i === teamTurnIndex ? " active" : ""}`;
        div.innerHTML = `
          <div class="row1">
            <span class="name">${lagNamn} (${lag.join(" & ")})</span>
            <span class="score">${score}</span>
          </div>
          <div class="row2">
            <span class="checkouts">Ut: ${checkout}</span>
            <span class="average">Snitt: ${formattedAvg}</span>
          </div>
        `;
        els.players.appendChild(div);
      });
    }
  }

  function renderLeaderboard() {
    const entries = Object.entries(leaderboard).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const renderInto = (root) => {
      root.innerHTML = "";
      entries.forEach(([name, wins]) => {
        const li = document.createElement("li");
        li.textContent = `${name} — ${wins}`;
        root.appendChild(li);
      });
    };
    renderInto(els.top10Start);
    renderInto(els.top10Game);
  }

  function updateTurnHint() {
    if (playType === "individual") {
      $("#turnHint").textContent = `Aktuell spelare: ${players[turnIndex]}`;
    } else {
      const lag = "Lag " + (teamTurnIndex + 1);
      const activePlayer = teams[teamTurnIndex][teamPlayerIndices[lag]];
      $("#turnHint").textContent = `Aktuellt lag: ${lag} — Spelare: ${activePlayer}`;
    }
  }

  // ===== Inmatning =====
  els.okBtn.addEventListener("click", submitScore);
  els.score.addEventListener("keydown", e => { if (e.key === "Enter") submitScore(); });
  els.undoBtn.addEventListener("click", undoLast);
  els.againBtn.addEventListener("click", newLegSamePlayers);
  els.newBtn.addEventListener("click", () => {
    // Reset all game state variables to their initial state
    players = [];
    scores = {};
    turns = [];
    perPlayerTurns = {};
    turnIndex = 0;
    teams = [];
    teamScores = {};
    teamTurnIndex = 0;
    teamPlayerIndices = {};
    perTeamTurns = {};
    leaderboard = {};
    currentPlayersKey = "";

    // Reset UI elements in the game view to a clean state
    els.players.innerHTML = "";
    const historyBox = document.getElementById("historyList");
    if (historyBox) historyBox.innerHTML = "";
    els.turnHint.textContent = "";

    // Reset the form on the start page for a fresh start
    els.names.value = "";
    els.mode.value = "301";
    playType = "individual"; // Explicitly reset the state variable
    playTypeSelect.value = "individual";
    if (teamHint) teamHint.style.display = "none";

    // Switch views
    gameView.classList.add("hidden");
    startView.classList.remove("hidden");

    // Render the (now empty) leaderboard
    renderLeaderboard();
  });

  function submitScore() {
    const raw = els.score.value.trim();
    const val = parseInt(raw, 10);
    if (Number.isNaN(val) || val < 0 || val > 180) {
      alert("Ange poäng 0–180.");
      return;
    }

    if (playType === "individual") {
      const p = players[turnIndex];
      const prev = scores[p];
      const after = prev - val;
      let rec = { player: p, score: val, prev, after: prev, type: "bust" };

      if (after < 0 || after === 1) {
        rec = { player: p, score: val, prev, after: prev, type: "bust" };
      } else if (after === 0) {
        scores[p] = 0;
        rec = { player: p, score: val, prev, after: 0, type: "win" };
        leaderboard[p] = (leaderboard[p] || 0) + 1;
        alert(`${p} vann! 🏆`);
      } else {
        scores[p] = after;
        rec = { player: p, score: val, prev, after, type: "score" };
      }

      turns.push(rec);
      perPlayerTurns[p].push(rec);
      turnIndex = (turnIndex + 1) % players.length;
    } else {
      const lagNamn = "Lag " + (teamTurnIndex + 1);
      const prev = teamScores[lagNamn];
      const after = prev - val;
      let rec = { player: lagNamn, score: val, prev, after: prev, type: "bust", playerTurnIndex: teamPlayerIndices[lagNamn] };

      if (after < 0 || after === 1) {
        rec = { player: lagNamn, score: val, prev, after: prev, type: "bust", playerTurnIndex: teamPlayerIndices[lagNamn] };
      } else if (after === 0) {
        teamScores[lagNamn] = 0;
        rec = { player: lagNamn, score: val, prev, after: 0, type: "win", playerTurnIndex: teamPlayerIndices[lagNamn] };
        leaderboard[lagNamn] = (leaderboard[lagNamn] || 0) + 1;
        alert(`${lagNamn} vann! 🏆`);
      } else {
        teamScores[lagNamn] = after;
        rec = { player: lagNamn, score: val, prev, after, type: "score", playerTurnIndex: teamPlayerIndices[lagNamn] };
      }

      turns.push(rec);
      perTeamTurns[lagNamn].push(rec);
      teamPlayerIndices[lagNamn] = (teamPlayerIndices[lagNamn] + 1) % teams[teamTurnIndex].length;
      teamTurnIndex = (teamTurnIndex + 1) % teams.length;
    }

    els.score.value = "";
    renderPlayers();
    renderHistory();
    renderLeaderboard();
    updateTurnHint();
  }

  function undoLast() {
    if (!turns.length) return;
    stickyCheckoutRoute = null; // Also reset sticky route here for consistency
    const last = turns.pop();

    if (playType === "individual") {
      const p = last.player;
      if (perPlayerTurns[p].length) {
        perPlayerTurns[p].pop();
      }
      if (last.type === "score" || last.type === "bust") {
        scores[p] = last.prev;
      } else if (last.type === "win") {
        scores[p] = last.prev;
        leaderboard[p] = Math.max(0, (leaderboard[p] || 1) - 1);
      }
      turnIndex = players.indexOf(p);
    } else {
      const lag = last.player;
      if (perTeamTurns[lag] && perTeamTurns[lag].length) {
        perTeamTurns[lag].pop();
      }
      if (last.type === "score" || last.type === "bust") {
        teamScores[lag] = last.prev;
      } else if (last.type === "win") {
        teamScores[lag] = last.prev;
        leaderboard[lag] = Math.max(0, (leaderboard[lag] || 1) - 1);
      }
      teamTurnIndex = parseInt(lag.replace("Lag ", "")) - 1;
      teamPlayerIndices[lag] = (teams[teamTurnIndex].length + last.playerTurnIndex - 1) % teams[teamTurnIndex].length;
    }

    renderPlayers();
    renderHistory();
    renderLeaderboard();
    updateTurnHint();
  }

  function newLegSamePlayers() {
    turns = [];
    els.score.value = "";

    if (playType === "individual") {
      players.forEach(p => {
        scores[p] = startPoints;
        perPlayerTurns[p] = [];
      });
      turnIndex = 0;
    } else {
      Object.keys(teamScores).forEach(lag => {
        teamScores[lag] = startPoints;
        perTeamTurns[lag] = [];
        teamPlayerIndices[lag] = 0;
      });
      teamTurnIndex = 0;
    }

    renderPlayers();
    renderHistory();
    renderLeaderboard();
    updateTurnHint();
  }

  function calcAvg(p) {
    const list = perPlayerTurns[p].filter(t => t.type === "score");
    if (!list.length) return 0;
    const tot = list.reduce((a, t) => a + t.score, 0);
    return tot / list.length;
  }

  function calcTeamAvg(lagNamn) {
    const list = perTeamTurns[lagNamn]?.filter(t => t.type === "score") || [];
    if (!list.length) return 0;
    const tot = list.reduce((a, t) => a + t.score, 0);
    return tot / list.length;
  }

  function renderHistory() {
    const box = document.getElementById("historyList");
    if (!box) return;
    box.innerHTML = "";

    if (playType === "individual") {
      players.forEach(p => {
        const list = perPlayerTurns[p];
        const last6 = list.slice(-6).map(t => {
          if (t.type === "bust") return `<span class="bad">BUST −${t.score}</span>`;
          if (t.type === "win") return `<span>Vinst!</span>`;
          return t.score;
        }).join(", ");
        const row = document.createElement("div");
        row.innerHTML = `<strong>${p}:</strong> ${last6 && last6.trim() ? last6 : "<span class='muted'>–</span>"}`;
        box.appendChild(row);
      });
    } else {
      Object.keys(teamScores).forEach(lag => {
        const list = perTeamTurns[lag] || [];
        const last6 = list.slice(-6).map(t => {
          if (t.type === "bust") return `<span class="bad">BUST −${t.score}</span>`;
          if (t.type === "win") return `<span>Vinst!</span>`;
          return t.score;
        }).join(", ");
        const row = document.createElement("div");
        row.innerHTML = `<strong>${lag}:</strong> ${last6 && last6.trim() ? last6 : "<span class='muted'>–</span>"}`;
        box.appendChild(row);
      });
    }
  }

  // ===== Preferred routes =====
  function getAntalUtgangar() {
    return 2; // Limit to 2 checkout routes for better mobile display
  }

  const preferredRoutes = {
    170: ["T20 T20 Bullseye"],
    167: ["T20 T19 Bullseye"],
    164: ["T20 T18 Bullseye", "T19 T19 Bullseye"],
    161: ["T20 T17 Bullseye"],
    160: ["T20 T20 D20"],
    158: ["T20 T20 D19"],
    157: ["T20 T19 D20"],
    156: ["T20 T20 D18"],
    155: ["T20 T19 D19"],
    154: ["T20 T18 D20"],
    153: ["T20 T19 D18"],
    152: ["T20 T20 D16"],
    151: ["T20 T17 D20", "T19 T18 D20"],
    150: ["T20 T18 D18", "T20 T20 D15", "Bullseye Bullseye Bullseye"],
    149: ["T20 T19 D16"],
    148: ["T20 T20 D14"],
    147: ["T20 T17 D18", "T19 T18 D18"],
    146: ["T20 T18 D16", "T19 T19 D16"],
    145: ["T20 T15 D20", "T19 T16 D16"],
    144: ["T20 T20 D12", "T18 T18 D18"],
    143: ["T20 T17 D16"],
    142: ["T20 T14 D20"],
    141: ["T20 T19 D12"],
    140: ["T20 T20 D10", "T19 T19 D12"],
    139: ["T20 T13 D20", "T19 T14 D20"],
    138: ["T20 T14 D18"],
    137: ["T20 T19 D10", "T19 T16 D16"],
    136: ["T20 T20 D8"],
    135: ["T20 T15 D15", "Bullseye T15 D10"],
    134: ["T20 T14 D16"],
    133: ["T20 T19 D8"],
    132: ["T20 T20 D6", "Bullseye Bullseye D16"],
    131: ["T20 T13 D16"],
    130: ["T20 T20 D5", "20 T20 Bullseye"],
    129: ["T19 T16 D12"],
    128: ["T18 T14 D16"],
    127: ["T20 T17 D8"],
    126: ["T19 T19 D6"],
    125: ["Bullseye T15 D20", "25 T20 D20"],
    124: ["T20 16 D20", "T20 T14 D11"],
    123: ["T19 16 D20"],
    122: ["T18 T18 D7", "Bullseye T14 D15"],
    121: ["T20 T11 D14", "T19 T16 D8"],
    120: ["T20 20 D20"],
    119: ["T19 12 D20"],
    118: ["T20 18 D20"],
    117: ["T20 17 D20"],
    116: ["T20 16 D20"],
    115: ["T19 18 D20", "T20 15 D20"],
    114: ["T20 14 D20"],
    113: ["T20 13 D20"],
    112: ["T20 12 D20"],
    111: ["T20 11 D20"],
    110: ["T20 Bullseye", "T20 10 D20"],
    109: ["T19 12 D20", "T20 9 D20"],
    108: ["T20 16 D16", "T19 19 D16"],
    107: ["T19 10 D20", "T17 16 D20"],
    106: ["T20 6 D20"],
    105: ["T19 8 D20", "T20 5 D20"],
    104: ["T18 10 D20", "T16 16 D20"],
    103: ["T19 6 D20", "T17 12 D20"],
    102: ["T20 10 D16"],
    101: ["T17 10 D20", "T20 1 D20"],
    100: ["T20 D20"],
    99: ["T19 10 D16"],
    98: ["T20 D19"],
    97: ["T19 D20"],
    96: ["T20 D18"],
    95: ["T19 D19"],
    94: ["T18 D20"],
    93: ["T19 D18"],
    92: ["T20 D16"],
    91: ["T17 D20"],
    90: ["T20 D15", "T18 D18"],
    89: ["T19 D16"],
    88: ["T20 D14"],
    87: ["T17 D18"],
    86: ["T18 D16"],
    85: ["T19 D14", "T15 D20"],
    84: ["T20 D12", "T16 D18"],
    83: ["T17 D16"],
    82: ["Bullseye D16", "T14 D20"],
    81: ["T19 D12"],
    80: ["T20 D10", "T16 D16"],
    79: ["T13 D20", "T19 D11"],
    78: ["T18 D12"],
    77: ["T19 D10"],
    76: ["T20 D8", "T16 D14"],
    75: ["T17 D12"],
    74: ["T14 D16"],
    73: ["T19 D8"],
    72: ["T16 D12"],
    71: ["T13 D16"],
    70: ["T18 D8", "T10 D20"],
    69: ["T15 D12", "T19 D6"],
    68: ["T20 D4", "T16 D10"],
    67: ["T17 D8"],
    66: ["T10 D18"],
    65: ["T11 D16", "T19 D4"],
    64: ["T16 D8", "T12 D14"],
    63: ["T13 D12"],
    62: ["T10 D16"],
    61: ["T15 D8"],
    60: ["20 D20"],
    59: ["19 D20"],
    58: ["18 D20"],
    57: ["17 D20"],
    56: ["16 D20"],
    55: ["15 D20"],
    54: ["14 D20"],
    53: ["13 D20"],
    52: ["12 D20", "20 D16"],
    51: ["19 D16", "11 D20"],
    50: ["Bullseye", "10 D20"],
    49: ["17 D16", "9 D20"],
    48: ["16 D16", "8 D20"],
    47: ["15 D16", "7 D20"],
    46: ["14 D16", "6 D20"],
    45: ["13 D16", "5 D20"],
    44: ["12 D16", "4 D20"],
    43: ["11 D16", "3 D20"],
    42: ["10 D16", "2 D20"],
    41: ["9 D16", "1 D20"],
    40: ["D20", "10 D15", "8 D16"],
    39: ["7 D16", "19 D10", "3 D18"],
    38: ["D19", "18 D10", "6 D16"],
    37: ["5 D16", "17 D10", "9 D14"],
    36: ["D18", "16 D10", "4 D16"],
    35: ["3 D16", "19 D8", "15 D10"],
    34: ["D17", "14 D10", "2 D16"],
    33: ["1 D16", "17 D8", "13 D10"],
    32: ["D16", "16 D8", "12 D10"],
    31: ["15 D8", "7 D12", "11 D10"],
    30: ["D15", "10 D10", "6 D12"],
    29: ["13 D8", "5 D12", "9 D10"],
    28: ["D14", "12 D8", "4 D12"],
    27: ["11 D8", "3 D12", "19 D4"],
    26: ["D13", "10 D8", "18 D4"],
    25: ["9 D8", "1 D12", "17 D4"],
    24: ["D12", "8 D8", "16 D4"],
    23: ["7 D8", "3 D10", "15 D4"],
    22: ["D11", "6 D8", "14 D4"],
    21: ["5 D8", "13 D4", "1 D10"],
    20: ["D10", "12 D4"],
    19: ["3 D8", "11 D4"],
    18: ["D9", "10 D4", "2 D8"],
    17: ["1 D8", "9 D4"],
    16: ["D8", "8 D4"],
    15: ["7 D4", "3 D6"],
    14: ["D7", "6 D4", "2 D6"],
    13: ["5 D4", "1 D6"],
    12: ["D6", "4 D4"],
    11: ["3 D4"],
    10: ["D5", "2 D4"],
    9: ["1 D4"],
    8: ["D4"],
    7: ["3 D2"],
    6: ["D3"],
    5: ["1 D2"],
    4: ["D2"],
    3: ["1 D1"],
    2: ["D1"],
  };

  // ===== Checkout-tabell =====
  function checkoutText(score) {
    if (preferredRoutes[score]) {
      const antal = getAntalUtgangar();
      return preferredRoutes[score]
        .slice(0, antal)
        .join(' <span class="checkout-separator">|</span> ');
    }

    if (score <= 1) return "–";
    if (score > 170) return "";

    const singles = Array.from({ length: 20 }, (_, i) => (i + 1).toString());
    const doubles = Array.from({ length: 20 }, (_, i) => "D" + (i + 1));
    const triples = ["T20", "T19", "T18", "T17", "T16"];
    const allHits = [].concat(triples, singles, doubles, ["25", "Bullseye"]);
    const finishing = doubles.concat(["Bullseye"]);

    function value(hit) {
      if (hit.startsWith("D")) return 2 * parseInt(hit.slice(1));
      if (hit.startsWith("T")) return 3 * parseInt(hit.slice(1));
      if (hit === "Bullseye") return 50;
      if (hit === "25") return 25;
      return parseInt(hit);
    }

    let solutions = [];
    for (let a of finishing) {
      if (value(a) === score) solutions.push([a]);
    }
    for (let a of allHits) {
      for (let b of finishing) {
        if (value(a) + value(b) === score) solutions.push([a, b]);
      }
    }
    for (let a of allHits) {
      for (let b of allHits) {
        for (let c of finishing) {
          if (value(a) + value(b) + value(c) === score) solutions.push([a, b, c]);
        }
      }
    }

    if (!solutions.length) return "–";

    let uniq = [];
    let seen = new Set();
    for (let seq of solutions) {
      let str = seq.join(" ");
      if (!seen.has(str)) {
        seen.add(str);
        uniq.push(seq);
      }
    }

    uniq.sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      const aBull = a.join(" ").includes("Bull");
      const bBull = b.join(" ").includes("Bull");
      if (aBull !== bBull) return aBull ? 1 : -1;
      return 0;
    });

    const antal = getAntalUtgangar();
    uniq = uniq.slice(0, antal);

    return uniq.map(seq => seq.join(" ")).join(' <span class="checkout-separator">|</span> ');
  }

  playTypeSelect.addEventListener("change", () => {
    playType = playTypeSelect.value;
    if (playType === "teams") {
      teamHint.style.display = "block";
    } else {
      teamHint.style.display = "none";
    }
  });

  // ===== Dartboard logik =====
  let dartThrows = 0;
  let totalScore = 0;
  let hits = [];
  let modalTurnFinished = false;
  let stickyCheckoutRoute = null;

  const dartBoardBtn = document.getElementById('dartBoardBtn');
  const dartboard = document.getElementById('dartboard');
  const scoreDisplay = document.getElementById('score'); // New HUD element
  const modalContent = document.querySelector('.modal-content');
  const remainingScoreTextEl = document.getElementById('remainingScoreText');
  const turnScoreTextEl = document.getElementById('turnScoreText');
  const dartCountTextEl = document.getElementById('dartCountText');
  const turnHitsTextEl = document.getElementById('turnHitsText');
  const checkoutSuggestionTextEl = document.getElementById('checkoutSuggestionText');

  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  let marker;
  if (isTouchDevice) {
      marker = document.createElement('div');
      marker.className = 'marker';
      document.body.appendChild(marker);
  }

  function getCurrentPlayerRemainingScore() {
    if (playType === "individual") {
      return scores[players[turnIndex]];
    } else {
      return teamScores["Lag " + (teamTurnIndex + 1)];
    }
  }

  function openDartboardModal() {
    const dartModal = document.getElementById('dartModal');
    dartModal.style.display = 'flex';
    dartModal.classList.remove('hidden');

    dartThrows = 0;
    totalScore = 0;
    hits = [];
    modalTurnFinished = false;

    if (scoreDisplay) {
        scoreDisplay.textContent = 'Last Hit: -';
    }

    if (isTouchDevice && marker) {
        marker.style.display = 'none';
    }

    const initialScore = getCurrentPlayerRemainingScore();
    const initialCheckout = checkoutText(initialScore);
    stickyCheckoutRoute = initialCheckout ? initialCheckout.split(' <span class="checkout-separator">|</span> ')[0].split(' ') : null;

    updateScoreDisplay();
  }

  if (dartBoardBtn) {
    dartBoardBtn.addEventListener('click', openDartboardModal);
    dartBoardBtn.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openDartboardModal()));
  }

  document.getElementById('closeModal').addEventListener('click', () => {
    const dartModal = document.getElementById('dartModal');
    if (dartModal) {
      dartModal.classList.add('hidden');
      document.getElementById('score').value = totalScore;
      submitScore();
    }
  });

  function getRelativeOffset() {
      return window.innerHeight * 0.075; // Ökat från 0.05 till 0.075 för större offset
  }

  function getSvgCoords(clientX, clientY) {
      const rect = dartboard.getBoundingClientRect();
      const pixelX = clientX - rect.left;
      const pixelY = clientY - rect.top;
      const svgX = (pixelX / rect.width) * 453;
      const svgY = (pixelY / rect.height) * 453;
      return { x: svgX, y: svgY };
  }

  function mapHitToRouteFormat(hitLabel) {
    if (hitLabel.startsWith('S')) {
      return hitLabel.slice(1);
    }
    if (hitLabel === 'Bullseye') {
      return 'Bullseye'; // Map to itself
    }
    if (hitLabel === 'Bull') {
      return '25'; // Map 25-bull to '25'
    }
    return hitLabel; // For T, D, and Miss
  }

  function calculateHit(svgX, svgY) {
      const centerX = 226.5;
      const centerY = 226.5;
      const sectors = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
      const innerBullRadius = 6.9;
      const outerBullRadius = 16.45;
      const innerTripleRadius = 98.47;
      const outerTripleRadius = 107.55;
      const innerDoubleRadius = 161.45;
      const outerDoubleRadius = 170.55;

      const dx = svgX - centerX;
      const dy = svgY - centerY;
      const radius = Math.sqrt(dx * dx + dy * dy);

      let angle = (Math.atan2(dy, dx) * (180 / Math.PI) + 99) % 360;
      if (angle < 0) angle += 360;
      const sector = sectors[Math.floor(angle / 18)];

      if (radius <= innerBullRadius) {
          return { hitLabel: 'Bullseye', points: 50, type: 'double' };
      } else if (radius <= outerBullRadius) {
          return { hitLabel: 'Bull', points: 25, type: 'single' };
      } else if (radius > outerDoubleRadius) {
          return { hitLabel: 'Miss', points: 0, type: 'miss' };
      } else if (radius > innerDoubleRadius) {
          return { hitLabel: `D${sector}`, points: sector * 2, type: 'double' };
      } else if (radius > outerTripleRadius) {
          return { hitLabel: `S${sector}`, points: sector, type: 'single' };
      } else if (radius > innerTripleRadius) {
          return { hitLabel: `T${sector}`, points: sector * 3, type: 'triple' };
      } else {
          return { hitLabel: `S${sector}`, points: sector, type: 'single' };
      }
  }

  function recordHit(points, hitName, type) {
      if (modalTurnFinished || dartThrows >= 3) return;

      if (scoreDisplay) {
        scoreDisplay.textContent = `Last Hit: ${hitName} (${points} pts)`;
      }

      // Sticky checkout logic
      if (stickyCheckoutRoute && stickyCheckoutRoute.length > 0) {
        const routeHit = mapHitToRouteFormat(hitName);
        if (routeHit === stickyCheckoutRoute[0]) {
          stickyCheckoutRoute.shift(); // Hit was correct, remove it from the route
        } else {
          stickyCheckoutRoute = null; // Missed the route, invalidate it
        }
      }

      dartThrows++;
      totalScore += points;
      hits.push({ name: hitName, score: points, type: type });

      const remaining = getCurrentPlayerRemainingScore();
      const remainingAfterHit = remaining - totalScore;
      const isDoubleOut = type === 'double';

      if (remainingAfterHit < 0 || remainingAfterHit === 1 || (remainingAfterHit === 0 && !isDoubleOut)) {
          modalTurnFinished = true;
          updateScoreDisplay("BUST");
      } else if (remainingAfterHit === 0 && isDoubleOut) {
          modalTurnFinished = true;
          updateScoreDisplay("VINST!");
      } else {
          updateScoreDisplay();
      }
  }

  // --- Event Listeners for Aiming ---
  if (!isTouchDevice) {
      dartboard.addEventListener('click', (event) => {
          if (modalTurnFinished) return;
          const { x, y } = getSvgCoords(event.clientX, event.clientY);
          const hit = calculateHit(x, y);
          recordHit(hit.points, hit.hitLabel, hit.type);
      });
  }

  if (isTouchDevice) {
      dartboard.addEventListener('touchstart', handleTouch);
      dartboard.addEventListener('touchmove', handleTouch);
      dartboard.addEventListener('touchend', handleTouchEnd);

      function handleTouch(event) {
          if (modalTurnFinished) return;
          event.preventDefault();
          const touch = event.touches[0];
          const offset = getRelativeOffset();
          const visualX = touch.clientX;
          const visualY = touch.clientY - offset;

          marker.style.left = `${visualX - 5}px`;
          marker.style.top = `${visualY - 5}px`;
          marker.style.display = 'block';
      }

      function handleTouchEnd(event) {
          if (modalTurnFinished) return;
          const visualX = parseFloat(marker.style.left) + 5;
          const visualY = parseFloat(marker.style.top) + 5;
          const { x, y } = getSvgCoords(visualX, visualY);
          const hit = calculateHit(x, y);
          recordHit(hit.points, hit.hitLabel, hit.type);
          marker.style.display = 'none';
      }
  }

  function updateScoreDisplay(status = null) {
      const remainingAfterTurn = getCurrentPlayerRemainingScore() - totalScore;
      const displayHits = hits.map(h => h.name).join(", ");

      if (status) {
          remainingScoreTextEl.textContent = status;
          turnScoreTextEl.textContent = `(${totalScore})`;
      } else {
          remainingScoreTextEl.textContent = `Kvar: ${remainingAfterTurn}`;
          turnScoreTextEl.textContent = `Poäng: ${totalScore}`;
      }
      dartCountTextEl.textContent = `${dartThrows}/3`;
      turnHitsTextEl.textContent = `Träffar: ${displayHits || "–"}`;

      let checkout = "";
      if (!modalTurnFinished) {
        const scoreForSuggestion = getCurrentPlayerRemainingScore() - totalScore;
        if (stickyCheckoutRoute && stickyCheckoutRoute.length > 0) {
          checkout = `Ut: ${stickyCheckoutRoute.join(' ')}`;
        } else if (scoreForSuggestion >= 2 && scoreForSuggestion <= 170) {
          const suggestions = checkoutText(scoreForSuggestion);
          if (suggestions) {
            const bestRoute = suggestions.split(' <span class="checkout-separator">|</span> ')[0];
            checkout = `Ut: ${bestRoute}`;
            stickyCheckoutRoute = bestRoute.split(' '); // Set the new sticky route
          }
        }
      }
      checkoutSuggestionTextEl.innerHTML = checkout;

      if (status) {
        turnHitsTextEl.textContent = `Sista kast: ${hits.length > 0 ? hits[hits.length - 1].name : ''}`;
        checkoutSuggestionTextEl.innerHTML = "";
      }
  }

  document.getElementById('undoModal').addEventListener('click', () => {
      if (hits.length > 0) {
          stickyCheckoutRoute = null; // Reset sticky route on undo
          hits.pop();
          totalScore = hits.reduce((sum, hit) => sum + hit.score, 0);
          dartThrows = hits.length;
          modalTurnFinished = false;
          updateScoreDisplay();

          if (scoreDisplay) {
            if (hits.length > 0) {
              const lastHit = hits[hits.length - 1];
              scoreDisplay.textContent = `Last Hit: ${lastHit.name} (${lastHit.score} pts)`;
            } else {
              scoreDisplay.textContent = 'Last Hit: -';
            }
          }
      }
  });
});
