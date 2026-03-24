// ============================================================
// DATA ENGINEERING LEARNING JOURNAL — app.js
// ============================================================

// ─── DEFAULT DATA STRUCTURE ──────────────────────────────
let data = {
    profile: {
        name: 'Emmanuel Mwangi',
        bio: 'Documenting my professional journey from fundamentals to mastery in Data Engineering',
        photo: null,
        dailyGoal: 2,
        location: 'Nairobi, Kenya'
    },
    entries: [],
    resources: [],
    phases: [
        'Phase 1: Foundations', 'Phase 2: SQL & Databases', 'Phase 3: Linux CLI',
        'Phase 4: Version Control', 'Phase 5: Core Concepts', 'Phase 6: Cloud Infra',
        'Phase 7: Apache Spark', 'Phase 8: Orchestration', 'Phase 9: Warehousing',
        'Phase 10: Streaming', 'Phase 11: Containers', 'Phase 12: Data Quality'
    ],
    settings: {
        adminEmail: 'admin@journal.com',
        adminPass: 'admin123',
        emailReminders: false,
        reminderTime: '20:00',
        reminderEmail: '',
        ejsPublicKey: '',
        ejsServiceId: 'service_wozwh25',
        ejsContactTemplate: '',
        ejsNotifyTemplate: ''
    }
};

let isAdmin = false;
let currentPhaseFilter = '';
let currentTab = 'dashboard';
let reminderInterval = null;

// ─── BOOT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadStorage();
    checkAdminSession();
    setTodayDate();
    renderAll();
    setupDragDrop();
    initThemeIcons();
    scheduleReminder();
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

// ─── LOCAL STORAGE ───────────────────────────────────────
function loadStorage() {
    try {
        const saved = localStorage.getItem('deJournalData');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge to preserve new keys
            data = {
                profile: { ...data.profile, ...parsed.profile },
                entries: parsed.entries || [],
                resources: parsed.resources || [],
                phases: parsed.phases || data.phases,
                settings: { ...data.settings, ...parsed.settings }
            };
        }
    } catch (e) {
        console.error('Load error:', e);
    }
}

