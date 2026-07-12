// ============================================================
// DATA ENGINEERING LEARNING JOURNAL — app.js
// ============================================================

// ─── DEFAULT DATA STRUCTURE ──────────────────────────────
// NOTE: No hardcoded personal info. All data comes from the cloud.

const phaseTargets = {
    'Phase 1-2: Foundations': 150,
    'Phase 3-4: Essential Developer Skills': 60,
    'Phase 5-6: Core Concepts & Cloud Platforms': 165,
    'Phase 7-8: Big Data Processing & Orchestration': 140,
    'Phase 9-10: Data Warehousing & Real-Time Streaming': 105,
    'Phase 11-12: Infrastructure & Data Quality': 80,
    'Phase 13: Building Your Portfolio': 50
};

let data = {
    profile: {
        name: '',
        bio: '',
        photo: null,
        dailyGoal: 2,
        location: '',
        tagline: '',
        skills: [],
        focusArea: '',
        curriculum: '',
        status: ''
    },
    entries: [],
    resources: [],
    phases: [
        'Phase 1-2: Foundations',
        'Phase 3-4: Essential Developer Skills',
        'Phase 5-6: Core Concepts & Cloud Platforms',
        'Phase 7-8: Big Data Processing & Orchestration',
        'Phase 9-10: Data Warehousing & Real-Time Streaming',
        'Phase 11-12: Infrastructure & Data Quality',
        'Phase 13: Building Your Portfolio'
    ],
    settings: {
        emailReminders: false,
        reminderTime: '20:00',
        reminderEmail: '',
        ejsPublicKey: '',
        ejsServiceId: '',
        ejsContactTemplate: '',
        ejsNotifyTemplate: ''
    }
};

// Admin session is kept only in sessionStorage (clears on tab close)
let isAdmin = false;
let adminCredentials = null; // { email, pass } — held in memory only during session
let currentPhaseFilter = '';
let currentTab = 'dashboard';
let reminderInterval = null;

// ─── BOOT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    showLoader(true);
    checkAdminSession();
    setTodayDate();
    initThemeIcons();
    await loadData();
    if (isAdmin) await syncPendingMigration();
    setupDragDrop();
    scheduleReminder();
    showLoader(false);
});

function renderAll() {
    loadProfileUI();
    renderDashboard();
    renderProgress();
    renderResources();
    renderAnalytics();
    buildPhaseFilters();
    renderPhaseManager();
    updatePhaseDropdown();
    updateStats();
    loadSettingsUI();
}

// ─── LOADER ───────────────────────────────────────────────
function showLoader(visible) {
    let el = document.getElementById('cloudLoader');
    if (!el) return;
    el.style.display = visible ? 'flex' : 'none';
    // Hide/show main content while loading
    const main = document.getElementById('mainContent');
    if (main) main.style.opacity = visible ? '0' : '1';
}

// ─── CLOUD DATA SYNC ─────────────────────────────────────
// Cloud (JSONBin) is the single source of truth.
// localStorage is kept only as an offline fallback.
function mergeJournalData(base, incoming) {
    if (!incoming) return base;
    const inEntries = incoming.entries || [];
    const baseEntries = base.entries || [];
    return {
        profile:   { ...base.profile,   ...(incoming.profile   || {}) },
        entries:   inEntries.length >= baseEntries.length ? inEntries : baseEntries,
        resources: (incoming.resources || []).length >= (base.resources || []).length
            ? (incoming.resources || []) : (base.resources || []),
        phases:    incoming.phases?.length ? incoming.phases : base.phases,
        settings:  { ...base.settings,  ...(incoming.settings  || {}) }
    };
}

function loadLocalStorageData() {
    try {
        const saved = localStorage.getItem('deJournalData');
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.warn('Could not read local journal backup:', e);
    }
    return null;
}

async function loadData() {
    let cloudLoaded = false;
    try {
        const res = await fetch('/api/data');
        if (res.ok) {
            const cloud = await res.json();
            // Cloud is the authoritative source — use it directly, no local merge on top
            data = mergeJournalData(data, cloud);
            cloudLoaded = true;
            // Mirror cloud data to localStorage so offline fallback stays current
            try { localStorage.setItem('deJournalData', JSON.stringify(data)); } catch {}
            sessionStorage.removeItem('deJournalPendingMigration');
        } else {
            const err = await res.json().catch(() => ({}));
            console.warn('Cloud load failed:', err.error || res.status);
        }
    } catch (e) {
        console.error('Cloud fetch error:', e);
    }

    // ── Offline-only fallback ───────────────────────────────
    // ONLY read localStorage when the cloud API is completely unreachable.
    // When cloud succeeds we NEVER merge local data on top — that would let
    // stale browser-cached data overwrite the real cloud data in other browsers.
    if (!cloudLoaded) {
        const local = loadLocalStorageData();
        if (local) {
            data = mergeJournalData(data, local);
            console.info('Offline mode: serving from local backup.');
            if (local.entries?.length || local.profile?.name) {
                sessionStorage.setItem('deJournalPendingMigration', 'true');
            }
        }
    }

    renderAll();
}


async function saveData() {
    if (!isAdmin || !adminCredentials) {
        showToast('Not authenticated. Please log in as admin.', 'error');
        return false;
    }
    try {
        const credentials = btoa(`${adminCredentials.email}:${adminCredentials.pass}`);
        const res = await fetch('/api/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('Cloud save failed:', err.error || res.status);
            showToast('Cloud save failed. Check Vercel env vars.', 'error');
            return false;
        }
        // Keep a local backup for recovery
        try { localStorage.setItem('deJournalData', JSON.stringify(data)); } catch {}
        sessionStorage.removeItem('deJournalPendingMigration');
        return true;
    } catch (e) {
        console.error('Cloud save error:', e);
        showToast('Could not reach cloud. Check your connection.', 'error');
        return false;
    }
}

async function syncPendingMigration() {
    if (sessionStorage.getItem('deJournalPendingMigration') !== 'true') return;
    const ok = await saveData();
    if (ok) showToast('Local journal data synced to cloud.', 'success');
}

// Legacy alias — keeps all existing save() call-sites working
function save() {
    saveData(); // fire-and-forget
}

