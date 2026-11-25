/**
 * Makuta Links Center - Google Apps Script backend.
 * Data lives in the spreadsheet this script is bound to: "Links" (Resources), "Tasks" (Milestones),
 * "Activity" (every login and change), and "Team", "Projects" and "Videographers" (Team & Projects page).
 */
const SHEET_NAME = 'Links';
const HEADERS = ['ID', 'Created', 'Updated', 'Title', 'Main Link', 'Category', 'Project', 'Status', 'Deadline', 'Pinned', 'Description', 'Related Links', 'Reminder IDs'];
const PINNED_COL = HEADERS.indexOf('Pinned') + 1;
const UPDATED_COL = HEADERS.indexOf('Updated') + 1;
// A CTC-Video link also records whose edit it is, stored in the category as e.g. "CTC-Video [VG-Arif]"
// (every videographer, also an archived one, so older links can still be saved)
const videoSources_ = () => dir_().raw.videographers.map(v => 'VG-' + v.name);
// Links in the Reference category always get this project
const REFERENCE_PROJECT = 'REFERENCE';

/* ---------- Milestones setup (the team and the projects are set on the Team & Projects page) ---------- */
const TASK_SHEET = 'Tasks';
const TASK_HEADERS = ['ID', 'Created', 'Updated', 'Title', 'Project', 'Content Type', 'Channel', 'Graphic Designer', 'Videographer', 'Deadline', 'Stage', 'Current Step', 'Revisions', 'Brief Link', 'Notes', 'History', 'Checklist', 'Work Month', 'For Month', 'Item', 'Result Link'];
/* ---------- The team and the projects live in the "Team", "Projects" and "Videographers" sheets ----------
   Managerial and the owner change them on the Team & Projects page (see the Team section below).
   The very first time, those sheets are filled with the team as it was when the page was added (SEED_*);
   after that the SEED_ lists are never used again.
   Team: username, name and role of each account. Content writers and graphic designers see the projects
   they are set on; managerial, the assistant manager and the owner see every project.
   Passwords are not stored anywhere (this code is public on GitHub). Set in Project Settings > Script Properties:
     PASSWORD_SUFFIX                   a team account's password is its username followed by this
     OWNER_USERNAME / OWNER_PASSWORD   the owner (superadmin) account, shown everywhere only as "Owner"
   Projects: code, icon (also used in Resources), content writer and graphic designer (usernames), default
   videographer (empty = chosen for every video task), the content types it makes and ORG + ADS / ORG only / ADS only. */
const SEED_USERS = {
  hendra: { name: 'Kak Hendra', role: 'manager' },
  riska: { name: 'Bu Riska', role: 'manager' },
  faza: { name: 'Kak Faza', role: 'assistant' },
  obi: { name: 'Obi', role: 'writer' },
  puput: { name: 'Puput', role: 'writer' },
  alfid: { name: 'Alfid', role: 'designer' },
  ilham: { name: 'Ilham', role: 'designer' },
  wawan: { name: 'Wawan', role: 'designer' }
};
const SEED_PROJECTS = {
  'VTB': { writer: 'obi', designer: 'ilham', videographer: 'Anno', icon: '🏙️', channel: 'both', types: ['Static', 'Video (Shooting)'] },
  'KRR': { writer: 'obi', designer: 'alfid', videographer: 'Anno', icon: '🌴', channel: 'both', types: ['Static', 'Video (Shooting)', 'Event Attribute'] },
  'Makuta': { writer: 'obi', designer: 'alfid', videographer: '', icon: '👑', channel: 'org', types: ['Static', 'Video (Non-Shooting)', 'Video (Shooting)'] },
  'GTR': { writer: 'obi', designer: 'wawan', videographer: 'Anno', icon: '🏡', channel: 'both', types: ['Static', 'Video (Non-Shooting)'] },
  'GM': { writer: 'puput', designer: 'wawan', videographer: 'Arif', icon: '🏢', channel: 'ads', types: ['Static', 'Video (Shooting)', 'Event Attribute'] },
  'HC': { writer: 'puput', designer: 'ilham', videographer: 'Arif', icon: '🏥', channel: 'ads', types: ['Static', 'Video (Shooting)', 'Event Attribute'] },
  'LUX': { writer: 'puput', designer: 'wawan', videographer: 'Arif', icon: '💎', channel: 'both', types: ['Static', 'Video (Non-Shooting)', 'Video (Shooting)', 'Event Attribute'] }
};
// Freelance videographers (no account): picked per project / video task, and "VG-Name" in Resources
const SEED_VIDEOGRAPHERS = ['Anno', 'Arif'];
const ROLE_NAMES = { owner: 'Owner', manager: 'Managerial', assistant: 'Assistant Manager', writer: 'Content Writer', designer: 'Graphic Designer' };
// The roles a team account can have (the owner is never in the team list)
const TEAM_ROLES = ['manager', 'assistant', 'writer', 'designer'];
// The Voice Over is always done by this account (shown by its current name)
const VOICE_OVER_USER = 'riska';
// Roles that see every project
const ALL_PROJECT_ROLES = ['owner', 'manager', 'assistant'];
// Who presses each step's button: the QC steps are for managerial, Design and Motion for the project's
// graphic designer, Send to Client, QC Client and Run Ads (the freelance ads team) for the assistant
// manager (Kak Faza), every other step (also those of the freelance videographers) for the project's
// content writer. Managerial and the owner can press every step.
const STEP_ACTORS = { qcBrief: 'manager', qcCut: 'manager', qcContent: 'manager', design: 'designer', motion: 'designer',
  toClient: 'assistant', qcClient: 'assistant', ads: 'assistant' };
