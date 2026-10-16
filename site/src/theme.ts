export const THEME_KEY = "postsight-site:theme";

/**
 * Runs before first paint so a saved theme never flashes the other one. Its hash goes into
 * the Content-Security-Policy, so the page must embed exactly this string.
 */
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;
