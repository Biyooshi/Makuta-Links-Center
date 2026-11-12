/**
 * Makuta Links Center - Google Apps Script backend.
 * Data lives in the "Links" sheet of the spreadsheet this script is bound to.
 */
const SHEET_NAME = 'Links';
const HEADERS = ['ID', 'Created', 'Updated', 'Title', 'Main Link', 'Category', 'Project', 'Status', 'Deadline', 'Pinned', 'Description', 'Related Links', 'Reminder IDs'];
const PINNED_COL = HEADERS.indexOf('Pinned') + 1;
const UPDATED_COL = HEADERS.indexOf('Updated') + 1;
const REMINDERS_COL = HEADERS.indexOf('Reminder IDs') + 1;
const STATUSES = ['Draft', 'In Progress', 'In Review', 'Revision', 'Done'];
// A CTC-Video link also records whose edit it is, stored in the category as e.g. "CTC-Video [VG-Arif]"
const VIDEO_SOURCES = ['VG-Arif', 'VG-Anno'];
// Links in the Reference category always get this project
const REFERENCE_PROJECT = 'REFERENCE';
// Google Calendar reminders: this many days before the deadline, at this hour (script time zone)
const REMINDER_DAYS = [2, 1];
const REMINDER_HOUR = 9;

/* ---------- Milestones setup: edit names here when the team changes ---------- */
const TASK_SHEET = 'Tasks';
const TASK_HEADERS = ['ID', 'Created', 'Updated', 'Title', 'Project', 'Content Type', 'Channel', 'Graphic Designer', 'Videographer', 'Deadline', 'Stage', 'Current Step', 'Revisions', 'Link', 'Notes', 'History', 'Checklist'];
// Each project: its graphic designer and videographer (both filled in automatically; no videographer =
// chosen for every video task), its icon (also used in All Links), the content types it makes
// (all except Event Attribute when not set) and whether it only runs organic content
const PROJECTS = {
  'VTB': { designer: 'Ilham', videographer: 'Anno', icon: '🏙️', types: ['Static', 'Video (Shooting)'] },
  'KRR': { designer: 'Alfid', videographer: 'Anno', icon: '🌴', types: ['Static', 'Video (Shooting)', 'Event Attribute'] },
  'Makuta': { designer: 'Alfid', videographer: '', icon: '👑', orgOnly: true },
  'GTR': { designer: 'Wawan', videographer: 'Anno', icon: '🏡', types: ['Static', 'Video (Non-Shooting)'] }
};
// Videographers that can be picked when editing a task (new tasks use the project's videographer)
const VIDEOGRAPHERS = ['Anno', 'Arif'];
// Static = carousel, single image and motion (all made by the graphic designer).
// Event Attribute = everything for one exhibition / event, in one task that follows the Static steps.
const CONTENT_TYPES = ['Static', 'Video (Non-Shooting)', 'Video (Shooting)', 'Event Attribute'];
const EVENT_TYPE = 'Event Attribute';
// What an Event Attribute task delivers, ticked off one by one. days = posting day before the event (D-Day = the deadline).
const EVENT_ITEMS = [
  { name: 'Countdown H-5', days: 5 },
  { name: 'Countdown H-2', days: 2 },
  { name: 'Countdown D-Day', days: 0 },
  { name: 'Flyer Cetak' },
  { name: 'Video Reels Pameran' }
];
// ORG / ADS is read from the task title, e.g. "BRIEF ORG NOV KRR"
const CHANNELS = { 'ORG': 'Organic', 'ADS': 'Ads' };
// Every possible step, in order. Each task uses only the steps that fit its content type and channel (see pipeline_).
// qc: the step approves or sends work back. person: who does it (empty = the task's designer/videographer).
const STAGES = [
  { key: 'brief', name: 'Drafting Brief', role: 'Content Writer', person: 'Obi', action: 'Submit Brief for QC' },
  // Only used after the client asks for a revision: Obi decides who fixes it (not part of the normal timeline)
  { key: 'revision', name: 'Client Revision', role: 'Content Writer', person: 'Obi', extra: true },
  { key: 'qcBrief', name: 'QC Internal: Brief', role: 'Head Manager Content', person: 'Kak Hendra / Bu Riska', qc: true },
  { key: 'vo', name: 'Voice Over', role: 'Voice Over', person: 'Bu Riska', action: 'Voice Over Received' },
  { key: 'shoot', name: 'Shooting', role: 'Shooting', person: '', action: 'Shooting Done' },
  { key: 'video', name: 'CTC', role: 'Videographer', person: '', action: 'CTC Done, Submit for QC' },
  // The graphic designer only gets a video after its CTC has passed QC Internal
  { key: 'qcCut', name: 'QC Internal: CTC', role: 'Head Manager Content', person: 'Kak Hendra / Bu Riska', qc: true },
  { key: 'design', name: 'Design', role: 'Graphic Designer', person: '', action: 'Design Done, Submit for QC' },
  { key: 'motion', name: 'Motion / ToV', role: 'Graphic Designer', person: '', action: 'Motion / ToV Done, Submit for QC' },
  { key: 'qcContent', name: 'QC Internal: Content', role: 'Head Manager Content', person: 'Kak Hendra / Bu Riska', qc: true },
  { key: 'toClient', name: 'Send to Client', role: 'Assistant Manager', person: 'Kak Faza', action: 'Sent to Client' },
  { key: 'qcClient', name: 'QC Client', role: 'Client', person: 'Client', qc: true },
  { key: 'post', name: 'Scheduling Post', role: 'Content Writer', person: 'Obi', action: 'Scheduled on Meta Business Suite' },
  { key: 'ads', name: 'Run Ads', role: 'Ads Team', person: 'Musthofa', action: 'Mark as Live on Ads' }
];

