/* ============================================
   Cloudberry VC Research Radar — App Logic
   All listed projects are active & thesis-qualifying.
   ============================================ */

const DATA_URL = 'data/projects.json';
const SOURCES_URL = 'sources.json';
const KEYWORDS_URL = 'keywords.json';

let allProjects = [];
let allSources = [];
let allKeywords = {};
let dataMetadata = {};

// ---- Dismissed Projects (persisted in localStorage) ----
const DISMISSED_KEY = 'cloudberry_dismissed_projects';

function getDismissedIds() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); }
  catch { return []; }
}
function dismissProject(id) {
  const dismissed = getDismissedIds();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  }
  renderProjects();
  updateStats();
  showToast('Project dismissed. It won\'t appear again.');
}
function undismissAll() {
  localStorage.removeItem(DISMISSED_KEY);
  renderProjects();
  updateStats();
  showToast('All dismissed projects restored.');
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadSources();
  await loadKeywords();
  await loadProjects();
});

function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', debounce(renderProjects, 250));
  document.getElementById('filterCountry').addEventListener('change', renderProjects);
  document.getElementById('filterUniversity').addEventListener('change', renderProjects);
  document.getElementById('filterCategory').addEventListener('change', renderProjects);
  document.getElementById('btnSources').addEventListener('click', () => toggleModal('sourcesModal', true));
  document.getElementById('closeSourcesModal').addEventListener('click', () => toggleModal('sourcesModal', false));
  document.getElementById('closeDetailModal').addEventListener('click', () => toggleModal('detailModal', false));
  document.getElementById('btnAddSource').addEventListener('click', addSource);
  document.getElementById('btnKeywords').addEventListener('click', () => toggleModal('keywordsModal', true));
  document.getElementById('closeKeywordsModal').addEventListener('click', () => toggleModal('keywordsModal', false));
  document.getElementById('btnAddCategory').addEventListener('click', addKeywordCategory);
  document.getElementById('btnScrapeNow').addEventListener('click', triggerScrape);
  document.getElementById('closeEditSourceModal').addEventListener('click', () => toggleModal('editSourceModal', false));
  document.getElementById('btnSaveSource').addEventListener('click', saveEditedSource);
  setupSourcesTabs();
  setupBulkImport();

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el) toggleModal(el.id, false);
    });
  });

  // Keyboard close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(el => toggleModal(el.id, false));
    }
  });
}

// ---- Data Loading ----
async function loadProjects() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('No data yet');
    const data = await res.json();
    allProjects = data.projects || [];
    dataMetadata = {
      by_category: data.by_category || {},
      by_country: data.by_country || {},
    };
    if (data.last_updated) {
      document.getElementById('lastUpdated').textContent = `Last scan: ${formatDate(data.last_updated, true)}`;
    }
    updateStats();
    populateFilters();
    renderProjects();
  } catch (e) {
    allProjects = [];
    renderProjects();
  }
}

async function loadSources() {
  try {
    const res = await fetch(SOURCES_URL);
    if (!res.ok) throw new Error('No sources');
    allSources = await res.json();
    renderSources();
  } catch (e) {
    allSources = [];
    renderSources();
  }
}

// ---- Stats ----
function updateStats() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // All projects in data are already active + thesis-qualifying
  const dismissed = getDismissedIds();
  const visibleProjects = allProjects.filter(p => !dismissed.includes(p.id));
  document.getElementById('statTotal').textContent = visibleProjects.length;
  document.getElementById('statNew').textContent = allProjects.filter(p => {
    return p.first_seen && new Date(p.first_seen) > weekAgo;
  }).length;
  document.getElementById('statSources').textContent = allSources.length;

  // Country breakdown
  const countries = [...new Set(allProjects.map(p => p.country).filter(Boolean))];
  document.getElementById('statCountries').textContent = countries.length;
}

