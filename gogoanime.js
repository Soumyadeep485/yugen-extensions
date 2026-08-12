// GogoAnime (Anitaku) Extension for Yugen
// Pure Native MP4 Scraper (Catches 404 Exceptions to trigger Smart Fallback)
const GOGOANIME = {
  name: 'GogoAnime',
  pkgName: 'com.gogoanime',
  version: '1.1.0',
  lang: 'EN',
  baseURL: 'https://anitaku.com.ro',

  async search(query) {
    try {
      const html = await nativeFetch(`${this.baseURL}/search.html?keyword=${encodeURIComponent(query)}`);
      const results = [];
      const regex = /<div class="img">\s*<a href="\/category\/([^"]+)" title="([^"]+)">\s*<img src="([^"]+)"/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        results.push({ url: match[1], title: match[2], poster: match[3] });
      }
      return results;
    } catch(e) { return []; }
  },

  async getEpisodes(slug) {
    try {
      const html = await nativeFetch(`${this.baseURL}/category/${slug}`);
      const epRegex = /ep_end="(\d+)"/i;
      const match = epRegex.exec(html);
      const maxEp = match ? parseInt(match[1]) : 1;
      const eps = [];
      for (let i = 1; i <= maxEp; i++) {
          eps.push({ id: `${slug}/ep-${i}`, number: i, title: `Episode ${i}` });
      }
      return eps;
    } catch(e) { return []; }
  },

  async getEpisodeCount(slug) {
    const eps = await this.getEpisodes(slug);
    return eps.length || 1;
  },

  async extractStreams(epId, title) {
    let slug = epId.split('/ep-')[0];
    let epNum = epId.split('/ep-')[1] || '1';
    let epHtml = "";

    try {
        // Attempt to fetch direct AniList slug. If it 404s, Dart throws an exception!
        epHtml = await nativeFetch(`${this.baseURL}/${slug}-episode-${epNum}`);
    } catch(e) {
        console.log("[GogoAnime] 404 Exception caught. Bad slug.");
        epHtml = ""; 
    }

    let dlMatch = epHtml ? epHtml.match(/<li class="dow?n?loads"><a href="([^"]+)"/i) : null;
    
    // 🚀 SMART FALLBACK: Activated if the page 404'd or the download button is missing
    if (!dlMatch) {
        console.log("[GogoAnime] Deploying Smart Search fallback...");
        const rawString = title || slug;
        // Strip down to the first two words (e.g., "Mushoku Tensei")
        const query = rawString.replace(/[-_:]/g, ' ').split(' ').filter(Boolean).slice(0, 2).join(' ');
        
        const searchRes = await this.search(query);
        if (searchRes.length > 0) {
            // Find the best match, preferring "season", "part", or just the first result
            const bestMatch = searchRes.find(r => r.url.includes('season') || r.url.includes(epNum)) || searchRes[0];
            slug = bestMatch.url; 
            
            try {
                epHtml = await nativeFetch(`${this.baseURL}/${slug}-episode-${epNum}`);
                dlMatch = epHtml.match(/<li class="dow?n?loads"><a href="([^"]+)"/i);
            } catch(e) { return []; }
        }
    }

    if (!dlMatch) return []; 

    try {
        const streams = [];
        const dlUrl = dlMatch[1].startsWith('//') ? 'https:' + dlMatch[1] : dlMatch[1];
        const dlHtml = await nativeFetch(dlUrl);
        
        // Extract pure MP4s from the download page
        const linkRegex = /<a href="([^"]+)"[^>]*>\s*Download[\s\S]*?\(([^)]+)\)/gi;
        let match;
        while ((match = linkRegex.exec(dlHtml)) !== null) {
            const link = match[1].replace(/&amp;/g, '&');
            const qual = match[2].trim();
            
            // Exclude captcha gates, include pure MP4s
            if (!link.includes('captcha') && link.startsWith('http')) {
                streams.push({
                    quality: `[SUB] MP4 Direct - ${qual}`,
                    url: link,
                    isM3U8: link.includes('.m3u8'),
                    headers: {"Referer": this.baseURL + "/"},
                    subtitles: []
                });
            }
        }
        return streams;
    } catch(e) {
        console.error("[GogoAnime] Native Scraper Error:", e);
        return [];
    }
  }
};

window.extensions = window.extensions || {}; 
window.extensions[GOGOANIME.pkgName] = GOGOANIME;
