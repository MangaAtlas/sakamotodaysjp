/* JPMangaatlas Ads System — identical shared loader for every MangaAtlas site. */
var mangaAtlasAdsScriptUrl = document.currentScript && document.currentScript.src;
(async function () {
  'use strict';
  if (window.__mangaAtlasAdsSystemLoaded) return;
  window.__mangaAtlasAdsSystemLoaded = true;
  if (/(^|\/)admin(?:\/|$)/i.test(location.pathname)) return;

  var cfg;
  try {
    var configUrl = mangaAtlasAdsScriptUrl
      ? new URL('data/ads-config.json', mangaAtlasAdsScriptUrl).href
      : new URL('data/ads-config.json', document.baseURI).href;
    configUrl += (configUrl.indexOf('?') === -1 ? '?' : '&') + 'v=' + Date.now();
    var response = await fetch(configUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Ads configuration HTTP ' + response.status);
    cfg = await response.json();
  } catch (error) {
    console.warn('JPMangaatlas ads configuration could not be loaded.', error);
    return;
  }

  var sections = Array.isArray(cfg && cfg.sections)
    ? cfg.sections.filter(function (section) {
        return section && section.enabled && String(section.code || '').trim();
      })
    : [];
  if (!sections.length) return;

  // Keep each social-bar script inside its configured section. Global deduplication
  // breaks placement-based formats because providers attach to the current document/slot.
  function executeIsolated(code, id) {
    var box = document.createElement('div');
    box.className = 'manga-atlas-ad-slot';
    box.dataset.maAdSection = id;
    box.style.cssText = 'width:100%;min-height:90px;margin:20px auto;padding:8px 0;display:flex;justify-content:center;align-items:center;clear:both;overflow:visible;position:relative;z-index:1;';
    var label = document.createElement('div');
    label.textContent = 'Advertisement';
    label.setAttribute('aria-label', 'Advertisement');
    label.style.cssText = 'position:absolute;top:0;left:0;font:10px Arial,sans-serif;color:#8b8b8b;line-height:12px;';
    box.appendChild(label);
    var content = document.createElement('div');
    content.style.cssText = 'width:100%;min-height:90px;display:flex;justify-content:center;align-items:center;overflow:visible;';
    content.innerHTML = String(code || '');
    box.appendChild(content);
    return box;
  }

  // HighRevenueFormat invoke.js reads the global atOptions object. Queue each
  // atOptions/invoke pair so different sections cannot overwrite one another.
  var providerQueue = Promise.resolve();
  function makeScript(oldScript, parent) {
    var script = document.createElement('script');
    Array.prototype.slice.call(oldScript.attributes).forEach(function (attribute) {
      if (attribute.name.toLowerCase() !== 'src') script.setAttribute(attribute.name, attribute.value);
    });
    if (oldScript.src) script.src = oldScript.src;
    else script.text = oldScript.textContent || '';
    parent.appendChild(script);
    return script;
  }

  // Activate no more than 10 configured ad placements per one-second batch.
  // The first batch starts immediately; later placements continue in subsequent seconds.
  var activationQueue = [];
  var activationTimer = null;
  function flushActivationQueue() {
    activationTimer = null;
    var batch = activationQueue.splice(0, 10);
    batch.forEach(function (box) {
      try { activateScripts(box); }
      catch (error) { console.warn('Could not activate ad placement.', error); }
    });
    if (activationQueue.length) activationTimer = setTimeout(flushActivationQueue, 1000);
  }
  function queueActivation(box) {
    activationQueue.push(box);
    if (activationTimer === null) activationTimer = setTimeout(flushActivationQueue, 0);
  }

  function activateScripts(box) {
    var scripts = Array.prototype.slice.call(box.querySelectorAll('script'));
    for (var i = 0; i < scripts.length; i++) {
      (function (oldScript, nextScript) {
        if (!oldScript.parentNode) return;
        var parent = oldScript.parentNode;
        var src = oldScript.getAttribute('src') || '';
        var isAtOptions = !src && /\batOptions\s*=/.test(oldScript.textContent || '');
        var nextSrc = nextScript && (nextScript.getAttribute('src') || '');
        if (isAtOptions && /highrevenueformat\.com\/[^/]+\/invoke\.js/i.test(nextSrc)) {
          if (nextScript.parentNode) nextScript.parentNode.removeChild(nextScript);
          parent.removeChild(oldScript);
          providerQueue = providerQueue.then(function () {
            var inline = document.createElement('script');
            inline.text = oldScript.textContent || '';
            parent.appendChild(inline);
            return new Promise(function (resolve) {
              var invoke = document.createElement('script');
              Array.prototype.slice.call(nextScript.attributes).forEach(function (attribute) {
                if (attribute.name.toLowerCase() !== 'src') invoke.setAttribute(attribute.name, attribute.value);
              });
              var settled = false;
              function finish() {
                if (settled) return;
                settled = true;
                resolve();
              }
              invoke.onload = finish;
              invoke.onerror = finish;
              var fallback = setTimeout(finish, 1500);
              var done = finish;
              invoke.onload = function () { clearTimeout(fallback); done(); };
              invoke.onerror = function () { clearTimeout(fallback); done(); };
              invoke.src = nextSrc;
              parent.appendChild(invoke);
            });
          }).catch(function (error) {
            console.warn('An ad provider script failed in section ' + box.dataset.maAdSection, error);
          });
          i++;
          return;
        }

        if (!oldScript.parentNode) return;
        if (src) {
          var external = makeScript(oldScript, parent);
          external.async = true;
          oldScript.parentNode.removeChild(oldScript);
        } else {
          makeScript(oldScript, parent);
          if (oldScript.parentNode) oldScript.parentNode.removeChild(oldScript);
        }
      })(scripts[i], scripts[i + 1]);
    }
  }

  function root() {
    return document.querySelector('.reader') || document.querySelector('.pages') ||
      document.querySelector('main') || document.querySelector('article') || document.body;
  }

  function exists(id) {
    return !!document.querySelector('[data-ma-ad-section="' + String(id).replace(/"/g, '\\"') + '"]');
  }

  function place(section) {
    var id = String(section.id || '');
    if (!id || exists(id)) return true;
    var target = root();
    if (!target) return false;
    var placement = String(section.placement || 'start').toLowerCase();
    var box;

    if (placement === 'between') {
      var pages = document.querySelector('.pages') || document.querySelector('.reader');
      var number = parseInt(section.afterImage != null ? section.afterImage : section.between, 10);
      if (!Number.isFinite(number) || number < 1) number = 5;
      box = executeIsolated(section.code, id);

      // Homepage: use the chapter list as placement anchors instead of silently
      // skipping "between" sections when there is no reader/image container.
      if (!pages) {
        var homeList = document.querySelector('.home-list');
        var homeItems = homeList ? Array.prototype.slice.call(homeList.querySelectorAll(':scope > a')) : [];
        if (homeList && homeItems.length) {
          var homeIndex = Math.min(number, homeItems.length) - 1;
          while (homeIndex < homeItems.length - 1 &&
            homeItems[homeIndex].nextElementSibling &&
            homeItems[homeIndex].nextElementSibling.classList.contains('manga-atlas-ad-slot')) {
            homeIndex++;
          }
          homeItems[homeIndex].parentNode.insertBefore(box, homeItems[homeIndex].nextSibling);
          queueActivation(box);
          return true;
        }
        if (target && target !== document.body) {
          target.appendChild(box);
          queueActivation(box);
          return true;
        }
        return false;
      }

      var images = Array.prototype.slice.call(pages.querySelectorAll('img.page'));
      if (!images.length) return false;
      if (images.length > 1) {
        var imageIndex = Math.min(number, images.length) - 1;
        while (imageIndex < images.length - 1 &&
          images[imageIndex].nextElementSibling &&
          images[imageIndex].nextElementSibling.classList.contains('manga-atlas-ad-slot')) {
          imageIndex++;
        }
        images[imageIndex].parentNode.insertBefore(box, images[imageIndex].nextSibling);
      } else {
        // One-image chapters need distinct anchors: intro, before/after image,
        // and related-content boundary, rather than stacking every slot.
        var reader = document.querySelector('.reader') || pages;
        var copy = reader.querySelector('.chapter-copy');
        var related = reader.querySelector('.related');
        var existingSlots = Array.prototype.filter.call(
          reader.querySelectorAll('.manga-atlas-ad-slot'),
          function (slot) {
            var configured = sections.find(function (item) {
              return String(item.id || '') === String(slot.dataset.maAdSection || '');
            });
            return configured && String(configured.placement || '').toLowerCase() === 'between';
          }
        ).length;
        if (existingSlots === 0 && copy && copy.parentNode) {
          copy.parentNode.insertBefore(box, copy.nextSibling);
        } else if (existingSlots === 1 && images[0].parentNode) {
          images[0].parentNode.insertBefore(box, images[0]);
        } else if (existingSlots === 2 && images[0].parentNode) {
          images[0].parentNode.insertBefore(box, images[0].nextSibling);
        } else if (existingSlots === 3 && related && related.parentNode) {
          related.parentNode.insertBefore(box, related);
        } else {
          reader.appendChild(box);
        }
      }
      queueActivation(box);
      return true;
    }

    box = executeIsolated(section.code, id);
    var reader = document.querySelector('.reader');
    if (reader && target === reader) {
      if (placement === 'end') {
        var related = reader.querySelector('.related');
        if (related) reader.insertBefore(box, related);
        else reader.appendChild(box);
      } else {
        var copy = reader.querySelector('.chapter-copy');
        if (copy && copy.nextSibling) reader.insertBefore(box, copy.nextSibling);
        else if (copy) reader.appendChild(box);
        else reader.insertBefore(box, reader.firstChild);
      }
    } else if (placement === 'end') {
      target.parentNode.insertBefore(box, target.nextSibling);
    } else {
      target.parentNode.insertBefore(box, target);
    }
    queueActivation(box);
    return true;
  }

  function install() {
    sections.forEach(function (section) {
      try { place(section); }
      catch (error) { console.warn('Could not place ad section ' + section.id, error); }
    });
  }

  var observer = new MutationObserver(install);
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  function startAds() {
    install();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAds, { once: true });
  } else {
    startAds();
  }
})();