// ---- Filters ----
function populateFilters() {
  // Country filter
  const countrySel = document.getElementById('filterCountry');
  const countries = [...new Set(allProjects.map(p => p.country).filter(Boolean))].sort();
  countrySel.innerHTML = '<option value="all">All Countries</option>';
  countries.forEach(c => {
    const count = allProjects.filter(p => p.country === c).length;
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = `${c} (${count})`;
    countrySel.appendChild(opt);
  });

  // University filter
  const uniSel = document.getElementById('filterUniversity');
  const orgs = [...new Set(allProjects.map(p => p.source_org).filter(Boolean))].sort();
  uniSel.innerHTML = '<option value="all">All Sources</option>';
  orgs.forEach(org => {
    const opt = document.createElement('option');
    opt.value = org;
    opt.textContent = org;
    uniSel.appendChild(opt);
  });
}

function getFilteredProjects() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const country = document.getElementById('filterCountry').value;
  const university = document.getElementById('filterUniversity').value;
  const category = document.getElementById('filterCategory').value;
  const dismissed = getDismissedIds();

  return allProjects.filter(p => {
    // Hide dismissed
    if (dismissed.includes(p.id)) return false;
    // Search
    if (query) {
      const haystack = [
        p.title, p.description, p.source_org, p.contact_name, p.contact_email, p.country,
        ...(p.matched_keywords || []), ...(p.categories || [])
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    // Country
    if (country !== 'all' && p.country !== country) return false;
    // University
    if (university !== 'all' && p.source_org !== university) return false;
    // Category
    if (category !== 'all' && !(p.categories || []).includes(category)) return false;
    return true;
  });
}

// ---- Render Projects ----
function renderProjects() {
  const container = document.getElementById('projectsContainer');
  const filtered = getFilteredProjects();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <img src="assets/berry_icon.png" alt="" class="empty-icon">
        <h3>${allProjects.length === 0 ? 'No projects yet' : 'No matching projects'}</h3>
        <p>${allProjects.length === 0
          ? 'The scraper has not run yet. Only active, thesis-qualifying projects will appear here after the next Monday scan.'
          : 'Try adjusting your search or filters.'}</p>
      </div>`;
    return;
  }

  // Sort by relevance score (highest first), then newest
  const sorted = [...filtered].sort((a, b) => {
    const scoreA = a.relevance_score || 0;
    const scoreB = b.relevance_score || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return (b.first_seen || '').localeCompare(a.first_seen || '');
  });

  container.innerHTML = sorted.map((p, i) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const isNew = p.first_seen && new Date(p.first_seen) > weekAgo;
    const score = p.relevance_score || 0;

    return `
    <div class="project-card flagged" data-index="${i}">
      <button class="btn-dismiss" title="Dismiss this project" onclick="event.stopPropagation(); dismissProject('${esc(p.id)}')">&times;</button>
      <div class="project-inner" onclick="showDetail(${i})">
        <div class="project-relevance relevant" title="Relevance score: ${score}">
          ${score}
        </div>
        <div class="project-body">
          <div class="project-header">
            <span class="project-title">${esc(cleanTitle(p.title))}</span>
            ${isNew ? '<span class="project-badge badge-new">NEW</span>' : ''}
            ${(p.categories || []).map(c => `<span class="project-badge badge-category">${esc(categoryLabel(c))}</span>`).join('')}
          </div>
          <div class="project-desc">${esc(p.description || 'No description available.')}</div>
          <div class="project-meta">
            <span>&#127891; ${esc(p.source_org || 'Unknown')}</span>
            <span>&#127758; ${esc(p.country || 'Finland')}</span>
            ${p.contact_name ? `<span>&#128100; ${esc(p.contact_name)}</span>` : ''}
            ${p.contact_email ? `<span>&#9993; ${esc(p.contact_email)}</span>` : ''}
            ${p.first_seen ? `<span>&#128197; ${formatDate(p.first_seen)}</span>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  container._sortedData = sorted;

  // Show/hide restore button
  const dismissedCount = getDismissedIds().length;
  const restoreBtn = document.getElementById('btnRestore');
  if (restoreBtn) {
    restoreBtn.style.display = dismissedCount > 0 ? '' : 'none';
    restoreBtn.textContent = `Restore dismissed (${dismissedCount})`;
  }
}

function showDetail(index) {
  const container = document.getElementById('projectsContainer');
  const sorted = container._sortedData || getFilteredProjects();
  const p = sorted[index];
  if (!p) return;

  document.getElementById('detailTitle').textContent = cleanTitle(p.title);
  document.getElementById('detailBody').innerHTML = `
    <div class="detail-section">
      <h3>Description</h3>
      <p>${esc(p.description || 'No description available.')}</p>
    </div>
    <div class="detail-section">
      <h3>Thesis Match (Score: ${p.relevance_score || 0})</h3>
      <div class="detail-tags">
        ${(p.categories || []).map(c => `<span class="detail-tag" style="background:rgba(0,122,110,0.1);color:var(--jade);">${esc(categoryLabel(c))}</span>`).join('')}
      </div>
      <div class="detail-tags" style="margin-top:8px;">
        ${(p.matched_keywords || []).map(k => `<span class="detail-tag">${esc(k)}</span>`).join('')}
      </div>
    </div>
    <div class="detail-section">
      <h3>Source</h3>
      <p>${esc(p.source_org || 'Unknown')} &mdash; ${esc(p.country || 'Finland')}</p>
    </div>
    ${p.contact_name || p.contact_email ? `
    <div class="detail-section">
      <h3>Contact</h3>
      <div class="detail-contact">
        ${p.contact_name ? `<strong>${esc(p.contact_name)}</strong><br>` : ''}
        ${p.contact_email ? `<a href="mailto:${esc(p.contact_email)}">${esc(p.contact_email)}</a>` : ''}
      </div>
    </div>` : ''}
    ${p.url ? `
    <div class="detail-section">
      <h3>Link</h3>
      <a href="${esc(p.url)}" target="_blank" rel="noopener" class="detail-link">
        Open original page &#8599;
      </a>
    </div>` : ''}
    <div class="detail-section" style="font-size:11px;color:var(--muted);">
      First seen: ${formatDate(p.first_seen)} | Last seen: ${formatDate(p.last_seen)} | Source: ${esc(p.source_name || '')}
    </div>
  `;
  toggleModal('detailModal', true);
}

// ---- Sources ----
const TYPE_ICONS = {
  university: '&#127891;',
  research_org: '&#128300;',
  funding_body: '&#128176;',
};
const TYPE_LABELS = {
  university: 'University',
  research_org: 'Research Institute',
  funding_body: 'Funding Body',
};

function renderSources() {
  document.getElementById('sourceCount').textContent = `(${allSources.length})`;
  document.getElementById('statSources').textContent = allSources.length;
  renderSourcesGrouped();
}

function renderSourcesGrouped(filter = '') {
  const container = document.getElementById('sourcesGrouped');
  const filterLower = filter.toLowerCase();

  // Group by country → organization
  const grouped = {};
  allSources.forEach((s, i) => {
    if (filterLower) {
      const text = `${s.name} ${s.organization} ${s.url} ${s.country} ${s.type}`.toLowerCase();
      if (!text.includes(filterLower)) return;
    }
    const country = s.country || 'Other';
    const org = s.organization || s.name;
    if (!grouped[country]) grouped[country] = {};
    if (!grouped[country][org]) grouped[country][org] = [];
    grouped[country][org].push({ ...s, _index: i });
  });

  if (Object.keys(grouped).length === 0) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;">No sources match your filter.</p>';
    return;
  }

  // Sort countries: Finland first, then alphabetical
  const countryOrder = Object.keys(grouped).sort((a, b) => {
    if (a === 'Finland') return -1;
    if (b === 'Finland') return 1;
    return a.localeCompare(b);
  });

  let html = '';
  for (const country of countryOrder) {
    const orgs = grouped[country];
    const orgNames = Object.keys(orgs).sort();
    const totalInCountry = orgNames.reduce((sum, o) => sum + orgs[o].length, 0);

    html += `<div class="source-country-group">
      <div class="source-country-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <span class="source-country-flag">${countryFlag(country)}</span>
        <span class="source-country-name">${esc(country)}</span>
        <span class="source-country-count">${totalInCountry} source${totalInCountry !== 1 ? 's' : ''}</span>
        <span class="source-chevron">&#9660;</span>
      </div>
      <div class="source-country-body">`;

    for (const orgName of orgNames) {
      const sources = orgs[orgName];
      const typeIcon = TYPE_ICONS[sources[0].type] || '&#127891;';
      const typeLabel = TYPE_LABELS[sources[0].type] || sources[0].type;

      html += `<div class="source-org-group">
        <div class="source-org-header">
          <span class="source-org-icon">${typeIcon}</span>
          <span class="source-org-name">${esc(orgName)}</span>
          <span class="source-org-type">${esc(typeLabel)}</span>
        </div>
        <div class="source-org-items">`;

      for (const s of sources) {
        html += `<div class="source-item">
          <div class="source-info">
            <div class="source-name">${esc(s.name)}</div>
            <a class="source-url" href="${esc(s.url)}" target="_blank" title="${esc(s.url)}">${esc(s.url)}</a>
          </div>
          <div class="source-actions">
            <button class="btn-icon" title="Edit" onclick="openEditSource(${s._index})">&#9998;</button>
            <button class="btn-icon btn-icon-danger" title="Remove" onclick="removeSource(${s._index})">&#128465;</button>
          </div>
        </div>`;
      }

      html += `</div></div>`;
    }

    html += `</div></div>`;
  }

  container.innerHTML = html;
}

function countryFlag(country) {
  const flags = { Finland: '&#127467;&#127470;', Sweden: '&#127480;&#127466;', Denmark: '&#127465;&#127472;', Norway: '&#127475;&#127476;', Netherlands: '&#127475;&#127473;', Germany: '&#127465;&#127466;' };
  return flags[country] || '&#127758;';
}

function openEditSource(index) {
  const s = allSources[index];
  document.getElementById('editSourceName').value = s.name || '';
  document.getElementById('editSourceUrl').value = s.url || '';
  document.getElementById('editSourceOrg').value = s.organization || '';
  document.getElementById('editSourceCountry').value = s.country || 'Finland';
  document.getElementById('editSourceType').value = s.type || 'university';
  document.getElementById('editSourceIndex').value = index;
  toggleModal('editSourceModal', true);
}

async function saveEditedSource() {
  const index = parseInt(document.getElementById('editSourceIndex').value);
  const updated = {
    name: document.getElementById('editSourceName').value.trim(),
    url: document.getElementById('editSourceUrl').value.trim(),
    organization: document.getElementById('editSourceOrg').value.trim(),
    country: document.getElementById('editSourceCountry').value,
    type: document.getElementById('editSourceType').value,
  };
  if (!updated.name || !updated.url) {
    showToast('Name and URL are required.', 'error');
    return;
  }
  allSources[index] = updated;

  try {
    // Save all sources (replace full list)
    const res = await fetch('/.netlify/functions/manage-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'replace_all', sources: allSources })
    });
    if (!res.ok) throw new Error('Save failed');
  } catch {
    // Still updated locally
  }

  toggleModal('editSourceModal', false);
  renderSources();
  showToast('Source updated.', 'success');
}

function setupSourcesTabs() {
  const tabs = document.querySelectorAll('.sources-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.sources-tab-panel').forEach(p => p.classList.remove('active'));
      const target = tab.getAttribute('data-sources-tab');
      const panelMap = { browse: 'panelBrowse', add: 'panelAdd', bulk: 'panelBulkTab' };
      document.getElementById(panelMap[target]).classList.add('active');
    });
  });

  // Source search filter
  document.getElementById('sourceSearchInput').addEventListener('input', debounce(() => {
    renderSourcesGrouped(document.getElementById('sourceSearchInput').value);
  }, 200));
}

async function addSource() {
  const name = document.getElementById('newSourceName').value.trim();
  const url = document.getElementById('newSourceUrl').value.trim();
  const org = document.getElementById('newSourceOrg').value.trim();
  const country = document.getElementById('newSourceCountry').value;
  const type = document.getElementById('newSourceType').value;

  if (!name || !url) {
    showToast('Please enter both a name and URL.', 'error');
    return;
  }

  try {
    new URL(url);
  } catch {
    showToast('Please enter a valid URL.', 'error');
    return;
  }

  const newSource = { name, url, organization: org || name, country, type };

  try {
    const res = await fetch('/.netlify/functions/manage-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', source: newSource })
    });
    if (res.ok) {
      const data = await res.json();
      allSources = data.sources || [...allSources, newSource];
      showToast(`Added "${name}" — it will be scraped on the next Monday scan.`, 'success');
    } else {
      throw new Error('Function not available');
    }
  } catch {
    allSources.push(newSource);
    showToast(`Added "${name}" locally. Deploy the Netlify Function for shared persistence.`, 'success');
  }

  renderSources();

  document.getElementById('newSourceName').value = '';
  document.getElementById('newSourceUrl').value = '';
  document.getElementById('newSourceOrg').value = '';
}

async function removeSource(index) {
  const source = allSources[index];
  if (!confirm(`Remove "${source.name}" from sources?`)) return;

  try {
    const res = await fetch('/.netlify/functions/manage-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', index })
    });
    if (res.ok) {
      const data = await res.json();
      allSources = data.sources;
    } else {
      throw new Error('Function not available');
    }
  } catch {
    allSources.splice(index, 1);
  }

  renderSources();
  showToast('Source removed.', 'success');
}

// ---- Utilities ----
function toggleModal(id, show) {
  document.getElementById(id).classList.toggle('active', show);
  document.body.style.overflow = show ? 'hidden' : '';
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr, includeTime = false) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!includeTime) return datePart;
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} at ${timePart}`;
  } catch { return dateStr; }
}

function cleanTitle(title) {
  if (!title) return 'Untitled Project';
  return title.replace(/^(move to page\s*|go to\s*|navigate to\s*)/i, '').trim() || 'Untitled Project';
}

function categoryLabel(cat) {
  const labels = {
    semiconductors: 'Semiconductors',
    photonics: 'Photonics & Optics',
    advanced_materials: 'Advanced Materials',
    equipment: 'Equipment & Metrology',
    quantum: 'Quantum'
  };
  return labels[cat] || cat;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ---- Keywords Management ----
async function loadKeywords() {
  try {
    const res = await fetch(KEYWORDS_URL);
    if (!res.ok) throw new Error('No keywords');
    allKeywords = await res.json();
    renderKeywords();
    populateCategoryFilter();
  } catch (e) {
    allKeywords = {};
  }
}

function populateCategoryFilter() {
  const sel = document.getElementById('filterCategory');
  sel.innerHTML = '<option value="all">All Categories</option>';
  Object.keys(allKeywords).forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = categoryLabel(cat);
    sel.appendChild(opt);
  });
}