// ─── NAVIGATION ──────────────────────────────────────────
function switchTab(tabName, el) {
    currentTab = tabName;
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const target = document.getElementById(tabName);
    if (target) target.classList.add('active');

    if (el) {
        el.classList.add('active');
    } else {
        const link = document.querySelector(`.nav-link[data-tab="${tabName}"]`);
        if (link) link.classList.add('active');
    }

    if (tabName === 'progress') renderProgress();
    if (tabName === 'resources') renderResources();
    if (tabName === 'dashboard') renderDashboard();
    if (tabName === 'analytics') renderAnalytics();
    if (tabName === 'settings') { renderPhaseManager(); loadSettingsUI(); }

    // Close mobile menu
    document.getElementById('navLinks').classList.remove('mobile-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
    const nav = document.getElementById('navLinks');
    nav.classList.toggle('mobile-open');
}

// ─── PROFILE ─────────────────────────────────────────────
function loadProfileUI() {
    const img = document.getElementById('profileImg');
    img.src = data.profile.photo ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.profile.name || 'DE')}&backgroundColor=7c3aed&textColor=ffffff`;
    document.getElementById('userName').textContent = data.profile.name || 'Your Name';
    document.getElementById('userBio').textContent = data.profile.bio || '';

    const tagEl = document.getElementById('profileTag');
    if (tagEl) tagEl.textContent = data.profile.tagline || 'Data Engineering Learner';

    const skillsWrap = document.getElementById('skillTags');
    if (skillsWrap) {
        const skills = data.profile.skills || [];
        skillsWrap.innerHTML = skills.length
            ? skills.map(s => `<span class="skill-tag">${esc(s)}</span>`).join('')
            : '';
    }

    const loc = document.getElementById('infoLocation');
    if (loc) loc.textContent = data.profile.location || '—';
    setText('infoFocusArea', data.profile.focusArea || '—');
    setText('infoCurriculum', data.profile.curriculum || '—');
    setText('infoStatus', data.profile.status || '—');
}

async function handleProfileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    data.profile.photo = await toBase64(file);
    save();
    loadProfileUI();
    showToast('Profile photo updated.');
}

function updateName() {
    const v = document.getElementById('settingsName').value.trim();
    if (!v) return;
    data.profile.name = v;
    document.getElementById('userName').textContent = v;
    save();
    loadProfileUI();
}

function updateBio() {
    data.profile.bio = document.getElementById('settingsBio').value;
    document.getElementById('userBio').textContent = data.profile.bio;
    save();
}

function saveDailyGoal() {
    data.profile.dailyGoal = parseFloat(document.getElementById('dailyGoal').value) || 2;
    save();
}

function saveLocation() {
    data.profile.location = document.getElementById('settingsLocation').value;
    loadProfileUI();
    save();
}

function saveTagline() {
    data.profile.tagline = document.getElementById('settingsTagline').value.trim();
    loadProfileUI();
    save();
}

function saveSkills() {
    const raw = document.getElementById('settingsSkills').value;
    data.profile.skills = raw.split(',').map(s => s.trim()).filter(Boolean);
    loadProfileUI();
    save();
}

function saveFocusArea() {
    data.profile.focusArea = document.getElementById('settingsFocusArea').value.trim();
    loadProfileUI();
    save();
}

function saveCurriculum() {
    data.profile.curriculum = document.getElementById('settingsCurriculum').value.trim();
    loadProfileUI();
    save();
}

function saveStatus() {
    data.profile.status = document.getElementById('settingsStatus').value.trim();
    loadProfileUI();
    save();
}

// ─── SAVE ALL PROFILE (bulk save button) ─────────────────
async function saveAllProfile() {
    const btn = document.getElementById('saveAllProfileBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    // Read all profile fields at once
    const getVal = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const name = getVal('settingsName');
    if (name) data.profile.name = name;
    data.profile.bio        = getVal('settingsBio');
    data.profile.location   = getVal('settingsLocation');
    data.profile.tagline    = getVal('settingsTagline');
    data.profile.focusArea  = getVal('settingsFocusArea');
    data.profile.curriculum = getVal('settingsCurriculum');
    data.profile.status     = getVal('settingsStatus');
    data.profile.dailyGoal  = parseFloat(document.getElementById('dailyGoal')?.value) || 2;

    const rawSkills = getVal('settingsSkills');
    data.profile.skills = rawSkills ? rawSkills.split(',').map(s => s.trim()).filter(Boolean) : [];

    loadProfileUI();
    const ok = await saveData();

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = ok
            ? '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:6px;"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Saved!'
            : '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:6px;"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Save All Profile Changes';
        if (ok) setTimeout(() => {
            btn.innerHTML = '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:6px;"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>Save All Profile Changes';
        }, 2500);
    }
    if (ok) showToast('Profile saved and synced to cloud! ✓');
}

function loadSettingsUI() {
    const s = data.settings;
    const p = data.profile;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('settingsName', p.name);
    set('settingsBio', p.bio);
    set('dailyGoal', p.dailyGoal);
    set('settingsLocation', p.location);
    set('settingsTagline', p.tagline);
    set('settingsSkills', (p.skills || []).join(', '));
    set('settingsFocusArea', p.focusArea);
    set('settingsCurriculum', p.curriculum);
    set('settingsStatus', p.status);
    // adminEmail and adminPass are now Vercel env vars — not shown in UI

    set('ejsPublicKey', s.ejsPublicKey);
    set('ejsServiceId', s.ejsServiceId);
    set('ejsContactTemplate', s.ejsContactTemplate);
    set('ejsNotifyTemplate', s.ejsNotifyTemplate);
    
    set('contactReminderEmail', s.reminderEmail);
    set('settingsReminderEmail', s.reminderEmail);
    set('contactReminderTime', s.reminderTime || '20:00');
    set('settingsReminderTime', s.reminderTime || '20:00');
    
    const tog1 = document.getElementById('contactRemindersToggle');
    if (tog1) tog1.checked = !!s.emailReminders;
    const tog2 = document.getElementById('settingsRemindersToggle');
    if (tog2) tog2.checked = !!s.emailReminders;
}

// ─── ENTRY MANAGEMENT ────────────────────────────────────
function setTodayDate() {
    const el = document.getElementById('entryDate');
    if (el) el.value = new Date().toISOString().split('T')[0];
}

async function saveEntry(event) {
    event.preventDefault();
    if (!isAdmin) { showToast('Authentication required.', 'error'); return; }

    const btn = document.getElementById('saveEntryBtn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    const diff = document.querySelector('input[name="difficulty"]:checked');
    const entry = {
        id: Date.now(),
        date: document.getElementById('entryDate').value,
        phase: document.getElementById('entryPhase').value,
        title: document.getElementById('entryTitle').value.trim(),
        content: document.getElementById('entryContent').value.trim(),
        code: document.getElementById('entryCode').value.trim(),
        tags: document.getElementById('entryTags').value.split(',').map(t => t.trim()).filter(Boolean),
        hours: parseFloat(document.getElementById('entryHours').value) || 0,
        difficulty: diff ? diff.value : 'Medium',
        media: []
    };

    const files = document.getElementById('entryMedia').files;
    for (let file of files) {
        entry.media.push({
            type: file.type.startsWith('image') ? 'image' : 'video',
            name: file.name,
            data: await toBase64(file)
        });
    }

    data.entries.push(entry);
    const ok = await saveData();
    
    if (!ok) {
        btn.textContent = 'Save Entry';
        btn.disabled = false;
        // Revert local state to avoid out-of-sync
        data.entries = data.entries.filter(e => e.id !== entry.id);
        return;
    }

    const shouldEmail = document.getElementById('notifyOnSave') && document.getElementById('notifyOnSave').checked;
    if (shouldEmail && data.settings.ejsServiceId && data.settings.ejsNotifyTemplate) {
        sendNewEntryNotification(entry);
    }

    showToast('Entry saved successfully! 🎉');
    resetEntryForm();
    buildPhaseFilters();
    updatePhaseDropdown();
    updateStats();
    switchTab('dashboard');

    btn.textContent = 'Save Entry';
    btn.disabled = false;
}

function resetEntryForm() {
    document.getElementById('entryForm').reset();
    document.getElementById('filePreview').innerHTML = '';
    setTodayDate();
}

async function deleteEntry(id) {
    if (!isAdmin) return;
    if (!confirm('Delete this entry?')) return;
    
    // Store backup in case save fails
    const backup = [...data.entries];
    data.entries = data.entries.filter(e => e.id !== id);
    
    const ok = await saveData();
    if (!ok) {
        data.entries = backup;
        return;
    }
    
    renderDashboard();
    updateStats();
    showToast('Entry deleted.');
}

function editEntry(id) {
    if (!isAdmin) return;
    const entry = data.entries.find(e => e.id === id);
    if (!entry) return;

    switchTab('add-entry');
    setTimeout(() => {
        document.getElementById('entryDate').value = entry.date;
        document.getElementById('entryPhase').value = entry.phase;
        document.getElementById('entryTitle').value = entry.title;
        document.getElementById('entryContent').value = entry.content;
        document.getElementById('entryCode').value = entry.code || '';
        document.getElementById('entryTags').value = entry.tags.join(', ');
        document.getElementById('entryHours').value = entry.hours;
        const diffEl = document.getElementById(`diff${entry.difficulty}`);
        if (diffEl) diffEl.checked = true;

        // Remove old entry so saving creates updated version
        data.entries = data.entries.filter(e => e.id !== id);
        save();
    }, 100);
}

// ─── DASHBOARD ───────────────────────────────────────────
function renderDashboard() {
    const grid = document.getElementById('entriesGrid');
    const empty = document.getElementById('emptyState');
    if (!grid) return;

    let entries = [...data.entries];

    if (currentPhaseFilter) entries = entries.filter(e => e.phase === currentPhaseFilter);

    const q = (document.getElementById('searchInput') || {}).value?.toLowerCase() || '';
    if (q) entries = entries.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
    );

    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (entries.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    grid.style.display = 'grid';
    empty.style.display = 'none';

    grid.innerHTML = entries.map(e => {
        const tags = e.tags.slice(0, 4).map(t =>
            `<span class="entry-tag">${esc(t)}</span>`
        ).join('');
        const hasImg = e.media && e.media.some(m => m.type === 'image');
        const firstImg = hasImg ? e.media.find(m => m.type === 'image') : null;

        return `
        <div class="entry-card">
            ${firstImg ? `<div class="entry-card-img" onclick="openLightbox('${firstImg.data}')"><img src="${firstImg.data}" alt=""></div>` : ''}
            <div class="entry-phase-tag">${esc(e.phase)}</div>
            <h3 class="entry-title">${esc(e.title)}</h3>
            <p class="entry-excerpt">${esc(truncate(e.content, 120))}</p>
            <div class="entry-tags">${tags}</div>
            <div class="entry-footer">
                <div class="entry-meta">
                    <span>${fmtDate(e.date)}</span>
                    <span class="meta-sep">·</span>
                    <span>${e.hours}h</span>
                    <span class="entry-diff-badge diff-${e.difficulty.toLowerCase()}">${e.difficulty}</span>
                </div>
                <button class="btn-link" onclick="viewEntry(${e.id})">View</button>
            </div>
            <div class="entry-admin-row">
                <button class="btn-edit-sm" onclick="editEntry(${e.id})">Edit</button>
                <button class="btn-del-sm" onclick="deleteEntry(${e.id})">Delete</button>
            </div>
        </div>`;
    }).join('');
}

function buildPhaseFilters() {
    const wrap = document.getElementById('phaseFilter');
    if (!wrap) return;

    let html = `<div class="fpill ${currentPhaseFilter === '' ? 'active' : ''}" onclick="filterPhase('', this)">All</div>`;
    data.phases.forEach(p => {
        const has = data.entries.some(e => e.phase === p);
        if (!has && !isAdmin) return;
        html += `<div class="fpill ${currentPhaseFilter === p ? 'active' : ''}" onclick="filterPhase('${p.replace(/'/g, "\\'")}', this)">${esc(p)}</div>`;
    });
    wrap.innerHTML = html;
}