// The link each of these steps hands on: the content writer submits the brief (one per channel of a
// Monthly Brief), the graphic designer the finished work (the result). QC, Send to Client and the
// posting steps open them from the task.
const LINK_STEPS = { brief: 'briefLink', design: 'resultLink', motion: 'resultLink' };
// Static = carousel, single image and motion (all made by the graphic designer).
// Event Attribute = everything for one exhibition / event, in one task that follows the Static steps.
// Collateral = one print, merchandise or web item a client asks for (any project, no ORG / ADS);
// it follows the Static steps and is done once the client approves it.
const CONTENT_TYPES = ['Static', 'Video (Non-Shooting)', 'Video (Shooting)', 'Event Attribute', 'Collateral'];
const EVENT_TYPE = 'Event Attribute';
const COLLATERAL_TYPE = 'Collateral';
// The content types a project is set to make (every project can get Collateral)
const PROJECT_TYPES = CONTENT_TYPES.filter(t => t !== COLLATERAL_TYPE);
const COLLATERAL_ITEMS = ['T-Banner', 'T-Banner Mini', 'Banner General', 'Neon Box', 'Billboard', 'Flyer', 'Brosur',
  'Landing Page', 'Website', 'Signboard', 'X Banner', 'Roll-up Banner', 'Product Knowledge', 'Umbul-umbul', 'Kipas', 'Topi'];
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
// Monthly Brief: briefs written in one month are for this many months later
// (written in November: ORG for December, ADS for November itself)
const BRIEF_MONTHS_AHEAD = { 'ORG': 1, 'ADS': 0 };
// Every possible step, in order. Each task uses only the steps that fit its content type and channel (see pipeline_).
// qc: the step approves or sends work back. person: who does it (empty = the task's designer/videographer;
// @managers / @assistants / @voiceOver = the current names of those accounts, see stages_).
const STAGE_LIST = [
  { key: 'brief', name: 'Drafting Brief', role: 'Content Writer', person: '', action: 'Submit Brief for QC' },
  // Only used after the client asks for a revision: the content writer decides who fixes it (not part of the normal timeline)
  { key: 'revision', name: 'Client Revision', role: 'Content Writer', person: '', extra: true },
  { key: 'qcBrief', name: 'QC Internal: Brief', role: 'Head Manager Content', person: '@managers', qc: true },
  { key: 'vo', name: 'Voice Over', role: 'Voice Over', person: '@voiceOver', action: 'Voice Over Received' },
  { key: 'shoot', name: 'Shooting', role: 'Shooting', person: '', action: 'Shooting Done' },
  { key: 'video', name: 'CTC', role: 'Videographer', person: '', action: 'CTC Done, Submit for QC' },
  // The graphic designer only gets a video after its CTC has passed QC Internal
  { key: 'qcCut', name: 'QC Internal: CTC', role: 'Head Manager Content', person: '@managers', qc: true },
  { key: 'design', name: 'Design', role: 'Graphic Designer', person: '', action: 'Design Done, Submit for QC' },
  { key: 'motion', name: 'Motion / ToV', role: 'Graphic Designer', person: '', action: 'Motion / ToV Done, Submit for QC' },
  { key: 'qcContent', name: 'QC Internal: Content', role: 'Head Manager Content', person: '@managers', qc: true },
  { key: 'toClient', name: 'Send to Client', role: 'Assistant Manager', person: '@assistants', action: 'Sent to Client' },
  { key: 'qcClient', name: 'QC Client', role: 'Client', person: 'Client', qc: true },
  { key: 'post', name: 'Scheduling Post', role: 'Content Writer', person: '', action: 'Scheduled on Meta Business Suite' },
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

/* ---------- Login: the web app is open to "Anyone" (so it also works inside the Vercel page), ----------
   so every call from the page carries the login ticket of this browser, checked here before anything
   is read or changed. The ticket itself is never stored, only its SHA-256 (see hash_). */
const ACCOUNT_PROPERTIES = ['PASSWORD_SUFFIX', 'OWNER_USERNAME', 'OWNER_PASSWORD'];
const OWNER_KEY = '@owner';            // how the owner is stored in sessions (never the real username)
const SESSION_PREFIX = 'SESSION_';     // Script Properties key of a session: SESSION_<hash of the ticket>
const SESSION_DAYS = 30;               // a login is remembered this long in one browser
const MAX_WRONG_PASSWORDS = 10;        // then that account stays locked for 15 minutes

// What the page may do. Every other function ends in "_", so google.script.run cannot call it.
const API = {
  getInitialData: getInitialData_, getLinks: getLinks_, addLink: addLink_, updateLink: updateLink_,
  setPinned: setPinned_, deleteLink: deleteLink_, getTasks: getTasks_, addTask: addTask_, addTasks: addTasks_,
  updateTask: updateTask_, setTaskItem: setTaskItem_, moveTask: moveTask_, deleteTask: deleteTask_,
  logout: logout_, getAdminData: getAdminData_, endSessions: endSessions_,
  getTeam: getTeam_, saveMember: saveMember_, setMemberActive: setMemberActive_, saveProject: saveProject_,
  setProjectActive: setProjectActive_, saveVideographer: saveVideographer_, setVideographerActive: setVideographerActive_
};
// Only these work while the owner uses View as (seeing the app as someone else changes nothing)
const READ_ONLY_API = ['getInitialData', 'getLinks', 'getTasks'];
const OWNER_API = ['getAdminData', 'endSessions'];
// The Team & Projects page: managerial and the owner
const TEAM_API = ['getTeam', 'saveMember', 'setMemberActive', 'saveProject', 'setProjectActive', 'saveVideographer', 'setVideographerActive'];

// The account making the current call (set by api and login)
let user_ = null;
// Each call from the page is one run of this script. Within a run the sheets are looked up and checked
// once (see getSheet_), and the activity rows are written together at the end (see logActivity_).
let sheets_ = {};
let activityRows_ = [];
function startRun_() {
  sheets_ = {};
  activityRows_ = [];
  team_ = null;
  inLock_ = false;
}

// The only entry point for the page: api(ticket, "addLink", [data]). viewAs: the owner sees the app
// as that team account, read-only.
function api(ticket, fn, args, viewAs) {
  startRun_();
  user_ = checkSession_(ticket);
  if (!API.hasOwnProperty(fn)) throw new Error('Unknown action.');
  if (OWNER_API.indexOf(fn) >= 0 && user_.role !== 'owner') throw new Error('Only the owner can do this.');
  if (TEAM_API.indexOf(fn) >= 0 && !isBoss_(user_)) throw new Error('Only managerial and the owner can change the team and the projects.');
  if (viewAs) {
    if (user_.role !== 'owner' || viewAs === OWNER_KEY || !account_(String(viewAs))) throw new Error('Only the owner can use View as.');
    if (READ_ONLY_API.indexOf(fn) < 0) throw new Error('View as is read-only. Exit View as to make changes.');
    user_ = Object.assign(account_(viewAs), { readOnly: true, session: user_.session });
  }
  return API[fn].apply(null, Array.isArray(args) ? args : []);
}

// Called by the login screen: checks the username and password and returns a new ticket for this browser,
// with everything the page shows (so opening the app takes one call, not two).
// Errors starting with "LOCKED:" make the page show the login screen.
function login(username, password, device) {
  startRun_();
  const props = PropertiesService.getScriptProperties();
  const suffix = props.getProperty('PASSWORD_SUFFIX');
  if (!suffix) throw new Error('LOCKED: The accounts are not set up yet. Add ' + ACCOUNT_PROPERTIES.join(', ') + ' in Apps Script > Project Settings > Script Properties.');
  const name = String(username == null ? '' : username).trim().toLowerCase();
  const owner = String(props.getProperty('OWNER_USERNAME') || '').trim().toLowerCase();
  // Archived accounts can't log in
  const member = has_(dir_().users, name) ? dir_().users[name] : null;
  const key = owner && name === owner ? OWNER_KEY : member && member.active ? name : '';
  const real = key === OWNER_KEY ? props.getProperty('OWNER_PASSWORD') : key ? key + suffix : '';
  const cache = CacheService.getScriptCache();
  // Wrong tries are counted per account (all unknown usernames share one count)
  const wrongKey = 'wrongLogin_' + (key || '?');
  const wrong = Number(cache.get(wrongKey) || 0);
  if (wrong >= MAX_WRONG_PASSWORDS) throw new Error('LOCKED: Too many wrong passwords for this account. Please try again in 15 minutes.');
  const ticket = withLock_(() => {
    if (!key || !real || String(password == null ? '' : password) !== real) {
      cache.put(wrongKey, String(wrong + 1), 15 * 60);
      // An unknown username is not written down (it could be a mistyped owner username)
      logActivity_('Failed login', '', '', '', key ? account_(key).name : '(unknown username)');
      throw new Error('LOCKED: Wrong username or password.');
    }
    cache.remove(wrongKey);
    const ticket = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    const now = Date.now();
    endOldSessions_(props, now);
    props.setProperty(SESSION_PREFIX + hash_(ticket), JSON.stringify({ u: key, start: now, seen: now, device: String(device || '').slice(0, 120) }));
    user_ = account_(key);
    logActivity_('Login', '', '', String(device || '').slice(0, 120));
    return ticket;
  });
  return { ticket: ticket, data: getInitialData_() };
}

// The account a session belongs to (a team username or OWNER_KEY), with the (not archived) projects it sees.
// null for an archived or unknown account, which ends its logins.
function account_(key) {
  const d = dir_();
  const u = key === OWNER_KEY ? { name: 'Owner', role: 'owner', active: true } : has_(d.users, key) ? d.users[key] : null;
  if (!u || !u.active) return null;
  const all = ALL_PROJECT_ROLES.indexOf(u.role) >= 0;
  return { key: key, name: u.name, role: u.role, all: all,
    projects: Object.keys(d.projects).filter(p => !d.projects[p].archived && (all || d.projects[p][u.role + 'Key'] === key)) };
}

function checkSession_(ticket) {
  if (!ticket) throw new Error('LOCKED: ');
  const props = PropertiesService.getScriptProperties();
  const id = SESSION_PREFIX + hash_(String(ticket));
  let s = null;
  try { s = JSON.parse(props.getProperty(id) || 'null'); } catch (e) {}
  const account = s && Date.now() < s.start + SESSION_DAYS * 864e5 ? account_(s.u) : null;
  if (!account) {
    if (s) props.deleteProperty(id);
    throw new Error('LOCKED: ' + (s ? 'Your login has ended. Please log in again.' : 'Please log in again.'));
  }
  // "Last active" for the owner's session list, saved at most every 10 minutes
  if (Date.now() - s.seen > 10 * 60000) {
    s.seen = Date.now();
    props.setProperty(id, JSON.stringify(s));
  }
  account.session = id;
  return account;
}

function logout_() {
  return withLock_(() => {
    PropertiesService.getScriptProperties().deleteProperty(user_.session);
    logActivity_('Logout', '', '', '');
    return true;
  });
}

// Removes the sessions older than SESSION_DAYS
function endOldSessions_(props, now) {
  const all = props.getProperties();
  Object.keys(all).forEach(k => {
    if (k.indexOf(SESSION_PREFIX) !== 0) return;
    let s = null;
    try { s = JSON.parse(all[k]); } catch (e) {}
    if (!s || now >= s.start + SESSION_DAYS * 864e5) props.deleteProperty(k);
  });
}

function hash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

/* ---------- Owner only: who is logged in, the activity log, and ending sessions ---------- */

function getAdminData_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const sessions = Object.keys(props).filter(k => k.indexOf(SESSION_PREFIX) === 0).map(k => {
    let s = {};
    try { s = JSON.parse(props[k]); } catch (e) {}
    const a = account_(s.u) || { name: '?', role: '' };
    return { id: k, name: a.name, role: ROLE_NAMES[a.role] || '', device: s.device || '', start: new Date(s.start).toISOString(),
      seen: new Date(s.seen).toISOString(), self: k === user_.session };
  }).filter(s => s.name !== '?').sort((a, b) => b.seen.localeCompare(a.seen));
  const sheet = getSheet_(ACTIVITY_SHEET, ACTIVITY_HEADERS);
  const last = sheet.getLastRow();
  const from = Math.max(2, last - MAX_ACTIVITY_SHOWN + 1);
  const activity = last < 2 ? [] : sheet.getRange(from, 1, last - from + 1, ACTIVITY_HEADERS.length).getValues()
    .map(r => ({ at: toIso_(r[0]), who: text_(r[1]), action: text_(r[2]), project: text_(r[3]), task: text_(r[4]), details: text_(r[5]) }))
    .reverse();
  const users = dir_().raw.users.filter(u => u.active).map(u => ({ username: u.username, name: u.name, role: ROLE_NAMES[u.role] }));
  return { sessions: sessions, activity: activity, users: users };
}