function renderKeywords() {
  const container = document.getElementById('keywordCategories');
  if (!container) return;
  const cats = Object.keys(allKeywords);
  container.innerHTML = cats.map(cat => {
    const label = cat.replace(/_/g, ' ');
    const keywords = allKeywords[cat] || [];
    return `
    <div class="keyword-category" data-cat="${esc(cat)}">
      <div class="keyword-category-header">
        <h4>${esc(label)} (${keywords.length})</h4>
        <button class="btn-remove-cat" onclick="removeKeywordCategory('${esc(cat)}')">Remove category</button>
      </div>
      <div class="keyword-tags">
        ${keywords.map(kw => `
          <span class="keyword-tag">
            ${esc(kw)}
            <button class="tag-remove" onclick="removeKeyword('${esc(cat)}','${esc(kw)}')">&times;</button>
          </span>
        `).join('')}
      </div>
      <div class="keyword-add-row">
        <input type="text" placeholder="Add keyword..." id="kwInput_${esc(cat)}" onkeydown="if(event.key==='Enter')addKeyword('${esc(cat)}')">
        <button class="btn btn-primary btn-sm" onclick="addKeyword('${esc(cat)}')">Add</button>
      </div>
    </div>`;
  }).join('');
}

async function saveKeywords() {
  try {
    const res = await fetch('/.netlify/functions/manage-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_keywords', keywords: allKeywords }),
    });
    if (!res.ok) throw new Error('Save failed');
  } catch {
    // Silently fail — keywords still updated in memory for display
  }
}

