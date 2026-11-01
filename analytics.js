/* GA4 site + chapter analytics — Sakamoto Days JP; existing property retained */
(function () {
  'use strict';
  var MEASUREMENT_ID = 'G-50N8R6DVZH';
  var SITE_NAME = "Sakamoto Days JP";
  var SITE_ID = "sakamotodaysjp";
  var sent = false;
  var chapterEventSent = false;

  function chapterDetails() {
    var slug = '';
    try { slug = new URLSearchParams(location.search).get('slug') || ''; } catch (e) {}
    var titleNode = document.getElementById('title');
    var nodeTitle = String((titleNode && titleNode.textContent) || '').trim();
    var chapterName = nodeTitle && nodeTitle !== 'Chapter' ? nodeTitle : String(document.title || SITE_NAME).trim();
    var match = chapterName.match(/(?:chapter|ch\.?|第)\s*([0-9]+(?:\.[0-9]+)?)/i);
    return {
      chapter_name: chapterName,
      chapter_slug: slug,
      chapter_number: match ? match[1] : '',
      manga_title: SITE_NAME.replace(/\s+(?:JP Raw|Raw|JP)$/i, ''),
      content_type: 'chapter'
    };
  }

  function sendPageView() {
    if (sent || typeof window.gtag !== 'function') return;
    var isChapter = /\/chapter\.html$/i.test(location.pathname);
    var title = String(document.title || '').trim();
    if (isChapter && (!title || /^Manga Chapter Raw \| JPMangaatlas$/i.test(title) || title === 'Chapter | JPMangaatlas')) return;
    var params = {
      page_title: title || SITE_NAME,
      page_location: location.href,
      site_name: SITE_NAME,
      site_id: SITE_ID,
      content_type: isChapter ? 'chapter' : 'page'
    };
    if (isChapter) {
      var details = chapterDetails();
      Object.keys(details).forEach(function (key) { if (details[key]) params[key] = details[key]; });
    }
    window.gtag('event', 'page_view', params);
    sent = true;
    if (isChapter) sendChapterView();
  }

  function sendChapterView() {
    if (chapterEventSent || typeof window.gtag !== 'function') return;
    var details = chapterDetails();
    if (!details.chapter_slug && (!details.chapter_name || details.chapter_name === 'Chapter')) return;
    window.gtag('event', 'chapter_view', {
      site_name: SITE_NAME,
      site_id: SITE_ID,
      chapter_name: details.chapter_name,
      chapter_slug: details.chapter_slug,
      chapter_number: details.chapter_number,
      manga_title: details.manga_title,
      content_type: 'chapter',
      page_title: String(document.title || SITE_NAME).trim(),
      page_location: location.href
    });
    chapterEventSent = true;
  }

  function loadAdsSystem() {
    if (location.pathname.indexOf('/admin') === 0) return;
    if (document.querySelector('script[data-manga-atlas-ads]')) return;
    var s = document.createElement('script');
    s.src = "/sakamotodaysjp/ads-system.js?v=30";
    s.async = false;
    s.setAttribute('data-manga-atlas-ads', 'true');
    document.head.appendChild(s);
  }

  function init() {
    loadAdsSystem();
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(script);
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, { send_page_view: false });

    if (/\/chapter\.html$/i.test(location.pathname)) {
      var observer = new MutationObserver(function () {
        sendPageView();
        sendChapterView();
        if (sent && chapterEventSent) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      setTimeout(function () { sendPageView(); sendChapterView(); if (sent && chapterEventSent) observer.disconnect(); }, 15000);
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', sendPageView, { once: true });
    } else {
      sendPageView();
    }
  }
  init();
})();