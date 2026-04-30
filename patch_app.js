const fs = require('fs');

let content = fs.readFileSync('c:\\Users\\Alex\\Desktop\\21 Day\\js\\app.js', 'utf8');

// Chunk 1
content = content.replace(
`  let challenge = {
    startDate: null,
    failedDaysCount: 0,
    lastEvaluatedDate: null,
    isActive: false,
    lastCycleCelebrated: null,
    completedCycles: 0,
    pendingStartMode: null
  };`,
`  let challenge = {
    startDate: null,
    failedDaysCount: 0,
    lastEvaluatedDate: null,
    isActive: false,
    lastCycleCelebrated: null,
    completedCycles: 0,
    pendingStartMode: null,
    xp: 0,
    currentStreak: 0,
    maxStreak: 0
  };`);

// Chunk 2
content = content.replace(
`    }
    delete completions.undefined;`,
`    }
    challenge.xp = typeof challenge.xp === "number" ? challenge.xp : 0;
    challenge.currentStreak = typeof challenge.currentStreak === "number" ? challenge.currentStreak : 0;
    challenge.maxStreak = typeof challenge.maxStreak === "number" ? challenge.maxStreak : 0;
    delete completions.undefined;`);

// Chunk 3
content = content.replace(
`    completions[dateStr]._failed = !summary.passed && summary.total > 0;

    if (completions[dateStr]._failed) {`,
`    completions[dateStr]._failed = !summary.passed && summary.total > 0;

    if (completions[dateStr]._passed) challenge.xp += 50;

    if (completions[dateStr]._failed) {`);

// Chunk 4
content = content.replace(
`      completions[today]._failed = false;
      completions[today]._passedEarly = true;
      saveCompletions();`,
`      completions[today]._failed = false;
      completions[today]._passedEarly = true;
      challenge.xp += 50;
      saveCompletions();
      saveChallenge();`);

// Chunk 5 & 6 (both match this exactly)
content = content.replaceAll(
`    challenge.isActive = false;
    challenge.lastCycleCelebrated = null;
    challenge.pendingStartMode = "reset";
    activeFailureReasonDate = null;`,
`    challenge.isActive = false;
    challenge.lastCycleCelebrated = null;
    challenge.pendingStartMode = "reset";
    challenge.currentStreak = 0;
    activeFailureReasonDate = null;`);

// Chunk 7
content = content.replace(
`    if (!completions[dateStr]) completions[dateStr] = {};
    if (isChecked) completions[dateStr][taskId] = true;
    else delete completions[dateStr][taskId];
    saveCompletions();`,
`    if (!completions[dateStr]) completions[dateStr] = {};
    if (isChecked) {
      completions[dateStr][taskId] = true;
      challenge.xp += 10;
    } else {
      delete completions[dateStr][taskId];
      challenge.xp = Math.max(0, challenge.xp - 10);
    }
    saveChallenge();
    saveCompletions();`);

// Chunk 8
content = content.replace(
`    challenge.lastCycleCelebrated = endDate;
    challenge.completedCycles += 1;
    saveChallenge();`,
`    challenge.lastCycleCelebrated = endDate;
    challenge.completedCycles += 1;
    challenge.xp += 1000;
    challenge.currentStreak += 1;
    if (challenge.currentStreak > challenge.maxStreak) challenge.maxStreak = challenge.currentStreak;
    saveChallenge();`);

// Chunk 9
content = content.replace(
`    appHeader?.classList.toggle("hidden", !isLoggedIn);
    appHeader?.classList.toggle("flex", isLoggedIn);
    appContent?.classList.toggle("hidden", !isLoggedIn);`,
`    appHeader?.classList.toggle("hidden", !isLoggedIn);
    appHeader?.classList.toggle("flex", isLoggedIn);
    appContent?.classList.toggle("hidden", !isLoggedIn);
    const badge = document.getElementById("headerGamificationBadge");
    badge?.classList.toggle("hidden", !isLoggedIn);
    badge?.classList.toggle("flex", isLoggedIn);`);

// UI Functions
const uiFuncs = `
  function getRankData(xp) {
    if (xp >= 15000) return { name: "Грандмастер", icon: "👑", nextXp: null };
    if (xp >= 7000) return { name: "Мастер", icon: "💎", nextXp: 15000, nextName: "Грандмастер", base: 7000 };
    if (xp >= 3000) return { name: "Воин", icon: "⚔️", nextXp: 7000, nextName: "Мастер", base: 3000 };
    if (xp >= 1000) return { name: "Ученик", icon: "🥈", nextXp: 3000, nextName: "Воин", base: 1000 };
    return { name: "Новичок", icon: "🥉", nextXp: 1000, nextName: "Ученик", base: 0 };
  }

  function updateGamificationUI() {
    if (!currentSupabaseUser) return;
    const rank = getRankData(challenge.xp);
    
    // Update Header Badge
    const headerRankIcon = document.getElementById("headerRankIcon");
    const headerRankName = document.getElementById("headerRankName");
    const headerStreakValue = document.getElementById("headerStreakValue");
    if (headerRankIcon) headerRankIcon.textContent = rank.icon;
    if (headerRankName) headerRankName.textContent = rank.name;
    if (headerStreakValue) headerStreakValue.textContent = challenge.currentStreak;

    // Update Profile Card
    const profileRankIcon = document.getElementById("profileRankIcon");
    const profileRankName = document.getElementById("profileRankName");
    const profileTotalXP = document.getElementById("profileTotalXP");
    const profileNextRankName = document.getElementById("profileNextRankName");
    const profileXPToNext = document.getElementById("profileXPToNext");
    const profileRankProgress = document.getElementById("profileRankProgress");
    
    const profileCurrentStreak = document.getElementById("profileCurrentStreak");
    const profileMaxStreak = document.getElementById("profileMaxStreak");
    const profileCompletedCycles = document.getElementById("profileCompletedCycles");

    if (profileRankIcon) profileRankIcon.textContent = rank.icon;
    if (profileRankName) profileRankName.textContent = rank.name;
    if (profileTotalXP) profileTotalXP.textContent = challenge.xp;
    
    if (profileCurrentStreak) profileCurrentStreak.textContent = challenge.currentStreak;
    if (profileMaxStreak) profileMaxStreak.textContent = challenge.maxStreak;
    if (profileCompletedCycles) profileCompletedCycles.textContent = challenge.completedCycles;

    if (rank.nextXp) {
      const needed = rank.nextXp - challenge.xp;
      const totalRange = rank.nextXp - rank.base;
      const currentProgress = challenge.xp - rank.base;
      const percentage = Math.max(0, Math.min(100, (currentProgress / totalRange) * 100));
      
      if (profileNextRankName) profileNextRankName.textContent = rank.nextName;
      if (profileXPToNext) profileXPToNext.textContent = needed;
      if (profileRankProgress) profileRankProgress.style.width = \`\${percentage}%\`;
    } else {
      if (profileNextRankName) profileNextRankName.textContent = "Максимальный";
      if (profileXPToNext) profileXPToNext.textContent = "0";
      if (profileRankProgress) profileRankProgress.style.width = "100%";
    }
  }
`;

content = content.replace(
  `  function renderEverything() {`,
  uiFuncs + `\n  function renderEverything() {`
);

content = content.replace(
  `    renderTomorrowTasks();
  }`,
  `    renderTomorrowTasks();
    updateGamificationUI();
  }`
);

fs.writeFileSync('c:\\Users\\Alex\\Desktop\\21 Day\\js\\app.js', content, 'utf8');
console.log("Successfully patched app.js");