function addKeyword(cat) {
  const input = document.getElementById(`kwInput_${cat}`);
  if (!input) return;
  const kw = input.value.trim().toLowerCase();
  if (!kw) return;
  if (!allKeywords[cat]) allKeywords[cat] = [];
  if (allKeywords[cat].includes(kw)) {
    showToast('Keyword already exists in this category.', 'error');
    return;
  }
  allKeywords[cat].push(kw);
  input.value = '';
  renderKeywords();
  saveKeywords();
  showToast(`Added "${kw}" to ${cat.replace(/_/g, ' ')}.`);
}

function removeKeyword(cat, kw) {
  if (!allKeywords[cat]) return;
  allKeywords[cat] = allKeywords[cat].filter(k => k !== kw);
  renderKeywords();
  saveKeywords();
  showToast(`Removed "${kw}" from ${cat.replace(/_/g, ' ')}.`);
}

function addKeywordCategory() {
  const input = document.getElementById('newCategoryName');
  const name = input.value.trim().toLowerCase().replace(/\s+/g, '_');
  if (!name) return;
  if (allKeywords[name]) {
    showToast('Category already exists.', 'error');
    return;
  }
  allKeywords[name] = [];
  input.value = '';
  renderKeywords();
  saveKeywords();
  showToast(`Category "${name.replace(/_/g, ' ')}" created. Add keywords to it!`);
}