// ALLOWALL lets the Vercel page (makuta-links-center.vercel.app) show the app inside its own address
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Makuta Links Center')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ---------- Passcode: the web app is open to "Anyone" (so it also works inside the Vercel page), ----------
   so every call from the page carries the passcode, checked here before anything is read or changed. */
const PASSCODE_PROPERTY = 'APP_PASSCODE';  // set in Project Settings > Script Properties
const MAX_WRONG_PASSCODES = 10;            // then everything stays locked for 15 minutes

// What the page may do. Every other function ends in "_", so google.script.run cannot call it.
const API = {
  getInitialData: getInitialData_, getLinks: getLinks_, addLink: addLink_, updateLink: updateLink_,
  setPinned: setPinned_, deleteLink: deleteLink_, getTasks: getTasks_, addTask: addTask_,
  updateTask: updateTask_, setTaskItem: setTaskItem_, moveTask: moveTask_, deleteTask: deleteTask_
};

// The only entry point for the page: api(passcode, "addLink", [data])
function api(passcode, fn, args) {
  checkPasscode_(passcode);
  if (!API.hasOwnProperty(fn)) throw new Error('Unknown action.');
  return API[fn].apply(null, Array.isArray(args) ? args : []);
}

// Errors starting with "LOCKED:" make the page show the passcode screen
function checkPasscode_(passcode) {
  const real = PropertiesService.getScriptProperties().getProperty(PASSCODE_PROPERTY);
  if (!real) throw new Error('LOCKED: No passcode is set up yet. Add ' + PASSCODE_PROPERTY + ' in Apps Script > Project Settings > Script Properties.');
  const cache = CacheService.getScriptCache();
  const wrong = Number(cache.get('wrongPasscodes') || 0);
  if (wrong >= MAX_WRONG_PASSCODES) throw new Error('LOCKED: Too many wrong passcodes. Please try again in 15 minutes.');
  if (String(passcode == null ? '' : passcode) !== real) {
    cache.put('wrongPasscodes', String(wrong + 1), 15 * 60);
    throw new Error('LOCKED: Wrong passcode.');
  }
}

// Run once from the Apps Script editor: asks for the permissions and creates the Links and Tasks sheets
// (with the edit warnings on their protected columns, see protectSheet_)
function setup() {
  getSheet_();
  getSheet_(TASK_SHEET, TASK_HEADERS);
  CalendarApp.getDefaultCalendar();
  const ready = !!PropertiesService.getScriptProperties().getProperty(PASSCODE_PROPERTY);
  Logger.log(ready ? 'Setup done. The passcode is set.' : 'Setup done. Now add ' + PASSCODE_PROPERTY + ' in Project Settings > Script Properties.');
}

/* ---------- Server functions used by the page (through api) ---------- */

