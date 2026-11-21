/**
 * Analytics configuration placeholders.
 * Leave empty until you are ready to enable tracking.
 * Do NOT commit real production IDs unless intended for live deployment.
 */
window.SITE_ANALYTICS_CONFIG = {
  // Google Analytics 4 Measurement ID (e.g., "G-XXXXXXXXXX")
  ga4MeasurementId: "",

  // Microsoft Clarity Project ID (e.g., "xxxxxxxxxx")
  clarityProjectId: ""
};

(function initAnalytics() {
  const cfg = window.SITE_ANALYTICS_CONFIG || {};

  if (cfg.ga4MeasurementId && typeof cfg.ga4MeasurementId === "string" && cfg.ga4MeasurementId.trim()) {
    const id = cfg.ga4MeasurementId.trim();
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", id);
  }

  if (cfg.clarityProjectId && typeof cfg.clarityProjectId === "string" && cfg.clarityProjectId.trim()) {
    const cid = cfg.clarityProjectId.trim();
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () {
        (c[a].q = c[a].q || []).push(arguments);
      };
      t = l.createElement(r);
      t.async = 1;
      t.src = "https://www.clarity.ms/tag/" + encodeURIComponent(i);
      y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", cid);
  }
})();