function removeKeywordCategory(cat) {
  if (!confirm(`Remove the entire "${cat.replace(/_/g, ' ')}" category and all its keywords?`)) return;
  delete allKeywords[cat];
  renderKeywords();
  saveKeywords();
  showToast(`Category "${cat.replace(/_/g, ' ')}" removed.`);
}

// ---- Scrape Now ----
async function triggerScrape() {
  const btn = document.getElementById('btnScrapeNow');
  btn.disabled = true;
  btn.textContent = 'Triggering...';
  try {
    const res = await fetch('/.netlify/functions/manage-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'trigger_scrape' }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed');
    }
    showToast('Scrape triggered! It will take a few minutes. Refresh the page afterwards.');
  } catch (err) {
    showToast('Could not trigger scrape: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Scrape Now';
  }
}

// ---- Bulk Import ----
function setupBulkImport() {
  const tabPaste = document.getElementById('tabPaste');
  const tabUpload = document.getElementById('tabUpload');
  const panelPaste = document.getElementById('panelPaste');
  const panelUpload = document.getElementById('panelUpload');

  // Tab switching
  tabPaste.addEventListener('click', () => {
    tabPaste.classList.add('active');
    tabUpload.classList.remove('active');
    panelPaste.style.display = '';
    panelUpload.style.display = 'none';
  });
  tabUpload.addEventListener('click', () => {
    tabUpload.classList.add('active');
    tabPaste.classList.remove('active');
    panelUpload.style.display = '';
    panelPaste.style.display = 'none';
  });

  // Paste import
  document.getElementById('btnBulkPaste').addEventListener('click', bulkImportFromPaste);

  // File upload
  const dropZone = document.getElementById('fileDropZone');
  const fileInput = document.getElementById('bulkFileInput');
  const browseLink = document.getElementById('fileBrowseLink');

  browseLink.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleBulkFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleBulkFile(fileInput.files[0]);
  });
  document.getElementById('btnBulkUpload').addEventListener('click', commitBulkFile);
}