function getInitialData_() {
  return {
    links: getLinks_(),
    tasks: getTasks_(),
    taskConfig: { stages: STAGES, projects: PROJECTS, videographers: VIDEOGRAPHERS, contentTypes: CONTENT_TYPES, channels: CHANNELS, eventType: EVENT_TYPE, eventItems: EVENT_ITEMS },
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    appUrl: ScriptApp.getService().getUrl()
  };
}

function getLinks_() {
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .filter(r => r[0] !== '')
    .map(r => publicLink_(rowToLink_(r)));
}

function addLink_(data) {
  return withLock_(() => {
    const sheet = getSheet_();
    const now = new Date().toISOString();
    const link = Object.assign(clean_(data), { id: newId_(), createdAt: now, updatedAt: now });
    const warning = syncReminders_(link, []);
    writeRows_(sheet, sheet.getLastRow() + 1, [linkToRow_(link)]);
    return publicLink_(link, warning);
  });
}

function updateLink_(id, data) {
  return withLock_(() => {
    const sheet = getSheet_();
    const row = findRow_(sheet, id);
    const old = rowToLink_(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
    const link = Object.assign(clean_(data), { id: old.id, createdAt: old.createdAt, updatedAt: new Date().toISOString() });
    const warning = syncReminders_(link, old.reminders);
    writeRows_(sheet, row, [linkToRow_(link)]);
    return publicLink_(link, warning);
  });
}

function setPinned_(id, pinned) {
  return withLock_(() => {
    const sheet = getSheet_();
    const row = findRow_(sheet, id);
    sheet.getRange(row, PINNED_COL).setValue(pinned === true);
    sheet.getRange(row, UPDATED_COL).setValue(new Date().toISOString());
    return true;
  });
}

function deleteLink_(id) {
  return withLock_(() => {
    const sheet = getSheet_();
    const row = findRow_(sheet, id);
    deleteReminders_(parseLines_(sheet.getRange(row, REMINDERS_COL).getValue()));
    sheet.deleteRow(row);
    return true;
  });
}

/* ---------- Milestones: content tasks and their step-by-step timeline ---------- */

function getTasks_() {
  const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, TASK_HEADERS.length).getValues()
    .filter(r => r[0] !== '')
    .map(rowToTask_);
}

function addTask_(data) {
  return withLock_(() => {
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    const now = new Date().toISOString();
    const task = Object.assign(cleanTask_(data), { id: newId_('T'), createdAt: now, updatedAt: now, stage: 'brief', checklist: [] });
    task.history = [{ at: now, action: 'created', from: '', to: 'brief', note: '' }];
    return writeTask_(sheet, sheet.getLastRow() + 1, task);
  });
}

function updateTask_(id, data) {
  return withLock_(() => {
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    const row = findRow_(sheet, id);
    const task = Object.assign(readTask_(sheet, row), cleanTask_(data), { updatedAt: new Date().toISOString() });
    task.stage = fitStage_(task);
    if (task.type !== EVENT_TYPE) task.checklist = [];
    return writeTask_(sheet, row, task);
  });
}

// Ticks (or unticks) one Event Attribute deliverable, e.g. "Flyer Cetak"
function setTaskItem_(id, item, checked) {
  return withLock_(() => {
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    const row = findRow_(sheet, id);
    const task = readTask_(sheet, row);
    if (task.type !== EVENT_TYPE || !EVENT_ITEMS.some(i => i.name === item)) throw new Error('This task has no such item.');
    task.checklist = task.checklist.filter(i => i !== item);
    if (checked === true) task.checklist.push(item);
    task.updatedAt = new Date().toISOString();
    return writeTask_(sheet, row, task);
  });
}

