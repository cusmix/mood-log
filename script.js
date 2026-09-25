"use strict";

const NOTE_LIMIT = 200;
const segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("ja", { granularity: "grapheme" })
  : null;

// Reuse the same counting rule for both feedback and validation.
function countCharacters(text) {
  return segmenter
    ? Array.from(segmenter.segment(text)).length
    : Array.from(text).length;
}

const today = document.getElementById("today");
const note = document.getElementById("note");
const counter = document.getElementById("note-count");
const noteError = document.getElementById("note-error");
const moodError = document.getElementById("mood-error");
const result = document.getElementById("check-result");
const moodInputs = document.querySelectorAll('input[name="mood"]');
let isComposing = false;

// Hold the local reference date until an explicit day switch.
let now = new Date();
let dateChangePending = false;
today.dateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
today.textContent = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "long", day: "numeric", weekday: "short"
}).format(now);
document.getElementById("count-help").hidden = segmenter !== null;

function updateNoteFeedback() {
  const count = countCharacters(note.value);
  counter.textContent = `${count} / ${NOTE_LIMIT}`;
  // Do not interrupt IME composition with transient validation errors.
  if (isComposing) return;
  const tooLong = count > NOTE_LIMIT;
  counter.classList.toggle("is-over-limit", tooLong);
  note.setAttribute("aria-invalid", String(tooLong));
  noteError.textContent = tooLong
    ? "ひとことは200文字以内にしてください。入力内容はそのまま残っています。"
    : "";
}

note.addEventListener("compositionstart", () => {
  isComposing = true;
  result.textContent = "";
});
note.addEventListener("compositionend", () => {
  isComposing = false;
  updateNoteFeedback();
});
note.addEventListener("input", () => {
  result.textContent = "";
  updateNoteFeedback();
});

moodInputs.forEach((input) => {
  input.addEventListener("change", () => {
    moodError.textContent = "";
    moodInputs.forEach((radio) => radio.removeAttribute("aria-invalid"));
    result.textContent = "";
  });
});

// Validate stored data before allowing any writes.
function isDataObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRealDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function validateStoredData(data) {
  if (!isDataObject(data) || typeof data.version !== "number" || !Number.isFinite(data.version)) {
    return { status: "invalid-data", records: null };
  }
  // A numeric version other than 1 is unsupported; a missing/string version is malformed.
  if (data.version !== 1) return { status: "unsupported-version", records: null };
  if (!Array.isArray(data.records)) return { status: "invalid-data", records: null };

  const dates = new Set();
  for (const record of data.records) {
    if (!isDataObject(record) || !isRealDate(record.date)
      || !Number.isInteger(record.mood) || record.mood < 1 || record.mood > 5
      || typeof record.note !== "string" || countCharacters(record.note) > NOTE_LIMIT
      || dates.has(record.date)) {
      // Reject the entire collection; never accept only the valid portion.
      return { status: "invalid-data", records: null };
    }
    dates.add(record.date);
  }
  return { status: "valid", records: data.records };
}

function readStoredData() {
  let raw;
  try {
    // Accessing localStorage itself can throw, as can getItem.
    raw = window.localStorage.getItem("mood-log");
  } catch {
    return { status: "read-error", records: null };
  }
  if (raw === null) return { status: "first-use", records: [] };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: "invalid-json", records: null };
  }
  return validateStoredData(data);
}

let storageState = readStoredData();
const storageMessages = {
  "invalid-json": "保存データのJSONが壊れています。",
  "invalid-data": "保存データの構造または値が正しくありません。",
  "unsupported-version": "このアプリでは対応していないデータのversionです。",
  "read-error": "ブラウザの保存領域へのアクセスに失敗しました。"
};

const saveButton = document.getElementById("save-record");
const saveError = document.getElementById("save-error");
let isSaving = false;

function isStorageUsable(state) {
  return state.status === "first-use" || state.status === "valid";
}