let pendingBulkSources = [];

function parseBulkLines(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sources = [];
  for (const line of lines) {
    // Skip header rows
    if (/^name\b/i.test(line)) continue;
    const parts = line.split(/[,\t]/).map(s => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) continue;
    // Validate URL loosely
    try { new URL(parts[1]); } catch { continue; }
    sources.push({
      name: parts[0],
      url: parts[1],
      organization: parts[2] || parts[0],
      country: parts[3] || 'Finland',
      type: parts[4] || 'university',
    });
  }
  return sources;
}

function bulkImportFromPaste() {
  const text = document.getElementById('bulkPasteInput').value.trim();
  if (!text) { showToast('Nothing to import — paste some sources first.', 'error'); return; }
  const parsed = parseBulkLines(text);
  if (parsed.length === 0) { showToast('Could not parse any valid sources. Use format: name, url, org, country, type', 'error'); return; }
  addBulkSources(parsed);
  document.getElementById('bulkPasteInput').value = '';
}

function handleBulkFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (['csv', 'tsv', 'txt'].includes(ext)) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseBulkLines(reader.result);
      if (parsed.length === 0) { showToast('No valid sources found in file.', 'error'); return; }
      pendingBulkSources = parsed;
      document.getElementById('bulkFileStatus').textContent = `Found ${parsed.length} source(s) in "${file.name}"`;
      document.getElementById('bulkFilePreview').style.display = '';
    };
    reader.readAsText(file);
  } else if (['xlsx', 'xls'].includes(ext)) {
    // Read Excel via basic parsing (ArrayBuffer → CSV-like extraction)
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseExcelBuffer(reader.result);
        if (parsed.length === 0) { showToast('No valid sources found in spreadsheet.', 'error'); return; }
        pendingBulkSources = parsed;
        document.getElementById('bulkFileStatus').textContent = `Found ${parsed.length} source(s) in "${file.name}"`;
        document.getElementById('bulkFilePreview').style.display = '';
      } catch (err) {
        showToast('Could not read spreadsheet. Please try CSV format instead.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    showToast('Unsupported file type. Please use CSV, TSV, XLS, or XLSX.', 'error');
  }
}