// action: "advance" = the current step is done / approved, "revise" = a QC step sends the work
// back to opts.to (QC Client always sends it back to Obi first), "assign" = Obi passes a client
// revision on to opts.to, "undo" = take back the last move. opts.from is the step the page showed,
// so a double click (or a change made on another device) can't move the task twice.
function moveTask_(id, action, opts) {
  opts = opts || {};
  return withLock_(() => {
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    const row = findRow_(sheet, id);
    const task = readTask_(sheet, row);
    if (opts.from && opts.from !== task.stage) throw new Error('This task was already updated. Please refresh the page.');
    const steps = pipeline_(task.type, task.channel);
    const i = steps.indexOf(task.stage);
    const now = new Date().toISOString();
    const note = String(opts.note || '').trim().slice(0, 1000);
    if (action === 'advance') {
      if (i < 0) throw new Error(task.stage === 'revision' ? 'Choose who fixes the revision first.' : 'This task is already done.');
      // A fix made for a revision goes straight back to the next QC step
      const entered = task.history.filter(h => h.to === task.stage).pop();
      const fixing = entered && (entered.action === 'revision' || entered.action === 'assign');
      const next = (fixing && steps.slice(i + 1).filter(k => stageInfo_(k).qc)[0]) || steps[i + 1] || 'done';
      task.history.push({ at: now, action: stageInfo_(task.stage).qc ? 'approved' : 'done', from: task.stage, to: next, note: note });
      task.stage = next;
    } else if (action === 'revise') {
      if (i < 0 || !stageInfo_(task.stage).qc) throw new Error('A revision can only be requested at a QC step.');
      const to = task.stage === 'qcClient' ? 'revision' : opts.to;
      const j = steps.indexOf(to);
      if (to !== 'revision' && (j < 0 || j >= i || stageInfo_(to).qc)) throw new Error('Please choose which step needs the revision.');
      task.history.push({ at: now, action: 'revision', from: task.stage, to: to, note: note });
      task.stage = to;
    } else if (action === 'assign') {
      if (task.stage !== 'revision') throw new Error('This task has no client revision waiting.');
      if (fixSteps_(steps).indexOf(opts.to) < 0) throw new Error('Please choose who fixes the revision.');
      task.history.push({ at: now, action: 'assign', from: 'revision', to: opts.to, note: note });
      task.stage = opts.to;
    } else if (action === 'undo') {
      if (task.history.length < 2) throw new Error('Nothing to undo.');
      task.stage = task.history.pop().from;
      task.stage = fitStage_(task);
    } else {
      throw new Error('Unknown action.');
    }
    task.updatedAt = now;
    return writeTask_(sheet, row, task);
  });
}

function deleteTask_(id) {
  return withLock_(() => {
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    sheet.deleteRow(findRow_(sheet, id));
    return true;
  });
}

// The steps a task goes through, based on its content type and channel
function pipeline_(type, channel) {
  const video = /^Video/.test(type);
  return STAGES.map(s => s.key).filter(k =>
    k === 'revision' ? false :
    k === 'vo' ? type === 'Video (Non-Shooting)' :
    k === 'shoot' ? type === 'Video (Shooting)' :
    k === 'video' || k === 'qcCut' || k === 'motion' ? video :
    k === 'design' ? !video :
    k === 'post' ? channel !== 'ADS' :
    k === 'ads' ? channel === 'ADS' : true);
}

// Steps that can fix a client revision: videographer (CTC) or graphic designer
function fixSteps_(steps) {
  return steps.filter(k => k === 'video' || k === 'design' || k === 'motion');
}

// Titles follow "[BRIEF / VIDEO CTC] [ORG / ADS] [MONTH] [PROJECT]", e.g. "VIDEO CTC ORG NOVEMBER VTB".
// "BRIEF ORG NOV KRR" -> "ORG". Empty when the title has neither (or both).
function channelFromTitle_(title) {
  const found = Object.keys(CHANNELS).filter(c => new RegExp('(^|[^A-Za-z])' + c + '([^A-Za-z]|$)', 'i').test(title));
  return found.length === 1 ? found[0] : '';
}

function stageInfo_(key) {
  return STAGES.filter(s => s.key === key)[0] || {};
}

// Keeps the task on a valid step after its content type or channel changed
function fitStage_(task) {
  if (task.stage === 'done' || task.stage === 'revision') return task.stage;
  const steps = pipeline_(task.type, task.channel);
  if (steps.indexOf(task.stage) >= 0) return task.stage;
  if (task.stage === 'post' || task.stage === 'ads') return steps[steps.length - 1];
  // Otherwise go back to the closest earlier step that still applies
  const order = STAGES.map(s => s.key);
  const pos = order.indexOf(task.stage);
  return steps.filter(k => order.indexOf(k) < pos).pop() || steps[0];
}

function currentStep_(t) {
  if (t.stage === 'done') return t.channel === 'ADS' ? 'Done: Live on Ads' : 'Done: Scheduled / Posted';
  const s = stageInfo_(t.stage);
  return s.name + ' (' + stageOwner_(s, t) + ')';
}