// Render only validated records, without changing their order in memory or storage.
function renderHistory() {
  const container = document.getElementById("history-content");
  container.replaceChildren();
  if (!isStorageUsable(storageState) || storageState.records.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = isStorageUsable(storageState)
      ? "まだ記録がありません"
      : "記録を保護するため、履歴を表示できません。上のエラー案内をご確認ください。";
    container.append(message);
    return;
  }

  const moodLabels = {
    1: "😣 つらい", 2: "😔 いまいち", 3: "😐 ふつう",
    4: "🙂 いい感じ", 5: "😄 とてもいい感じ"
  };
  const sortedRecords = [...storageState.records].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const list = document.createElement("ol");
  list.className = "history-list";
  for (const record of sortedRecords) {
    const item = document.createElement("li");
    item.className = "history-item";
    const heading = document.createElement("h3");
    const date = document.createElement("time");
    date.dateTime = record.date;
    date.textContent = record.date;
    heading.append(date);
    const details = document.createElement("dl");
    for (const [label, value] of [
      ["気分", moodLabels[record.mood]],
      ["ひとこと", record.note === "" ? "ひとことなし" : record.note]
    ]) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      // Never interpret user-entered notes as HTML.
      description.textContent = value;
      details.append(term, description);
    }
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-record";
    deleteButton.textContent = "削除する";
    deleteButton.setAttribute("aria-label", `${record.date}の記録を削除する`);
    deleteButton.addEventListener("click", () => deleteRecord(record.date, deleteButton));
    item.append(heading, details, deleteButton);
    list.append(item);
  }
  container.append(list);
}

function showStorageState() {
  const usable = isStorageUsable(storageState);
  saveButton.disabled = !usable;
  renderHistory();
  renderInsights();
  document.getElementById("storage-status").textContent = !usable ? ""
    : storageState.status === "first-use" ? "保存データはまだありません。"
    : "保存データを読み込めます。";
  document.getElementById("storage-error").textContent = usable ? ""
    : "保存データを読み込めませんでした。記録を保護するため、現在は保存・更新・削除を停止しています。 "
      + storageMessages[storageState.status] + " 元のデータは変更していません。";
}

function updateSaveButton() {
  const hasToday = isStorageUsable(storageState)
    && storageState.records.some((record) => record.date === today.dateTime);
  saveButton.textContent = hasToday ? "更新する" : "保存する";
}

// Restore today's form only once on page load; do not overwrite unsaved edits.
if (isStorageUsable(storageState)) {
  const savedToday = storageState.records.find((record) => record.date === today.dateTime);
  if (savedToday) {
    moodInputs.forEach((radio) => { radio.checked = Number(radio.value) === savedToday.mood; });
    note.value = savedToday.note;
  }
}
showStorageState();
updateSaveButton();
updateNoteFeedback();

saveButton.addEventListener("click", () => {
  if (isComposing || isSaving) return;
  if (checkDateChange()) return;
  result.textContent = "";
  saveError.textContent = "";
  if (!isStorageUsable(storageState)) {
    showStorageState();
    return;
  }

  const selectedMood = document.querySelector('input[name="mood"]:checked');
  const validMood = selectedMood !== null && ["1", "2", "3", "4", "5"].includes(selectedMood.value);
  const validNote = countCharacters(note.value) <= NOTE_LIMIT;
  moodError.textContent = validMood ? "" : "気分を1つ選んでください。";
  moodInputs.forEach((radio) => radio.setAttribute("aria-invalid", String(!validMood)));
  updateNoteFeedback();
  if (!validMood || !validNote) {
    if (!validMood) moodInputs[0].focus();
    else note.focus();
    return;
  }

  // Recheck immediately before writing so newly damaged data is never replaced.
  const latest = readStoredData();
  if (!isStorageUsable(latest)) {
    storageState = latest;
    showStorageState();
    return;
  }
  if (checkDateChange()) return;
  const nextRecord = { date: today.dateTime, mood: Number(selectedMood.value), note: note.value };
  const wasUpdate = latest.records.some((record) => record.date === nextRecord.date);
  const nextRecords = latest.records.map((record) => record.date === nextRecord.date
    ? nextRecord : { date: record.date, mood: record.mood, note: record.note });
  if (!wasUpdate) nextRecords.push(nextRecord);

  if (checkDateChange()) return;
  isSaving = true;
  saveButton.disabled = true;
  try {
    window.localStorage.setItem("mood-log", JSON.stringify({ version: 1, records: nextRecords }));
  } catch {
    saveError.textContent = "記録を保存できませんでした。入力内容は残っています。ブラウザの保存設定や空き容量を確認して、もう一度お試しください。";
    return;
  } finally {
    isSaving = false;
    saveButton.disabled = !isStorageUsable(storageState);
  }
  // Commit the UI state only after setItem succeeds.
  storageState = { status: "valid", records: nextRecords };
  showStorageState();
  updateSaveButton();
  result.textContent = wasUpdate ? "今日の記録を更新しました" : "今日の記録を保存しました";
});