function filterPhase(phase, el) {
    currentPhaseFilter = phase;
    document.querySelectorAll('.fpill').forEach(p => p.classList.remove('active'));
    if (el) el.classList.add('active');
    renderDashboard();
}

// ─── ENTRY DETAIL MODAL ───────────────────────────────────
function viewEntry(id) {
    const entry = data.entries.find(e => e.id === id);
    if (!entry) return;

    const mediaHtml = (entry.media && entry.media.length > 0) ? `
        <div style="margin-top:40px;">
            <p style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:800;margin-bottom:16px;">📸 Visual Evidence</p>
            <div style="display:grid;gap:16px;">
                ${entry.media.map(m => m.type === 'image'
        ? `<div onclick="openLightbox('${m.data}')" style="cursor:zoom-in;border-radius:12px;overflow:hidden;border:1px solid var(--border);"><img src="${m.data}" style="width:100%;height:auto;display:block;"></div>`
        : `<div style="border-radius:12px;overflow:hidden;border:1px solid var(--border);"><video src="${m.data}" controls style="width:100%;display:block;background:#000;"></video></div>`
    ).join('')}
            </div>
        </div>` : '';

    const codeHtml = entry.code ? `
        <div style="margin-top:40px;">
            <p style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:800;margin-bottom:12px;">💻 Code Implementation</p>
            <pre style="background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:28px;overflow-x:auto;font-family:var(--font-mono);font-size:0.875rem;color:#c084fc;line-height:1.7;">${esc(entry.code)}</pre>
        </div>` : '';

    const tagsHtml = entry.tags.map(t =>
        `<span style="background:rgba(124,58,237,0.15);color:#c084fc;border:1px solid rgba(124,58,237,0.3);padding:4px 12px;border-radius:999px;font-size:0.8rem;">#${esc(t)}</span>`
    ).join('');

    document.getElementById('modalEntryContent').innerHTML = `
        <div style="max-width:900px;margin:0 auto;padding:48px 40px;">
            <div style="font-size:0.7rem;color:var(--accent-3);text-transform:uppercase;letter-spacing:0.12em;font-weight:800;margin-bottom:16px;">${esc(entry.phase)}</div>
            <h1 style="font-size:2.75rem;font-weight:900;letter-spacing:-0.04em;line-height:1.1;background:linear-gradient(135deg,#f0f0ff,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:32px;">${esc(entry.title)}</h1>
            <div style="display:flex;flex-wrap:wrap;gap:24px;margin-bottom:40px;padding:24px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);">
                <div><p style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:4px;">Date</p><p style="font-weight:700;color:var(--text-primary);">${fmtDate(entry.date)}</p></div>
                <div><p style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:4px;">Hours</p><p style="font-weight:700;color:var(--text-primary);">${entry.hours}h</p></div>
                <div><p style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:4px;">Difficulty</p><span class="entry-diff diff-${entry.difficulty.toLowerCase()}" style="padding:3px 10px;border-radius:4px;">${entry.difficulty}</span></div>
            </div>
            <div style="font-size:1.1rem;line-height:1.9;color:var(--text-secondary);white-space:pre-wrap;margin-bottom:32px;">${esc(entry.content)}</div>
            ${tagsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">${tagsHtml}</div>` : ''}
            ${codeHtml}
            ${mediaHtml}
        </div>`;

    document.getElementById('entryModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeEntryModal(e) {
    if (e.target === document.getElementById('entryModal')) closeEntryModalBtn();
}

function closeEntryModalBtn() {
    document.getElementById('entryModal').classList.remove('open');
    document.body.style.overflow = '';
}

// ─── PROGRESS ────────────────────────────────────────────
function renderProgress() {
    const wrap = document.getElementById('progressOverview');
    if (!wrap) return;

    let totalTarget = 0;
    let totalHrsAll = 0;

    wrap.innerHTML = data.phases.map(p => {
        const ents = data.entries.filter(e => e.phase === p);
        const hrs = ents.reduce((s, e) => s + e.hours, 0);
        const target = phaseTargets[p] || 40;
        const pct = Math.min((hrs / target) * 100, 100);
        
        totalTarget += target;
        totalHrsAll += hrs;

        return `
        <div class="phase-row">
            <div class="phase-row-header">
                <span class="phase-name">${esc(p)}</span>
                <span class="phase-pct">${Math.round(pct)}%</span>
            </div>
            <div class="phase-track"><div class="phase-fill" style="width:${pct}%"></div></div>
            <div class="phase-row-meta"><span>${ents.length} entries</span><span>${hrs.toFixed(1)}h / ${target}h</span></div>
        </div>`;
    }).join('');

    const active = new Set(data.entries.map(e => e.phase)).size;
    const overallPct = totalTarget > 0 ? Math.round(Math.min((totalHrsAll / totalTarget) * 100, 100)) : 0;

    const txt = document.getElementById('overallProgressText');
    if (txt) txt.textContent = overallPct + '%';

    // Ring fill: circumference = 2 * PI * 50 ≈ 314
    const ring = document.getElementById('ringFill');
    if (ring) ring.style.strokeDashoffset = 314 - (314 * overallPct / 100);

    // Header progress bar
    const hpb = document.getElementById('headerProgress');
    if (hpb) hpb.style.width = overallPct + '%';
    const hpt = document.getElementById('headerProgressPct');
    if (hpt) hpt.textContent = `${overallPct}% Complete`;

    // Overall stats
    const totalHrs = data.entries.reduce((s, e) => s + e.hours, 0);
    const el = document.getElementById('overallStats');
    if (el) el.innerHTML = `
        <div class="stat-list-row"><span>Phases Started</span><span>${active} / ${data.phases.length}</span></div>
        <div class="stat-list-row"><span>Total Entries</span><span>${data.entries.length}</span></div>
        <div class="stat-list-row"><span>Total Hours</span><span>${totalHrs.toFixed(1)}h</span></div>
        <div class="stat-list-row"><span>Day Streak</span><span>${calcStreak()} days</span></div>`;

    renderAchievements();
}

function renderAchievements() {
    const el = document.getElementById('achievementsWrap');
    if (!el) return;
    const total = data.entries.length;
    const hrs = data.entries.reduce((s, e) => s + e.hours, 0);
    const streak = calcStreak();
    const phases = new Set(data.entries.map(e => e.phase)).size;
    const svgCheck = `<svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
    const svgStar = `<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>`;
    const ach = [
        { label: 'First Entry', desc: 'Logged your first day', unlocked: total >= 1 },
        { label: '7-Day Streak', desc: '7 consecutive study days', unlocked: streak >= 7 },
        { label: '50 Hours', desc: 'Invested 50+ study hours', unlocked: hrs >= 50 },
        { label: 'Phase Explorer', desc: 'Started 3 or more phases', unlocked: phases >= 3 },
        { label: 'Prolific Logger', desc: 'Written 20 or more entries', unlocked: total >= 20 },
        { label: 'Curriculum Master', desc: 'Completed all phases', unlocked: phases >= data.phases.length }
    ];
    el.innerHTML = ach.map(a => `
        <div class="ach-row ${a.unlocked ? 'unlocked' : ''}">
            <div class="ach-icon-box">${svgStar}</div>
            <div class="ach-info"><strong>${a.label}</strong><span>${a.desc}</span></div>
            ${a.unlocked ? `<div class="ach-check">${svgCheck}</div>` : ''}
        </div>`).join('');
}