// Who does a step for this task; the designer / videographer come from the task itself
function stageOwner_(s, t) {
  if (s.key === 'shoot') return 'Obi & ' + (t.videographer || 'Videographer');
  return s.person || (s.role === 'Graphic Designer' ? t.designer : s.role === 'Videographer' ? t.videographer : '') || s.role;
}

function cleanTask_(d) {
  d = d || {};
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const line = v => str(v, 100).replace(/[\r\n]+/g, ' ');
  const t = {
    title: str(d.title, 300).replace(/[\r\n]+/g, ' '),
    project: line(d.project),
    type: CONTENT_TYPES.indexOf(d.type) >= 0 ? d.type : '',
    channel: '',
    designer: '',
    videographer: line(d.videographer),
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(d.deadline) ? d.deadline : '',
    link: str(d.link, 2000),
    notes: str(d.notes, 5000)
  };
  if (!t.title) throw new Error('Title is required.');
  t.channel = channelFromTitle_(t.title);
  if (!t.channel) throw new Error('Write either ORG or ADS in the title, e.g. "BRIEF ORG NOV KRR".');
  if (!PROJECTS.hasOwnProperty(t.project)) throw new Error('Please choose the project.');
  const p = PROJECTS[t.project];
  if (p.orgOnly && t.channel !== 'ORG') throw new Error(t.project + ' is organic only. Use ORG in the title.');
  t.designer = p.designer;
  if (!t.type) throw new Error('Please choose the content type.');
  if ((p.types || CONTENT_TYPES).indexOf(t.type) < 0) throw new Error(t.project + ' has no ' + t.type + ' content.');
  if (t.type === EVENT_TYPE && !t.deadline) throw new Error('Please fill in the event date (D-Day).');
  if (!/^Video/.test(t.type)) t.videographer = '';
  else if (VIDEOGRAPHERS.indexOf(t.videographer) < 0) {
    if (!p.videographer) throw new Error('Please choose the videographer for ' + t.project + ' (' + VIDEOGRAPHERS.join(' or ') + ').');
    t.videographer = p.videographer;
  }
  if (t.link && !isUrl_(t.link)) throw new Error('The link must start with http:// or https://');
  return t;
}

function readTask_(sheet, row) {
  return rowToTask_(sheet.getRange(row, 1, 1, TASK_HEADERS.length).getValues()[0]);
}

// Saves the task (all as plain text) and returns it the way the page uses it
function writeTask_(sheet, row, t) {
  const missing = row - sheet.getMaxRows();
  if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing);
  const revisions = t.history.filter(h => h.action === 'revision').length;
  sheet.getRange(row, 1, 1, TASK_HEADERS.length).setNumberFormat('@').setValues([[
    t.id, t.createdAt, t.updatedAt, t.title, t.project, t.type, t.channel, t.designer, t.videographer, t.deadline,
    t.stage, currentStep_(t), String(revisions), t.link, t.notes, JSON.stringify(t.history),
    t.type === EVENT_TYPE ? EVENT_ITEMS.map(i => i.name).filter(n => t.checklist.indexOf(n) >= 0).join('\n') : ''
  ].map(safe_)]);
  t.steps = pipeline_(t.type, t.channel);
  return t;
}

function rowToTask_(r) {
  let history = [];
  try { history = JSON.parse(text_(r[15]) || '[]'); } catch (e) {}
  const task = {
    id: text_(r[0]),
    createdAt: toIso_(r[1]),
    updatedAt: toIso_(r[2]),
    title: text_(r[3]),
    project: text_(r[4]),
    type: text_(r[5]),
    channel: text_(r[6]).trim().toUpperCase(),
    designer: (PROJECTS[text_(r[4])] || {}).designer || text_(r[7]),
    videographer: text_(r[8]),
    deadline: toDay_(r[9]),
    stage: text_(r[10]).trim(),
    link: text_(r[13]),
    notes: text_(r[14]),
    history: Array.isArray(history) ? history : [],
    checklist: parseLines_(r[16])
  };
  task.stage = fitStage_(task);
  task.steps = pipeline_(task.type, task.channel);
  return task;
}

/* ---------- Helpers ---------- */

