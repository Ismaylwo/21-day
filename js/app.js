// ---------- REMOTE STORAGE ----------
  const SUPABASE_URL = "https://oywwuxhsqqkjelcwuvbc.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95d3d1eGhzcXFramVsY3d1dmJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NzE5ODUsImV4cCI6MjA5MDQ0Nzk4NX0.wuKfgsA70So9szb8fh-Oi6TtvEeyEXhnrlDAcr4GXqE";
  const SUPABASE_TABLE = "discipline_user_state";
  const APP_STATE_VERSION = 2;

  const CATEGORIES = ["Work", "Family", "Health", "Learning", "Finance", "Other"];
  const FAILURE_REASONS = [
    { key: "laziness", label: "Ленивость", icon: "fa-person-walking" },
    { key: "no_time", label: "Не было времени", icon: "fa-clock" },
    { key: "tired", label: "Устал(а)", icon: "fa-battery-quarter" },
    { key: "sick", label: "Плохое самочувствие", icon: "fa-notes-medical" },
    { key: "forgot", label: "Забыл(а)", icon: "fa-brain" },
    { key: "stress", label: "Стресс / перегруз", icon: "fa-fire" },
    { key: "no_plan", label: "Не было плана", icon: "fa-list-ul" },
    { key: "distractions", label: "Отвлекся(лась)", icon: "fa-bell" },
    { key: "other", label: "Другое", icon: "fa-ellipsis" }
  ];
  const CATEGORY_ICONS = {
    Work:'<i class="fas fa-briefcase"></i>',
    Family:'<i class="fas fa-house-user"></i>',
    Health:'<i class="fas fa-heart-pulse"></i>',
    Learning:'<i class="fas fa-book-open"></i>',
    Finance:'<i class="fas fa-wallet"></i>',
    Other:'<i class="fas fa-layer-group"></i>'
  };
  const CATEGORY_LABELS = {
    Work:"Работа",
    Family:"Семья",
    Health:"Здоровье",
    Learning:"Обучение",
    Finance:"Финансы",
    Other:"Другое"
  };
  const CATEGORY_COLORS = {
    Work:"#22d3ee",
    Family:"#34d399",
    Health:"#fb7185",
    Learning:"#c084fc",
    Finance:"#fbbf24",
    Other:"#94a3b8"
  };

  let templates = [];
  let customTasks = [];
  let completions = {};
  let notes = [];
  let challenge = createEmptyChallenge();

  let categoryChart, weeklyChart, failureReasonChart, priorityChart, failureReasonTrendChart;
  let currentSelectedCategory = "Work";
  const sentReminderKeys = new Set();
  let supabaseMeta = { lastRemoteUpdatedAt: null };
  let supabaseClient = null;
  let currentSupabaseUser = null;
  let supabaseSyncTimer = null;
  let suppressCloudSync = false;
  let activeStudyNoteId = null;
  let isStudyAnswerVisible = false;
  let isStudyModalOpen = false;
  const DEFAULT_ACTIVE_VIEW = "today";
  const ACTIVE_VIEWS = new Set(["today", "tomorrow", "stats"]);
  let activeView = DEFAULT_ACTIVE_VIEW;
  let activeFailureReasonDate = null;
  let dismissedFailureReasonDate = null;

  function formatDateLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateLocal(dateStr) {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function addDaysToDateStr(dateStr, days) {
    const date = parseDateLocal(dateStr);
    date.setDate(date.getDate() + days);
    return formatDateLocal(date);
  }

  function formatDisplayDate(dateStr) {
    const date = parseDateLocal(dateStr);
    if (!date) return "—";
    return date.toLocaleDateString("ru-RU");
  }

  function getCategoryLabel(categoryKey) {
    return CATEGORY_LABELS[categoryKey] || categoryKey;
  }

  function parseCategoryInput(value, fallback) {
    const trimmed = (value || "").trim();
    if (CATEGORIES.includes(trimmed)) return trimmed;
    const found = Object.entries(CATEGORY_LABELS).find(([, label]) => label.toLowerCase() === trimmed.toLowerCase());
    return found ? found[0] : fallback;
  }

  function daysBetween(startDateStr, endDateStr) {
    const start = parseDateLocal(startDateStr);
    const end = parseDateLocal(endDateStr);
    return Math.round((end - start) / 86400000);
  }

  function todayStr() { return formatDateLocal(new Date()); }
  function hasStoredTasks() { return templates.length > 0 || customTasks.length > 0; }
  function isCyclePending() { return Boolean(challenge.startDate && todayStr() < challenge.startDate); }
  function getChallengeEndDate() { return challenge.startDate ? addDaysToDateStr(challenge.startDate, 20) : null; }
  function isDayLocked(dateStr) { return Boolean(completions[dateStr] && completions[dateStr]._evaluated); }
  function getCycleStartMode() {
    if (challenge.pendingStartMode === "reset" || challenge.pendingStartMode === "completed") {
      return challenge.pendingStartMode;
    }
    if (!challenge.isActive && hasStoredTasks()) {
      return "first";
    }
    return null;
  }
  function getDisplayedCycleDay() {
    if (!challenge.startDate || !challenge.isActive) return 0;
    const diff = daysBetween(challenge.startDate, todayStr());
    if (diff < 0) return 0;
    return Math.min(diff + 1, 21);
  }

  function createEmptyChallenge() {
    return {
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
    };
  }

  function normalizeActiveView(view) {
    return ACTIVE_VIEWS.has(view) ? view : DEFAULT_ACTIVE_VIEW;
  }

  function resetAppState() {
    templates = [];
    customTasks = [];
    completions = {};
    notes = [];
    challenge = createEmptyChallenge();
    activeStudyNoteId = null;
    isStudyAnswerVisible = false;
    isStudyModalOpen = false;
    document.getElementById("studyModal")?.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    activeFailureReasonDate = null;
    dismissedFailureReasonDate = null;
  }

  function sanitizeStoredState() {
    if (!Array.isArray(templates)) templates = [];
    if (!Array.isArray(customTasks)) customTasks = [];
    if (!Array.isArray(notes)) notes = [];
    notes = notes.map(note => {
      if (!note || typeof note !== "object") return null;
      const safe = { ...note };
      if (!Array.isArray(safe.tags)) safe.tags = [];
      safe.tags = safe.tags.map(tag => String(tag || "").trim()).filter(Boolean).slice(0, 12);
      if (safe.nextReviewAt && Number.isNaN(new Date(safe.nextReviewAt).getTime())) {
        safe.nextReviewAt = null;
      }
      if (!safe.nextReviewAt) safe.nextReviewAt = new Date().toISOString();
      return safe;
    }).filter(Boolean);
    if (!completions || typeof completions !== "object") completions = {};
    if (!challenge || typeof challenge !== "object") {
      challenge = createEmptyChallenge();
    }
    delete completions.undefined;
    Object.keys(completions).forEach(key => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        delete completions[key];
        return;
      }
      if (!completions[key] || typeof completions[key] !== "object") completions[key] = {};
      if (typeof completions[key]._failureReasonKey === "string") {
        completions[key]._failureReasonKey = completions[key]._failureReasonKey.trim();
        if (!completions[key]._failureReasonKey) delete completions[key]._failureReasonKey;
      } else {
        delete completions[key]._failureReasonKey;
      }
      if (typeof completions[key]._failureReason === "string") {
        completions[key]._failureReason = completions[key]._failureReason.trim();
        if (!completions[key]._failureReason) delete completions[key]._failureReason;
      } else {
        delete completions[key]._failureReason;
      }
      if (completions[key]._failureReasonUpdatedAt && Number.isNaN(new Date(completions[key]._failureReasonUpdatedAt).getTime())) {
        delete completions[key]._failureReasonUpdatedAt;
      }
    });
    if (!("lastCycleCelebrated" in challenge)) challenge.lastCycleCelebrated = null;
    if (!("completedCycles" in challenge)) challenge.completedCycles = 0;
    if (!("pendingStartMode" in challenge)) challenge.pendingStartMode = null;
    challenge.xp = Number.isFinite(Number(challenge.xp)) ? Math.max(0, Number(challenge.xp)) : 0;
    challenge.currentStreak = Number.isFinite(Number(challenge.currentStreak)) ? Math.max(0, Number(challenge.currentStreak)) : 0;
    challenge.maxStreak = Number.isFinite(Number(challenge.maxStreak)) ? Math.max(0, Number(challenge.maxStreak)) : 0;
    if (!["reset", "completed"].includes(challenge.pendingStartMode)) challenge.pendingStartMode = null;
    if (!challenge.isActive && challenge.pendingStartMode === null) {
      challenge.startDate = null;
      challenge.lastEvaluatedDate = null;
    }
    renderNotesPanel();
  }

  function sanitizeSupabaseMeta() {
    if (!supabaseMeta || typeof supabaseMeta !== "object") {
      supabaseMeta = { lastRemoteUpdatedAt: null };
      renderNotesPanel();
      return;
    }
    supabaseMeta.lastRemoteUpdatedAt = supabaseMeta.lastRemoteUpdatedAt || null;
  }

  function isSupabaseConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  function isSupabaseReadyForSync() {
    return Boolean(currentSupabaseUser && isSupabaseConfigured());
  }

  function setSupabaseStatus(message, tone = "neutral") {
    const status = document.getElementById("supabaseStatus");
    if (!status) return;
    status.className = "mt-3 rounded-2xl border px-4 py-3 text-sm";
    const toneClasses = {
      neutral: "border-slate-200 bg-white/80 text-slate-700",
      info: "border-cyan-200 bg-cyan-50 text-cyan-900",
      success: "border-emerald-200 bg-emerald-50 text-emerald-900",
      warning: "border-amber-200 bg-amber-50 text-amber-900",
      error: "border-rose-200 bg-rose-50 text-rose-900"
    };
    status.className += ` ${toneClasses[tone] || toneClasses.neutral}`;
    status.textContent = message;
  }

  function renderAppAccess() {
    const isLoggedIn = Boolean(currentSupabaseUser);
    const authScreen = document.getElementById("authScreen");
    const appHeader = document.getElementById("appHeader");
    const appContent = document.getElementById("appContent");
    const headerAccountCard = document.getElementById("headerAccountCard");
    const headerUserEmail = document.getElementById("headerUserEmail");
    const headerGamificationBadge = document.getElementById("headerGamificationBadge");

    authScreen?.classList.toggle("hidden", isLoggedIn);
    appHeader?.classList.toggle("hidden", !isLoggedIn);
    appHeader?.classList.toggle("flex", isLoggedIn);
    appContent?.classList.toggle("hidden", !isLoggedIn);
    headerAccountCard?.classList.toggle("hidden", !isLoggedIn);
    headerGamificationBadge?.classList.toggle("hidden", !isLoggedIn);
    headerGamificationBadge?.classList.toggle("flex", isLoggedIn);

    if (headerUserEmail) {
      headerUserEmail.textContent = isLoggedIn
        ? (currentSupabaseUser.email || currentSupabaseUser.id)
        : "аккаунт не выбран";
    }
  }

  function getSupabaseCredentials() {
    return {
      email: (document.getElementById("supabaseEmail")?.value || "").trim(),
      password: document.getElementById("supabasePassword")?.value || ""
    };
  }

  function setAccountButtonsBusy(isBusy, activeButtonId = null) {
    const buttonIds = [
      "supabaseRegisterBtn",
      "supabaseLoginBtn",
      "supabaseLogoutBtn",
      "headerRestartCycleBtn",
      "headerLogoutBtn"
    ];

    buttonIds.forEach(id => {
      const button = document.getElementById(id);
      if (!button) return;
      button.disabled = isBusy ? id !== activeButtonId : false;
      button.classList.toggle("opacity-60", isBusy && id !== activeButtonId);
      button.classList.toggle("cursor-wait", isBusy && id === activeButtonId);
    });
  }

  function renderSupabaseSettings() {
    const info = document.getElementById("supabaseUserInfo");
    const registerBtn = document.getElementById("supabaseRegisterBtn");
    const loginBtn = document.getElementById("supabaseLoginBtn");
    const logoutBtn = document.getElementById("supabaseLogoutBtn");
    const restartCycleBtn = document.getElementById("headerRestartCycleBtn");
    const noteTitleInput = document.getElementById("noteTitle");
    const noteContentInput = document.getElementById("noteContent");
    const addNoteBtn = document.getElementById("addNoteBtn");
    const studyRandomNoteBtn = document.getElementById("studyRandomNoteBtn");

    if (registerBtn) registerBtn.disabled = false;
    if (loginBtn) loginBtn.disabled = false;
    if (logoutBtn) logoutBtn.disabled = false;
    if (restartCycleBtn) restartCycleBtn.disabled = !currentSupabaseUser;
    if (noteTitleInput) noteTitleInput.disabled = !currentSupabaseUser;
    if (noteContentInput) noteContentInput.disabled = !currentSupabaseUser;
    if (addNoteBtn) addNoteBtn.disabled = !currentSupabaseUser;
    if (studyRandomNoteBtn) studyRandomNoteBtn.disabled = !currentSupabaseUser;

    if (!currentSupabaseUser) {
      if (info) info.textContent = "После входа твои задачи и прогресс будут сохраняться в аккаунте.";
      setSupabaseStatus("Войди или создай аккаунт, чтобы сохранить свой прогресс.", "neutral");
      renderAppAccess();
      renderNotesPanel();
      return;
    }

    const lastSyncText = supabaseMeta.lastRemoteUpdatedAt
      ? ` Последнее сохранение: ${new Date(supabaseMeta.lastRemoteUpdatedAt).toLocaleString("ru-RU")}.`
      : "";
    if (info) info.textContent = `Текущий пользователь: ${currentSupabaseUser.email || currentSupabaseUser.id}`;
    setSupabaseStatus(`Вход выполнен. Твой прогресс сохраняется в аккаунте.${lastSyncText}`, "success");
    renderAppAccess();
    renderNotesPanel();
  }

  function scheduleSupabaseSync() {
    if (suppressCloudSync || !isSupabaseReadyForSync()) return;
    window.clearTimeout(supabaseSyncTimer);
    supabaseSyncTimer = window.setTimeout(() => {
      pushStateToSupabase({ silent: true }).catch(() => {});
    }, 900);
  }

  function saveRemoteState() {
    scheduleSupabaseSync();
  }
  const saveTemplates = saveRemoteState;
  const saveCustom = saveRemoteState;
  const saveCompletions = saveRemoteState;
  const saveNotes = saveRemoteState;
  const saveChallenge = saveRemoteState;
  const savePreferences = saveRemoteState;

  function createStatePayload() {
    return {
      version: APP_STATE_VERSION,
      savedAt: new Date().toISOString(),
      data: {
        templates,
        customTasks,
        completions,
        notes,
        challenge,
        preferences: {
          activeView
        }
      }
    };
  }

  function getSupabaseClient() {
    if (!isSupabaseConfigured()) throw new Error("Сервис сохранения недоступен.");
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Не удалось запустить сервис сохранения.");
    }
    if (supabaseClient) return supabaseClient;

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    return supabaseClient;
  }

  function getFriendlySupabaseError(error) {
    const message = error && error.message ? error.message : String(error || "Неизвестная ошибка");
    if (/Failed to fetch/i.test(message)) return "Не удалось подключиться к сервису сохранения. Проверь интернет.";
    if (/Invalid login credentials/i.test(message)) return "Неверный email или пароль.";
    if (/Email not confirmed/i.test(message)) return "Почта ещё не подтверждена. Проверь email или отключи подтверждение в настройках Auth.";
    if (/User already registered/i.test(message)) return "Пользователь с таким email уже существует. Просто войди.";
    if (/Password should be at least/i.test(message)) return "Пароль слишком короткий. Нужен минимум 6 символов.";
    if (/row-level security/i.test(message)) return "Сохранение временно недоступно. Попробуй позже.";
    if (/relation .* does not exist/i.test(message) || /Could not find the table/i.test(message)) return "Сохранение временно недоступно. Попробуй позже.";
    return message;
  }

  async function fetchStateFromSupabase() {
    if (!currentSupabaseUser) throw new Error("Сначала войди в аккаунт.");
    const client = getSupabaseClient();
    const { data, error } = await client
      .from(SUPABASE_TABLE)
      .select("user_id, payload, updated_at")
      .eq("user_id", currentSupabaseUser.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function pushStateToSupabase(options = {}) {
    const { silent = false } = options;
    if (!currentSupabaseUser) throw new Error("Сначала войди в аккаунт.");
    const client = getSupabaseClient();
    const payload = createStatePayload();
    const updatedAt = new Date().toISOString();

    const { error } = await client
      .from(SUPABASE_TABLE)
      .upsert({
        user_id: currentSupabaseUser.id,
        payload,
        updated_at: updatedAt
      }, { onConflict: "user_id" });

    if (error) throw error;

    supabaseMeta.lastRemoteUpdatedAt = updatedAt;
    renderSupabaseSettings();
    if (!silent) showMotivation("Прогресс сохранён.");
    return true;
  }

  async function pullStateFromSupabase(options = {}) {
    const { silent = false } = options;
    const row = await fetchStateFromSupabase();
    if (!row || !row.payload) {
      setSupabaseStatus("Для этого аккаунта пока нет сохранённого прогресса.", "warning");
      if (!silent) showMotivation("Сохранённых данных пока нет.");
      return false;
    }

    supabaseMeta.lastRemoteUpdatedAt = row.updated_at || null;
    renderSupabaseSettings();
    applyStatePayload(row.payload, {
      toastMessage: silent ? null : "Прогресс загружен."
    });
    return true;
  }

  async function syncStateAfterAuth() {
    if (!currentSupabaseUser) {
      resetAppState();
      renderSupabaseSettings();
      renderEverything();
      return;
    }

    try {
      const remoteState = await fetchStateFromSupabase();

      if (remoteState && remoteState.payload) {
        await pullStateFromSupabase({ silent: true });
        showMotivation("Прогресс загружен.");
        return;
      }

      resetAppState();
      supabaseMeta.lastRemoteUpdatedAt = null;
      renderSupabaseSettings();
      renderEverything();
      showMotivation("Аккаунт подключен. Можно начинать новый цикл.");
    } catch (error) {
      setSupabaseStatus(getFriendlySupabaseError(error), "error");
      showMotivation(getFriendlySupabaseError(error));
    }
  }

  async function registerSupabaseUser() {
    const { email, password } = getSupabaseCredentials();
    if (!email || !password) {
      showMotivation("Для регистрации нужны email и пароль.");
      return;
    }

    setAccountButtonsBusy(true, "supabaseRegisterBtn");
    setSupabaseStatus("Создаю аккаунт...", "info");
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.href
        }
      });
      if (error) throw error;
      currentSupabaseUser = data.user || null;
      renderSupabaseSettings();
      if (data.session) {
        await syncStateAfterAuth();
      } else {
        setSupabaseStatus("Аккаунт создан. Если письмо с подтверждением включено, сначала подтверди почту, затем войди.", "warning");
        showMotivation("Аккаунт создан. При необходимости подтверди почту и войди.");
      }
    } catch (error) {
      setSupabaseStatus(getFriendlySupabaseError(error), "error");
      showMotivation(getFriendlySupabaseError(error));
    } finally {
      setAccountButtonsBusy(false);
    }
  }

  async function loginSupabaseUser() {
    const { email, password } = getSupabaseCredentials();
    if (!email || !password) {
      showMotivation("Для входа нужны email и пароль.");
      return;
    }

    setAccountButtonsBusy(true, "supabaseLoginBtn");
    setSupabaseStatus("Выполняю вход...", "info");
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentSupabaseUser = data.user || null;
      await syncStateAfterAuth();
      showMotivation("Вход выполнен.");
    } catch (error) {
      setSupabaseStatus(getFriendlySupabaseError(error), "error");
      showMotivation(getFriendlySupabaseError(error));
    } finally {
      setAccountButtonsBusy(false);
    }
  }

  async function logoutSupabaseUser() {
    if (!currentSupabaseUser) {
      showMotivation("Сейчас нет активного входа.");
      return;
    }

    setAccountButtonsBusy(true, "supabaseLogoutBtn");
    setSupabaseStatus("Выполняю выход...", "info");
    try {
      const client = getSupabaseClient();
      const { error } = await client.auth.signOut();
      if (error) throw error;
      currentSupabaseUser = null;
      resetAppState();
      renderSupabaseSettings();
      renderEverything();
      showMotivation("Выход выполнен.");
    } catch (error) {
      setSupabaseStatus(getFriendlySupabaseError(error), "error");
      showMotivation(getFriendlySupabaseError(error));
    } finally {
      setAccountButtonsBusy(false);
    }
  }

  async function initializeSupabaseIfNeeded() {
    renderSupabaseSettings();
    if (!isSupabaseConfigured()) return;

    try {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      currentSupabaseUser = data.session?.user || null;
      renderSupabaseSettings();

      client.auth.onAuthStateChange(async (_event, session) => {
        currentSupabaseUser = session?.user || null;
        renderSupabaseSettings();
        if (currentSupabaseUser) {
          await syncStateAfterAuth();
        } else {
          resetAppState();
          renderEverything();
        }
      });

      if (currentSupabaseUser) {
        await syncStateAfterAuth();
      } else {
        resetAppState();
        renderEverything();
      }
    } catch (error) {
      setSupabaseStatus(getFriendlySupabaseError(error), "error");
    }
  }

  function applyStatePayload(payload, options = {}) {
    const { toastMessage = "Данные аккаунта загружены." } = options;
    if (!payload || typeof payload !== "object") throw new Error("Некорректный файл.");
    const source = payload.data && typeof payload.data === "object" ? payload.data : payload;

    templates = Array.isArray(source.templates) ? source.templates : [];
    customTasks = Array.isArray(source.customTasks) ? source.customTasks : [];
    completions = source.completions && typeof source.completions === "object" ? source.completions : {};
    notes = Array.isArray(source.notes) ? source.notes : [];
    challenge = source.challenge && typeof source.challenge === "object"
      ? source.challenge
      : createEmptyChallenge();
    const preferences = source.preferences && typeof source.preferences === "object" ? source.preferences : {};

    sanitizeStoredState();
    renderCategoryButtons();
    renderEverything();
    setActiveView(preferences.activeView, { sync: false });
    if (toastMessage) showMotivation(toastMessage);
  }

  function formatDateTimeDisplay(dateStr) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU");
  }

  function formatTextWithBreaks(text) {
    return escapeHtml(text || "").replace(/\n/g, "<br>");
  }

  function getFailureReasonOption(key) {
    return FAILURE_REASONS.find(option => option.key === key) || null;
  }

  function normalizeFailureReasonKey(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return "";
    const direct = getFailureReasonOption(trimmed);
    if (direct) return direct.key;
    const byLabel = FAILURE_REASONS.find(option => option.label.toLowerCase() === trimmed.toLowerCase());
    return byLabel ? byLabel.key : "";
  }

  function getFailureReasonLabel(dateStr) {
    const entry = completions?.[dateStr] || {};
    const key = typeof entry._failureReasonKey === "string" ? entry._failureReasonKey.trim() : "";
    if (key) return getFailureReasonOption(key)?.label || "Другое";
    const legacy = typeof entry._failureReason === "string" ? entry._failureReason.trim() : "";
    return legacy;
  }

  function getFailureReasonKey(dateStr) {
    const entry = completions?.[dateStr] || {};
    const key = typeof entry._failureReasonKey === "string" ? entry._failureReasonKey.trim() : "";
    if (key) return key;
    const legacy = typeof entry._failureReason === "string" ? entry._failureReason.trim() : "";
    return normalizeFailureReasonKey(legacy);
  }

  function getFailureReason(dateStr) {
    return getFailureReasonLabel(dateStr) || "";
  }

  function saveFailureReason(dateStr, reason) {
    if (!dateStr || !completions[dateStr]) return;
    const raw = (reason || "").trim();
    const key = normalizeFailureReasonKey(raw) || raw;
    const option = getFailureReasonOption(key);
    if (option) {
      completions[dateStr]._failureReasonKey = option.key;
      completions[dateStr]._failureReason = option.label;
      completions[dateStr]._failureReasonUpdatedAt = new Date().toISOString();
    } else if (raw) {
      // legacy free text (keep for backward compatibility)
      completions[dateStr]._failureReason = raw;
      delete completions[dateStr]._failureReasonKey;
      completions[dateStr]._failureReasonUpdatedAt = new Date().toISOString();
    } else {
      delete completions[dateStr]._failureReason;
      delete completions[dateStr]._failureReasonKey;
      delete completions[dateStr]._failureReasonUpdatedAt;
    }
    saveCompletions();
  }

  function setActiveView(view, options = {}) {
    const { sync = true } = options;
    activeView = normalizeActiveView(view);
    if (sync) savePreferences();

    const todayViewEl = document.getElementById("todayView");
    const tomorrowViewEl = document.getElementById("tomorrowView");
    const statsViewEl = document.getElementById("statsView");
    todayViewEl?.classList.toggle("hidden", activeView !== "today");
    tomorrowViewEl?.classList.toggle("hidden", activeView !== "tomorrow");
    statsViewEl?.classList.toggle("hidden", activeView !== "stats");

    const todayBtn = document.getElementById("navTodayBottomBtn");
    const tomorrowBtn = document.getElementById("navTomorrowBottomBtn");
    const statsBtn = document.getElementById("navStatsBottomBtn");

    if (todayBtn && tomorrowBtn && statsBtn) {
      [todayBtn, tomorrowBtn, statsBtn].forEach(btn => btn.classList.remove("active"));
      if (activeView === "today") todayBtn.classList.add("active");
      else if (activeView === "tomorrow") tomorrowBtn.classList.add("active");
      else if (activeView === "stats") statsBtn.classList.add("active");
    }

    if (activeView === "stats") {
      window.setTimeout(() => {
        try { renderAnalytics(); } catch (_) {}
      }, 0);
    }
    if (activeView === "tomorrow") {
      window.setTimeout(() => {
        try { renderTomorrowTasks(); } catch (_) {}
      }, 0);
    }
  }

  function getNoteById(noteId) {
    return notes.find(note => note.id === noteId) || null;
  }

  function normalizeTagsInput(raw) {
    return (raw || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function getNotesSearchQuery() {
    return (document.getElementById("notesSearch")?.value || "").trim().toLowerCase();
  }

  function noteMatchesQuery(note, query) {
    if (!query) return true;
    const hay = [
      note.title || "",
      note.content || "",
      Array.isArray(note.tags) ? note.tags.join(" ") : ""
    ].join(" ").toLowerCase();
    return hay.includes(query);
  }

  function addNote() {
    if (!currentSupabaseUser) {
      showMotivation("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u043e\u0439\u0434\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442.");
      return;
    }
    const titleInput = document.getElementById("noteTitle");
    const tagsInput = document.getElementById("noteTags");
    const contentInput = document.getElementById("noteContent");
    const title = titleInput?.value.trim() || "";
    const content = contentInput?.value.trim() || "";
    const tags = normalizeTagsInput(tagsInput?.value || "");

    if (!title || !content) {
      showMotivation("Заполни заголовок и текст заметки.");
      return;
    }

    notes.unshift({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      content,
      tags,
      createdAt: new Date().toISOString(),
      lastReviewedAt: null,
      reviewCount: 0,
      nextReviewAt: new Date().toISOString()
    });

    saveNotes();
    if (titleInput) titleInput.value = "";
    if (tagsInput) tagsInput.value = "";
    if (contentInput) contentInput.value = "";
    renderNotesPanel();
    showMotivation("Заметка сохранена.");
  }

  function editNote(noteId) {
    if (!currentSupabaseUser) {
      showMotivation("Сначала войди в аккаунт.");
      return;
    }
    const note = getNoteById(noteId);
    if (!note) return;
    const newTitle = prompt("Заголовок заметки:", note.title || "");
    if (newTitle === null) return;
    const newTags = prompt("Теги (через запятую):", Array.isArray(note.tags) ? note.tags.join(", ") : "");
    if (newTags === null) return;
    const newContent = prompt("Текст заметки:", note.content || "");
    if (newContent === null) return;
    if (!newTitle.trim() || !newContent.trim()) {
      showMotivation("Заголовок и текст не могут быть пустыми.");
      return;
    }
    note.title = newTitle.trim();
    note.tags = normalizeTagsInput(newTags);
    note.content = newContent.trim();
    saveNotes();
    renderNotesPanel();
    showMotivation("Заметка обновлена.");
  }

  function deleteNote(noteId) {
    if (!currentSupabaseUser) {
      showMotivation("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u043e\u0439\u0434\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442.");
      return;
    }
    notes = notes.filter(note => note.id !== noteId);
    if (activeStudyNoteId === noteId) {
      activeStudyNoteId = null;
      isStudyAnswerVisible = false;
    }
    saveNotes();
    renderNotesPanel();
    showMotivation("Заметка удалена.");
  }

  function openStudyModal() {
    isStudyModalOpen = true;
    document.getElementById("studyModal")?.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  }

  function closeStudyModal() {
    isStudyModalOpen = false;
    document.getElementById("studyModal")?.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }

  function renderStudyModal() {
    if (!isStudyModalOpen || !activeStudyNoteId) return;
    const note = getNoteById(activeStudyNoteId);
    if (!note) return;

    const title = document.getElementById("studyModalTitle");
    const body = document.getElementById("studyModalBody");
    const meta = document.getElementById("studyModalMeta");
    if (title) title.textContent = note.title || "Без названия";
    if (body) {
      body.innerHTML = isStudyAnswerVisible
        ? formatTextWithBreaks(note.content)
        : '<span class="text-slate-500">Попробуй сначала вспомнить заметку сам, затем нажми “Показать”.</span>';
    }
    if (meta) {
      const next = note.nextReviewAt ? formatDateTimeDisplay(note.nextReviewAt) : "—";
      meta.textContent = `Повторений: ${Number(note.reviewCount || 0)} · Последний раз: ${note.lastReviewedAt ? formatDateTimeDisplay(note.lastReviewedAt) : "ещё не повторял"} · Следующее повторение: ${next}`;
    }

    const revealBtn = document.getElementById("studyRevealBtn");
    const difficultyRow = document.getElementById("studyDifficultyRow");
    if (revealBtn) revealBtn.classList.toggle("hidden", isStudyAnswerVisible);
    if (difficultyRow) difficultyRow.classList.toggle("hidden", !isStudyAnswerVisible);
  }

  function startStudyNote(noteId = null) {
    if (!currentSupabaseUser) {
      showMotivation("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u043e\u0439\u0434\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442.");
      return;
    }
    if (notes.length === 0) {
      showMotivation("Сначала добавь хотя бы одну заметку.");
      return;
    }

    if (!noteId) {
      const now = Date.now();
      const dueNotes = notes.filter(note => {
        if (!note || !note.id) return false;
        const nextAt = note.nextReviewAt ? new Date(note.nextReviewAt).getTime() : 0;
        return Number.isFinite(nextAt) ? nextAt <= now : true;
      });
      const pool = dueNotes.length ? dueNotes : notes;
      const randomNote = pool[Math.floor(Math.random() * pool.length)];
      noteId = randomNote.id;
    }

    activeStudyNoteId = noteId;
    isStudyAnswerVisible = false;
    openStudyModal();
    renderStudyModal();
  }

  function revealStudyNote() {
    if (!activeStudyNoteId) return;
    isStudyAnswerVisible = true;
    renderStudyModal();
  }

  function markNoteReviewed(noteId) {
    if (!currentSupabaseUser) {
      showMotivation("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u043e\u0439\u0434\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442.");
      return;
    }
    const note = getNoteById(noteId);
    if (!note) return;
    note.lastReviewedAt = new Date().toISOString();
    note.reviewCount = Number(note.reviewCount || 0) + 1;
    saveNotes();
    isStudyAnswerVisible = false;
    renderStudyModal();
    showMotivation("Повторение заметки отмечено.");
  }

  function scheduleNextReview(note, difficulty) {
    const now = new Date();
    const days = difficulty === "easy" ? 7 : difficulty === "hard" ? 1 : 3;
    const next = new Date(now);
    next.setDate(next.getDate() + days);
    note.nextReviewAt = next.toISOString();
  }

  function markNoteReviewedWithDifficulty(noteId, difficulty = "normal") {
    if (!currentSupabaseUser) {
      showMotivation("Сначала войди в аккаунт.");
      return;
    }
    const note = getNoteById(noteId);
    if (!note) return;
    note.lastReviewedAt = new Date().toISOString();
    note.reviewCount = Number(note.reviewCount || 0) + 1;
    scheduleNextReview(note, difficulty);
    saveNotes();
    isStudyAnswerVisible = false;
    renderStudyModal();
    renderNotesPanel();
    showMotivation("Повторение отмечено.");
  }

  function renderNotesPanel() {
    const studyCard = document.getElementById("noteStudyCard");
    const container = document.getElementById("notesContainer");
    if (!studyCard || !container) return;

    if (!currentSupabaseUser) {
      activeStudyNoteId = null;
      isStudyAnswerVisible = false;
      studyCard.classList.add("hidden");
      studyCard.innerHTML = "";
      container.innerHTML = `<div class="text-center py-8 text-slate-500">Зайди в аккаунт, чтобы создавать и учить заметки.</div>`;
      return;
    }

    // Study is rendered in a fullscreen modal so that notes list isn't visible underneath.
    studyCard.classList.add("hidden");
    studyCard.innerHTML = "";

    const query = getNotesSearchQuery();
    const filteredNotes = notes.filter(note => noteMatchesQuery(note, query));

    if (filteredNotes.length === 0) {
      if (notes.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-slate-500">Заметок пока нет.</div>`;
      } else {
        container.innerHTML = `<div class="text-center py-8 text-slate-500">Ничего не найдено по запросу.</div>`;
      }
    } else {
      container.innerHTML = filteredNotes.map(note => `
        <div class="rounded-2xl border border-slate-200 bg-white/90 p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-semibold text-slate-900">${escapeHtml(note.title)}</h3>
                <span class="category-badge">повторений: ${Number(note.reviewCount || 0)}</span>
              </div>
              ${Array.isArray(note.tags) && note.tags.length
                ? `<div class="mt-2 flex flex-wrap gap-2">${note.tags.map(tag => `<span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">#${escapeHtml(tag)}</span>`).join("")}</div>`
                : ""
              }
              <div class="mt-2 text-sm leading-6 text-slate-700 whitespace-pre-line">${formatTextWithBreaks(note.content)}</div>
              <div class="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                <span><i class="far fa-calendar-plus mr-1"></i>${formatDateTimeDisplay(note.createdAt)}</span>
                <span><i class="fas fa-rotate mr-1"></i>${note.lastReviewedAt ? formatDateTimeDisplay(note.lastReviewedAt) : "ещё не повторял"}</span>
              </div>
            </div>
            <div class="flex gap-2">
              <button type="button" class="study-note-btn rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-100" data-note-id="${note.id}"><i class="fas fa-book-open mr-1"></i>Учить</button>
              <button type="button" class="edit-note-btn rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" data-note-id="${note.id}"><i class="fas fa-pen mr-1"></i>Изменить</button>
              <button type="button" class="delete-note-btn rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100" data-note-id="${note.id}"><i class="fas fa-trash-alt mr-1"></i>Удалить</button>
            </div>
          </div>
        </div>
      `).join("");
    }

    document.querySelectorAll(".study-note-btn").forEach(button => {
      button.addEventListener("click", () => startStudyNote(button.dataset.noteId));
    });
    document.querySelectorAll(".delete-note-btn").forEach(button => {
      button.addEventListener("click", () => {
        if (confirm("Удалить эту заметку?")) deleteNote(button.dataset.noteId);
      });
    });
    document.querySelectorAll(".edit-note-btn").forEach(button => {
      button.addEventListener("click", () => editNote(button.dataset.noteId));
    });
  }
  function initNewChallenge(resetCompletions = true, offsetDays = 0) {
    challenge.startDate = addDaysToDateStr(todayStr(), offsetDays);
    challenge.failedDaysCount = 0;
    challenge.isActive = true;
    challenge.lastEvaluatedDate = null;
    challenge.lastCycleCelebrated = null;
    challenge.pendingStartMode = null;
    activeFailureReasonDate = null;
    dismissedFailureReasonDate = null;
    if (resetCompletions) completions = {};
    saveChallenge();
    saveCompletions();
  }

  function startChallengeAtDate(dateStr) {
    const startMode = getCycleStartMode();
    if (!dateStr) {
      showMotivation("Сначала выбери дату старта.");
      return;
    }

    if (!hasStoredTasks()) {
      showMotivation("Сначала добавь хотя бы одну задачу.");
      return;
    }

    if (dateStr < todayStr()) {
      showMotivation("Дата старта не может быть в прошлом.");
      return;
    }

    if (startMode === "first" && dateStr !== todayStr()) {
      customTasks = customTasks.map(task => task.date === todayStr()
        ? { ...task, date: dateStr }
        : task);
      saveCustom();
    }

    initNewChallenge(startMode !== "first", daysBetween(todayStr(), dateStr));
    showMotivation(`Цикл назначен на ${formatDisplayDate(challenge.startDate)}.`);
    renderEverything();
  }

  function renderCycleStartPlanner() {
    const planner = document.getElementById("cycleStartPlanner");
    const eyebrow = document.getElementById("cycleStartPlannerEyebrow");
    const title = document.getElementById("cycleStartPlannerTitle");
    const text = document.getElementById("cycleStartPlannerText");
    const dateInput = document.getElementById("customCycleStartDate");
    if (!planner || !eyebrow || !title || !text || !dateInput) return;

    const startMode = getCycleStartMode();
    const shouldShow = Boolean(currentSupabaseUser && startMode);
    planner.classList.toggle("hidden", !shouldShow);
    if (!shouldShow) return;

    dateInput.min = todayStr();
    if (!dateInput.value || dateInput.value < todayStr()) dateInput.value = todayStr();

    if (startMode === "reset") {
      eyebrow.textContent = "Перезапуск цикла";
      title.textContent = "После сброса выбери новый старт";
      text.textContent = "Третий провал обнулил текущий прогресс. Задачи сохранены, теперь выбери, когда запустить новый 21-дневный цикл.";
      return;
    }

    if (startMode === "completed") {
      eyebrow.textContent = "Новый цикл";
      title.textContent = "Выбери старт после успешного завершения";
      text.textContent = "Цикл на 21 день завершен. Задачи сохранены, а новый прогресс начнется с выбранной даты.";
      return;
    }

    eyebrow.textContent = "Первый старт";
    title.textContent = "Выбери, когда начать первый цикл";
    text.textContent = "Первая задача уже добавлена. Теперь зафиксируй старт: сегодня, завтра или в выбранную дату.";
  }

  function getChallengeDayIndex(dateStr) {
    if (!challenge.startDate || !challenge.isActive) return -1;
    const diff = daysBetween(challenge.startDate, dateStr);
    if (diff < 0 || diff > 20) return -1;
    return diff;
  }

  function getTasksForDate(dateStr) {
    let tasks = [];
    // recurring templates only if date is within active cycle
    if (challenge.isActive && challenge.startDate) {
      const dayIdx = getChallengeDayIndex(dateStr);
      if (dayIdx !== -1) {
        templates.forEach(t => {
          tasks.push({
            id: `recur_${t.id}_${dateStr}`,
            templateId: t.id,
            name: t.name,
            time: t.time,
            category: t.category,
            description: t.description,
            priority: t.priority || "medium",
            estimateMin: typeof t.estimateMin === "number" ? t.estimateMin : null,
            isRecurring: true,
            date: dateStr
          });
        });
      }
    }
    // one-off tasks for exact date
    customTasks.forEach(c => {
      if (c.date === dateStr) {
        tasks.push({
          id: `custom_${c.id}`,
          customId: c.id,
          name: c.name,
          time: c.time,
          category: c.category,
          description: c.description,
          priority: c.priority || "medium",
          estimateMin: typeof c.estimateMin === "number" ? c.estimateMin : null,
          isRecurring: false,
          date: dateStr
        });
      }
    });
    const priorityWeight = priority => (priority === "high" ? 0 : priority === "medium" ? 1 : 2);
    tasks.sort((a, b) => {
      const pr = priorityWeight(a.priority) - priorityWeight(b.priority);
      if (pr !== 0) return pr;
      return (a.time || "23:59").localeCompare(b.time || "23:59");
    });
    return tasks;
  }

  // completion summary for a date
  function getDayCompletion(dateStr) {
    const tasks = getTasksForDate(dateStr);
    if (tasks.length === 0) return { completed:0, total:0, percent:0, passed:true };
    const compMap = completions[dateStr] || {};
    const completed = tasks.filter(task => Boolean(compMap[task.id])).length;
    const percent = (completed / tasks.length) * 100;
    return { completed, total: tasks.length, percent, passed: percent >= 80 };
  }

  function getCycleHistoryEntries() {
    return Array.from({ length: 21 }, (_, index) => {
      const dayNumber = index + 1;
      const dateStr = challenge.startDate ? addDaysToDateStr(challenge.startDate, index) : null;
      const summary = dateStr ? getDayCompletion(dateStr) : { completed: 0, total: 0, percent: 0, passed: false };
      const dayMeta = dateStr ? (completions[dateStr] || {}) : {};
      let status = "not_started";
      let label = "ожидает старт";

      if (dateStr) {
        if (dayMeta._evaluated) {
          status = dayMeta._failed ? "failed" : "passed";
          label = dayMeta._failed ? "провален" : "пройден";
        } else if (dateStr === todayStr()) {
          status = "today";
          label = summary.total > 0 ? `в процессе ${Math.round(summary.percent)}%` : "сегодня без задач";
        } else if (dateStr < todayStr()) {
          status = "pending_review";
          label = "ждет оценки";
        } else {
          status = "upcoming";
          label = "впереди";
        }
      } else if (getCycleStartMode()) {
        status = "planned";
        label = "дата не выбрана";
      }

      return { dayNumber, dateStr, summary, status, label };
    });
  }

  function renderCycleHistory() {
    const grid = document.getElementById("cycleHistoryGrid");
    const summary = document.getElementById("cycleHistorySummary");
    if (!grid || !summary) return;

    const entries = getCycleHistoryEntries();
    const passedCount = entries.filter(entry => entry.status === "passed").length;
    const failedCount = entries.filter(entry => entry.status === "failed").length;
    const inProgressCount = entries.filter(entry => entry.status === "today").length;

    summary.textContent = challenge.startDate
      ? `Пройдено: ${passedCount} · Провалено: ${failedCount} · Активно сейчас: ${inProgressCount}`
      : (getCycleStartMode() ? "Цикл подготовлен, но дата старта ещё не зафиксирована." : "Цикл ещё не запускался.");

    const palette = {
      passed: "border-emerald-200 bg-emerald-50 text-emerald-900",
      failed: "border-rose-200 bg-rose-50 text-rose-900",
      today: "border-cyan-200 bg-cyan-50 text-cyan-900",
      pending_review: "border-amber-200 bg-amber-50 text-amber-900",
      upcoming: "border-slate-200 bg-white text-slate-700",
      planned: "border-slate-200 bg-slate-50 text-slate-600",
      not_started: "border-slate-200 bg-slate-50 text-slate-500"
    };

    const badges = {
      passed: "Пройден",
      failed: "Провал",
      today: "Сегодня",
      pending_review: "Оценка",
      upcoming: "Впереди",
      planned: "План",
      not_started: "Ожидание"
    };

    grid.innerHTML = entries.map(entry => {
      const failureReason = entry.dateStr ? getFailureReason(entry.dateStr) : "";
      const failureReasonKey = entry.dateStr ? getFailureReasonKey(entry.dateStr) : "";
      const isFailureReasonOpen = entry.status === "failed" && activeFailureReasonDate === entry.dateStr;
      let failureReasonMarkup = "";

      if (entry.status === "failed") {
        if (failureReason) {
          failureReasonMarkup = `
            <div class="mt-4 rounded-2xl border border-rose-200 bg-white/80 p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">Причина провала</div>
                <button type="button" class="failure-reason-toggle-btn rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100" data-date="${entry.dateStr}">
                  ${isFailureReasonOpen ? "Скрыть" : "Изменить"}
                </button>
              </div>
              <div class="mt-2 text-sm font-semibold text-rose-950">${escapeHtml(failureReason)}</div>
              ${isFailureReasonOpen ? `
                <div class="mt-3">
                  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    ${FAILURE_REASONS.map(option => `
                      <button type="button"
                        class="failure-reason-pick-btn rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition ${option.key === failureReasonKey ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}"
                        data-date="${entry.dateStr}"
                        data-reason="${option.key}">
                        <i class="fas ${option.icon} mr-2"></i>${option.label}
                      </button>
                    `).join("")}
                  </div>
                  <div class="mt-2">
                    <button type="button" class="clear-failure-reason-btn rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" data-date="${entry.dateStr}">Удалить причину</button>
                  </div>
                </div>
              ` : ""}
            </div>
          `;
        } else {
          failureReasonMarkup = `
            <div class="mt-4 rounded-2xl border border-dashed border-rose-300 bg-white/75 p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="text-sm text-rose-900">Выбери причину провала (без текста), чтобы отслеживать статистику.</div>
                <button type="button" class="failure-reason-toggle-btn rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100" data-date="${entry.dateStr}">
                  ${isFailureReasonOpen ? "Скрыть" : "Указать причину"}
                </button>
              </div>
              ${isFailureReasonOpen ? `
                <div class="mt-3">
                  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    ${FAILURE_REASONS.map(option => `
                      <button type="button"
                        class="failure-reason-pick-btn rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        data-date="${entry.dateStr}"
                        data-reason="${option.key}">
                        <i class="fas ${option.icon} mr-2"></i>${option.label}
                      </button>
                    `).join("")}
                  </div>
                  <div class="mt-2">
                    <button type="button" class="dismiss-failure-reason-btn rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" data-date="${entry.dateStr}">Позже</button>
                  </div>
                </div>
              ` : ""}
            </div>
          `;
        }
      }

      return `
        <div class="rounded-2xl border px-4 py-4 ${palette[entry.status]}" title="${entry.label}">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">День ${entry.dayNumber}</div>
              <div class="mt-2 text-sm font-semibold">${entry.dateStr ? formatDisplayDate(entry.dateStr) : "дата не выбрана"}</div>
            </div>
            <span class="rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]">${badges[entry.status]}</span>
          </div>
          <div class="mt-3 text-sm">${entry.label}</div>
          <div class="mt-3 flex flex-wrap gap-3 text-xs opacity-80">
            <span>задач: ${entry.summary.total}</span>
            <span>выполнено: ${entry.summary.completed}</span>
            <span>${Math.round(entry.summary.percent)}%</span>
          </div>
          ${failureReasonMarkup}
        </div>
      `;
    }).join("");

    grid.querySelectorAll(".failure-reason-toggle-btn").forEach(button => {
      button.addEventListener("click", () => {
        const dateStr = button.dataset.date;
        if (!dateStr) return;
        activeFailureReasonDate = activeFailureReasonDate === dateStr ? null : dateStr;
        if (activeFailureReasonDate === dateStr) dismissedFailureReasonDate = null;
        renderCycleHistory();
      });
    });

    grid.querySelectorAll(".dismiss-failure-reason-btn").forEach(button => {
      button.addEventListener("click", () => {
        dismissedFailureReasonDate = button.dataset.date || null;
        activeFailureReasonDate = null;
        renderCycleHistory();
      });
    });

    grid.querySelectorAll(".failure-reason-pick-btn").forEach(button => {
      button.addEventListener("click", () => {
        const dateStr = button.dataset.date;
        const reasonKey = button.dataset.reason;
        if (!dateStr || !reasonKey) return;
        saveFailureReason(dateStr, reasonKey);
        activeFailureReasonDate = null;
        dismissedFailureReasonDate = null;
        showMotivation("Причина провала сохранена.");
        renderCycleHistory();
        renderAnalytics();
      });
    });

    grid.querySelectorAll(".clear-failure-reason-btn").forEach(button => {
      button.addEventListener("click", () => {
        const dateStr = button.dataset.date;
        saveFailureReason(dateStr, "");
        activeFailureReasonDate = dateStr;
        showMotivation("Причина провала удалена.");
        renderCycleHistory();
        renderAnalytics();
      });
    });
  }

  function evaluateDay(dateStr) {
    const dayIdx = getChallengeDayIndex(dateStr);
    if (dayIdx === -1) return { evaluated:false, failed:false, reset:false };
    completions[dateStr] = completions[dateStr] || {};
    if (completions[dateStr]._evaluated) return { evaluated:false, failed:false, reset:false };

    const summary = getDayCompletion(dateStr);
    completions[dateStr]._evaluated = true;
    completions[dateStr]._passed = summary.passed;
    completions[dateStr]._failed = !summary.passed && summary.total > 0;

    if (completions[dateStr]._passed) challenge.xp += 50;

    if (completions[dateStr]._failed) {
      challenge.failedDaysCount++;
      if (!getFailureReason(dateStr) && dismissedFailureReasonDate !== dateStr) {
        activeFailureReasonDate = dateStr;
      }
    }

    saveCompletions();
    saveChallenge();

    if (challenge.failedDaysCount >= 3) {
      hardResetProgress();
      return { evaluated:true, failed:true, reset:true };
    }

    return { evaluated:true, failed:completions[dateStr]._failed, reset:false };
  }

  function evaluateMissedDays() {
    if (!challenge.isActive || !challenge.startDate) return;
    const today = todayStr();
    if (today <= challenge.startDate) return;

    const lastDateToEvaluate = [addDaysToDateStr(today, -1), getChallengeEndDate()].sort()[0];
    let cursor = challenge.lastEvaluatedDate ? addDaysToDateStr(challenge.lastEvaluatedDate, 1) : challenge.startDate;
    if (cursor > lastDateToEvaluate) return;

    let processedDays = 0;
    let failedDays = 0;

    while (cursor <= lastDateToEvaluate) {
      const result = evaluateDay(cursor);
      if (result.evaluated) {
        processedDays++;
        if (result.failed) failedDays++;
      }
      if (result.reset) {
        showMotivation("Третий провал достигнут. Прогресс сброшен. Выбери новую дату старта цикла.");
        return;
      }
      challenge.lastEvaluatedDate = cursor;
      cursor = addDaysToDateStr(cursor, 1);
    }

    saveChallenge();
    if (processedDays > 0) {
      showMotivation(`Проверено пропущенных дней: ${processedDays}. Провалов: ${failedDays}.`);
    }
  }

  function evaluateTodayIfComplete() {
    const today = todayStr();
    const dayIdx = getChallengeDayIndex(today);
    if (dayIdx === -1 || isDayLocked(today)) return false;
    const { completed, total } = getDayCompletion(today);
    if (total === 0) return false;

    if (completed === total) {
      completions[today] = completions[today] || {};
      completions[today]._evaluated = true;
      completions[today]._passed = true;
      completions[today]._failed = false;
      completions[today]._passedEarly = true;
      challenge.xp += 50;
      saveCompletions();
      saveChallenge();
      showMotivation(`День ${dayIdx + 1} закрыт досрочно. Все задачи выполнены.`);
      if (typeof confetti !== "undefined") {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      }
      return true;
    }

    return false;
  }

  function hardResetProgress() {
    completions = {};
    challenge.startDate = null;
    challenge.failedDaysCount = 0;
    challenge.lastEvaluatedDate = null;
    challenge.isActive = false;
    challenge.lastCycleCelebrated = null;
    challenge.pendingStartMode = "reset";
    challenge.currentStreak = 0;
    activeFailureReasonDate = null;
    dismissedFailureReasonDate = null;
    saveCompletions();
    saveChallenge();
    renderEverything();
  }

  function restartCurrentCycle() {
    if (!currentSupabaseUser) {
      showMotivation("Сначала войди в аккаунт.");
      return;
    }

    if (!challenge.isActive && !challenge.startDate) {
      showMotivation("Сейчас нет активного цикла для перезапуска.");
      return;
    }

    const shouldRestart = confirm("Начать цикл заново? Прогресс текущего цикла будет очищен, но задачи и заметки сохранятся.");
    if (!shouldRestart) return;

    completions = {};
    challenge.startDate = null;
    challenge.failedDaysCount = 0;
    challenge.lastEvaluatedDate = null;
    challenge.isActive = false;
    challenge.lastCycleCelebrated = null;
    challenge.pendingStartMode = "reset";
    challenge.currentStreak = 0;
    activeFailureReasonDate = null;
    dismissedFailureReasonDate = null;
    saveCompletions();
    saveChallenge();
    renderEverything();
    showMotivation("Текущий цикл очищен. Выбери новую дату старта.");
  }

  function addNewTask() {
    if (!currentSupabaseUser) {
      showMotivation("Сначала войди в аккаунт.");
      return;
    }
    const name = document.getElementById("taskName").value.trim();
    if (!name) { showMotivation("Название задачи обязательно."); return; }

    const today = todayStr();
    if (isDayLocked(today) && !isCyclePending()) {
      showMotivation("Сегодняшний день уже закрыт. Новые задачи можно добавить в следующий день цикла.");
      return;
    }

    const time = document.getElementById("taskTime").value || "18:00";
    const category = currentSelectedCategory;
    const desc = document.getElementById("taskDesc").value.trim();
    const recurring = document.getElementById("taskRecurring").checked;
    const priority = (document.getElementById("taskPriority")?.value || "medium").trim();
    const estimateMinRaw = document.getElementById("taskEstimateMin")?.value || "";
    const estimateMin = estimateMinRaw ? Number(estimateMinRaw) : null;

    if (recurring) {
      templates.push({
        id: Date.now() + Math.random(),
        name,
        time,
        category,
        description: desc,
        priority,
        estimateMin
      });
      saveTemplates();
    } else {
      customTasks.push({
        id: Date.now() + Math.random(),
        name,
        time,
        category,
        description: desc,
        priority,
        estimateMin,
        date: today
      });
      saveCustom();
    }

    document.getElementById("taskName").value = "";
    document.getElementById("taskTime").value = "";
    document.getElementById("taskDesc").value = "";
    document.getElementById("taskRecurring").checked = false;
    const priorityEl = document.getElementById("taskPriority");
    if (priorityEl) priorityEl.value = "medium";
    const estimateEl = document.getElementById("taskEstimateMin");
    if (estimateEl) estimateEl.value = "";

    const startMode = getCycleStartMode();
    showMotivation(recurring
      ? (startMode
          ? "Повторяющаяся задача сохранена. Теперь выбери, когда запустить цикл."
          : `Повторяющаяся задача сохранена. Цикл стартует ${formatDisplayDate(challenge.startDate)}.`)
      : (startMode
          ? "Задача сохранена. Теперь выбери, когда запустить цикл."
          : "Разовая задача добавлена на сегодня."));
    renderEverything();
  }

  function deleteTask(task) {
    if (!currentSupabaseUser) {
      showMotivation("Сначала войди в аккаунт.");
      return;
    }
    if (!task) return;
    if (!task.isRecurring && isDayLocked(task.date)) {
      showMotivation("Сегодняшний день уже закрыт. Удаление задач для него заблокировано.");
      return;
    }

    if (task.isRecurring && task.templateId) {
      templates = templates.filter(t => t.id !== task.templateId);
      saveTemplates();
      showMotivation("Повторяющаяся задача удалена из всего цикла.");
    } else if (task.customId) {
      customTasks = customTasks.filter(c => c.id !== task.customId);
      saveCustom();
      showMotivation("Разовая задача удалена.");
    }
    renderEverything();
  }

  function editTask(task) {
    if (!currentSupabaseUser) {
      showMotivation("Сначала войди в аккаунт.");
      return;
    }
    if (!task) return;
    if (!task.isRecurring && isDayLocked(task.date)) {
      showMotivation("Сегодняшний день уже закрыт. Редактирование задач для него заблокировано.");
      return;
    }

    const newName = prompt("Название задачи:", task.name);
    if (newName === null) return;
    if (!newName.trim()) { showMotivation("Название задачи не может быть пустым."); return; }

    const newTime = prompt("Время (HH:MM):", task.time || "18:00");
    if (newTime === null) return;
    let newCat = prompt(`Категория (${CATEGORIES.map(getCategoryLabel).join(", ")}):`, getCategoryLabel(task.category));
    if (newCat === null) return;
    newCat = parseCategoryInput(newCat, task.category);
    const newPriority = prompt("Приоритет (high/medium/low):", task.priority || "medium");
    if (newPriority === null) return;
    const newEstimate = prompt("Оценка времени (минуты, пусто = нет):", task.estimateMin != null ? String(task.estimateMin) : "");
    if (newEstimate === null) return;
    const newDesc = prompt("Описание:", task.description || "");
    if (newDesc === null) return;

    const normalizedPriority = ["high", "medium", "low"].includes((newPriority || "").trim())
      ? (newPriority || "").trim()
      : "medium";
    const normalizedEstimate = (newEstimate || "").trim() ? Number((newEstimate || "").trim()) : null;
    const safeEstimate = Number.isFinite(normalizedEstimate) ? Math.max(1, Math.round(normalizedEstimate)) : null;

    if (task.isRecurring && task.templateId) {
      const idx = templates.findIndex(t => t.id === task.templateId);
      if (idx !== -1) {
        templates[idx].name = newName.trim();
        templates[idx].time = newTime || "18:00";
        templates[idx].category = newCat;
        templates[idx].priority = normalizedPriority;
        templates[idx].estimateMin = safeEstimate;
        templates[idx].description = newDesc;
        saveTemplates();
      }
    } else if (task.customId) {
      const idx = customTasks.findIndex(c => c.id === task.customId);
      if (idx !== -1) {
        customTasks[idx].name = newName.trim();
        customTasks[idx].time = newTime || "18:00";
        customTasks[idx].category = newCat;
        customTasks[idx].priority = normalizedPriority;
        customTasks[idx].estimateMin = safeEstimate;
        customTasks[idx].description = newDesc;
        saveCustom();
      }
    }
    renderEverything();
  }

  function toggleCompletion(dateStr, taskId, isChecked) {
    if (!currentSupabaseUser) {
      showMotivation("Сначала войди в аккаунт.");
      return;
    }
    if (!dateStr || !taskId || isDayLocked(dateStr)) return;
    if (!completions[dateStr]) completions[dateStr] = {};
    const wasChecked = Boolean(completions[dateStr][taskId]);
    if (isChecked) {
      completions[dateStr][taskId] = true;
      if (!wasChecked) challenge.xp += 10;
    } else {
      delete completions[dateStr][taskId];
      if (wasChecked) challenge.xp = Math.max(0, challenge.xp - 10);
    }
    saveCompletions();
    saveChallenge();
    evaluateTodayIfComplete();
    renderEverything();
  }

  function getTaskByRenderedId(dateStr, taskId) {
    return getTasksForDate(dateStr).find(task => task.id === taskId) || null;
  }

  function renderCategoryButtons() {
    const container = document.getElementById("categoryButtonsContainer");
    container.innerHTML = "";
    CATEGORIES.forEach(cat => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `category-btn px-3 py-2 rounded-full text-sm font-medium transition ${currentSelectedCategory === cat ? "active" : "bg-white text-slate-700"}`;
      btn.innerHTML = `${CATEGORY_ICONS[cat]} <span class="ml-1">${getCategoryLabel(cat)}</span>`;
      btn.onclick = () => {
        currentSelectedCategory = cat;
        renderCategoryButtons();
      };
      container.appendChild(btn);
    });
  }

  function renderTaskCardMarkup(task, options = {}) {
    const dateStr = options.dateStr || todayStr();
    const done = Boolean(options.done);
    const preview = Boolean(options.preview);
    const locked = Boolean(options.locked);
    const color = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.Other;
    const checkboxMarkup = preview
      ? `<input type="checkbox" class="h-5 w-5 rounded accent-teal-400 opacity-50 cursor-not-allowed" disabled>`
      : `<input type="checkbox" class="task-toggle h-5 w-5 rounded accent-teal-400" data-task-id="${task.id}" data-date="${dateStr}" ${done ? "checked" : ""} ${locked ? "disabled" : ""}>`;
    const queuedBadge = preview
      ? '<span class="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-700">с завтрашнего дня</span>'
      : "";
    const priority = task.priority || "medium";
    const priorityBadge = priority === "high"
      ? '<span class="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-rose-700">важно</span>'
      : priority === "low"
        ? '<span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-600">низкий</span>'
        : '<span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-700">средний</span>';
    const estimateBadge = typeof task.estimateMin === "number" && task.estimateMin > 0
      ? `<span class="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-600"><i class="far fa-hourglass mr-1"></i>${task.estimateMin}м</span>`
      : "";
    const canMoveToTomorrow = !preview && !locked && !task.isRecurring && Boolean(task.customId) && dateStr === todayStr();
    const moveBtn = canMoveToTomorrow
      ? `<button class="move-to-tomorrow-btn text-slate-700 hover:text-slate-900 p-1 text-sm" title="Перенести на завтра" data-task-id="${task.id}" data-date="${dateStr}"><i class="fas fa-arrow-right-long"></i></button>`
      : "";

    return `
      <div class="task-card rounded-xl bg-white/90 p-3 border border-slate-200" style="border-left-color:${color}">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            ${checkboxMarkup}
            <div class="flex-1 min-w-0">
              <div class="font-semibold flex flex-wrap gap-2 items-center">
                <span class="${done ? "line-through text-slate-400" : "text-slate-900"}">${escapeHtml(task.name)}</span>
                <span class="category-badge">${getCategoryLabel(task.category)}</span>
                ${priorityBadge}
                ${estimateBadge}
                ${queuedBadge}
              </div>
              <div class="text-xs text-slate-500 flex flex-wrap gap-3 mt-1">
                <span><i class="far fa-clock"></i> ${task.time || "--:--"}</span>
                <span><i class="far fa-note-sticky"></i> ${escapeHtml(task.description) || "без описания"}</span>
              </div>
            </div>
          </div>
          <div class="flex gap-1">
            ${moveBtn}
            <button class="edit-task-btn text-cyan-700 hover:text-cyan-800 p-1 text-sm disabled:opacity-40" data-task-id="${task.id}" data-date="${dateStr}" ${locked && !preview ? "disabled" : ""}><i class="fas fa-pen"></i></button>
            <button class="delete-task-btn text-rose-600 hover:text-rose-700 p-1 disabled:opacity-40" data-task-id="${task.id}" data-date="${dateStr}" ${locked && !preview ? "disabled" : ""}><i class="fas fa-trash-alt"></i></button>
          </div>
        </div>
      </div>
    `;
  }

  function renderTodayTasks() {
    const today = todayStr();
    const startMode = getCycleStartMode();
    const tasks = getTasksForDate(today);
    const previewTasks = isCyclePending() ? getTasksForDate(challenge.startDate).filter(task => task.isRecurring) : [];
    const compMap = completions[today] || {};
    const container = document.getElementById("tasksContainer");
    const note = document.getElementById("taskListNote");
    const lockedToday = isDayLocked(today);

    note.classList.add("hidden");
    note.innerHTML = "";

    if (startMode === "first") {
      note.classList.remove("hidden");
      note.innerHTML = "Первая задача уже добавлена. Теперь выбери: начать цикл сейчас, завтра или в выбранную дату.";
    } else if (startMode === "reset") {
      note.classList.remove("hidden");
      note.innerHTML = "После полного сброса выбери новую дату старта цикла. Задачи сохранены.";
    } else if (startMode === "completed") {
      note.classList.remove("hidden");
      note.innerHTML = "Прошлый цикл завершен. Выбери дату старта для нового 21-дневного цикла.";
    } else if (challenge.startDate && isCyclePending()) {
      note.classList.remove("hidden");
      note.innerHTML = `Цикл стартует <span class="font-mono text-cyan-700">${formatDisplayDate(challenge.startDate)}</span>. Повторяющиеся задачи уже в очереди. Галочки появятся в день старта.`;
    } else if (lockedToday) {
      note.classList.remove("hidden");
      note.innerHTML = "Сегодняшний день уже закрыт. Изменение статуса задач заблокировано.";
    }

    if (tasks.length === 0 && previewTasks.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-slate-400"><i class="fas fa-dice-d6"></i> Пока нет задач. Добавь первую задачу и выбери дату старта цикла.</div>`;
      document.getElementById("todayCompletedCount").innerText = "0";
      document.getElementById("todayTotalTasks").innerText = "0";
      document.getElementById("todayCompletionPercent").innerText = "0%";
      document.getElementById("todayProgressFill").style.width = "0%";
      return;
    }

    let html = "";
    if (tasks.length > 0) {
      html += tasks.map(task => renderTaskCardMarkup(task, {
        dateStr: today,
        done: Boolean(compMap[task.id]),
        locked: lockedToday
      })).join("");
    }

    if (previewTasks.length > 0) {
      html += `
        <div class="mt-4 border-t border-slate-200 pt-4">
          <div class="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">Очередь на день 1</div>
          <div class="space-y-3">
            ${previewTasks.map(task => renderTaskCardMarkup(task, { dateStr: challenge.startDate, preview: true })).join("")}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
    container.querySelectorAll('.task-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const card = cb.closest('.task-card');
        if (cb.checked && card) {
          card.classList.add('completed-anim');
          setTimeout(() => toggleCompletion(cb.dataset.date, cb.dataset.taskId, cb.checked), 300);
        } else {
          toggleCompletion(cb.dataset.date, cb.dataset.taskId, cb.checked);
        }
      });
    });
    container.querySelectorAll('.edit-task-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getTaskByRenderedId(btn.dataset.date, btn.dataset.taskId);
        if (task) editTask(task);
      });
    });
    container.querySelectorAll('.move-to-tomorrow-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getTaskByRenderedId(btn.dataset.date, btn.dataset.taskId);
        if (task) moveTaskToTomorrow(task);
      });
    });
    container.querySelectorAll('.delete-task-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getTaskByRenderedId(btn.dataset.date, btn.dataset.taskId);
        if (task && confirm("Удалить эту задачу?")) deleteTask(task);
      });
    });

    const { completed, total, percent } = getDayCompletion(today);
    document.getElementById("todayCompletedCount").innerText = completed;
    document.getElementById("todayTotalTasks").innerText = total;
    document.getElementById("todayCompletionPercent").innerText = Math.floor(percent) + "%";
    document.getElementById("todayProgressFill").style.width = `${percent}%`;
  }

  function moveTaskToTomorrow(task) {
    if (!currentSupabaseUser) {
      showMotivation("Сначала войди в аккаунт.");
      return;
    }
    if (!task || task.isRecurring || !task.customId) return;
    if (isDayLocked(task.date)) {
      showMotivation("Сегодняшний день уже закрыт. Перенос заблокирован.");
      return;
    }
    const tomorrow = addDaysToDateStr(todayStr(), 1);
    const idx = customTasks.findIndex(c => c.id === task.customId);
    if (idx === -1) return;
    customTasks[idx].date = tomorrow;
    saveCustom();
    showMotivation("Задача перенесена на завтра.");
    renderEverything();
    renderTomorrowTasks();
  }

  function renderTomorrowTasks() {
    const container = document.getElementById("tomorrowTasksContainer");
    if (!container) return;
    const tomorrow = addDaysToDateStr(todayStr(), 1);
    const label = document.getElementById("tomorrowDateLabel");
    if (label) label.textContent = formatDisplayDate(tomorrow);

    const tasks = getTasksForDate(tomorrow);
    const compMap = completions[tomorrow] || {};
    const locked = isDayLocked(tomorrow);

    if (tasks.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-slate-400"><i class="fas fa-calendar-day"></i> На завтра задач пока нет. Можно перенести разовые задачи со “Сегодня”.</div>`;
      return;
    }

    container.innerHTML = tasks.map(task => {
      const markup = renderTaskCardMarkup(task, {
        dateStr: tomorrow,
        done: Boolean(compMap[task.id]),
        locked
      });
      return markup;
    }).join("");

    // reuse handlers for toggles/edit/delete on tomorrow list
    container.querySelectorAll('.task-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        toggleCompletion(cb.dataset.date, cb.dataset.taskId, cb.checked);
      });
    });
    container.querySelectorAll('.edit-task-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getTaskByRenderedId(btn.dataset.date, btn.dataset.taskId);
        if (task) editTask(task);
      });
    });
    container.querySelectorAll('.move-to-tomorrow-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getTaskByRenderedId(btn.dataset.date, btn.dataset.taskId);
        if (task) moveTaskToTomorrow(task);
      });
    });
    container.querySelectorAll('.delete-task-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = getTaskByRenderedId(btn.dataset.date, btn.dataset.taskId);
        if (task && confirm("Удалить эту задачу?")) deleteTask(task);
      });
    });
  }

  function renderAnalytics() {
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7.push(formatDateLocal(d));
    }

    const weeklyPercents = last7.map(date => getDayCompletion(date).percent);
    const weeklyAverage = weeklyPercents.length ? Math.round(weeklyPercents.reduce((a, b) => a + b, 0) / weeklyPercents.length) : 0;

    if (weeklyChart) weeklyChart.destroy();
    const ctxWeek = document.getElementById("weeklyChart").getContext("2d");
    weeklyChart = new Chart(ctxWeek, {
      type: "line",
      data: {
        labels: last7.map(date => date.slice(5)),
        datasets: [{
          label: "Процент выполнения",
          data: weeklyPercents,
          borderColor: "#0f766e",
          backgroundColor: "rgba(20, 184, 166, 0.12)",
          tension: 0.3,
          fill: true,
          pointBackgroundColor: "#0f766e",
          pointBorderColor: "#ecfeff",
          borderWidth: 2.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#334155" } } },
        scales: {
          y: { max: 100, min: 0, grid: { color: "rgba(203, 213, 225, 0.9)" }, ticks: { color: "#64748b" } },
          x: { ticks: { color: "#64748b" }, grid: { color: "rgba(226, 232, 240, 0.9)" } }
        }
      }
    });

    const catStats = Object.fromEntries(CATEGORIES.map(category => [category, { total: 0, done: 0 }]));
    last7.forEach(date => {
      const tasks = getTasksForDate(date);
      const compMap = completions[date] || {};
      tasks.forEach(task => {
        catStats[task.category].total++;
        if (compMap[task.id]) catStats[task.category].done++;
      });
    });

    const categoryHasRealData = CATEGORIES.some(category => catStats[category].total > 0);
    const categoryData = categoryHasRealData
      ? CATEGORIES.map(category => {
          const stat = catStats[category];
          return stat.total > 0 ? (stat.done / stat.total) * 100 : 0;
        })
      : CATEGORIES.map(() => 1);
    const categoryColors = categoryHasRealData
      ? CATEGORIES.map(category => CATEGORY_COLORS[category])
      : [
          "rgba(34, 211, 238, 0.28)",
          "rgba(52, 211, 153, 0.28)",
          "rgba(251, 113, 133, 0.28)",
          "rgba(192, 132, 252, 0.28)",
          "rgba(251, 191, 36, 0.28)",
          "rgba(148, 163, 184, 0.28)"
        ];

    if (categoryChart) categoryChart.destroy();
    const ctxCat = document.getElementById("categoryChart").getContext("2d");
    categoryChart = new Chart(ctxCat, {
      type: "doughnut",
      data: {
        labels: CATEGORIES.map(getCategoryLabel),
        datasets: [{
          data: categoryData,
          backgroundColor: categoryColors,
          borderColor: "rgba(255, 255, 255, 0.96)",
          borderWidth: 2,
          hoverOffset: categoryHasRealData ? 6 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "64%",
        plugins: {
          legend: { position: "bottom", labels: { color: "#334155", font: { size: 10 }, boxWidth: 12, padding: 14 } },
          tooltip: {
            callbacks: {
              label: context => categoryHasRealData
                ? `${context.label}: ${Math.round(context.parsed)}%`
                : `${context.label}: пока нет данных`
            }
          }
        }
      }
    });

    document.getElementById("weeklyAverageValue").innerText = `${weeklyAverage}%`;
    const todayComp = getDayCompletion(todayStr());
    const startMode = getCycleStartMode();
    const cycleStatus = startMode
      ? (startMode === "reset"
          ? "ожидает новый старт после сброса"
          : startMode === "completed"
            ? "ожидает старт нового цикла"
            : "ожидает выбор первого старта")
      : challenge.startDate
      ? (isCyclePending() ? `ожидает старт ${formatDisplayDate(challenge.startDate)}` : `старт ${formatDisplayDate(challenge.startDate)}`)
      : "ожидание первой задачи";

    document.getElementById("projectAnalyticsText").innerHTML = `
      <p><i class="fas fa-calendar-alt mr-2 text-cyan-700"></i>День цикла: <span class="font-semibold text-slate-900">${getDisplayedCycleDay()}/21</span></p>
      <p><i class="fas fa-flag-checkered mr-2 text-cyan-700"></i>Статус: <span class="font-semibold text-slate-900">${cycleStatus}</span></p>
      <p><i class="fas fa-bolt mr-2 text-cyan-700"></i>Выполнение сегодня: <span class="font-semibold text-slate-900">${Math.round(todayComp.percent)}%</span></p>
      <p><i class="fas fa-bullseye mr-2 text-cyan-700"></i>Среднее за неделю: <span class="font-semibold text-slate-900">${weeklyAverage}%</span></p>
      <p><i class="fas fa-triangle-exclamation mr-2 text-amber-500"></i>Провалы: <span class="font-semibold text-slate-900">${challenge.failedDaysCount}/3</span></p>
      <p><i class="fas fa-trophy mr-2 text-emerald-600"></i>Цикл пройден: <span class="font-semibold text-slate-900">${challenge.completedCycles} раз</span></p>
      <p><i class="fas fa-layer-group mr-2 text-cyan-700"></i>${categoryHasRealData ? "Категории в графике показывают реальное выполнение." : "Категории показаны по умолчанию. Данные появятся после выполнения задач."}</p>
    `;

    // heatmap (last 28 days)
    const heatmapGrid = document.getElementById("heatmapGrid");
    const heatmapLegend = document.getElementById("heatmapLegend");
    if (heatmapLegend) {
      heatmapLegend.innerHTML = `
        <span class="mr-2">0%</span>
        <span class="inline-block h-3 w-3 rounded bg-slate-100 border border-slate-200"></span>
        <span class="inline-block h-3 w-3 rounded bg-rose-100 border border-rose-200"></span>
        <span class="inline-block h-3 w-3 rounded bg-amber-100 border border-amber-200"></span>
        <span class="inline-block h-3 w-3 rounded bg-emerald-100 border border-emerald-200"></span>
        <span class="ml-2">100%</span>
      `;
    }
    if (heatmapGrid) {
      const dates28 = [];
      for (let i = 27; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates28.push(formatDateLocal(d));
      }
      const cells = dates28.map(dateStr => {
        const summary = getDayCompletion(dateStr);
        const pct = Math.round(summary.percent || 0);
        const hasTasks = summary.total > 0;
        const tone = !hasTasks
          ? "bg-slate-50 border-slate-200"
          : pct >= 80
            ? "bg-emerald-100 border-emerald-200"
            : pct >= 50
              ? "bg-amber-100 border-amber-200"
              : "bg-rose-100 border-rose-200";
        const title = `${formatDisplayDate(dateStr)} · ${hasTasks ? `${pct}% (${summary.completed}/${summary.total})` : "нет задач"}`;
        return `<div class="h-9 rounded-xl border ${tone} flex items-center justify-center text-[10px] text-slate-600" title="${escapeHtml(title)}">${dateStr.slice(8)}</div>`;
      }).join("");
      heatmapGrid.innerHTML = cells;
    }

    // priority completion (last 7 days)
    const priorityBuckets = {
      high: { total: 0, done: 0, label: "Высокий", color: "rgba(244, 63, 94, 0.75)" },
      medium: { total: 0, done: 0, label: "Средний", color: "rgba(245, 158, 11, 0.75)" },
      low: { total: 0, done: 0, label: "Низкий", color: "rgba(100, 116, 139, 0.75)" }
    };
    last7.forEach(date => {
      const tasks = getTasksForDate(date);
      const compMap = completions[date] || {};
      tasks.forEach(task => {
        const pr = ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium";
        priorityBuckets[pr].total += 1;
        if (compMap[task.id]) priorityBuckets[pr].done += 1;
      });
    });

    const prLabels = Object.values(priorityBuckets).map(bucket => bucket.label);
    const prData = Object.values(priorityBuckets).map(bucket => bucket.total > 0 ? Math.round((bucket.done / bucket.total) * 100) : 0);
    const prColors = Object.values(priorityBuckets).map(bucket => bucket.color);
    const priorityCanvas = document.getElementById("priorityChart");
    if (priorityCanvas) {
      if (priorityChart) priorityChart.destroy();
      const ctxPr = priorityCanvas.getContext("2d");
      priorityChart = new Chart(ctxPr, {
        type: "bar",
        data: {
          labels: prLabels,
          datasets: [{
            label: "Выполнение, %",
            data: prData,
            backgroundColor: prColors,
            borderColor: prColors.map(color => color.replace("0.75", "1")),
            borderWidth: 1.5,
            borderRadius: 12
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterLabel: context => {
                  const idx = context.dataIndex;
                  const key = Object.keys(priorityBuckets)[idx];
                  const bucket = priorityBuckets[key];
                  return `Задач: ${bucket.done}/${bucket.total}`;
                }
              }
            }
          },
          scales: {
            y: { max: 100, min: 0, grid: { color: "rgba(226, 232, 240, 0.9)" }, ticks: { color: "#64748b" } },
            x: { ticks: { color: "#64748b" }, grid: { color: "rgba(226, 232, 240, 0.35)" } }
          }
        }
      });
    }

    const reasonCounts = Object.fromEntries(FAILURE_REASONS.map(option => [option.key, 0]));
    const cycleDates = challenge.startDate ? Array.from({ length: 21 }, (_, idx) => addDaysToDateStr(challenge.startDate, idx)) : [];
    const datesToScan = cycleDates.length ? cycleDates : last7;
    datesToScan.forEach(dateStr => {
      const meta = completions?.[dateStr] || {};
      if (!meta._failed) return;
      const key = getFailureReasonKey(dateStr) || "other";
      if (reasonCounts[key] === undefined) reasonCounts.other += 1;
      else reasonCounts[key] += 1;
    });

    const reasonLabels = FAILURE_REASONS.map(option => option.label);
    const reasonData = FAILURE_REASONS.map(option => reasonCounts[option.key] || 0);
    const reasonCanvas = document.getElementById("failureReasonChart");
    if (reasonCanvas) {
      if (failureReasonChart) failureReasonChart.destroy();
      const ctxReason = reasonCanvas.getContext("2d");
      failureReasonChart = new Chart(ctxReason, {
        type: "bar",
        data: {
          labels: reasonLabels,
          datasets: [{
            label: "Кол-во провалов",
            data: reasonData,
            backgroundColor: "rgba(244, 63, 94, 0.22)",
            borderColor: "rgba(244, 63, 94, 0.65)",
            borderWidth: 1.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: "#334155" } } },
          scales: {
            y: { beginAtZero: true, grid: { color: "rgba(226, 232, 240, 0.9)" }, ticks: { color: "#64748b", precision: 0 } },
            x: { ticks: { color: "#64748b", maxRotation: 30, minRotation: 0 }, grid: { color: "rgba(226, 232, 240, 0.35)" } }
          }
        }
      });
    }

    // failure reasons trend (last 4 weeks, stacked)
    const trendCanvas = document.getElementById("failureReasonTrendChart");
    if (trendCanvas) {
      const now = new Date();
      const weekStarts = Array.from({ length: 4 }, (_, i) => {
        const d = new Date(now);
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1)); // Monday start
        d.setDate(d.getDate() - (3 - i) * 7);
        return d;
      });
      const weekLabels = weekStarts.map(d => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`);
      const weekKeys = weekStarts.map(d => formatDateLocal(d));

      const byWeek = weekKeys.map(() => Object.fromEntries(FAILURE_REASONS.map(option => [option.key, 0])));
      // scan last 28 days
      for (let i = 0; i < 28; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = formatDateLocal(d);
        const meta = completions?.[dateStr] || {};
        if (!meta._failed) continue;
        const key = getFailureReasonKey(dateStr) || "other";
        // find week index
        for (let w = 0; w < 4; w++) {
          const start = parseDateLocal(weekKeys[w]);
          const end = new Date(start);
          end.setDate(end.getDate() + 7);
          const cur = parseDateLocal(dateStr);
          if (cur >= start && cur < end) {
            if (byWeek[w][key] === undefined) byWeek[w].other += 1;
            else byWeek[w][key] += 1;
            break;
          }
        }
      }

      const datasets = FAILURE_REASONS
        .filter(option => option.key !== "other")
        .map(option => ({
          label: option.label,
          data: byWeek.map(weekObj => weekObj[option.key] || 0),
          backgroundColor: option.key === "laziness" ? "rgba(244, 63, 94, 0.55)" : "rgba(14, 165, 233, 0.35)",
          borderColor: "rgba(148, 163, 184, 0.25)",
          borderWidth: 1
        }));
      datasets.push({
        label: "Другое",
        data: byWeek.map(weekObj => weekObj.other || 0),
        backgroundColor: "rgba(100, 116, 139, 0.35)",
        borderColor: "rgba(148, 163, 184, 0.25)",
        borderWidth: 1
      });

      if (failureReasonTrendChart) failureReasonTrendChart.destroy();
      const ctxTrend = trendCanvas.getContext("2d");
      failureReasonTrendChart = new Chart(ctxTrend, {
        type: "bar",
        data: { labels: weekLabels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { color: "#334155", font: { size: 10 }, boxWidth: 12, padding: 12 } }
          },
          scales: {
            x: { stacked: true, ticks: { color: "#64748b" }, grid: { color: "rgba(226, 232, 240, 0.35)" } },
            y: { stacked: true, beginAtZero: true, ticks: { color: "#64748b", precision: 0 }, grid: { color: "rgba(226, 232, 240, 0.9)" } }
          }
        }
      });
    }

    // notes analytics
    const notesText = document.getElementById("notesAnalyticsText");
    if (notesText) {
      const nowMs = Date.now();
      const dueCount = notes.filter(note => {
        const nextAt = note.nextReviewAt ? new Date(note.nextReviewAt).getTime() : 0;
        return Number.isFinite(nextAt) ? nextAt <= nowMs : true;
      }).length;

      const cutoffMs = nowMs - 6 * 86400000;
      const reviewedLast7 = notes.filter(note => {
        if (!note.lastReviewedAt) return false;
        const t = new Date(note.lastReviewedAt).getTime();
        if (!Number.isFinite(t)) return false;
        return t >= cutoffMs;
      }).length;

      const tagCounts = {};
      notes.forEach(note => {
        (Array.isArray(note.tags) ? note.tags : []).forEach(tag => {
          const key = String(tag || "").trim();
          if (!key) return;
          tagCounts[key] = (tagCounts[key] || 0) + 1;
        });
      });
      const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([tag, count]) => `#${escapeHtml(tag)} (${count})`)
        .join(" · ");

      notesText.innerHTML = `
        <div class="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-xs uppercase tracking-[0.18em] text-slate-500">К повторению сейчас</div>
            <div class="text-lg font-black text-slate-900">${dueCount}</div>
          </div>
          <div class="mt-2 text-xs text-slate-500">Всего заметок: ${notes.length} · Повторил за 7 дней: ${reviewedLast7}</div>
          ${topTags ? `<div class="mt-3 text-xs text-slate-600"><i class="fas fa-tags mr-2 text-cyan-700"></i>${topTags}</div>` : `<div class="mt-3 text-xs text-slate-500">Тегов пока нет.</div>`}
        </div>
      `;
    }
  }

  function renderHeaderStats() {
    const startMode = getCycleStartMode();
    const restartCycleBtn = document.getElementById("headerRestartCycleBtn");
    document.getElementById("currentDayNum").innerText = String(getDisplayedCycleDay());
    document.getElementById("failedDaysCount").innerText = String(challenge.failedDaysCount);
    document.getElementById("startDateDisplay").innerText = startMode
      ? "выбери старт"
      : (challenge.startDate ? formatDisplayDate(challenge.startDate) : "ожидание первой задачи");
    const miniStart = document.getElementById("startDateDisplayMini");
    if (miniStart) {
      miniStart.textContent = startMode
        ? "выбери старт"
        : (challenge.startDate ? formatDisplayDate(challenge.startDate) : "ожидание");
    }
    if (restartCycleBtn) {
      const canRestart = Boolean(currentSupabaseUser && (challenge.isActive || challenge.startDate));
      restartCycleBtn.classList.toggle("hidden", !canRestart);
    }
  }


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
      if (profileRankProgress) profileRankProgress.style.width = `${percentage}%`;
    } else {
      if (profileNextRankName) profileNextRankName.textContent = "Максимальный";
      if (profileXPToNext) profileXPToNext.textContent = "0";
      if (profileRankProgress) profileRankProgress.style.width = "100%";
    }
  }

  function renderEverything() {
    if (!currentSupabaseUser) {
      renderHeaderStats();
      renderCycleHistory();
      renderNotesPanel();
      renderCycleStartPlanner();
      return;
    }
    evaluateMissedDays();
    evaluateTodayIfComplete();
    celebrateCycleCompletion();
    renderHeaderStats();
    renderCycleHistory();
    renderCycleStartPlanner();
    renderTodayTasks();
    renderTomorrowTasks();
    renderNotesPanel();
    renderAnalytics();
    updateGamificationUI();
  }

  function showMotivation(msg) {
    const toast = document.getElementById("motivationToast");
    toast.innerHTML = `<div class="flex gap-3"><i class="fas fa-bolt text-teal-300 text-xl"></i><div class="text-sm font-medium">${msg}</div></div>`;
    toast.classList.remove("translate-x-full");
    setTimeout(() => toast.classList.add("translate-x-full"), 3800);
  }

  function promptNextCycleAfterCompletion() {
    challenge.startDate = null;
    challenge.isActive = false;
    challenge.failedDaysCount = 0;
    challenge.lastEvaluatedDate = null;
    challenge.lastCycleCelebrated = null;
    challenge.pendingStartMode = "completed";
    activeFailureReasonDate = null;
    dismissedFailureReasonDate = null;
    saveChallenge();
    renderEverything();
    showMotivation("Цикл завершен. Выбери дату старта для следующего цикла.");
  }

  function celebrateCycleCompletion() {
    if (!challenge.startDate || !challenge.isActive) return;

    const endDate = getChallengeEndDate();
    if (!endDate) return;
    if (challenge.lastCycleCelebrated === endDate) return;
    if (todayStr() < endDate) return;
    if (!completions[endDate] || !completions[endDate]._evaluated) return;
    if (challenge.failedDaysCount >= 3) return;

    challenge.lastCycleCelebrated = endDate;
    challenge.completedCycles += 1;
    challenge.xp += 1000;
    challenge.currentStreak += 1;
    if (challenge.currentStreak > challenge.maxStreak) challenge.maxStreak = challenge.currentStreak;
    saveChallenge();

    const ending = challenge.failedDaysCount === 0
      ? "Без единого провала."
      : `С ${challenge.failedDaysCount} провал${challenge.failedDaysCount === 1 ? "ом" : "ами"}, но до самого конца.`;

    showMotivation(`21 дней пройдены. Ты довел дело до конца и доказал себе, что можешь держать слово. ${ending} Это уже не случайность, это дисциплина.`);
    setTimeout(promptNextCycleAfterCompletion, 700);
  }

  function startReminders() {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    setInterval(() => {
      if (!challenge.isActive || isCyclePending()) return;
      const now = new Date();
      const today = todayStr();
      const todayTasks = getTasksForDate(today);
      const compMap = completions[today] || {};
      todayTasks.forEach(task => {
        if (!task.time || compMap[task.id]) return;
        const reminderKey = `${today}_${task.id}`;
        const [taskHour, taskMin] = task.time.split(":").map(Number);
        const taskDate = new Date();
        taskDate.setHours(taskHour, taskMin, 0, 0);
        const diff = taskDate - now;
        if (diff > 0 && diff <= 10 * 60 * 1000) {
          if (!sentReminderKeys.has(reminderKey) && Notification.permission === "granted") {
            sentReminderKeys.add(reminderKey);
            new Notification("Напоминание за 10 минут", { body: task.name, icon: "https://cdn-icons-png.flaticon.com/512/190/190411.png" });
          }
        } else if (diff > 10 * 60 * 1000 || diff <= 0) {
          sentReminderKeys.delete(reminderKey);
        }
      });
    }, 30000);
  }

  function loadAllData() {
    resetAppState();
    supabaseMeta = { lastRemoteUpdatedAt: null };
    sanitizeStoredState();
    sanitizeSupabaseMeta();

    renderCategoryButtons();
    renderSupabaseSettings();
    renderEverything();
    setActiveView(DEFAULT_ACTIVE_VIEW, { sync: false });
    startReminders();
    setInterval(renderEverything, 60000);
    initializeSupabaseIfNeeded();
  }

  document.getElementById("addTaskBtn").addEventListener("click", addNewTask);
  document.getElementById("taskName").addEventListener("keydown", event => {
    if (event.key === "Enter") addNewTask();
  });
  document.getElementById("addNoteBtn")?.addEventListener("click", addNote);
  document.getElementById("noteTitle")?.addEventListener("keydown", event => {
    if (event.key === "Enter") addNote();
  });
  document.getElementById("notesSearch")?.addEventListener("input", () => renderNotesPanel());
  document.getElementById("studyRandomNoteBtn")?.addEventListener("click", () => {
    startStudyNote();
  });
  document.getElementById("startCycleNowBtn")?.addEventListener("click", () => {
    startChallengeAtDate(todayStr());
  });
  document.getElementById("startCycleTomorrowBtn")?.addEventListener("click", () => {
    startChallengeAtDate(addDaysToDateStr(todayStr(), 1));
  });
  document.getElementById("applyCustomCycleStartBtn")?.addEventListener("click", () => {
    startChallengeAtDate(document.getElementById("customCycleStartDate")?.value || "");
  });
  document.getElementById("supabaseRegisterBtn")?.addEventListener("click", () => {
    registerSupabaseUser();
  });
  document.getElementById("supabaseLoginBtn")?.addEventListener("click", () => {
    loginSupabaseUser();
  });
  document.getElementById("supabasePassword")?.addEventListener("keydown", event => {
    if (event.key === "Enter") loginSupabaseUser();
  });
  document.getElementById("supabaseLogoutBtn")?.addEventListener("click", () => {
    logoutSupabaseUser();
  });
  document.getElementById("headerLogoutBtn")?.addEventListener("click", () => {
    logoutSupabaseUser();
  });
  document.getElementById("headerRestartCycleBtn")?.addEventListener("click", () => {
    restartCurrentCycle();
  });
  document.getElementById("navTodayBottomBtn")?.addEventListener("click", () => setActiveView("today"));
  document.getElementById("navTomorrowBottomBtn")?.addEventListener("click", () => setActiveView("tomorrow"));
  document.getElementById("navStatsBottomBtn")?.addEventListener("click", () => setActiveView("stats"));
  document.getElementById("btnFailChartOverall")?.addEventListener("click", () => {
    document.getElementById("btnFailChartOverall")?.classList.add("active");
    document.getElementById("btnFailChartWeekly")?.classList.remove("active");
    document.getElementById("failChartOverallWrapper")?.classList.remove("hidden");
    document.getElementById("failChartWeeklyWrapper")?.classList.add("hidden");
    document.getElementById("failChartDesc").textContent = "График собирается по выбранным причинам в проваленных днях.";
  });
  document.getElementById("btnFailChartWeekly")?.addEventListener("click", () => {
    document.getElementById("btnFailChartWeekly")?.classList.add("active");
    document.getElementById("btnFailChartOverall")?.classList.remove("active");
    document.getElementById("failChartWeeklyWrapper")?.classList.remove("hidden");
    document.getElementById("failChartOverallWrapper")?.classList.add("hidden");
    document.getElementById("failChartDesc").textContent = "Показывает, какие причины чаще встречались по неделям (последние 4 недели).";
  });
  document.getElementById("closeStudyModalBtn")?.addEventListener("click", closeStudyModal);
  document.getElementById("studyRevealBtn")?.addEventListener("click", revealStudyNote);
  document.getElementById("studyHardBtn")?.addEventListener("click", () => {
    if (activeStudyNoteId) markNoteReviewedWithDifficulty(activeStudyNoteId, "hard");
  });
  document.getElementById("studyNormalBtn")?.addEventListener("click", () => {
    if (activeStudyNoteId) markNoteReviewedWithDifficulty(activeStudyNoteId, "normal");
  });
  document.getElementById("studyEasyBtn")?.addEventListener("click", () => {
    if (activeStudyNoteId) markNoteReviewedWithDifficulty(activeStudyNoteId, "easy");
  });
  document.getElementById("studyNextBtn")?.addEventListener("click", () => startStudyNote());
  document.getElementById("studyModalBackdrop")?.addEventListener("click", closeStudyModal);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && isStudyModalOpen) closeStudyModal();
  });
  loadAllData();

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      if (m === '"') return '&quot;';
      if (m === "'") return '&#39;';
      return m;
    });
  }
