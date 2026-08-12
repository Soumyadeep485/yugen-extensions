// GogoAnime Extension for Yugen
// 100% Forced AllOrigins Proxying (No Direct Connections)
const GOGOANIME = {
  name: 'GogoAnime',
  pkgName: 'com.gogoanime',
  version: '1.1.3',
  lang: 'EN',
  baseURL: 'https://gogoanime3.co', // Shifted domain

  async _fetch(url) {
    try {
      const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
      const res = await nativeFetch(proxyUrl);
      const json = JSON.parse(res);
      if (json.contents && json.contents.length > 1000) return json.contents;
      throw new Error("Proxy returned empty contents.");
    } catch(e) {
      throw new Error("Target completely neutralized by ISP/Cloudflare.");
    }
  },

  async search(query) {
    try {
      const html = await this._fetch(`${this.baseURL}/search.html?keyword=${encodeURIComponent(query)}`);
      const results = [];
      const regex = /href="\/category\/([^"]+)" title="([^"]+)"/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        if (!results.find(r => r.url === match[1])) {
            results.push({ url: match[1], title: match[2], poster: "" });
        }
      }
      return results;
    } catch(e) { return []; }
  },

  async getEpisodes(slug) {
    try {
      const html = await this._fetch(`${this.baseURL}/category/${slug}`);
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
        epHtml = await this._fetch(`${this.baseURL}/${slug}-episode-${epNum}`);
    } catch(e) { epHtml = ""; }

    let dlMatch = epHtml ? (epHtml.match(/href="([^"]+download\?id=[^"]+)"/i) || epHtml.match(/<li class="dow?n?loads"><a href="([^"]+)"/i)) : null;
    
    if (!dlMatch) {
        console.log("[GogoAnime] 404 or Blocked. Deploying Smart Search fallback...");
        const query = (title || slug).replace(/[-_:]/g, ' ').split(' ').filter(Boolean).slice(0, 2).join(' ');
        const searchRes = await this.search(query);
        
        if (searchRes.length > 0) {
            const bestMatch = searchRes.find(r => r.url.includes('season') || r.url.includes(epNum)) || searchRes[0];
            slug = bestMatch.url; 
            try {
                epHtml = await this._fetch(`${this.baseURL}/${slug}-episode-${epNum}`);
                dlMatch = epHtml.match(/href="([^"]+download\?id=[^"]+)"/i) || epHtml.match(/<li class="dow?n?loads"><a href="([^"]+)"/i);
            } catch(e) { return []; }
        }
    }

    if (!dlMatch) return []; 

    try {
        const streams = [];
        const dlUrl = dlMatch[1].startsWith('//') ? 'https:' + dlMatch[1] : dlMatch[1];
        const dlHtml = await this._fetch(dlUrl);
        
        const linkRegex = /<a href="([^"]+)"[^>]*>[\s\S]*?Download\s*\(([^)]+)\)/gi;
        let match;
        while ((match = linkRegex.exec(dlHtml)) !== null) {
            const link = match[1].replace(/&amp;/g, '&');
            const qual = match[2].trim();
            if (!link.includes('captcha') && link.startsWith('http')) {
                streams.push({ quality: `[SUB] MP4 Direct - ${qual}`, url: link, isM3U8: link.includes('.m3u8'), headers: {"Referer": this.baseURL + "/"}, subtitles: [] });
            }
        }
        return streams;
    } catch(e) { return []; }
  }
};

window.extensions = window.extensions || {}; 
window.extensions[GOGOANIME.pkgName] = GOGOANIME;