function getSheet_(name, headers) {
  name = name || SHEET_NAME;
  headers = headers || HEADERS;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  // (Re)create the header row if the sheet is new or was emptied by hand
  const fresh = sheet.getLastRow() === 0;
  if (fresh) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  protectSheet_(sheet, headers, fresh);
  return sheet;
}

// Columns only the website should change. Editing them by hand in the sheet shows an
// "Are you sure?" warning; the website itself still writes to them as usual.
const PROTECTED_COLUMNS = {
  'Links': ['ID', 'Reminder IDs'],
  'Tasks': ['ID', 'Stage', 'Current Step', 'Revisions', 'History', 'Checklist']
};

// Adds the warnings once per sheet (again if the sheet was recreated); existing ones are kept
function protectSheet_(sheet, headers, force) {
  const props = PropertiesService.getScriptProperties();
  const flag = 'PROTECTED_' + sheet.getName();
  if (!force && props.getProperty(flag)) return;
  const have = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).map(p => p.getDescription());
  const warn = (a1, label) => {
    const description = 'Makuta: ' + label + ' (changed by the website only)';
    if (have.indexOf(description) < 0) sheet.getRange(a1).protect().setDescription(description).setWarningOnly(true);
  };
  warn('1:1', 'column titles');
  (PROTECTED_COLUMNS[sheet.getName()] || []).forEach(name => {
    const letter = String.fromCharCode(65 + headers.indexOf(name));
    warn(letter + ':' + letter, name);
  });
  props.setProperty(flag, new Date().toISOString());
}

// Writes rows as plain text, so Sheets never turns "001" into 1, "50%" into 0.5,
// or "12/11" into a date. Only the Pinned column keeps its TRUE/FALSE type.
function writeRows_(sheet, startRow, rows) {
  const missing = startRow + rows.length - 1 - sheet.getMaxRows();
  if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing);
  sheet.getRange(startRow, 1, rows.length, PINNED_COL - 1).setNumberFormat('@');
  sheet.getRange(startRow, PINNED_COL + 1, rows.length, HEADERS.length - PINNED_COL).setNumberFormat('@');
  sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function findRow_(sheet, id) {
  const last = sheet.getLastRow();
  if (last >= 2) {
    const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) return i + 2;
    }
  }
  throw new Error((sheet.getName() === TASK_SHEET ? 'Task' : 'Link') + ' not found. It may have been deleted - please refresh the page.');
}

