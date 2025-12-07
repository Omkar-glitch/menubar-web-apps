// DOM elements
const addSiteForm = document.getElementById('add-site-form');
const sitesContainer = document.getElementById('sites-container');
const siteNameInput = document.getElementById('site-name');
const siteUrlInput = document.getElementById('site-url');
const siteColorInput = document.getElementById('site-color');

// Load sites on startup
async function loadSites() {
    const sites = await window.api.getSites();
    renderSites(sites);
}

// Get favicon URL
function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
    } catch {
        return null;
    }
}

// Render sites list
function renderSites(sites) {
    if (sites.length === 0) {
        sitesContainer.innerHTML = `
      <p class="empty-state">
        <span class="empty-icon">📭</span>
        No sites added yet.<br>
        <span class="empty-hint">Add your first site above or use Quick Add!</span>
      </p>
    `;
        return;
    }

    sitesContainer.innerHTML = sites.map(site => {
        const faviconUrl = getFaviconUrl(site.url);
        return `
      <div class="site-item" data-id="${site.id}">
        ${faviconUrl
                ? `<img class="site-icon" src="${faviconUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" alt="">
             <div class="site-color" style="background-color: ${site.color}; display: none;"></div>`
                : `<div class="site-color" style="background-color: ${site.color}"></div>`
            }
        <div class="site-info">
          <div class="site-name">${escapeHtml(site.name)}</div>
          <div class="site-url">${escapeHtml(site.url)}</div>
        </div>
        <button class="site-remove" onclick="removeSite('${site.id}')">Remove</button>
      </div>
    `;
    }).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add site handler
addSiteForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = siteNameInput.value.trim();
    let url = siteUrlInput.value.trim();
    const color = siteColorInput.value;

    // Add https:// if not present
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    if (!name || !url) return;

    // Disable button while adding
    const btn = addSiteForm.querySelector('button');
    btn.disabled = true;
    btn.classList.add('adding');
    btn.innerHTML = '<span class="btn-icon">⏳</span> Adding...';

    await window.api.addSite({ name, url, color });

    // Clear form
    siteNameInput.value = '';
    siteUrlInput.value = '';
    siteColorInput.value = '#007AFF';

    // Reset button
    btn.disabled = false;
    btn.classList.remove('adding');
    btn.innerHTML = '<span class="btn-icon">+</span> Add to Menu Bar';

    // Reload sites
    loadSites();
});

// Remove site handler
async function removeSite(siteId) {
    await window.api.removeSite(siteId);
    loadSites();
}

// Quick add buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const url = btn.dataset.url;
        const color = btn.dataset.color;

        // Visual feedback
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';

        await window.api.addSite({ name, url, color });
        loadSites();

        // Reset button after brief delay
        setTimeout(() => {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }, 500);
    });
});

// Listen for updates from main process
window.api.onSitesUpdated((sites) => {
    renderSites(sites);
});

// Initialize
loadSites();