// ids: the sessions to end (from getAdminData), or "all" for everyone except the owner's own session
function endSessions_(ids) {
  return withLock_(() => {
    const props = PropertiesService.getScriptProperties();
    const all = Object.keys(props.getProperties()).filter(k => k.indexOf(SESSION_PREFIX) === 0 && k !== user_.session);
    const ended = ids === 'all' ? all : all.filter(k => Array.isArray(ids) && ids.indexOf(k) >= 0);
    ended.forEach(k => props.deleteProperty(k));
    logActivity_('Ended logins', '', '', ids === 'all' ? 'Everyone (' + ended.length + ')' : String(ended.length));
    return ended.length;
  });
}

/* ---------- Team & Projects: who is in the team, the projects and the videographers ----------
   Kept in three sheets. Changed on the Team & Projects page by managerial and the owner (only the owner
   adds or changes managerial accounts). Nobody is deleted: people, projects and videographers are archived,
   so their history stays and they can be restored. Read once per run, from a 10 minute cache (a change
   typed by hand into these sheets shows within 10 minutes; a change made on the page shows at once). */
const TEAM_SHEET = 'Team';
const TEAM_HEADERS = ['Username', 'Name', 'Role', 'Status', 'Added', 'Updated'];
const PROJECT_SHEET = 'Projects';
const PROJECT_HEADERS = ['Code', 'Icon', 'Content Writer', 'Graphic Designer', 'Videographer', 'Content Types', 'Channel', 'Status', 'Added', 'Updated'];
const VIDEOGRAPHER_SHEET = 'Videographers';
const VIDEOGRAPHER_HEADERS = ['Name', 'Status', 'Added', 'Updated'];
const ACTIVE = 'Active';
const ARCHIVED = 'Archived';
// How a project's channel is written in the Projects sheet
const PROJECT_CHANNELS = { both: 'ORG + ADS', org: 'ORG only', ads: 'ADS only' };
const TEAM_SEEDED = 'TEAM_SEEDED';     // Script Property: the sheets were filled the first time
const TEAM_CACHE = 'team_v1';
const TEAM_CACHE_SECONDS = 600;

// The team of this run: { raw: the sheets' rows, users: {username: member}, projects: {code: project},
// managers / assistants: names of the active ones }
let team_ = null;
function dir_() {
  if (team_) return team_;
  let raw = null;
  try { raw = JSON.parse(CacheService.getScriptCache().get(TEAM_CACHE) || 'null'); } catch (e) {}
  // Read under the lock: a read that started before a change on the page could otherwise put the old team
  // back in the cache for 10 minutes
  if (!raw) raw = withLock_(() => {
    if (!PropertiesService.getScriptProperties().getProperty(TEAM_SEEDED)) seedTeam_();
    const fresh = readTeam_();
    cacheTeam_(fresh);
    return fresh;
  });
  return team_ = buildDir_(raw);
}

function cacheTeam_(raw) {
  try { CacheService.getScriptCache().put(TEAM_CACHE, JSON.stringify(raw), TEAM_CACHE_SECONDS); } catch (e) {}
}

// The rows of the three sheets, as they are (also archived ones); rows without a valid key are skipped
function readTeam_() {
  const rows = (name, headers) => {
    const sheet = getSheet_(name, headers);
    const last = sheet.getLastRow();
    return last < 2 ? [] : sheet.getRange(2, 1, last - 1, headers.length).getValues();
  };
  const cell = v => text_(v).trim();
  const isActive = v => cell(v).toLowerCase() !== ARCHIVED.toLowerCase();
  const roleOf = v => TEAM_ROLES.filter(r => r === cell(v).toLowerCase() || ROLE_NAMES[r].toLowerCase() === cell(v).toLowerCase())[0] || '';
  const channelOf = v => Object.keys(PROJECT_CHANNELS).filter(c => PROJECT_CHANNELS[c].toLowerCase() === cell(v).toLowerCase())[0] || 'both';
  const seen = {};
  const once = (kind, key) => key && !seen[kind + key.toLowerCase()] && (seen[kind + key.toLowerCase()] = true);
  return {
    users: rows(TEAM_SHEET, TEAM_HEADERS).map(r => ({ username: cell(r[0]).toLowerCase(), name: cell(r[1]), role: roleOf(r[2]), active: isActive(r[3]) }))
      .filter(u => /^[a-z][a-z0-9]*$/.test(u.username) && u.name && u.role && once('u', u.username)),
    projects: rows(PROJECT_SHEET, PROJECT_HEADERS).map(r => ({
      code: cell(r[0]), icon: cell(r[1]) || '📁', writer: cell(r[2]).toLowerCase(), designer: cell(r[3]).toLowerCase(),
      videographer: cell(r[4]), types: PROJECT_TYPES.filter(t => parseLines_(r[5]).indexOf(t) >= 0),
      channel: channelOf(r[6]), active: isActive(r[7])
    })).filter(p => p.code && once('p', p.code)),
    videographers: rows(VIDEOGRAPHER_SHEET, VIDEOGRAPHER_HEADERS).map(r => ({ name: cell(r[0]), active: isActive(r[1]) }))
      .filter(v => v.name && once('v', v.name))
  };
}

function buildDir_(raw) {
  const users = {};
  raw.users.forEach(u => users[u.username] = u);
  const nameOf = k => has_(users, k) ? users[k].name : '';
  const projects = {};
  raw.projects.forEach(p => projects[p.code] = {
    code: p.code, icon: p.icon, writer: nameOf(p.writer), designer: nameOf(p.designer), writerKey: p.writer, designerKey: p.designer,
    videographer: p.videographer, types: p.types.length ? p.types : PROJECT_TYPES.filter(t => t !== EVENT_TYPE),
    channel: p.channel, orgOnly: p.channel === 'org', adsOnly: p.channel === 'ads', archived: !p.active
  });
  const names = role => raw.users.filter(u => u.active && u.role === role).map(u => u.name);
  return { raw: raw, users: users, projects: projects, managers: names('manager'), assistants: names('assistant') };
}

// The first time: the team, projects and videographers as they were before this page existed.
// A sheet that already has rows (typed in by hand) is left as it is.
function seedTeam_() {
  withLock_(() => {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(TEAM_SEEDED)) return;
    const now = new Date().toISOString();
    const fill = (name, headers, rows) => {
      const sheet = getSheet_(name, headers);
      if (sheet.getLastRow() > 1) return;
      sheet.getRange(2, 1, rows.length, headers.length).setNumberFormat('@').setValues(rows.map(r => r.concat([now, now]).map(safe_)));
    };
    fill(TEAM_SHEET, TEAM_HEADERS, Object.keys(SEED_USERS).map(k => [k, SEED_USERS[k].name, ROLE_NAMES[SEED_USERS[k].role], ACTIVE]));
    fill(PROJECT_SHEET, PROJECT_HEADERS, Object.keys(SEED_PROJECTS).map(c => {
      const p = SEED_PROJECTS[c];
      return [c, p.icon, p.writer, p.designer, p.videographer, p.types.join('\n'), PROJECT_CHANNELS[p.channel], ACTIVE];
    }));
    fill(VIDEOGRAPHER_SHEET, VIDEOGRAPHER_HEADERS, SEED_VIDEOGRAPHERS.map(n => [n, ACTIVE]));
    props.setProperty(TEAM_SEEDED, now);
  });
}

// The projects as the page uses them: the active ones, with the names of their content writer and designer
function pageProjects_() {
  const d = dir_();
  const out = {};
  Object.keys(d.projects).filter(c => !d.projects[c].archived).forEach(c => {
    const p = d.projects[c];
    out[c] = { writer: p.writer, designer: p.designer, videographer: p.videographer, icon: p.icon, types: p.types.slice(), orgOnly: p.orgOnly, adsOnly: p.adsOnly };
  });
  return out;
}

// The emoji of every project, also archived ones (used for their links in Resources)
function projectIcons_() {
  const d = dir_();
  const out = {};
  Object.keys(d.projects).forEach(c => out[c] = d.projects[c].icon);
  return out;
}

// Names of the active videographers
const videographers_ = () => dir_().raw.videographers.filter(v => v.active).map(v => v.name);

// Everything the Team & Projects page shows. editable: whether this account may change that person.
function getTeam_() {
  const d = dir_();
  const owner = user_.role === 'owner';
  const roleOrder = r => TEAM_ROLES.indexOf(r);
  return {
    members: d.raw.users.map(u => ({
      username: u.username, name: u.name, role: u.role, roleName: ROLE_NAMES[u.role], active: u.active,
      projects: activeProjectsOf_(d.raw, u.username), editable: owner || u.role !== 'manager'
    })).sort((a, b) => (b.active - a.active) || (roleOrder(a.role) - roleOrder(b.role)) || a.name.localeCompare(b.name)),
    projects: d.raw.projects.map(p => ({
      code: p.code, icon: p.icon, writer: p.writer, designer: p.designer, writerName: has_(d.users, p.writer) ? d.users[p.writer].name : p.writer,
      designerName: has_(d.users, p.designer) ? d.users[p.designer].name : p.designer, videographer: p.videographer,
      types: d.projects[p.code].types, channel: p.channel, active: p.active
    })),
    videographers: d.raw.videographers.slice(),
    roles: TEAM_ROLES.filter(r => owner || r !== 'manager').map(r => ({ key: r, name: ROLE_NAMES[r] })),
    projectTypes: PROJECT_TYPES,
    channels: PROJECT_CHANNELS
  };
}