// A native confirmation dialog supports keyboard confirm/cancel without custom trapping.
function deleteRecord(date, trigger) {
  if (isSaving || !isStorageUsable(storageState)) return;
  if (checkDateChange()) return;
  if (!window.confirm(`${date}の記録を削除しますか？ この操作は取り消せません。`)) {
    trigger.focus();
    return;
  }
  if (checkDateChange()) return;
  const notification = document.getElementById("delete-result");
  const error = document.getElementById("delete-error");
  notification.textContent = "";
  error.textContent = "";
  const latest = readStoredData();
  if (!isStorageUsable(latest)) {
    storageState = latest;
    showStorageState();
    document.getElementById("history-heading").focus();
    return;
  }
  if (!latest.records.some((record) => record.date === date)) {
    error.textContent = "対象の記録が保存先に見つからないため、削除しませんでした。ページを再読み込みして確認してください。";
    trigger.focus();
    return;
  }
  const buttons = Array.from(document.querySelectorAll(".delete-record"));
  const previousIndex = buttons.indexOf(trigger);
  const nextRecords = latest.records.filter((record) => record.date !== date)
    .map((record) => ({ date: record.date, mood: record.mood, note: record.note }));
  if (checkDateChange()) return;
  isSaving = true;
  try {
    window.localStorage.setItem("mood-log", JSON.stringify({ version: 1, records: nextRecords }));
  } catch {
    error.textContent = "記録を削除できませんでした。データと表示は変更していません。もう一度お試しください。";
    trigger.focus();
    return;
  } finally {
    isSaving = false;
  }
  storageState = { status: "valid", records: nextRecords };
  if (date === today.dateTime) {
    moodInputs.forEach((radio) => {
      radio.checked = false;
      radio.removeAttribute("aria-invalid");
    });
    note.value = "";
    isComposing = false;
    moodError.textContent = "";
    saveError.textContent = "";
    result.textContent = "";
    updateNoteFeedback();
  }
  showStorageState();
  updateSaveButton();
  notification.textContent = `${date}の記録を削除しました。`;
  const remainingButtons = document.querySelectorAll(".delete-record");
  const focusTarget = remainingButtons[Math.min(previousIndex, remainingButtons.length - 1)]
    || document.getElementById("history-heading");
  focusTarget.focus();
}

// Use calendar arithmetic, not elapsed hours. The reference is the local date
// changed only by the explicit day-switch action.
function getRecentDates(referenceDate) {
  const cursor = new Date(referenceDate.getTime());
  cursor.setHours(12, 0, 0, 0);
  const dates = [];
  for (let offset = 0; offset < 7; offset += 1) {
    dates.unshift(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    cursor.setDate(cursor.getDate() - 1);
  }
  return dates;
}

// Pure calculation: accepts validated records and never reads/writes storage.
function calculateInsights(records, referenceDate) {
  const dates = getRecentDates(referenceDate);
  const dateSet = new Set(dates);
  const recent = records.filter((record) => dateSet.has(record.date));
  const counts = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const record of recent) {
    counts[record.mood - 1] += 1;
    sum += record.mood;
  }
  const maxCount = Math.max(...counts);
  const modes = [];
  if (recent.length > 0) {
    counts.forEach((count, index) => {
      if (count === maxCount) modes.push(index + 1);
    });
  }
  return {
    dates, recordedDays: recent.length,
    average: recent.length === 0 ? null : sum / recent.length,
    modes, totalDays: records.length
  };
}

function renderInsights() {
  const container = document.getElementById("insights-content");
  container.replaceChildren();
  if (!isStorageUsable(storageState)) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "記録を保護するため、集計を表示できません。上のエラー案内をご確認ください。";
    container.append(message);
    return;
  }
  const summary = calculateInsights(storageState.records, now);
  const period = document.createElement("p");
  period.className = "insights-period";
  period.textContent = `直近7日間：${summary.dates[0]} 〜 ${summary.dates[6]}（今日を含む）`;
  const labels = { 1: "😣 つらい", 2: "😔 いまいち", 3: "😐 ふつう", 4: "🙂 いい感じ", 5: "😄 とてもいい感じ" };
  const list = document.createElement("dl");
  list.className = "insights-list";
  for (const [name, value] of [
    ["直近7日間の記録日数", `${summary.recordedDays} / 7日`],
    ["直近7日間の平均気分", summary.average === null ? "—" : summary.average.toFixed(1)],
    ["直近7日間の最も多かった気分", summary.modes.length === 0 ? "—" : summary.modes.map((mood) => labels[mood]).join("、")],
    ["累計記録日数（全期間）", `${summary.totalDays}日`]
  ]) {
    const group = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = name;
    const valueElement = document.createElement("dd");
    valueElement.textContent = value;
    group.append(term, valueElement);
    list.append(group);
  }
  const explanation = document.createElement("p");
  explanation.className = "insights-explanation";
  explanation.textContent = "平均気分は、選んだ気分を内部の1〜5に対応させた振り返り用の参考値です。未記録日は平均に含めません。";
  container.append(period, list, explanation, createMoodChart(summary.dates, storageState.records, labels));
}

