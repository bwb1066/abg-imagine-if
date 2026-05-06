/* ============================================================
   MILE × Avis Budget Group — Editor Script
   Three ways to enable edit mode:
     1. Add #edit to URL (works on initial load AND when added later)
     2. Press Cmd/Ctrl + E to toggle
     3. Type the word "edit" anywhere on the page
   ============================================================ */

(function () {
  // Bumping STORAGE_VERSION invalidates any cached state from older builds. This prevents
  // the situation where stale localStorage from a previous version of the HTML overwrites
  // newly-shipped structural changes (e.g. when img-swap classes were added to placeholder
  // tiles, old caches kept the previous structure and edit affordances disappeared).
  const STORAGE_VERSION = 'v3';
  const STORAGE_KEY = 'mile-mockup:' + STORAGE_VERSION + ':' + location.pathname.split('/').pop();
  let edited = false;
  let initialized = false;

  function isEditUrl() {
    return location.hash === '#edit' || location.search.indexOf('edit=1') !== -1;
  }

  function structuralFingerprint(root) {
    // A minimal signature of the page's structural skeleton. If this differs between
    // a saved state and the current HTML, the saved state was made against a different
    // build of the page and applying it would silently overwrite new structural changes
    // (e.g. img-swap classes, new sections). We use it as a sanity check before restore.
    if (!root) return '';
    return [
      root.querySelectorAll('.img-swap').length,
      root.querySelectorAll('.veh-card').length,
      root.querySelectorAll('.thing-card').length,
      root.querySelectorAll('.badge-card').length,
      root.querySelectorAll('button').length,
      root.querySelectorAll('h1,h2,h3,h4').length
    ].join('-');
  }

  function saveState() {
    const stage = document.querySelector('.mockup-stage');
    if (!stage) return;
    try {
      const payload = JSON.stringify({
        fp: structuralFingerprint(stage),
        html: stage.innerHTML
      });
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (e) {}
  }

  function restoreState() {
    const stage = document.querySelector('.mockup-stage');
    if (!stage) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      // Backwards-compat: old saves were raw HTML strings, not JSON. Treat those as stale.
      if (raw[0] !== '{') {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const data = JSON.parse(raw);
      const currentFp = structuralFingerprint(stage);
      if (data.fp !== currentFp) {
        // Saved state was made against a different page structure — ignore it. The user's
        // old edits aren't lost (they're still in localStorage), but applying them would
        // hide newly-shipped content. Bumping STORAGE_VERSION clears these eventually.
        console.warn('MILE editor: skipping restore — saved state predates a page update.');
        return;
      }
      stage.innerHTML = data.html;
    } catch (e) {}
  }

  function stripEditAttributes(root) {
    if (!root) return;
    // Only strip true edit artifacts. Do NOT remove the .img-swap class — that's part of
    // the page's source markup, and removing it makes recovery impossible if the user enters
    // edit mode without a full page reload (e.g. adds #edit to the URL on an already-open
    // page, where the browser fires hashchange but doesn't refetch the HTML).
    root.querySelectorAll('[contenteditable]').forEach(el => {
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
    });
  }

  function applyEditable() {
    const sel = [
      '.avis-mock h1, .avis-mock h2, .avis-mock h3, .avis-mock h4, .avis-mock h5, .avis-mock h6',
      '.avis-mock p',
      '.avis-mock span:not(.dot):not(.pin)',
      '.avis-mock b', '.avis-mock strong', '.avis-mock small',
      '.avis-mock .mile-input',
      '.avis-mock .avis-account',
      '.avis-mock .avis-subnav',
      '.avis-mock .bubble-user', '.avis-mock .bubble-mile',
      '.avis-mock .chip',
      '.avis-mock .btn-reserve, .avis-mock .btn-add, .avis-mock .btn-primary, .avis-mock .btn-secondary',
      '.avis-mock .veh-card', '.avis-mock .thing-card', '.avis-mock .badge-card', '.avis-mock .stat-tile',
      '.avis-mock .step', '.avis-mock .pill', '.avis-mock .badge',
      '.avis-mock label', '.avis-mock td', '.avis-mock li',
      '.mockup-caption'
    ];
    document.querySelectorAll(sel.join(',')).forEach(el => {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');
    });
  }

  function applyImageSwap() {
    // Step 1: mark every swap target as explicitly NOT contenteditable. Without this, Safari
    // (and some other browsers) swallow clicks because the parent .thing-card / .veh-card is
    // contenteditable=true, so children inherit edit behavior and place a text cursor instead
    // of firing the click handler. Setting contenteditable="false" on the swap target severs
    // that inheritance.
    document.querySelectorAll('.avis-mock img, .avis-mock .img-swap').forEach(target => {
      target.classList.add('img-swap');
      target.setAttribute('contenteditable', 'false');
    });

    // Step 2: also mark children of .img-swap (like .pin-tag) non-editable, otherwise clicks
    // on those children focus them for text-edit instead of bubbling to the swap handler.
    document.querySelectorAll('.avis-mock .img-swap *').forEach(child => {
      child.setAttribute('contenteditable', 'false');
    });

    // Step 3: use ONE event-delegation handler at the stage level instead of attaching a
    // listener per element. Clicking anywhere inside an .img-swap subtree resolves to its
    // nearest .img-swap ancestor and triggers the file picker. This is robust across browsers
    // and survives DOM changes from contenteditable typing.
    const stage = document.querySelector('.mockup-stage');
    if (!stage || stage.dataset.swapBound) return;
    stage.dataset.swapBound = '1';
    stage.addEventListener('click', function (e) {
      const target = e.target.closest('.img-swap');
      if (!target) return;
      if (!document.body.classList.contains('edit-mode')) return;
      e.preventDefault();
      e.stopPropagation();
      triggerImageUpload(target);
    }, true);  // capture phase — intercepts before any contenteditable focus handling
  }

  function triggerImageUpload(target) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = function () {
      const f = input.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = function (ev) {
        if (target.tagName === 'IMG') {
          target.src = ev.target.result;
        } else {
          target.style.backgroundImage = 'url("' + ev.target.result + '")';
          target.style.backgroundSize = 'cover';
          target.style.backgroundPosition = 'center';
        }
        saveState();
      };
      r.readAsDataURL(f);
    };
    input.click();
  }

  function injectToolbar() {
    if (document.querySelector('.editor-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'editor-bar';
    bar.innerHTML =
      '<a class="back" href="index.html">← All mockups</a>' +
      '<span class="title">' + document.title.replace(/^MILE — /, '') + '</span>' +
      '<button id="toggle-edit" type="button">Edit mode: ON</button>' +
      '<button id="reset-edits" type="button">Reset</button>' +
      '<button class="primary" id="download-html" type="button">Download HTML</button>' +
      '<span class="hint">Click any text to edit · Click any image or logo to replace · ⌘E to toggle</span>';
    document.body.insertBefore(bar, document.body.firstChild);
    document.getElementById('toggle-edit').addEventListener('click', toggleEditMode);
    document.getElementById('reset-edits').addEventListener('click', resetEdits);
    document.getElementById('download-html').addEventListener('click', downloadHTML);
  }

  function enableEditMode() {
    if (edited) return;
    edited = true;
    restoreState();  // surface saved edits when actually entering edit mode
    document.body.classList.add('edit-mode');
    injectToolbar();
    applyEditable();
    applyImageSwap();
  }

  function toggleEditMode() {
    if (!edited) {
      enableEditMode();
      return;
    }
    document.body.classList.toggle('edit-mode');
    const btn = document.getElementById('toggle-edit');
    if (btn) btn.textContent = document.body.classList.contains('edit-mode')
      ? 'Edit mode: ON' : 'Edit mode: OFF';
  }

  function downloadHTML() {
    const clone = document.documentElement.cloneNode(true);
    const bar = clone.querySelector('.editor-bar'); if (bar) bar.remove();
    clone.querySelectorAll('script').forEach(s => s.remove());
    clone.querySelectorAll('[contenteditable]').forEach(el => {
      el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck');
    });
    clone.querySelectorAll('.img-swap').forEach(el => el.classList.remove('img-swap'));
    const body = clone.querySelector('body'); if (body) body.classList.remove('edit-mode');

    fetch('styles.css').then(r => r.text()).then(css => {
      const link = clone.querySelector('link[rel="stylesheet"]');
      if (link) {
        const style = document.createElement('style');
        style.textContent = css;
        link.replaceWith(style);
      }
      const html = '<!DOCTYPE html>\n' + clone.outerHTML;
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = document.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.html';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function resetEdits() {
    if (!confirm('Reset this page to the original? Your edits will be lost.')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    location.reload();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    // Only restore saved edits when entering edit mode. Auto-restoring on every page load
    // is a footgun: stale cache silently replaces new content for view-only visitors.
    if (isEditUrl()) {
      restoreState();
      enableEditMode();
    } else {
      stripEditAttributes(document.querySelector('.mockup-stage'));
    }
    document.addEventListener('input', function (e) {
      if (e.target.closest && e.target.closest('.mockup-stage')) saveState();
    });
  }

  // Entry point 1: initial page load with #edit
  document.addEventListener('DOMContentLoaded', init);

  // Entry point 2: hash CHANGED after load (this was the bug — without this, adding #edit
  // to an already-open page silently did nothing because the browser doesn't reload on hash change)
  window.addEventListener('hashchange', function () {
    if (isEditUrl()) enableEditMode();
  });

  // Entry point 3: Cmd/Ctrl + E
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'e' || e.key === 'E')) {
      const t = e.target;
      const isField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (isField && edited) return;
      e.preventDefault();
      toggleEditMode();
    }
  });

  // Entry point 4: type "edit" anywhere on the page
  let typed = '';
  document.addEventListener('keydown', function (e) {
    const t = e.target;
    const isField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (isField) return;
    if (e.key && e.key.length === 1) {
      typed = (typed + e.key.toLowerCase()).slice(-4);
      if (typed === 'edit') { typed = ''; if (!edited) enableEditMode(); }
    }
  });

  console.log('%cMILE editor', 'color:#D50025;font-weight:700',
    '— enable with #edit in URL, Cmd/Ctrl+E, or type "edit"');
})();