// Active projects where that username is the content writer or the graphic designer
function activeProjectsOf_(raw, username) {
  return raw.projects.filter(p => p.active && (p.writer === username || p.designer === username)).map(p => p.code);
}

// Runs a change of the team: fn checks it against the sheets as they are now (not the cache) and writes
// it; then the team is read again, so this call and the next ones see the change at once.
function changeTeam_(fn) {
  return withLock_(() => {
    fn(readTeam_());
    const raw = readTeam_();
    cacheTeam_(raw);
    team_ = buildDir_(raw);
    return getTeam_();
  });
}

// Writes one row of a Team / Projects / Videographers sheet: the row with that key (first column), or a new one.
// values: every column before Added; Added is kept, Updated is now.
function writeTeamRow_(name, headers, key, values) {
  const sheet = getSheet_(name, headers);
  const last = sheet.getLastRow();
  const keys = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 1).getValues().map(r => text_(r[0]).trim().toLowerCase());
  const i = keys.indexOf(String(key).toLowerCase());
  const row = i >= 0 ? i + 2 : last + 1;
  const now = new Date().toISOString();
  const added = i >= 0 ? toIso_(sheet.getRange(row, headers.indexOf('Added') + 1).getValue()) || now : now;
  const missing = row - sheet.getMaxRows();
  if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing);
  sheet.getRange(row, 1, 1, headers.length).setNumberFormat('@').setValues([values.concat([added, now]).map(safe_)]);
}

// Words of task titles ("BRIEF ORG DECEMBER KRR"): a project code can't be one, or the title would be read wrongly
const titleWords_ = () => ['ORG', 'ADS', 'BRIEF', 'VIDEO', 'CTC', 'NON', 'SHOOTING', 'EVENT', 'COLLATERAL', 'STATIC'].concat(MONTH_NAMES, Object.keys(MONTH_WORDS));
const ROLE_JOBS = { writer: 'the content writer', designer: 'the graphic designer' };
// "Obi is still the content writer of VTB and KRR."
function stillOnProjects_(raw, member) {
  const codes = activeProjectsOf_(raw, member.username);
  return codes.length ? member.name + ' is still ' + (ROLE_JOBS[member.role] || 'set on') + ' of ' + codes.join(', ') +
    '. Choose someone else for ' + (codes.length > 1 ? 'those projects' : 'it') + ' on the Projects tab first.' : '';
}
const activeManagers_ = raw => raw.users.filter(u => u.active && u.role === 'manager');