function save() {
    try {
        localStorage.setItem('deJournalData', JSON.stringify(data));
    } catch (e) {
        showToast('Storage quota exceeded. Some data may not save.', 'error');
    }
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
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.profile.name)}&backgroundColor=7c3aed&textColor=ffffff`;
    document.getElementById('userName').textContent = data.profile.name;
    document.getElementById('userBio').textContent = data.profile.bio;
    const loc = document.getElementById('infoLocation');
    if (loc) loc.textContent = data.profile.location || 'Nairobi, Kenya';
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
    const loc = document.getElementById('infoLocation');
    if (loc) loc.textContent = data.profile.location;
    save();
}

function loadSettingsUI() {
    const s = data.settings;
    const p = data.profile;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('settingsName', p.name);
    set('settingsBio', p.bio);
    set('dailyGoal', p.dailyGoal);
    set('settingsLocation', p.location);
    set('adminEmailConfig', s.adminEmail);
    set('ejsPublicKey', s.ejsPublicKey);
    set('ejsServiceId', s.ejsServiceId);
    set('ejsContactTemplate', s.ejsContactTemplate);
    set('ejsNotifyTemplate', s.ejsNotifyTemplate);
    set('reminderEmail', s.reminderEmail);
    set('reminderTime', s.reminderTime || '20:00');
    const tog = document.getElementById('emailRemindersToggle');
    if (tog) tog.checked = !!s.emailReminders;
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
    save();

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

function deleteEntry(id) {
    if (!isAdmin) return;
    if (!confirm('Delete this entry?')) return;
    data.entries = data.entries.filter(e => e.id !== id);
    save();
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

    wrap.innerHTML = data.phases.map(p => {
        const ents = data.entries.filter(e => e.phase === p);
        const hrs = ents.reduce((s, e) => s + e.hours, 0);
        const pct = Math.min((ents.length / 5) * 100, 100);
        return `
        <div class="phase-row">
            <div class="phase-row-header">
                <span class="phase-name">${esc(p)}</span>
                <span class="phase-pct">${Math.round(pct)}%</span>
            </div>
            <div class="phase-track"><div class="phase-fill" style="width:${pct}%"></div></div>
            <div class="phase-row-meta"><span>${ents.length} entries</span><span>${hrs.toFixed(1)}h</span></div>
        </div>`;
    }).join('');

    const active = new Set(data.entries.map(e => e.phase)).size;
    const overallPct = data.phases.length > 0 ? Math.round((active / data.phases.length) * 100) : 0;

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
    const active = new Set(data.entries.map(e => e.phase)).size;
    const pct = data.phases.length > 0 ? Math.round((active / data.phases.length) * 100) : 0;
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
    save();
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

function deleteResource(id) {
    if (!isAdmin || !confirm('Remove this resource?')) return;
    data.resources = data.resources.filter(r => r.id !== id);
    save();
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

// ─── ADMIN AUTH ───────────────────────────────────────────
function handleAdminLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');

    if (email === data.settings.adminEmail && pass === data.settings.adminPass) {
        isAdmin = true;
        localStorage.setItem('deJournalAdmin', 'true');
        applyAdminState();
        closeAdminModalBtn();
        switchTab('dashboard');
        showToast('Welcome back. Admin mode active.');
        if (errEl) errEl.style.display = 'none';
    } else {
        if (errEl) errEl.style.display = 'block';
        document.getElementById('loginPass').value = '';
        document.getElementById('loginPass').focus();
    }
}

function toggleAdminMode() {
    isAdmin = false;
    localStorage.removeItem('deJournalAdmin');
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
}

function checkAdminSession() {
    if (localStorage.getItem('deJournalAdmin') === 'true') {
        isAdmin = true;
        applyAdminState();
    }
}

function applyAdminState() {
    document.body.classList.toggle('admin-mode', isAdmin);
    renderDashboard();
    renderResources();
    buildPhaseFilters();
}

function updateAdminCredentials() {
    const email = document.getElementById('adminEmailConfig').value.trim();
    const pass = document.getElementById('adminPassConfig').value;
    if (email) data.settings.adminEmail = email;
    if (pass) data.settings.adminPass = pass;
    save();
    showToast('Credentials updated.');
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

function saveReminderSettings() {
    data.settings.reminderEmail = document.getElementById('reminderEmail').value;
    data.settings.reminderTime = document.getElementById('reminderTime').value;
    data.settings.emailReminders = document.getElementById('emailRemindersToggle').checked;
    save();
    scheduleReminder();
    showToast('Notification settings saved! 🔔');
}

function toggleReminders() {
    data.settings.emailReminders = document.getElementById('emailRemindersToggle').checked;
    save();
    scheduleReminder();
}

function scheduleReminder() {
    if (reminderInterval) clearInterval(reminderInterval);
    if (!data.settings.emailReminders) return;

    function checkAndSend() {
        const now = new Date();
        const [h, m] = (data.settings.reminderTime || '20:00').split(':').map(Number);
        if (now.getHours() === h && now.getMinutes() === m) {
            sendDailyReminder();
        }
    }

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
    reader.onload = ev => {
        try {
            const parsed = JSON.parse(ev.target.result);
            if (!parsed.entries) throw new Error('Invalid format');
            data = { ...data, ...parsed };
            save();
            renderAll();
            showToast('Data imported successfully! Reloading...', 'success');
            setTimeout(() => location.reload(), 1500);
        } catch { showToast('Invalid file format.', 'error'); }
    };
    reader.readAsText(f);
}

function clearAllData() {
    if (!confirm('⚠️ This will permanently erase ALL journal data. Are you sure?')) return;
    localStorage.clear();
    showToast('All data cleared. Reloading...');
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
    localStorage.setItem('deTheme', next);
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