function updateStats() {
    const dates = new Set(data.entries.map(e => e.date)).size;
    const hrs = data.entries.reduce((s, e) => s + e.hours, 0);
    setText('totalDays', dates);
    setText('totalEntries', data.entries.length);
    setText('currentStreak', calcStreak());
    setText('completedPhases', new Set(data.entries.map(e => e.phase)).size);
    setText('totalHours', hrs.toFixed(1));

    const hpb = document.getElementById('headerProgress');
    const hpt = document.getElementById('headerProgressPct');
    
    let totalTarget = 0;
    let totalHrsAll = 0;
    data.phases.forEach(p => {
        totalTarget += phaseTargets[p] || 40;
        const ents = data.entries.filter(e => e.phase === p);
        totalHrsAll += ents.reduce((s, e) => s + e.hours, 0);
    });
    
    const pct = totalTarget > 0 ? Math.round(Math.min((totalHrsAll / totalTarget) * 100, 100)) : 0;
    if (hpb) hpb.style.width = pct + '%';
    if (hpt) hpt.textContent = `${pct}% Complete`;
}

function calcStreak() {
    if (!data.entries.length) return 0;
    const dates = [...new Set(data.entries.map(e => e.date))].sort().reverse();
    const today = new Date().toISOString().split('T')[0];
    let streak = 0, curr = new Date(today);
    for (let d of dates) {
        const diff = Math.floor((curr - new Date(d)) / 86400000);
        if (diff <= 1) { streak++; curr = new Date(d); }
        else break;
    }
    return streak;
}