// Adds a person (isNew true) or changes the name / role of one. data: { username, name, role }.
// Their password is their username followed by PASSWORD_SUFFIX, like everyone else's.
function saveMember_(data, isNew) {
  data = data || {};
  return changeTeam_(raw => {
    const owner = user_.role === 'owner';
    const username = String(data.username == null ? '' : data.username).trim().toLowerCase();
    const name = String(data.name == null ? '' : data.name).trim().replace(/\s+/g, ' ');
    const role = String(data.role || '');
    const old = raw.users.filter(u => u.username === username)[0];
    if (isNew === true) {
      if (!/^[a-z][a-z0-9]{1,19}$/.test(username)) throw new Error('The username must be 2 to 20 small letters or digits, starting with a letter (e.g. dimas).');
      const ownerName = String(PropertiesService.getScriptProperties().getProperty('OWNER_USERNAME') || '').trim().toLowerCase();
      if (old || username === ownerName) throw new Error('The username "' + username + '" is already taken. Choose another one.');
    } else if (!old) {
      throw new Error('This person was not found. Please refresh the page.');
    }
    if (name.length < 2 || name.length > 40) throw new Error('The name must be 2 to 40 characters.');
    if (/[\/|<>"]/.test(name)) throw new Error('The name can\'t contain / | < > or ".');
    if (/^(owner|client)$/i.test(name) || raw.users.some(u => u.username !== username && u.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Someone is already called "' + name + '". Use another name, e.g. with their last name.');
    }
    if (TEAM_ROLES.indexOf(role) < 0) throw new Error('Please choose the role.');
    if (!owner && (role === 'manager' || (old && old.role === 'manager'))) throw new Error('Only the owner can add or change managerial accounts.');
    if (old && old.role !== role) {
      const busy = stillOnProjects_(raw, old);
      if (busy) throw new Error(busy);
      if (old.role === 'manager' && old.active && activeManagers_(raw).length < 2) throw new Error(old.name + ' is the only managerial account left, so the role can\'t change.');
    }
    writeTeamRow_(TEAM_SHEET, TEAM_HEADERS, username, [username, name, ROLE_NAMES[role], old && !old.active ? ARCHIVED : ACTIVE]);
    const changes = !old ? ROLE_NAMES[role] : [old.name !== name ? 'name: ' + old.name + ' → ' + name : '',
      old.role !== role ? 'role: ' + ROLE_NAMES[old.role] + ' → ' + ROLE_NAMES[role] : ''].filter(Boolean).join(', ');
    logActivity_(old ? 'Edited person' : 'Added person', '', name, changes);
  });
}

// Archives a person (they can't log in, their logins end now; their history stays) or restores them
function setMemberActive_(username, active) {
  return changeTeam_(raw => {
    const m = raw.users.filter(u => u.username === String(username))[0];
    if (!m) throw new Error('This person was not found. Please refresh the page.');
    if (m.username === user_.key) throw new Error('You can\'t archive your own account.');
    if (user_.role !== 'owner' && m.role === 'manager') throw new Error('Only the owner can archive or restore managerial accounts.');
    if (active === true) {
      if (m.active) return;
      writeTeamRow_(TEAM_SHEET, TEAM_HEADERS, m.username, [m.username, m.name, ROLE_NAMES[m.role], ACTIVE]);
      return logActivity_('Restored person', '', m.name, ROLE_NAMES[m.role]);
    }
    if (!m.active) return;
    const busy = stillOnProjects_(raw, m);
    if (busy) throw new Error(busy);
    if (m.role === 'manager' && activeManagers_(raw).length < 2) throw new Error(m.name + ' is the only managerial account left, so it can\'t be archived.');
    writeTeamRow_(TEAM_SHEET, TEAM_HEADERS, m.username, [m.username, m.name, ROLE_NAMES[m.role], ARCHIVED]);
    // Their open logins end now
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    let ended = 0;
    Object.keys(all).forEach(k => {
      if (k.indexOf(SESSION_PREFIX) !== 0) return;
      let s = null;
      try { s = JSON.parse(all[k]); } catch (e) {}
      if (s && s.u === m.username) { props.deleteProperty(k); ended++; }
    });
    logActivity_('Archived person', '', m.name, ROLE_NAMES[m.role] + (ended ? ', logged out (' + ended + ')' : ''));
  });
}

// Adds a project (isNew true) or changes one. data: { code, icon, writer, designer (usernames),
// videographer ('' = chosen per video task), types, channel: both / org / ads }
function saveProject_(data, isNew) {
  data = data || {};
  return changeTeam_(raw => {
    const code = String(data.code == null ? '' : data.code).trim();
    const old = raw.projects.filter(p => p.code === code)[0];
    if (isNew === true) {
      if (!/^[A-Za-z0-9]{2,12}$/.test(code)) throw new Error('The project code must be 2 to 12 letters or digits, without spaces (e.g. BSD).');
      if (titleWords_().indexOf(code.toUpperCase()) >= 0) throw new Error('"' + code + '" is a word used in task titles (like ORG, ADS or a month), so it can\'t be a project code.');
      const taken = raw.projects.filter(p => p.code.toLowerCase() === code.toLowerCase())[0];
      if (taken || code.toUpperCase() === REFERENCE_PROJECT) throw new Error('The project code "' + code + '" is already used' + (taken && !taken.active ? ' by an archived project. Restore that one instead.' : '. Choose another one.'));
    } else if (!old) {
      throw new Error('This project was not found. Please refresh the page.');
    }
    const icon = String(data.icon == null ? '' : data.icon).trim() || '📁';
    if (icon.length > 8 || /[\s<>"'&A-Za-z0-9]/.test(icon)) throw new Error('Use one emoji as the icon, e.g. 🏢');
    const person = (key, role) => raw.users.filter(u => u.username === String(key || '') && u.active && u.role === role)[0];
    const writer = person(data.writer, 'writer');
    const designer = person(data.designer, 'designer');
    if (!writer) throw new Error('Please choose the content writer.');
    if (!designer) throw new Error('Please choose the graphic designer.');
    const videographer = String(data.videographer == null ? '' : data.videographer).trim();
    if (videographer && !raw.videographers.some(v => v.name === videographer && (v.active || (old && old.videographer === videographer)))) {
      throw new Error('Please choose the videographer again.');
    }
    const types = PROJECT_TYPES.filter(t => Array.isArray(data.types) && data.types.indexOf(t) >= 0);
    if (!types.length) throw new Error('Tick at least one content type.');
    const channel = has_(PROJECT_CHANNELS, data.channel) ? data.channel : '';
    if (!channel) throw new Error('Please choose ORG + ADS, ORG only or ADS only.');
    writeTeamRow_(PROJECT_SHEET, PROJECT_HEADERS, code, [code, icon, writer.username, designer.username, videographer,
      types.join('\n'), PROJECT_CHANNELS[channel], old && !old.active ? ARCHIVED : ACTIVE]);
    logActivity_(old ? 'Edited project' : 'Added project', code, '', 'Content Writer: ' + writer.name + ', Graphic Designer: ' + designer.name);
  });
}

// Archives a project (its tasks are hidden, kept in the sheet) or restores it
function setProjectActive_(code, active) {
  return changeTeam_(raw => {
    const p = raw.projects.filter(x => x.code === String(code))[0];
    if (!p) throw new Error('This project was not found. Please refresh the page.');
    if (p.active === (active === true)) return;
    if (active === true) {
      const ok = (key, role) => raw.users.some(u => u.username === key && u.active && u.role === role);
      if (!ok(p.writer, 'writer') || !ok(p.designer, 'designer')) {
        throw new Error('Its content writer or graphic designer is no longer in the team. Edit ' + p.code + ' to choose them first.');
      }
    }
    writeTeamRow_(PROJECT_SHEET, PROJECT_HEADERS, p.code, [p.code, p.icon, p.writer, p.designer, p.videographer,
      p.types.join('\n'), PROJECT_CHANNELS[p.channel], active === true ? ACTIVE : ARCHIVED]);
    logActivity_(active === true ? 'Restored project' : 'Archived project', p.code, '', '');
  });
}

// Adds a freelance videographer
function saveVideographer_(name) {
  return changeTeam_(raw => {
    name = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
    if (!/^[A-Za-z][A-Za-z .'-]{1,29}$/.test(name)) throw new Error('The videographer\'s name must be 2 to 30 letters (e.g. Anno).');
    const taken = raw.videographers.filter(v => v.name.toLowerCase() === name.toLowerCase())[0];
    if (taken) throw new Error(taken.active ? name + ' is already in the list.' : name + ' is archived. Restore them instead.');
    writeTeamRow_(VIDEOGRAPHER_SHEET, VIDEOGRAPHER_HEADERS, name, [name, ACTIVE]);
    logActivity_('Added videographer', '', name, '');
  });
}

// Archives a videographer (no longer picked for new tasks) or restores them
function setVideographerActive_(name, active) {
  return changeTeam_(raw => {
    const v = raw.videographers.filter(x => x.name === String(name))[0];
    if (!v) throw new Error('This videographer was not found. Please refresh the page.');
    if (v.active === (active === true)) return;
    const uses = raw.projects.filter(p => p.active && p.videographer === v.name).map(p => p.code);
    if (active !== true && uses.length) throw new Error(v.name + ' is still the videographer of ' + uses.join(', ') + '. Choose another one for ' + (uses.length > 1 ? 'those projects' : 'it') + ' first.');
    writeTeamRow_(VIDEOGRAPHER_SHEET, VIDEOGRAPHER_HEADERS, v.name, [v.name, active === true ? ACTIVE : ARCHIVED]);
    logActivity_(active === true ? 'Restored videographer' : 'Archived videographer', '', v.name, '');
  });
}

/* ---------- Activity log: every login and change, in its own sheet (kept after a task is deleted) ---------- */
const ACTIVITY_SHEET = 'Activity';
const ACTIVITY_HEADERS = ['Time', 'Who', 'Action', 'Project', 'Task', 'Details'];
const MAX_ACTIVITY_SHOWN = 500;

// Always called inside withLock_, which writes the rows when it ends (one write for a move of 4 tasks).
// who: only for a failed login (otherwise the current account).
function logActivity_(action, project, task, details, who) {
  activityRows_.push([
    new Date().toISOString(), who || (user_ ? user_.name : ''), action, project || '', task || '', String(details || '').slice(0, 1000)
  ].map(safe_));
}
function writeActivity_() {
  const rows = activityRows_;
  activityRows_ = [];
  if (!rows.length) return;
  try {
    const sheet = getSheet_(ACTIVITY_SHEET, ACTIVITY_HEADERS);
    const row = sheet.getLastRow() + 1;
    const missing = row + rows.length - 1 - sheet.getMaxRows();
    if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing);
    sheet.getRange(row, 1, rows.length, ACTIVITY_HEADERS.length).setNumberFormat('@').setValues(rows);
  } catch (e) {
    // The log never stops the change itself
  }
}

/* ---------- Who may do what (the page shows the same rules, but they are enforced here) ---------- */
const isBoss_ = u => u.role === 'owner' || u.role === 'manager';
// The tasks of an archived project are hidden (they stay in the sheet and come back when it is restored)
const seesProject_ = (u, project) => u.all ? !(projectOf_(project) || {}).archived : u.projects.indexOf(project) >= 0;
// The project with that code (also an archived one), or null
const projectOf_ = code => has_(dir_().projects, code) ? dir_().projects[code] : null;
// Create, edit and delete a project's tasks: its content writer, managerial and the owner
const managesProject_ = (u, project) => isBoss_(u) || (u.role === 'writer' && (projectOf_(project) || {}).writerKey === u.key);
const stepActor_ = key => STEP_ACTORS[key] || 'writer';
// Press the button of the task's current step
function canPress_(u, t) {
  if (isBoss_(u)) return true;
  const actor = stepActor_(t.stage);
  // The assistant manager's steps are the same for every project
  return u.role === actor && (actor === 'assistant' || (projectOf_(t.project) || {})[actor + 'Key'] === u.key);
}
// Take back the last move: whoever made it, managerial and the owner (moves saved before logins
// existed have no name: the project's content writer too)
function canUndo_(u, t) {
  const last = t.history[t.history.length - 1] || {};
  return isBoss_(u) || (last.byKey ? last.byKey === u.key : last.by ? last.by === u.name : managesProject_(u, t.project));
}
// Tick Event Attribute deliverables: the content writer and graphic designer of the project, managerial, the owner
const canTick_ = (u, t) => managesProject_(u, t.project) || (u.role === 'designer' && (projectOf_(t.project) || {}).designerKey === u.key);

// Run once from the Apps Script editor: asks for the permissions and creates the sheets
// (with the edit warnings on their protected columns, see protectSheet_)
function setup() {
  getSheet_();
  getSheet_(TASK_SHEET, TASK_HEADERS);
  getSheet_(ACTIVITY_SHEET, ACTIVITY_HEADERS);
  // Creates the Team, Projects and Videographers sheets (filled the first time)
  dir_();
  CalendarApp.getDefaultCalendar();
  const props = PropertiesService.getScriptProperties();
  const missing = ACCOUNT_PROPERTIES.filter(k => !props.getProperty(k));
  Logger.log(missing.length ? 'Setup done. Now add ' + missing.join(', ') + ' in Project Settings > Script Properties.' : 'Setup done. The accounts are set.');
}

/* ---------- Server functions used by the page (through api) ---------- */

function getInitialData_() {
  upgradeTasks_();
  return {
    links: getLinks_(),
    tasks: getTasks_(),
    taskConfig: { stages: stages_(), projects: pageProjects_(), projectOrder: Object.keys(pageProjects_()), projectIcons: projectIcons_(), videographers: videographers_(), contentTypes: CONTENT_TYPES, channels: CHANNELS, briefMonthsAhead: BRIEF_MONTHS_AHEAD, eventType: EVENT_TYPE, eventItems: EVENT_ITEMS, collateralType: COLLATERAL_TYPE, collateralItems: COLLATERAL_ITEMS, stepActors: STEP_ACTORS, linkSteps: LINK_STEPS, assistantName: assistantName_() },
    // Who is logged in (the owner's username is never sent)
    // key: the team username (for Undo); never sent for the owner
    user: Object.assign(user_.role === 'owner' ? {} : { key: user_.key }, { name: user_.name, role: user_.role, roleName: ROLE_NAMES[user_.role],
      projects: user_.projects, all: user_.all, readOnly: !!user_.readOnly, canManageTeam: isBoss_(user_) && !user_.readOnly }),
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl()
  };
}

function getLinks_() {
  const sheet = getSheet_();
  return uniqueIds_(sheet, HEADERS.length, 'L', 6)
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
    logActivity_('Added link', link.project, link.title, link.url);
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
    logActivity_('Edited link', link.project, link.title, '');
    return publicLink_(link, warning);
  });
}

function setPinned_(id, pinned) {
  return withLock_(() => {
    const sheet = getSheet_();
    const row = findRow_(sheet, id);
    sheet.getRange(row, PINNED_COL).setValue(pinned === true);
    sheet.getRange(row, UPDATED_COL).setValue(new Date().toISOString());
    const link = rowToLink_(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
    logActivity_(pinned === true ? 'Pinned link' : 'Unpinned link', link.project, link.title, '');
    return true;
  });
}

function deleteLink_(id) {
  return withLock_(() => {
    const sheet = getSheet_();
    const row = findRow_(sheet, id);
    const link = rowToLink_(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);
    deleteReminders_(link.reminders);
    sheet.deleteRow(row);
    logActivity_('Deleted link', link.project, link.title, link.url);
    return true;
  });
}

/* ---------- Milestones: content tasks and their step-by-step timeline ---------- */

function getTasks_() {
  const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
  return uniqueIds_(sheet, TASK_HEADERS.length, 'T', 4)
    .filter(r => r[0] !== '')
    .map(rowToTask_)
    .filter(t => seesProject_(user_, t.project));
}

// The task in that row, if the current account may see it (otherwise it is "not found")
function readVisibleTask_(sheet, row) {
  const task = readTask_(sheet, row);
  if (!seesProject_(user_, task.project)) throw new Error('Task not found. It may have been deleted - please refresh the page.');
  return task;
}

function addTask_(data) {
  return addTasks_([data])[0];
}

// Monthly Brief: creates several tasks at once (Static + Video for ORG and ADS). workMonth
// ("2026-11") is the month the briefs are written in; it links the tasks (see linkedTasks_).
// Every task is checked first, so one mistake saves none of them.
function addTasks_(list, workMonth) {
  if (!Array.isArray(list) || !list.length) throw new Error('Choose at least one task.');
  if (list.length > 20) throw new Error('Too many tasks at once (max 20).');
  const month = /^\d{4}-\d{2}$/.test(workMonth) ? workMonth : '';
  const tasks = list.map(d => {
    try {
      const t = cleanTask_(d);
      if (!managesProject_(user_, t.project)) throw new Error('Only the content writer of ' + t.project + ' (or managerial) can create its tasks.');
      t.workMonth = month;
      t.forMonth = month ? addMonths_(month, BRIEF_MONTHS_AHEAD[t.channel] || 0) : '';
      return t;
    } catch (e) {
      throw new Error(list.length > 1 && d && d.title ? d.title + ': ' + e.message : e.message);
    }
  });
  return withLock_(() => {
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    const now = new Date().toISOString();
    const first = sheet.getLastRow() + 1;
    return tasks.map((t, i) => {
      Object.assign(t, { id: newId_('T'), createdAt: now, updatedAt: now, stage: 'brief', checklist: [] });
      t.history = [{ at: now, action: 'created', from: '', to: 'brief', note: '', by: user_.name, byKey: user_.key }];
      logActivity_('Created task', t.project, t.title, month ? 'Monthly Brief ' + month : t.type);
      return writeTask_(sheet, first + i, t);
    });
  });
}

function updateTask_(id, data) {
  return withLock_(() => {
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    const row = findRow_(sheet, id);
    const old = readVisibleTask_(sheet, row);
    const changes = cleanTask_(data, old);
    // A task can only be moved to a project its editor also looks after
    if (!managesProject_(user_, old.project) || !managesProject_(user_, changes.project)) throw new Error('Only the content writer of ' + old.project + ' (or managerial) can edit this task.');
    const task = Object.assign(old, changes, { updatedAt: new Date().toISOString() });
    task.stage = fitStage_(task);
    if (task.type !== EVENT_TYPE) task.checklist = [];
    logActivity_('Edited task', task.project, task.title, '');
    return writeTask_(sheet, row, task);
  });
}

// Ticks (or unticks) one Event Attribute deliverable, e.g. "Flyer Cetak"
function setTaskItem_(id, item, checked) {
  return withLock_(() => {
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    const row = findRow_(sheet, id);
    const task = readVisibleTask_(sheet, row);
    if (task.type !== EVENT_TYPE || !EVENT_ITEMS.some(i => i.name === item)) throw new Error('This task has no such item.');
    if (!canTick_(user_, task)) throw new Error('Only the content writer or graphic designer of ' + task.project + ' (or managerial) can tick this.');
    task.checklist = task.checklist.filter(i => i !== item);
    if (checked === true) task.checklist.push(item);
    task.updatedAt = new Date().toISOString();
    logActivity_(checked === true ? 'Ticked' : 'Unticked', task.project, task.title, item);
    return writeTask_(sheet, row, task);
  });
}

// action: "advance" = the current step is done / approved, "revise" = a QC step sends the work
// back to opts.to (QC Client always sends it back to the content writer first), "assign" = the writer passes a client
// revision on to opts.to, "undo" = take back the last move. opts.from is the step the page showed,
// so a double click (or a change made on another device) can't move the task twice.
// Monthly Brief tasks that share the step move together (see linkedTasks_); they come back in task.linked.
// At their QC Internal: Brief, opts.channels lists the briefs that need a revision; the others are approved.
function moveTask_(id, action, opts) {
  opts = opts || {};
  return withLock_(() => {
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    const rows = {};
    const all = [];
    uniqueIds_(sheet, TASK_HEADERS.length, 'T', 4).forEach((r, i) => {
      if (r[0] === '') return;
      const t = rowToTask_(r);
      rows[t.id] = i + 2;
      all.push(t);
    });
    const task = all.filter(t => t.id === String(id))[0];
    if (!task || !seesProject_(user_, task.project)) throw new Error('Task not found. It may have been deleted - please refresh the page.');
    // Says where the task really is and who moved it last, so a page that is out of date can be explained
    if (opts.from && opts.from !== task.stage) {
      const lastMove = task.history[task.history.length - 1] || {};
      const at = lastMove.at ? Utilities.formatDate(new Date(lastMove.at), getTimeZone_(), 'd MMM HH:mm') : '';
      throw new Error('This task was already updated: it is now at "' + (task.stage === 'done' ? 'Done' : stageInfo_(task.stage).name) + '"' +
        (lastMove.by || at ? ' (last change' + (lastMove.by ? ' by ' + lastMove.by : '') + (at ? ', ' + at : '') + ')' : '') +
        '. The page now shows it as it is.');
    }
    // Linked Monthly Brief tasks share the project, so the same people may move them
    if (action === 'undo' ? !canUndo_(user_, task) : !canPress_(user_, task)) {
      throw new Error(action === 'undo' ? 'Only the person who made the last move (or managerial) can undo it.'
        : 'This step is not yours: it is waiting for ' + waitingFor_(task) + '.');
    }
    const now = new Date().toISOString();
    const note = String(opts.note || '').trim().slice(0, 1000);
    // Drafting Brief, Design and Motion hand on their link: the one given now, or the one the task already has
    const linkField = action === 'advance' ? LINK_STEPS[task.stage] : '';
    const link = linkField ? String(opts.link || '').trim().slice(0, 2000) || task[linkField] : '';
    if (linkField && !isUrl_(link)) throw new Error('Paste the ' + (linkField === 'briefLink' ? 'brief' : 'result') + ' link first (starting with http:// or https://).');
    let moved;
    if (action === 'undo') {
      if (task.history.length < 2) throw new Error('Nothing to undo.');
      // A move made together with other tasks is taken back for all of them
      const sync = task.history[task.history.length - 1].sync;
      moved = [task].concat(sync ? all.filter(o => o !== task && o.history.length > 1 && o.history[o.history.length - 1].sync === sync) : []);
      moved.forEach(o => {
        o.stage = o.history.pop().from;
        o.stage = fitStage_(o);
      });
    } else if (action === 'revise' && task.stage === 'qcBrief' && Array.isArray(opts.channels)) {
      moved = [task].concat(linkedTasks_(task, all));
      if (!moved.some(o => opts.channels.indexOf(o.channel) >= 0)) throw new Error('Choose which brief needs the revision.');
      const sync = moved.length > 1 ? newId_('S') : '';
      moved.forEach(o => opts.channels.indexOf(o.channel) >= 0
        ? stepTask_(o, 'revise', { to: 'brief', note: note }, now, sync)
        : stepTask_(o, 'advance', { note: '' }, now, sync));
    } else {
      moved = [task].concat(action === 'advance' ? linkedTasks_(task, all) : []);
      const sync = moved.length > 1 ? newId_('S') : '';
      // One brief covers every task of that channel in the Monthly Brief
      if (linkField) moved.forEach(o => o[linkField] = link);
      moved.forEach(o => stepTask_(o, action, { to: opts.to, note: note, link: link }, now, sync));
    }
    moved.forEach(o => {
      o.updatedAt = now;
      writeTask_(sheet, rows[o.id], o);
      logActivity_(action === 'undo' ? 'Undo' : 'Moved', o.project, o.title, action === 'undo' ? 'Back to ' + stageInfo_(o.stage).name
        : activityText_(o.history[o.history.length - 1]));
    });
    task.linked = moved.slice(1);
    return task;
  });
}

// "Design done → QC Internal: Content", "QC Client asked for a revision → Client Revision: change the logo"
function activityText_(e) {
  const to = e.to === 'done' ? 'Done' : stageInfo_(e.to).name;
  const text = stageInfo_(e.from).name + (e.action === 'revision' ? ' asked for a revision → ' : e.action === 'approved' ? ' approved → ' : e.action === 'assign' ? ' passed to → ' : ' done → ') + to;
  return text + (e.note ? ': ' + e.note : '');
}

// Who the task's current step is waiting for, e.g. "Alfid", "Client (via Kak Faza)", "QC (Kak Hendra / Bu Riska)"
function waitingFor_(t) {
  const s = stageInfo_(t.stage);
  const owner = stageOwner_(s, t);
  const actor = stepActor_(t.stage);
  if (actor === 'manager') return 'QC (' + owner + ')';
  // The person who presses the button for someone without an account (the client, the freelancers)
  const via = actor === 'writer' ? (projectOf_(t.project) || {}).writer : actor === 'assistant' ? assistantName_() : '';
  return via && owner !== via && owner.indexOf(via + ' ') !== 0 ? owner + ' (via ' + via + ')' : owner;
}
// "Kak Faza" (every active assistant manager, e.g. "Kak Faza / Kak Dimas")
function assistantName_() {
  return dir_().assistants.join(' / ') || ROLE_NAMES.assistant;
}

// Moves one task a step (advance / revise / assign, see moveTask_). sync marks moves made together.
function stepTask_(task, action, opts, now, sync) {
  const steps = pipeline_(task.type, task.channel);
  const i = steps.indexOf(task.stage);
  const entry = (act, to) => {
    const e = { at: now, action: act, from: task.stage, to: to, note: opts.note, by: user_.name, byKey: user_.key };
    if (sync) e.sync = sync;
    if (opts.link) e.link = opts.link;
    task.history.push(e);
    task.stage = to;
  };
  if (action === 'advance') {
    if (i < 0) throw new Error(task.stage === 'revision' ? 'Choose who fixes the revision first.' : 'This task is already done.');
    // A fix made for a revision goes straight back to the next QC step
    const entered = task.history.filter(h => h.to === task.stage).pop();
    const fixing = entered && (entered.action === 'revision' || entered.action === 'assign');
    entry(stageInfo_(task.stage).qc ? 'approved' : 'done', (fixing && steps.slice(i + 1).filter(k => stageInfo_(k).qc)[0]) || steps[i + 1] || 'done');
  } else if (action === 'revise') {
    if (i < 0 || !stageInfo_(task.stage).qc) throw new Error('A revision can only be requested at a QC step.');
    const to = task.stage === 'qcClient' ? 'revision' : opts.to;
    const j = steps.indexOf(to);
    if (to !== 'revision' && (j < 0 || j >= i || stageInfo_(to).qc)) throw new Error('Please choose which step needs the revision.');
    entry('revision', to);
  } else if (action === 'assign') {
    if (task.stage !== 'revision') throw new Error('This task has no client revision waiting.');
    if (fixSteps_(steps).indexOf(opts.to) < 0) throw new Error('Please choose who fixes the revision.');
    entry('assign', opts.to);
  } else {
    throw new Error('Unknown action.');
  }
}

// Monthly Brief tasks of one project and working month share three moments: one brief per channel
// (Drafting Brief), one QC for the ORG and ADS briefs together (QC Internal: Brief) and one shooting
// for all the month's videos (Shooting). The other tasks waiting at the same shared step move with t.
function linkedTasks_(t, all) {
  if (!t.workMonth || ['brief', 'qcBrief', 'shoot'].indexOf(t.stage) < 0) return [];
  return all.filter(o => o.id !== t.id && o.project === t.project && o.workMonth === t.workMonth &&
    o.stage === t.stage && (t.stage !== 'brief' || o.channel === t.channel));
}

const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
// Month words in titles written by hand, English or Indonesian, full or short ("DES", "Desember", "OKT")
const MONTH_WORDS = { JAN: 1, FEB: 2, PEB: 2, MAR: 3, APR: 4, MAY: 5, MEI: 5, JUN: 6, JUL: 7, AUG: 8, AGU: 8, AGS: 8, SEP: 9, OCT: 10, OKT: 10, NOV: 11, DEC: 12, DES: 12 };

// Monthly Brief title (mirrors batchTitle in JavaScript.html): "BRIEF ORG DECEMBER KRR",
// "VIDEO CTC ADS NOVEMBER KRR"; "NON-SHOOTING" is added when the project makes both video types
function briefTitle_(project, type, channel, forMonth) {
  const videos = ((projectOf_(project) || {}).types || PROJECT_TYPES).filter(v => /^Video/.test(v)).length;
  const kind = !/^Video/.test(type) ? 'BRIEF' : videos > 1 && type === 'Video (Non-Shooting)' ? 'VIDEO CTC NON-SHOOTING' : 'VIDEO CTC';
  return kind + ' ' + channel + ' ' + MONTH_NAMES[Number(forMonth.slice(5, 7)) - 1] + ' ' + project.toUpperCase();
}

// Tasks made one by one before Monthly Brief existed (e.g. "BRIEF ORG DES KRR", "VIDEO ORG DES GTR")
// become Monthly Brief tasks: their working month is filled in from the title (the year from when
// the task was made) and the title is written the standard way. Runs once; Event Attribute tasks and
// titles that don't follow the format are left as they are.
const UPGRADE_PROPERTY = 'UPGRADED_MONTHLY_BRIEF';
function upgradeTasks_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(UPGRADE_PROPERTY)) return;
  withLock_(() => {
    if (props.getProperty(UPGRADE_PROPERTY)) return;
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    const last = sheet.getLastRow();
    let changed = 0;
    if (last >= 2) sheet.getRange(2, 1, last - 1, TASK_HEADERS.length).getValues().forEach((r, i) => {
      if (r[0] === '') return;
      const t = rowToTask_(r);
      const m = t.title.trim().match(/^(BRIEF|VIDEO(?: CTC)?(?: NON-SHOOTING)?)\s+(ORG|ADS)\s+([A-Za-z]+)\s+(\S+)$/i);
      const month = m && MONTH_WORDS[m[3].slice(0, 3).toUpperCase()];
      if (t.workMonth || t.type === EVENT_TYPE || !projectOf_(t.project) || !m || !month ||
        m[3].length < 3 || m[2].toUpperCase() !== t.channel || m[4].toUpperCase() !== t.project.toUpperCase()) return;
      // The year that puts the content month closest to when the task was made
      const made = new Date(t.createdAt || Date.now());
      const year = [made.getFullYear() - 1, made.getFullYear(), made.getFullYear() + 1].sort((a, b) =>
        Math.abs(new Date(a, month - 1, 15) - made) - Math.abs(new Date(b, month - 1, 15) - made))[0];
      t.forMonth = year + '-' + ('0' + month).slice(-2);
      t.workMonth = addMonths_(t.forMonth, -(BRIEF_MONTHS_AHEAD[t.channel] || 0));
      t.title = briefTitle_(t.project, t.type, t.channel, t.forMonth);
      writeTask_(sheet, i + 2, t);
      changed++;
    });
    props.setProperty(UPGRADE_PROPERTY, new Date().toISOString() + ' (' + changed + ' tasks)');
  });
}

// "2026-11" + 1 -> "2026-12"
function addMonths_(month, n) {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

function deleteTask_(id) {
  return withLock_(() => {
    const sheet = getSheet_(TASK_SHEET, TASK_HEADERS);
    const row = findRow_(sheet, id);
    const task = readVisibleTask_(sheet, row);
    if (!managesProject_(user_, task.project)) throw new Error('Only the content writer of ' + task.project + ' (or managerial) can delete this task.');
    sheet.deleteRow(row);
    logActivity_('Deleted task', task.project, task.title, currentStep_(task));
    return true;
  });
}

// The steps a task goes through, based on its content type and channel
function pipeline_(type, channel) {
  const video = /^Video/.test(type);
  return STAGE_LIST.map(s => s.key).filter(k =>
    k === 'revision' ? false :
    k === 'vo' ? type === 'Video (Non-Shooting)' :
    k === 'shoot' ? type === 'Video (Shooting)' :
    k === 'video' || k === 'qcCut' || k === 'motion' ? video :
    k === 'design' ? !video :
    k === 'post' ? channel !== 'ADS' && type !== COLLATERAL_TYPE :
    k === 'ads' ? channel === 'ADS' && type !== COLLATERAL_TYPE : true);
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
  return stages_().filter(s => s.key === key)[0] || {};
}

// The steps with the names of who does them now (QC: every active managerial account, Send to Client:
// every active assistant manager, Voice Over: VOICE_OVER_USER)
function stages_() {
  const d = dir_();
  if (d.stages) return d.stages;
  const voiceOver = has_(d.users, VOICE_OVER_USER) ? d.users[VOICE_OVER_USER].name : 'Bu Riska';
  const fill = p => p === '@managers' ? d.managers.join(' / ') || ROLE_NAMES.manager
    : p === '@assistants' ? assistantName_() : p === '@voiceOver' ? voiceOver : p;
  return d.stages = STAGE_LIST.map(s => Object.assign({}, s, { person: fill(s.person) }));
}

// Keeps the task on a valid step after its content type or channel changed
function fitStage_(task) {
  if (task.stage === 'done' || task.stage === 'revision') return task.stage;
  const steps = pipeline_(task.type, task.channel);
  if (steps.indexOf(task.stage) >= 0) return task.stage;
  if (task.stage === 'post' || task.stage === 'ads') return steps[steps.length - 1];
  // Otherwise go back to the closest earlier step that still applies
  const order = STAGE_LIST.map(s => s.key);
  const pos = order.indexOf(task.stage);
  return steps.filter(k => order.indexOf(k) < pos).pop() || steps[0];
}

function currentStep_(t) {
  if (t.stage === 'done') return t.type === COLLATERAL_TYPE ? 'Done: Approved by Client' : t.channel === 'ADS' ? 'Done: Live on Ads' : 'Done: Scheduled / Posted';
  const s = stageInfo_(t.stage);
  return s.name + ' (' + stageOwner_(s, t) + ')';
}

// Who does a step for this task; the designer / videographer come from the task itself, the content
// writer from its project
function stageOwner_(s, t) {
  const writer = (projectOf_(t.project) || {}).writer || 'Content Writer';
  if (s.key === 'shoot') return writer + ' & ' + (t.videographer || 'Videographer');
  return s.person || (s.role === 'Graphic Designer' ? t.designer : s.role === 'Videographer' ? t.videographer : s.role === 'Content Writer' ? writer : '') || s.role;
}

// old: the task being edited. What it already is stays allowed (e.g. a content type or a videographer
// its project no longer has), so older tasks can still be edited.
function cleanTask_(d, old) {
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
    briefLink: str(d.briefLink, 2000),
    resultLink: str(d.resultLink, 2000),
    notes: str(d.notes, 5000),
    item: ''
  };
  if (!t.title) throw new Error('Title is required.');
  // Collateral is not posted, so it has no ORG / ADS
  const collateral = t.type === COLLATERAL_TYPE;
  t.channel = collateral ? '' : channelFromTitle_(t.title);
  if (!collateral && !t.channel) throw new Error('Write either ORG or ADS in the title, e.g. "BRIEF ORG NOV KRR".');
  const p = projectOf_(t.project);
  if (!p || p.archived) throw new Error('Please choose the project.');
  const kept = old && old.project === t.project ? old : {};
  if (!collateral && p.orgOnly && t.channel !== 'ORG' && t.channel !== kept.channel) throw new Error(t.project + ' is organic only. Use ORG in the title.');
  if (!collateral && p.adsOnly && t.channel !== 'ADS' && t.channel !== kept.channel) throw new Error(t.project + ' runs ADS only. Use ADS in the title.');
  t.designer = p.designer;
  if (!t.type) throw new Error('Please choose the content type.');
  // Every project can get Collateral; the other types only where the project makes them
  if (!collateral && p.types.indexOf(t.type) < 0 && t.type !== kept.type) throw new Error(t.project + ' has no ' + t.type + ' content.');
  if (collateral) {
    t.item = COLLATERAL_ITEMS.indexOf(line(d.item)) >= 0 ? line(d.item) : '';
    if (!t.item) throw new Error('Please choose the collateral item (e.g. Flyer, Billboard).');
  }
  if (t.type === EVENT_TYPE && !t.deadline) throw new Error('Please fill in the event date (D-Day).');
  if (!/^Video/.test(t.type)) t.videographer = '';
  else if (videographers_().indexOf(t.videographer) < 0 && !(old && t.videographer && t.videographer === old.videographer)) {
    if (!p.videographer) throw new Error('Please choose the videographer for ' + t.project + ' (' + videographers_().join(' or ') + ').');
    t.videographer = p.videographer;
  }
  if (t.briefLink && !isUrl_(t.briefLink)) throw new Error('The brief link must start with http:// or https://');
  if (t.resultLink && !isUrl_(t.resultLink)) throw new Error('The result link must start with http:// or https://');
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
    t.stage, currentStep_(t), String(revisions), t.briefLink || '', t.notes, JSON.stringify(t.history),
    t.type === EVENT_TYPE ? EVENT_ITEMS.map(i => i.name).filter(n => t.checklist.indexOf(n) >= 0).join('\n') : '',
    t.workMonth || '', t.forMonth || '', t.type === COLLATERAL_TYPE ? t.item || '' : '', t.resultLink || ''
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
    // A type typed by hand ("static ", "Video (shooting)") still gets its steps
    type: CONTENT_TYPES.filter(c => c.toLowerCase() === text_(r[5]).trim().toLowerCase())[0] || text_(r[5]).trim(),
    channel: text_(r[6]).trim().toUpperCase(),
    designer: (projectOf_(text_(r[4])) || {}).designer || text_(r[7]),
    videographer: text_(r[8]),
    deadline: toDay_(r[9]),
    stage: text_(r[10]).trim(),
    briefLink: text_(r[13]).trim(),
    resultLink: text_(r[20]).trim(),
    notes: text_(r[14]),
    history: Array.isArray(history) ? history : [],
    checklist: parseLines_(r[16]),
    workMonth: /^\d{4}-\d{2}$/.test(text_(r[17]).trim()) ? text_(r[17]).trim() : '',
    forMonth: /^\d{4}-\d{2}$/.test(text_(r[18]).trim()) ? text_(r[18]).trim() : '',
    item: text_(r[19]).trim()
  };
  // An ORG / ADS cell emptied or mistyped by hand: read it from the title again (Collateral has none),
  // otherwise an ADS task would lose its Run Ads step and fall back a step on every read
  if (!has_(CHANNELS, task.channel)) task.channel = task.type === COLLATERAL_TYPE ? '' : channelFromTitle_(task.title);
  task.stage = fitStage_(task);
  task.steps = pipeline_(task.type, task.channel);
  return task;
}

/* ---------- Helpers ---------- */

function getSheet_(name, headers) {
  name = name || SHEET_NAME;
  headers = headers || HEADERS;
  // Looked up and checked once per run (every check reads the spreadsheet, which is slow)
  if (sheets_[name]) return sheets_[name];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  // (Re)create the header row if the sheet is new or was emptied by hand
  const fresh = sheet.getLastRow() === 0;
  if (fresh) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getRange(1, headers.length).getValue() === '') {
    // Columns added in a newer version (e.g. Work Month) get their titles
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
  protectSheet_(sheet, headers, fresh);
  return sheets_[name] = sheet;
}

// Columns only the website should change. Editing them by hand in the sheet shows an
// "Are you sure?" warning; the website itself still writes to them as usual.
const PROTECTED_COLUMNS = {
  'Links': ['ID', 'Reminder IDs'],
  'Tasks': ['ID', 'Stage', 'Current Step', 'Revisions', 'History', 'Checklist'],
  'Activity': ACTIVITY_HEADERS,
  'Team': ['Username'],
  'Projects': ['Code'],
  'Videographers': ['Name']
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

// One change at a time; the activity of the change is written before the next one may start.
// A change made inside another one (e.g. the first filling of the Team sheet) runs in the same lock.
let inLock_ = false;
function withLock_(fn) {
  if (inLock_) return fn();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  inLock_ = true;
  try {
    return fn();
  } finally {
    inLock_ = false;
    writeActivity_();
    // Sheets keeps writes in a buffer; they must be in the sheet before the next change may read it
    try { SpreadsheetApp.flush(); } catch (e) {}
    lock.releaseLock();
  }
}

// The rows of a Links / Tasks sheet. A row copied by hand has the same ID as the row it came from, so a
// change was read from one row and saved into the other: the page said "saved", but after a refresh the
// first row came back unchanged. Each copy gets an ID of its own (once, written in the Activity log).
// projectCol: the column (from 0) of the project, for the log.
function uniqueIds_(sheet, width, prefix, projectCol) {
  const read = () => {
    const last = sheet.getLastRow();
    return last < 2 ? [] : sheet.getRange(2, 1, last - 1, width).getValues();
  };
  const copies = rows => {
    const seen = {};
    const out = [];
    rows.forEach((r, i) => {
      const id = String(r[0]);
      if (id !== '' && has_(seen, id)) out.push(i);
      seen[id] = true;
    });
    return out;
  };
  const rows = read();
  if (!copies(rows).length) return rows;
  return withLock_(() => {
    const fresh = read();
    copies(fresh).forEach(i => {
      const id = newId_(prefix);
      sheet.getRange(i + 2, 1).setNumberFormat('@').setValue(id);
      logActivity_('Fixed copied row', text_(fresh[i][projectCol]), text_(fresh[i][3]),
        'Row ' + (i + 2) + ' had the same ID as another row (' + text_(fresh[i][0]) + '); it now has its own: ' + id, 'Website (auto-fix)');
      fresh[i][0] = id;
    });
    return fresh;
  });
}

const has_ = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

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

/* ---------- Google Calendar reminders (links had deadlines before they became resources) ---------- */

// Removes the reminders a link still has from when links had deadlines. Returns a warning if the
// calendar could not be updated (the link itself is still saved).
function syncReminders_(link, oldIds) {
  link.reminders = [];
  try {
    deleteReminders_(oldIds);
    return '';
  } catch (e) {
    return 'Saved, but the old Google Calendar reminder could not be removed: ' + e.message;
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
  if (m && videoSources_().indexOf(m[1]) >= 0) return c;
  if (/^CTC-Video\b/.test(c)) throw new Error('Please choose the video source for CTC-Video (' + videographers_().map(v => 'VG-' + v).join(' or ') + ').');
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
    // Kept in the sheet for links saved before, empty for resources
    status: '',
    deadline: '',
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
    status: text_(r[7]).trim(),
    deadline: toDay_(r[8]),
    pinned: r[9] === true || String(r[9]).toUpperCase() === 'TRUE',
    purpose: text_(r[10]),
    versions: parseVersions_(r[11]),
    reminders: parseLines_(r[12])
  };
}