// Reuse the exact dates calculated for INSIGHTS; no independent date arithmetic.
function createMoodChart(dates, records, labels) {
  const figure = document.createElement("figure");
  figure.className = "mood-chart";
  const caption = document.createElement("figcaption");
  caption.textContent = "直近7日間の気分";
  const guide = document.createElement("p");
  guide.className = "chart-guide";
  guide.textContent = "棒の高さは気分の1〜5の対応で固定しています。未記録の日には棒を表示しません。";
  const layout = document.createElement("div");
  layout.className = "chart-layout";
  const axis = document.createElement("div");
  axis.className = "chart-axis";
  axis.setAttribute("aria-hidden", "true");
  for (let value = 5; value >= 1; value -= 1) {
    const tick = document.createElement("span");
    tick.textContent = String(value);
    tick.style.top = `${(5 - value) * 20}%`;
    axis.append(tick);
  }
  const days = document.createElement("ol");
  days.className = "chart-days";
  days.setAttribute("role", "list");
  const byDate = new Map(records.map((record) => [record.date, record]));
  for (const date of dates) {
    const record = byDate.get(date);
    const day = document.createElement("li");
    day.className = "chart-day";
    const track = document.createElement("div");
    track.className = "chart-track";
    // Decorative bars are hidden from AT; the visible date and label convey the data once.
    track.setAttribute("aria-hidden", "true");
    if (record) {
      const bar = document.createElement("div");
      bar.className = "chart-bar";
      bar.style.height = `${record.mood * 20}%`;
      track.append(bar);
    }
    const dateText = document.createElement("time");
    dateText.dateTime = date;
    dateText.textContent = `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
    const moodText = document.createElement("span");
    moodText.className = "chart-mood";
    moodText.textContent = record ? labels[record.mood] : "未記録";
    day.append(track, dateText, moodText);
    days.append(day);
  }
  layout.append(axis, days);
  figure.append(caption, guide, layout);
  return figure;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Detection alone never changes the form, history, or reference date.
function checkDateChange() {
  const current = new Date();
  if (localDateKey(current) !== localDateKey(now)) {
    dateChangePending = true;
    document.getElementById("date-change-message").textContent =
      `日付が変わりました（現在：${localDateKey(current)}）。入力内容は保持しています。内容を確認し、新しい今日へ切り替えてください。保存・削除は行っていません。`;
    document.getElementById("date-switch-panel").hidden = false;
  }
  return dateChangePending;
}

window.addEventListener("focus", checkDateChange);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkDateChange();
});

document.getElementById("switch-day").addEventListener("click", () => {
  if (isComposing || isSaving || !dateChangePending) return;
  if (!window.confirm("新しい今日へ切り替えますか？ 現在の未保存の入力は引き継がれず、新しい今日の記録、または空欄に置き換わります。")) return;
  const current = new Date();
  const latest = readStoredData();
  if (!isStorageUsable(latest)) {
    storageState = latest;
    showStorageState();
    return;
  }
  now = current;
  storageState = latest;
  today.dateTime = localDateKey(now);
  today.textContent = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short"
  }).format(now);
  const savedToday = latest.records.find((record) => record.date === today.dateTime);
  moodInputs.forEach((radio) => {
    radio.checked = savedToday ? Number(radio.value) === savedToday.mood : false;
    radio.removeAttribute("aria-invalid");
  });
  note.value = savedToday ? savedToday.note : "";
  moodError.textContent = "";
  saveError.textContent = "";
  result.textContent = "";
  document.getElementById("delete-result").textContent = "";
  document.getElementById("delete-error").textContent = "";
  dateChangePending = false;
  document.getElementById("date-switch-panel").hidden = true;
  updateNoteFeedback();
  showStorageState();
  updateSaveButton();
  document.getElementById("date-change-message").textContent = `${today.dateTime}へ切り替えました。${savedToday ? "保存済みの記録を読み込みました。" : "新しい記録を入力できます。"} 保存は行っていません。`;
  moodInputs[0].focus();
});