// ─── RESOURCES ────────────────────────────────────────────
function openAddResourceModal() {
    document.getElementById('resourceModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeResourceModal(e) {
    if (e.target === document.getElementById('resourceModal')) closeResourceModalBtn();
}

function closeResourceModalBtn() {
    document.getElementById('resourceModal').classList.remove('open');
    document.body.style.overflow = '';
}

async function saveResource(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const rc = document.getElementById('resourceCategory');
    const res = {
        id: Date.now(),
        title: document.getElementById('resourceTitle').value.trim(),
        url: document.getElementById('resourceUrl').value || '#',
        category: rc ? rc.value : 'Other',
        fileData: null,
        fileName: null
    };

    const fi = document.getElementById('resourceFile');
    if (fi && fi.files.length > 0) {
        const f = fi.files[0];
        res.fileData = await toBase64(f);
        res.fileName = f.name;
    }

    data.resources.push(res);
    const ok = await saveData();
    
    if (!ok) {
        data.resources.pop();
        return;
    }
    
    closeResourceModalBtn();
    event.target.reset();
    renderResources();
    showToast('Resource added to library.');
}

function renderResources() {
    const grid = document.getElementById('resourcesGrid');
    if (!grid) return;

    if (!data.resources.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:80px;color:var(--text-muted);">
            <div style="font-size:3rem;margin-bottom:16px;">📚</div>
            <p>No resources yet. Add your first reference material.</p>
        </div>`;
        return;
    }

    const badgeClass = r => r.fileData ? 'res-badge-file' : (r.category === 'Course' ? 'res-badge-course' : 'res-badge-link');
    grid.innerHTML = data.resources.map(r => `
        <div class="res-card">
            <div class="res-type-badge ${badgeClass(r)}">${r.category || (r.fileData ? 'File' : 'Link')}</div>
            <h3 class="res-title">${esc(r.title)}</h3>
            <div class="res-footer">
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${r.url && r.url !== '#' ? `<a href="${r.url}" target="_blank" rel="noopener" class="btn-primary btn-sm">Visit</a>` : ''}
                    ${r.fileData ? `<a href="${r.fileData}" download="${r.fileName}" class="btn-secondary btn-sm">Download</a>` : ''}
                </div>
                ${isAdmin ? `<button class="btn-del-sm" onclick="deleteResource(${r.id})">Remove</button>` : ''}
            </div>
        </div>`).join('');
}

async function deleteResource(id) {
    if (!isAdmin || !confirm('Remove this resource?')) return;
    
    const backup = [...data.resources];
    data.resources = data.resources.filter(r => r.id !== id);
    
    const ok = await saveData();
    if (!ok) {
        data.resources = backup;
        return;
    }
    
    renderResources();
    showToast('Resource removed.');
}

// ─── ANALYTICS ───────────────────────────────────────────
function renderAnalytics() {
    renderHoursChart();
    renderDiffChart();
    renderCalendar();
    renderWeeklyChart();
    renderTagsCloud();
    initStudyChart();
}

function renderHoursChart() {
    const el = document.getElementById('hoursChart');
    if (!el) return;
    const phaseHours = {};
    data.entries.forEach(e => {
        phaseHours[e.phase] = (phaseHours[e.phase] || 0) + e.hours;
    });
    const max = Math.max(...Object.values(phaseHours), 1);
    el.innerHTML = Object.entries(phaseHours).sort((a, b) => b[1] - a[1]).map(([p, h]) => `
        <div class="bar-row">
            <div class="bar-label" title="${p}">${p.split(':')[0]}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(h / max) * 100}%"></div></div>
            <div class="bar-val">${h.toFixed(1)}h</div>
        </div>`).join('') || '<p style="color:var(--text-muted);font-size:0.875rem;">No data yet</p>';
}

function renderDiffChart() {
    const el = document.getElementById('diffChart');
    if (!el) return;
    const counts = { Easy: 0, Medium: 0, Hard: 0 };
    data.entries.forEach(e => { if (counts[e.difficulty] !== undefined) counts[e.difficulty]++; });
    const total = data.entries.length || 1;
    const colors = { Easy: 'var(--green)', Medium: 'var(--yellow)', Hard: 'var(--red)' };
    el.innerHTML = Object.entries(counts).map(([d, c]) => `
        <div class="legend-row">
            <div class="legend-swatch" style="background:${colors[d]};"></div>
            <span class="legend-name">${d}</span>
            <span class="legend-count">${c} &nbsp;<span style="color:var(--text-muted);font-weight:400;">(${Math.round(c / total * 100)}%)</span></span>
        </div>`).join('');
}

function renderCalendar() {
    const el = document.getElementById('activityCalendar');
    if (!el) return;
    const entriesByDate = {};
    data.entries.forEach(e => { entriesByDate[e.date] = (entriesByDate[e.date] || 0) + 1; });
    let html = '';
    const today = new Date();
    for (let i = 89; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const count = entriesByDate[key] || 0;
        const lv = count === 0 ? '' : count === 1 ? 'cal-lv1' : count === 2 ? 'cal-lv2' : count === 3 ? 'cal-lv3' : 'cal-lv4';
        html += `<div class="cal-day ${lv}" data-tip="${key}: ${count} entr${count === 1 ? 'y' : 'ies'}"></div>`;
    }
    el.innerHTML = html;
}

function renderWeeklyChart() {
    const el = document.getElementById('weeklyChart');
    if (!el) return;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = days.map(() => 0);
    data.entries.forEach(e => {
        const day = new Date(e.date + 'T12:00:00').getDay();
        counts[day]++;
    });
    const max = Math.max(...counts, 1);
    el.innerHTML = counts.map((c, i) => `
        <div class="bar-row">
            <div class="bar-label">${days[i]}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(c / max) * 100}%"></div></div>
            <div class="bar-val">${c}</div>
        </div>`).join('');
}

function renderTagsCloud() {
    const el = document.getElementById('tagsCloud');
    if (!el) return;
    const tagCounts = {};
    data.entries.forEach(e => e.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
    if (!sorted.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem;">No tags yet</p>'; return; }
    el.innerHTML = sorted.map(([t, c]) =>
        `<span class="tag-pill">${esc(t)} <span style="color:var(--text-muted);font-size:0.7rem;">${c}</span></span>`
    ).join('');
}

// ─── STUDY CHART (TradingView-style) ─────────────────────
let studyChart = null;

function initStudyChart() {
    const canvas = document.getElementById('studyChartCanvas');
    if (!canvas) return;
    if (!studyChart) studyChart = new StudyChart('studyChartCanvas');
    // Always resize first so canvas gets correct dimensions even if section was hidden on boot
    studyChart._resize();
    studyChart.loadData(data.entries, data.profile.dailyGoal);
}

class StudyChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.bars = [];
        this.sessionLines = [];
        this.barsPerView = 30;
        this.scrollOffset = 0;
        this.mouseX = -1;
        this.mouseY = -1;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragScrollStart = 0;
        this.showSessions = true;
        this.dailyGoal = 2;
        this.MIN_BARS = 5;
        this.MAX_BARS = 120;
        this.PAD = { top: 28, right: 68, bottom: 44, left: 8 };
        this.GAP_RATIO = 0.28;

        // Colour palette
        this.C = {
            bg:          '#09090b',
            grid:        'rgba(255,255,255,0.035)',
            gridStrong:  'rgba(255,255,255,0.07)',
            axis:        '#27272a',
            xhair:       'rgba(160,170,190,0.35)',
            barUp:       '#10b981',
            barDown:     '#ef4444',
            barNeutral:  '#0ea5e9',
            sessH:       '#0284c7',
            sessL:       '#f59e0b',
            goal:        'rgba(245,158,11,0.55)',
            goalLabel:   '#f59e0b',
            lastLine:    'rgba(14,165,233,0.4)',
            lastBadge:   '#0ea5e9',
            text:        '#71717a',
            textBright:  '#f4f4f5',
            tipBg:       '#18181b',
            tipBorder:   '#27272a',
        };

        this._roundRect = (ctx, x, y, w, h, r) => {
            r = Math.min(r || 0, w / 2, Math.abs(h) / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        };

        this._bind();
        window.addEventListener('resize', () => this._resize());
        this._resize();
    }

    _bind() {
        const c = this.canvas;
        c.addEventListener('mousemove', e => this._onMove(e));
        c.addEventListener('mouseleave', () => { this.mouseX = -1; this.mouseY = -1; this.isDragging = false; this._render(); });
        c.addEventListener('mousedown', e => {
            const r = c.getBoundingClientRect();
            this.dragStartX = e.clientX - r.left;
            this.dragScrollStart = this.scrollOffset;
            this._dragMoved = false;
            this.isDragging = true;
        });
        window.addEventListener('mouseup', () => { this.isDragging = false; });
        // NOTE: wheel zoom intentionally removed — use the +/- buttons to avoid accidental zoom
        c.addEventListener('touchstart', e => { if (e.touches.length === 1) { this.isDragging = true; this._dragMoved = false; const r = c.getBoundingClientRect(); this.dragStartX = e.touches[0].clientX - r.left; this.dragScrollStart = this.scrollOffset; } }, { passive: true });
        c.addEventListener('touchmove', e => { if (e.touches.length === 1 && this.isDragging) { const r = c.getBoundingClientRect(); const dx = e.touches[0].clientX - r.left - this.dragStartX; this._applyDrag(dx); } }, { passive: true });
        c.addEventListener('touchend', () => { this.isDragging = false; });
    }

    _onMove(e) {
        const r = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - r.left;
        this.mouseY = e.clientY - r.top;
        if (this.isDragging) this._applyDrag(this.mouseX - this.dragStartX);
        this._render();
    }

    _applyDrag(dx) {
        // Require at least 4px movement before treating as a drag (prevents accidental pans)
        if (Math.abs(dx) < 4) return;
        this._dragMoved = true;
        const barW = this._barWidth();
        const shifted = Math.round(-dx / barW);
        this.scrollOffset = Math.max(0, Math.min(Math.max(0, this.bars.length - this.barsPerView), this.dragScrollStart + shifted));
        this._render();
    }

    _resize() {
        const wrap = this.canvas.parentElement;
        if (!wrap) return;
        const dpr = window.devicePixelRatio || 1;
        const cssW = wrap.clientWidth  || 600;
        const cssH = wrap.clientHeight || 340;
        // Set physical pixels for crisp rendering on hi-DPI screens
        this.canvas.width  = Math.round(cssW * dpr);
        this.canvas.height = Math.round(cssH * dpr);
        // Keep CSS display size unchanged
        this.canvas.style.width  = cssW + 'px';
        this.canvas.style.height = cssH + 'px';
        this._dpr = dpr;
        this._render();
    }

    loadData(entries, dailyGoal) {
        this.dailyGoal = parseFloat(dailyGoal) || 2;
        const byDate = {};
        entries.forEach(e => {
            if (!byDate[e.date]) byDate[e.date] = { hours: 0, phases: [], difficulty: [] };
            byDate[e.date].hours += e.hours;
            byDate[e.date].phases.push(e.phase.split(':')[0].trim());
            byDate[e.date].difficulty.push(e.difficulty);
        });
        this.bars = Object.entries(byDate)
            .sort(([a], [b]) => (a > b ? 1 : -1))
            .map(([date, d]) => ({
                date, hours: Math.round(d.hours * 10) / 10,
                phases: [...new Set(d.phases)], difficulty: d.difficulty
            }));
        this.barsPerView = Math.min(Math.max(this.bars.length, 5), 30);
        this.scrollOffset = 0;
        this._calcSessionLines();
        this._render();
        this._updateZoomUI();

        // Empty state
        const em = document.getElementById('studyChartEmpty');
        if (em) em.style.display = this.bars.length === 0 ? 'flex' : 'none';
    }

    _calcSessionLines() {
        this.sessionLines = [];
        if (this.bars.length < 2) return;
        // Group bars by ISO week (Mon-Sun)
        const weeks = new Map();
        this.bars.forEach((bar, idx) => {
            const d = new Date(bar.date + 'T12:00:00');
            const dow = d.getDay();
            const mon = new Date(d);
            mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
            const key = mon.toISOString().split('T')[0];
            if (!weeks.has(key)) weeks.set(key, []);
            weeks.get(key).push({ ...bar, idx });
        });

        weeks.forEach(wBars => {
            if (wBars.length === 0) return;
            const high = wBars.reduce((a, b) => b.hours > a.hours ? b : a);
            const nonZ = wBars.filter(b => b.hours > 0);
            if (!nonZ.length) return;
            const low = nonZ.reduce((a, b) => b.hours < a.hours ? b : a);

            // High mitigation: first future bar with hours >= high.hours
            let hEnd = this.bars.length - 1;
            for (let i = high.idx + 1; i < this.bars.length; i++) {
                if (this.bars[i].hours >= high.hours) { hEnd = i; break; }
            }
            // Low mitigation: first future bar with hours <= low.hours (and > 0)
            let lEnd = this.bars.length - 1;
            if (low.idx !== high.idx) {
                for (let i = low.idx + 1; i < this.bars.length; i++) {
                    if (this.bars[i].hours > 0 && this.bars[i].hours <= low.hours) { lEnd = i; break; }
                }
            }
            this.sessionLines.push({ price: high.hours, type: 'high', startIdx: high.idx, endIdx: hEnd, label: 'W.H' });
            if (low.idx !== high.idx) {
                this.sessionLines.push({ price: low.hours, type: 'low', startIdx: low.idx, endIdx: lEnd, label: 'W.L' });
            }
        });
    }

    _barWidth() {
        const w = this.canvas.width / (this._dpr || 1);
        return (w - this.PAD.left - this.PAD.right) / this.barsPerView;
    }

    _visibleBars() {
        const start = Math.max(0, this.bars.length - this.barsPerView - this.scrollOffset);
        const end   = Math.max(0, this.bars.length - this.scrollOffset);
        return { start, bars: this.bars.slice(start, end) };
    }

    _yRange(bars) {
        const hours = bars.map(b => b.hours);
        const maxH  = Math.max(...hours, this.dailyGoal, 1);
        const pad   = maxH * 0.18;
        return { min: -maxH * 0.05, max: maxH + pad };
    }

    _toY(price, yr) {
        const h = (this.canvas.height / (this._dpr || 1)) - this.PAD.top - this.PAD.bottom;
        return this.PAD.top + h - ((price - yr.min) / (yr.max - yr.min)) * h;
    }

    _yTicks(yr) {
        const range = yr.max - yr.min;
        const rough = range / 6;
        const mag   = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 0.01))));
        const step  = Math.ceil(rough / mag) * mag || 1;
        const ticks = [];
        const start = Math.ceil(yr.min / step) * step;
        for (let t = start; t <= yr.max + 0.001; t += step) {
            if (t >= -0.001) ticks.push(Math.round(t * 100) / 100);
        }
        return ticks;
    }

    _render() {
        const ctx = this.ctx;
        const dpr = this._dpr || 1;
        const W = this.canvas.width / dpr;
        const H = this.canvas.height / dpr;
        const P = this.PAD, C = this.C;
        const chartW = W - P.left - P.right;
        const chartH = H - P.top  - P.bottom;

        ctx.save();
        ctx.scale(dpr, dpr);
        
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, W, H);

        if (!this.bars.length) {
            ctx.restore();
            return;
        }

        const { start, bars: vis } = this._visibleBars();
        const yr  = this._yRange(vis);
        const bW  = this._barWidth();
        const bIW = bW * (1 - this.GAP_RATIO);
        const ticks = this._yTicks(yr);

        // ── Grid ────────────────────────────────────
        ticks.forEach(t => {
            const y = this._toY(t, yr);
            ctx.strokeStyle = t === 0 ? C.gridStrong : C.grid;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(P.left, y); ctx.lineTo(W - P.right, y); ctx.stroke();
        });

        // ── Daily goal line ──────────────────────────
        if (this.dailyGoal > yr.min && this.dailyGoal < yr.max) {
            const gy = this._toY(this.dailyGoal, yr);
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = C.goal;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(P.left, gy); ctx.lineTo(W - P.right, gy); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = C.goalLabel;
            ctx.font = '9px Inter,sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('Goal ' + this.dailyGoal + 'h', W - P.right - 4, gy - 3);
        }

        // ── Session H/L lines ────────────────────────
        if (this.showSessions) {
            this.sessionLines.forEach(sl => {
                if (sl.endIdx < start || sl.startIdx >= start + vis.length) return;
                const lStart = Math.max(sl.startIdx - start, 0);
                const lEnd   = Math.min(sl.endIdx   - start, vis.length - 1);
                const x1 = P.left + lStart * bW;
                const x2 = P.left + (lEnd + 1) * bW;
                const y  = this._toY(sl.price, yr);
                const col = sl.type === 'high' ? C.sessH : C.sessL;

                ctx.setLineDash([3, 4]);
                ctx.strokeStyle = col;
                ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
                ctx.setLineDash([]);

                // Label pill at line start
                ctx.font = 'bold 8.5px JetBrains Mono,monospace';
                ctx.textAlign = 'left';
                const lw = ctx.measureText(sl.label).width + 6;
                ctx.fillStyle = col + '22';
                this._roundRect(ctx, x1 + 1, y - 9, lw, 10, 2);
                ctx.fill();
                ctx.fillStyle = col;
                ctx.fillText(sl.label, x1 + 4, y - 1);

                // Mitigation dot
                if (sl.endIdx < this.bars.length - 1 && lEnd < vis.length - 1) {
                    ctx.beginPath();
                    ctx.arc(x2, y, 3, 0, Math.PI * 2);
                    ctx.fillStyle = col;
                    ctx.fill();
                }
            });
        }

        // ── Bars ─────────────────────────────────────
        vis.forEach((bar, li) => {
            const x  = P.left + li * bW + (bW - bIW) / 2;
            const yT = this._toY(bar.hours, yr);
            const yB = this._toY(0, yr);
            const bh = Math.max(1, yB - yT);
            const color = bar.hours >= this.dailyGoal ? C.barUp : (bar.hours > 0 ? C.barDown : C.barNeutral);
            ctx.fillStyle = color;
            this._roundRect(ctx, x, yT, bIW, bh, Math.min(3, bIW / 2));
            ctx.fill();
        });

        // ── Latest value line ────────────────────────
        if (vis.length > 0) {
            const last = vis[vis.length - 1];
            const ly = this._toY(last.hours, yr);
            ctx.setLineDash([2, 3]);
            ctx.strokeStyle = C.lastLine;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(P.left, ly); ctx.lineTo(W - P.right, ly); ctx.stroke();
            ctx.setLineDash([]);
            // Badge
            ctx.fillStyle = C.lastBadge;
            this._roundRect(ctx, W - P.right + 2, ly - 9, P.right - 3, 18, 3);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9.5px JetBrains Mono,monospace';
            ctx.textAlign = 'center';
            ctx.fillText(last.hours.toFixed(1) + 'h', W - P.right + (P.right - 3) / 2 + 2, ly + 4);
        }

        // ── Y-axis labels ────────────────────────────
        ctx.fillStyle = C.text;
        ctx.font = '9.5px JetBrains Mono,monospace';
        ctx.textAlign = 'left';
        ticks.forEach(t => {
            ctx.fillText(t.toFixed(1), W - P.right + 5, this._toY(t, yr) + 4);
        });

        // ── Axes ─────────────────────────────────────
        ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(P.left, P.top); ctx.lineTo(P.left, H - P.bottom); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(P.left, H - P.bottom); ctx.lineTo(W - P.right, H - P.bottom); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W - P.right, P.top); ctx.lineTo(W - P.right, H - P.bottom); ctx.stroke();

        // ── X-axis labels ────────────────────────────
        const every = Math.max(1, Math.floor(this.barsPerView / 8));
        ctx.fillStyle = C.text; ctx.font = '9px Inter,sans-serif'; ctx.textAlign = 'center';
        vis.forEach((bar, li) => {
            if (li % every !== 0) return;
            const x = P.left + (li + 0.5) * bW;
            const d = new Date(bar.date + 'T12:00:00');
            ctx.fillText(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), x, H - P.bottom + 16);
            ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, H - P.bottom); ctx.lineTo(x, H - P.bottom + 4); ctx.stroke();
        });

        // ── Crosshair ────────────────────────────────
        if (this.mouseX > P.left && this.mouseX < W - P.right &&
            this.mouseY > P.top  && this.mouseY < H - P.bottom) {
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = C.xhair; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(this.mouseX, P.top); ctx.lineTo(this.mouseX, H - P.bottom); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(P.left, this.mouseY); ctx.lineTo(W - P.right, this.mouseY); ctx.stroke();
            ctx.setLineDash([]);

            // Price label on right axis
            const hoverPrice = yr.min + (H - P.bottom - this.mouseY) / chartH * (yr.max - yr.min);
            if (hoverPrice >= 0) {
                ctx.fillStyle = 'rgba(100,110,130,0.85)';
                this._roundRect(ctx, W - P.right + 2, this.mouseY - 9, P.right - 3, 18, 3);
                ctx.fill();
                ctx.fillStyle = C.textBright; ctx.font = '9.5px JetBrains Mono,monospace'; ctx.textAlign = 'center';
                ctx.fillText(Math.max(0, hoverPrice).toFixed(1) + 'h', W - P.right + (P.right - 3) / 2 + 2, this.mouseY + 4);
            }

            // Date label on X-axis
            const li = Math.floor((this.mouseX - P.left) / bW);
            if (li >= 0 && li < vis.length) {
                const hBar = vis[li];
                const dl   = new Date(hBar.date + 'T12:00:00')
                    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                ctx.font = '9px Inter,sans-serif'; ctx.textAlign = 'center';
                const dlW = ctx.measureText(dl).width + 12;
                ctx.fillStyle = 'rgba(100,110,130,0.85)';
                this._roundRect(ctx, this.mouseX - dlW / 2, H - P.bottom + 2, dlW, 16, 3);
                ctx.fill();
                ctx.fillStyle = C.textBright;
                ctx.fillText(dl, this.mouseX, H - P.bottom + 13);
                this._drawTooltip(ctx, hBar, this.mouseX, this.mouseY, W, H, yr);
            }
        }
        
        ctx.restore();
    }

    _drawTooltip(ctx, bar, mx, my, W, H, yr) {
        const C  = this.C;
        const lines = [
            bar.date,
            `Hours: ${bar.hours.toFixed(1)}h`,
            bar.hours >= this.dailyGoal ? '✓ Goal met' : `Goal: ${this.dailyGoal}h`,
            bar.phases.length ? `${bar.phases[0]}` : null,
        ].filter(Boolean);

        ctx.font = '11px Inter,sans-serif';
        const lH = 17, px = 10, py = 8;
        const tw = Math.max(...lines.map(l => ctx.measureText(l).width)) + px * 2 + 4;
        const th = lines.length * lH + py * 2;

        let tx = mx + 14;
        let ty = my - th / 2;
        if (tx + tw > W - this.PAD.right) tx = mx - tw - 14;
        if (ty < this.PAD.top) ty = this.PAD.top + 4;
        if (ty + th > H - this.PAD.bottom) ty = H - this.PAD.bottom - th - 4;

        // Box
        ctx.fillStyle = C.tipBg; ctx.strokeStyle = C.tipBorder; ctx.lineWidth = 1; ctx.setLineDash([]);
        this._roundRect(ctx, tx, ty, tw, th, 5); ctx.fill(); ctx.stroke();

        // Accent strip
        ctx.fillStyle = bar.hours >= this.dailyGoal ? C.barUp : C.barDown;
        this._roundRect(ctx, tx, ty, 3, th, [5, 0, 0, 5]); ctx.fill();

        // Text
        lines.forEach((line, i) => {
            ctx.fillStyle   = i === 0 ? C.textBright : (line.startsWith('✓') ? '#2d9e44' : C.text);
            ctx.font        = i === 0 ? 'bold 11px Inter,sans-serif' : '11px Inter,sans-serif';
            ctx.textAlign   = 'left';
            ctx.fillText(line, tx + px + 2, ty + py + (i + 0.78) * lH);
        });
    }

    zoomIn() {
        const step = Math.max(1, Math.floor(this.barsPerView * 0.2));
        this.barsPerView = Math.max(this.MIN_BARS, this.barsPerView - step);
        this.scrollOffset = Math.min(this.scrollOffset, Math.max(0, this.bars.length - this.barsPerView));
        this._render(); this._updateZoomUI();
    }

    zoomOut() {
        const step = Math.max(1, Math.floor(this.barsPerView * 0.2));
        this.barsPerView = Math.min(this.MAX_BARS, Math.min(this.bars.length, this.barsPerView + step));
        this.scrollOffset = Math.min(this.scrollOffset, Math.max(0, this.bars.length - this.barsPerView));
        this._render(); this._updateZoomUI();
    }

    scrollToLatest() {
        this.scrollOffset = 0;
        this._render();
    }

    toggleSessions(btn) {
        this.showSessions = !this.showSessions;
        if (btn) btn.classList.toggle('active', this.showSessions);
        this._render();
    }

    _updateZoomUI() {
        const pct = Math.round((30 / this.barsPerView) * 100);
        const lvEl = document.getElementById('studyChartZoomLevel');
        if (lvEl) lvEl.textContent = pct + '%';
        const inBtn  = document.getElementById('studyChartZoomIn');
        const outBtn = document.getElementById('studyChartZoomOut');
        if (inBtn)  inBtn.disabled  = this.barsPerView <= this.MIN_BARS;
        if (outBtn) outBtn.disabled = this.barsPerView >= Math.min(this.MAX_BARS, this.bars.length);
    }
}



async function handleAdminLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    const btn = event.target.querySelector('button[type="submit"]');

    if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }

    try {
        // Verify credentials server-side — never writes data on login
        const credentials = btoa(`${email}:${pass}`);
        const res = await fetch('/api/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${credentials}`,
                'X-Verify-Only': 'true'
            },
            body: JSON.stringify({})
        });

        if (res.ok) {
            isAdmin = true;
            adminCredentials = { email, pass };
            sessionStorage.setItem('deJournalAdmin', 'true');
            sessionStorage.setItem('deJournalAdminCred', btoa(`${email}:${pass}`));
            applyAdminState();
            // Show post-login action panel instead of closing immediately
            const loginForm = document.querySelector('#adminLoginModal form');
            const postLogin = document.getElementById('adminPostLogin');
            if (loginForm) loginForm.style.display = 'none';
            if (postLogin) postLogin.style.display = 'block';
            if (errEl) errEl.style.display = 'none';
            showToast('Welcome back! Admin mode active. ✓');
            await syncPendingMigration();
        } else {
            if (errEl) errEl.style.display = 'block';
            document.getElementById('loginPass').value = '';
            document.getElementById('loginPass').focus();
        }
    } catch (e) {
        console.error('Login error:', e);
        if (errEl) { errEl.textContent = 'Connection error. Try again.'; errEl.style.display = 'block'; }
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
}