// The letter prefix ("L" for links, "T" for tasks) keeps the ID a string in Sheets (never parsed as a number)
function newId_(prefix) {
  return (prefix || 'L') + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function isUrl_(url) {
  return /^https?:\/\/\S+$/i.test(url);
}

/* ---------- Google Calendar reminders ---------- */

// Replaces the link's reminders: removes the old events, then adds one for each of
// REMINDER_DAYS that is still in the future. Links that are Done or have no deadline get none.
// Returns a warning if the calendar could not be updated (the link itself is still saved).
function syncReminders_(link, oldIds) {
  link.reminders = [];
  try {
    deleteReminders_(oldIds);
    if (!link.deadline || link.status === 'Done') return '';
    const cal = CalendarApp.getDefaultCalendar();
    const p = link.deadline.split('-').map(Number);
    REMINDER_DAYS.forEach(days => {
      const start = new Date(p[0], p[1] - 1, p[2] - days, REMINDER_HOUR);
      if (start <= new Date()) return;
      const title = '[MAKUTA] ' + (days === 1 ? 'Due tomorrow' : 'Due in ' + days + ' days') + ': ' + link.title +
        (link.project ? ' (' + link.project + ')' : '');
      const event = cal.createEvent(title, start, new Date(start.getTime() + 30 * 60000), {
        description: 'Deadline: ' + link.deadline + '\nStatus: ' + link.status + '\nCategory: ' + link.category + '\n\n' + link.url
      });
      event.removeAllReminders();
      event.addPopupReminder(0);
      link.reminders.push(event.getId());
    });
    return '';
  } catch (e) {
    return 'Saved, but the Google Calendar reminder could not be updated: ' + e.message;
  }
}

function deleteReminders_(ids) {
  if (!ids || !ids.length) return;
  const cal = CalendarApp.getDefaultCalendar();
  ids.forEach(id => {
    try {
      const event = cal.getEventById(id);
      if (event) event.deleteEvent();
    } catch (e) {
      // Already deleted by hand in Google Calendar
    }
  });
}

// What the page receives: everything except the calendar event IDs
function publicLink_(link, warning) {
  const out = Object.assign({}, link);
  delete out.reminders;
  if (warning) out.warning = warning;
  return out;
}

function cleanCategory_(value) {
  const c = String(value == null ? '' : value).trim();
  const m = c.match(/^CTC-Video \[(.+)\]$/);
  if (m && VIDEO_SOURCES.indexOf(m[1]) >= 0) return c;
  if (/^CTC-Video\b/.test(c)) throw new Error('Please choose the video source for CTC-Video (' + VIDEO_SOURCES.join(' or ') + ').');
  return c.slice(0, 100);
}

function clean_(d) {
  d = d || {};
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const link = {
    title: str(d.title, 300).replace(/[\r\n]+/g, ' '),
    url: str(d.url, 2000),
    category: cleanCategory_(d.category),
    project: str(d.project, 100).replace(/[\r\n]+/g, ' '),
    status: STATUSES.indexOf(d.status) >= 0 ? d.status : 'Draft',
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(d.deadline) ? d.deadline : '',
    pinned: d.pinned === true,
    purpose: str(d.purpose, 5000),
    versions: (Array.isArray(d.versions) ? d.versions : [])
      .map(v => ({ label: str(v && v.label, 100).replace(/[\r\n|]+/g, ' '), url: str(v && v.url, 2000) }))
      .filter(v => isUrl_(v.url))
  };
  if (!link.title) throw new Error('Title is required.');
  if (!isUrl_(link.url)) throw new Error('A valid link (http/https) is required.');
  if (!link.category) throw new Error('Category is required.');
  // Reference links always belong to REFERENCE; no other link may use that project name
  if (link.category === 'Reference') link.project = REFERENCE_PROJECT;
  else if (link.project.toUpperCase() === REFERENCE_PROJECT) link.project = '';
  return link;
}

// Text starting with = + - @ or ' would be read by Sheets as a formula (or lose
// its apostrophe), so it is stored with one extra leading apostrophe...
function safe_(v) {
  return typeof v === 'string' && /^[=+\-@']/.test(v) ? "'" + v : v;
}
// ...which is removed again when reading, in case Sheets kept it.
function unsafe_(v) {
  return /^'[=+\-@']/.test(v) ? v.slice(1) : v;
}

function linkToRow_(l) {
  return [
    l.id, l.createdAt, l.updatedAt, l.title, l.url, l.category, l.project, l.status, l.deadline, l.pinned, l.purpose,
    l.versions.map(v => (v.label || 'Link') + ' | ' + v.url).join('\n'),
    (l.reminders || []).join('\n')
  ].map(safe_);
}

let timeZone_;
function getTimeZone_() {
  timeZone_ = timeZone_ || SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return timeZone_;
}

function text_(v) {
  return unsafe_(String(v == null ? '' : v));
}

function toIso_(v) {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString();
}

// Deadline is always returned as "yyyy-MM-dd" (or empty if it is not a valid date)
function toDay_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, getTimeZone_(), 'yyyy-MM-dd');
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

// Accepts "done", "IN REVIEW", etc. when the sheet was edited by hand
function toStatus_(v) {
  const s = text_(v).trim();
  const match = STATUSES.filter(x => x.toLowerCase() === s.toLowerCase())[0];
  return match || s || 'Draft';
}

function parseLines_(value) {
  return text_(value).split('\n').map(s => s.trim()).filter(Boolean);
}

function parseVersions_(value) {
  return text_(value).split('\n').map(line => {
    const i = line.indexOf(' | ');
    return i >= 0 ? { label: line.slice(0, i).trim(), url: line.slice(i + 3).trim() } : { label: '', url: line.trim() };
  }).filter(v => v.url);
}

function rowToLink_(r) {
  return {
    id: text_(r[0]),
    createdAt: toIso_(r[1]),
    updatedAt: toIso_(r[2]),
    title: text_(r[3]),
    url: text_(r[4]),
    category: text_(r[5]),
    project: text_(r[6]),
    status: toStatus_(r[7]),
    deadline: toDay_(r[8]),
    pinned: r[9] === true || String(r[9]).toUpperCase() === 'TRUE',
    purpose: text_(r[10]),
    versions: parseVersions_(r[11]),
    reminders: parseLines_(r[12])
  };
}