function parseExcelBuffer(buffer) {
  // Lightweight XLSX parser — extracts shared strings and first sheet rows
  // For full Excel support, users can export to CSV
  try {
    // Use JSZip-like approach: XLSX is a ZIP with XML inside
    // Fallback: try to decode as CSV if it fails
    const bytes = new Uint8Array(buffer);
    // Check for ZIP signature (PK)
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) {
      // Not a ZIP/XLSX — try as CSV text
      const text = new TextDecoder().decode(buffer);
      return parseBulkLines(text);
    }
    // For XLSX: we suggest CSV export since full parsing in vanilla JS is complex
    showToast('For Excel files, please save as CSV first for most reliable import.', 'error');
    return [];
  } catch {
    return [];
  }
}

function commitBulkFile() {
  if (pendingBulkSources.length === 0) { showToast('No sources to import.', 'error'); return; }
  addBulkSources(pendingBulkSources);
  pendingBulkSources = [];
  document.getElementById('bulkFilePreview').style.display = 'none';
  document.getElementById('bulkFileInput').value = '';
}

async function addBulkSources(newSources) {
  // Deduplicate against existing sources
  const existingUrls = new Set(allSources.map(s => s.url));
  const unique = newSources.filter(s => !existingUrls.has(s.url));
  const dupeCount = newSources.length - unique.length;

  if (unique.length === 0) {
    showToast(`All ${newSources.length} source(s) already exist.`, 'error');
    return;
  }

  try {
    const res = await fetch('/.netlify/functions/manage-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_add', sources: unique }),
    });
    if (res.ok) {
      const data = await res.json();
      allSources = data.sources || [...allSources, ...unique];
    } else {
      throw new Error('Function not available');
    }
  } catch {
    allSources.push(...unique);
  }

  renderSources();
  const msg = `Imported ${unique.length} source(s).${dupeCount > 0 ? ` ${dupeCount} duplicate(s) skipped.` : ''}`;
  showToast(msg, 'success');
}

function showToast(msg, type = 'success') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