function toggleAdminMode() {
    isAdmin = false;
    adminCredentials = null;
    sessionStorage.removeItem('deJournalAdmin');
    sessionStorage.removeItem('deJournalAdminCred');
    applyAdminState();
    switchTab('dashboard');
    showToast('Signed out successfully.');
}

// ─── ADMIN MODAL (Ctrl+Shift+A) ──────────────────────────
function openAdminModal() {
    const modal = document.getElementById('adminLoginModal');
    if (!modal) return;
    if (isAdmin) {
        // Already admin — show a quick confirmation to sign out
        if (confirm('You are currently signed in as Admin. Sign out?')) {
            toggleAdminMode();
        }
        return;
    }
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        const em = document.getElementById('loginEmail');
        if (em) em.focus();
    }, 150);
}

function closeAdminModal(e) {
    if (e.target === document.getElementById('adminLoginModal')) closeAdminModalBtn();
}

function closeAdminModalBtn() {
    const modal = document.getElementById('adminLoginModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    const errEl = document.getElementById('loginError');
    if (errEl) errEl.style.display = 'none';
    // Reset modal to login form state for next open
    const loginForm = document.querySelector('#adminLoginModal form');
    const postLogin = document.getElementById('adminPostLogin');
    if (loginForm) loginForm.style.display = 'block';
    if (postLogin) postLogin.style.display = 'none';
}

function checkAdminSession() {
    if (sessionStorage.getItem('deJournalAdmin') === 'true') {
        isAdmin = true;
        const stored = sessionStorage.getItem('deJournalAdminCred');
        if (stored) {
            try {
                const decoded = atob(stored);
                const colonIdx = decoded.indexOf(':');
                adminCredentials = {
                    email: decoded.slice(0, colonIdx),
                    pass:  decoded.slice(colonIdx + 1)
                };
            } catch {}
        }
        applyAdminState();
    }
}

function applyAdminState() {
    document.body.classList.toggle('admin-mode', isAdmin);
    renderDashboard();
    renderResources();
    buildPhaseFilters();
    // Update Security card in Settings
    const secInfo = document.getElementById('securityAdminInfo');
    const secEmail = document.getElementById('securityAdminEmail');
    if (secInfo) secInfo.style.display = isAdmin ? 'block' : 'none';
    if (secEmail && adminCredentials) secEmail.textContent = adminCredentials.email;
}

function updateAdminCredentials() {
    // Credentials are now managed via Vercel environment variables (ADMIN_EMAIL, ADMIN_PASS).
    // They cannot be changed from the browser for security. Update them in the Vercel dashboard.
    showToast('Credentials are managed via Vercel environment variables. Update them in the Vercel dashboard.', 'warning');
}

function togglePassVisibility() {
    const input = document.getElementById('loginPass');
    const icon = document.getElementById('eyeIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>`;
    } else {
        input.type = 'password';
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`;
    }
}

// ─── PHASES ───────────────────────────────────────────────
function updatePhaseDropdown() {
    const s = document.getElementById('entryPhase');
    if (!s) return;
    s.innerHTML = data.phases.map(p => `<option value="${p}">${p}</option>`).join('');
}

function renderPhaseManager() {
    const wrap = document.getElementById('phaseManagerList');
    if (!wrap) return;
    wrap.innerHTML = data.phases.map((p, i) => `
        <div class="phase-item">
            <span>${esc(p)}</span>
            <button class="phase-item-del" onclick="deletePhase(${i})">✕ Remove</button>
        </div>`).join('') || '<p style="color:var(--text-muted);font-size:0.875rem;">No phases defined.</p>';
}

function addPhase() {
    const input = document.getElementById('newPhaseInput');
    const val = input.value.trim();
    if (!val || data.phases.includes(val)) { showToast('Phase name already exists or empty.', 'warning'); return; }
    data.phases.push(val);
    input.value = '';
    save();
    renderPhaseManager();
    updatePhaseDropdown();
    buildPhaseFilters();
    showToast(`Phase "${val}" added.`);
}

function deletePhase(i) {
    if (!confirm('Remove this phase? Entries assigned to it will remain.')) return;
    data.phases.splice(i, 1);
    save();
    renderPhaseManager();
    updatePhaseDropdown();
    buildPhaseFilters();
}

// ─── SETTINGS ─────────────────────────────────────────────
function saveEmailJsConfig() {
    data.settings.ejsPublicKey = document.getElementById('ejsPublicKey').value.trim();
    data.settings.ejsServiceId = document.getElementById('ejsServiceId').value.trim();
    data.settings.ejsContactTemplate = document.getElementById('ejsContactTemplate').value.trim();
    data.settings.ejsNotifyTemplate = document.getElementById('ejsNotifyTemplate').value.trim();
    save();

    // Re-init EmailJS with new key
    if (data.settings.ejsPublicKey) {
        emailjs.init(data.settings.ejsPublicKey);
    }
    showToast('EmailJS configuration saved! ✅');
}

// ─── EMAIL / NOTIFICATIONS ───────────────────────────────
async function sendLiveEmail(e) {
    e.preventDefault();
    const btn = document.getElementById('sendEmailBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Sending...';

    const name = document.getElementById('fromName').value;
    const email = document.getElementById('replyTo').value;
    const subject = (document.getElementById('contactSubject') || {}).value || 'Message from DE Journal';
    const msg = document.getElementById('message').value;

    const s = data.settings;
    if (!s.ejsServiceId || !s.ejsContactTemplate) {
        showToast('EmailJS not configured. Please set up in Settings.', 'warning');
        btn.disabled = false;
        btn.textContent = 'Send Message';
        return;
    }

    try {
        await emailjs.send(s.ejsServiceId, s.ejsContactTemplate, {
            from_name: name,
            reply_to: email,
            subject: subject,
            message: msg,
            to_name: data.profile.name
        });
        showToast('Message sent successfully! 📨');
        document.getElementById('contactForm').reset();
    } catch (err) {
        console.error('EmailJS error:', err);
        showToast('Failed to send. Check EmailJS config.', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Send Message';
    btn.innerHTML = `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>Send Message`;
}

async function sendNewEntryNotification(entry) {
    const s = data.settings;
    if (!s.ejsServiceId || !s.ejsNotifyTemplate) return;

    try {
        await emailjs.send(s.ejsServiceId, s.ejsNotifyTemplate, {
            to_email: s.reminderEmail || s.adminEmail,
            to_name: data.profile.name,
            entry_title: entry.title,
            entry_phase: entry.phase,
            entry_date: fmtDate(entry.date),
            entry_hours: entry.hours,
            entry_difficulty: entry.difficulty,
            entry_summary: entry.content.substring(0, 200) + '...'
        });
        console.log('Entry notification sent.');
    } catch (err) {
        console.error('Notification error:', err);
    }
}

function saveReminderSettings(prefix) {
    if (!prefix) prefix = 'contact';
    data.settings.reminderEmail = document.getElementById(prefix + 'ReminderEmail').value;
    data.settings.reminderTime = document.getElementById(prefix + 'ReminderTime').value;
    data.settings.emailReminders = document.getElementById(prefix + 'RemindersToggle').checked;
    save();
    loadSettingsUI();
    scheduleReminder();
    showToast('Notification settings saved! 🔔');
}

function toggleReminders(el) {
    if (!el) return;
    data.settings.emailReminders = el.checked;
    save();
    loadSettingsUI();
    scheduleReminder();
}

let lastSentDate = sessionStorage.getItem('lastReminderSentDate');

function scheduleReminder() {
    if (reminderInterval) clearInterval(reminderInterval);
    if (!data.settings.emailReminders) return;

    function checkAndSend() {
        if (!data.settings.emailReminders) return;
        const now = new Date();
        const todayStr = now.toDateString();
        const [h, m] = (data.settings.reminderTime || '20:00').split(':').map(Number);
        
        let shouldSend = false;
        if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
            shouldSend = true;
        }

        if (shouldSend && lastSentDate !== todayStr) {
            sendDailyReminder();
            lastSentDate = todayStr;
            sessionStorage.setItem('lastReminderSentDate', todayStr);
        }
    }

    checkAndSend();
    reminderInterval = setInterval(checkAndSend, 60000);
}

async function sendDailyReminder() {
    const s = data.settings;
    if (!s.ejsServiceId || !s.ejsNotifyTemplate || !s.reminderEmail) return;

    const streak = calcStreak();
    try {
        await emailjs.send(s.ejsServiceId, s.ejsNotifyTemplate, {
            to_email: s.reminderEmail,
            to_name: data.profile.name,
            entry_title: '🔔 Daily Study Reminder',
            entry_phase: 'DE Journal',
            entry_date: new Date().toLocaleDateString(),
            entry_hours: data.profile.dailyGoal,
            entry_difficulty: `Streak: ${streak} days`,
            entry_summary: `Don't forget your daily study session! Goal: ${data.profile.dailyGoal} hours.`
        });
        console.log('Daily reminder sent.');
    } catch (err) {
        console.error('Reminder error:', err);
    }
}

// ─── FILE HANDLING ────────────────────────────────────────
function previewFiles() {
    const preview = document.getElementById('filePreview');
    const files = document.getElementById('entryMedia').files;
    preview.innerHTML = '';
    Array.from(files).forEach(async f => {
        const div = document.createElement('div');
        div.className = 'file-preview-item';
        if (f.type.startsWith('image')) {
            const url = await toBase64(f);
            div.innerHTML = `<img src="${url}">`;
        } else {
            div.innerHTML = `<span style="font-size:0.65rem;color:var(--text-muted);padding:4px;text-align:center;">${truncate(f.name, 12)}</span>`;
        }
        preview.appendChild(div);
    });
}

function setupDragDrop() {
    const area = document.getElementById('fileUploadArea');
    if (!area) return;
    area.addEventListener('dragover', e => { e.preventDefault(); area.style.borderColor = 'var(--accent)'; });
    area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
    area.addEventListener('drop', e => {
        e.preventDefault();
        area.style.borderColor = '';
        const dt = new DataTransfer();
        [...e.dataTransfer.files].forEach(f => dt.items.add(f));
        document.getElementById('entryMedia').files = dt.files;
        previewFiles();
    });
}

// ─── DATA OPS ─────────────────────────────────────────────
function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `de_journal_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Journal exported successfully! 📥');
}

function importData() { document.getElementById('importFile').click(); }

function handleImport(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async ev => {
        try {
            const parsed = JSON.parse(ev.target.result);
            if (!parsed.entries) throw new Error('Invalid format');
            data = mergeJournalData(data, parsed);
            await saveData();
            renderAll();
            showToast('Data imported and synced to cloud! ☁️', 'success');
        } catch { showToast('Invalid file format.', 'error'); }
    };
    reader.readAsText(f);
}

async function pushLocalCacheToCloud() {
    if (!isAdmin) {
        showToast('Authentication required.', 'error');
        return;
    }
    const local = loadLocalStorageData();
    if (!local || (!local.entries?.length && !local.profile?.name)) {
        showToast('No local backup data found in this browser.', 'warning');
        return;
    }
    const count = local.entries?.length || 0;
    const name = local.profile?.name || 'Robert Njoroge';
    
    if (!confirm(`⚠️ This will overwrite the cloud database with the local data found in this browser:\n\n• Profile: ${name}\n• Total Entries: ${count}\n\nAre you sure you want to push this to the cloud?`)) {
        return;
    }
    
    data.profile = { ...data.profile, ...local.profile };
    data.entries = local.entries || [];
    data.resources = local.resources || [];
    if (local.phases && local.phases.length) data.phases = local.phases;
    if (local.settings) data.settings = { ...data.settings, ...local.settings };
    
    const ok = await saveData();
    if (ok) {
        showToast('Local browser data pushed and synced to cloud! ☁️', 'success');
        renderAll();
    } else {
        showToast('Failed to save data. Check your connection or Vercel config.', 'error');
    }
}

async function clearAllData() {
    if (!confirm('⚠️ This will permanently erase ALL journal data from the cloud. Are you sure?')) return;
    // Reset to empty state and push to cloud
    data = {
        profile:   { name: '', bio: '', photo: null, dailyGoal: 2, location: '',
                     tagline: '', skills: [], focusArea: '', curriculum: '', status: '' },
        entries:   [],
        resources: [],
        phases: [
            'Phase 1-2: Foundations',
            'Phase 3-4: Essential Developer Skills',
            'Phase 5-6: Core Concepts & Cloud Platforms',
            'Phase 7-8: Big Data Processing & Orchestration',
            'Phase 9-10: Data Warehousing & Real-Time Streaming',
            'Phase 11-12: Infrastructure & Data Quality',
            'Phase 13: Building Your Portfolio'
        ],
        settings:  { emailReminders: false, reminderTime: '20:00', reminderEmail: '',
                     ejsPublicKey: '', ejsServiceId: '', ejsContactTemplate: '', ejsNotifyTemplate: '' }
    };
    await saveData();
    showToast('All data cleared from cloud. Reloading...');
    setTimeout(() => location.reload(), 1200);
}

// ─── LIGHTBOX ─────────────────────────────────────────────
function openLightbox(src, caption = '') {
    document.getElementById('lightboxImg').src = src;
    const cap = document.getElementById('lbCaption');
    if (cap) cap.textContent = caption;
    document.getElementById('lightbox').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('active');
    document.body.style.overflow = '';
}

// (Particles and gradient defs removed — clean professional design)

// ─── TOAST ────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    const m = document.getElementById('toastMsg');
    m.textContent = msg;
    t.className = `toast ${type}`;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ─── HELPERS ──────────────────────────────────────────────
function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function truncate(str, max) {
    return String(str).length > max ? String(str).slice(0, max) + '…' : String(str);
}

function fmtDate(s) {
    return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toBase64(f) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(f);
    });
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ─── THEME TOGGLE ─────────────────────────────────────────
function toggleTheme() {
    const html = document.documentElement;
    const curr = html.getAttribute('data-theme') || 'dark';
    const next = curr === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('deTheme', next); // theme preference stays local — intentional
    initThemeIcons();
}

function initThemeIcons() {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const sun = document.getElementById('iconSun');
    const moon = document.getElementById('iconMoon');
    if (!sun || !moon) return;
    if (theme === 'dark') {
        sun.style.display = '';        // show sun (click to switch to light)
        moon.style.display = 'none';
    } else {
        sun.style.display = 'none';
        moon.style.display = '';        // show moon (click to switch to dark)
    }
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeLightbox();
        closeEntryModalBtn();
        closeResourceModalBtn();
        closeAdminModalBtn();
    }
    // Ctrl+Shift+A  →  open hidden admin login
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        openAdminModal();
    }
});
