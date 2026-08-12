// GogoAnime (Anitaku) Extension for Yugen
const GOGOANIME = {
  name: 'GogoAnime',
  pkgName: 'com.gogoanime',
  version: '1.0.6',
  lang: 'EN',
  baseURL: 'https://anitaku.com.ro',

  async _api(endpoint) {
    const url = 'https://api.consumet.org/anime/gogoanime' + endpoint;
    
    // 1. Native Fetch
    try {
        const r1 = await nativeFetch(url);
        const j1 = JSON.parse(r1);
        if (j1 && !j1.message) return j1;
    } catch(e) {}

    // 2. CORS Proxy Fallback (Bypasses Cloudflare)
    try {
        const r2 = await fetch('https://corsproxy.io/?url=' + encodeURIComponent(url));
        const j2 = await r2.json();
        if (j2 && !j2.message) return j2;
    } catch(e) {}

    // 3. AllOrigins Fallback
    try {
        const r3 = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
        const j3 = await r3.json();
        if (j3 && !j3.message) return j3;
    } catch(e) {}

    throw new Error("Consumet API heavily blocked or returned 404.");
  },

  async search(query) {
    try {
        const res = await this._api(`/${encodeURIComponent(query)}`);
        return res.results.map(i => ({ title: i.title, poster: i.image, url: i.id }));
    } catch(e) { return []; }
  },

  async getEpisodes(slug) {
    try {
        const res = await this._api(`/info/${slug}`);
        return res.episodes.map(e => ({ id: `${slug}/ep-${e.number}`, number: e.number, title: `Episode ${e.number}` }));
    } catch(e) { return []; }
  },

  async getEpisodeCount(slug) {
    const eps = await this.getEpisodes(slug);
    return eps.length || 1;
  },

  async extractStreams(epId, title) {
    let slug = epId.split('/ep-')[0];
    let epNum = epId.split('/ep-')[1] || '1';
    
    let res;
    try {
        res = await this._api(`/watch/${slug}-episode-${epNum}`);
    } catch(e) {
        // 🚀 SMART FALLBACK: If slug 404s, search using first 3 words of title!
        const query = (title || slug).replace(/[-_:]/g, ' ').split(' ').slice(0, 3).join(' ');
        const searchData = await this.search(query);
        if (searchData.length > 0) {
            const best = searchData.find(r => r.url.includes('season') || r.url.includes('part')) || searchData[0];
            res = await this._api(`/watch/${best.url}-episode-${epNum}`);
        } else {
            return [];
        }
    }

    const streams = [];
    if (res && res.sources) {
        res.sources.forEach(s => {
            streams.push({ 
                quality: `[SUB] Gogo CDN - ${s.quality || 'Auto'}`, 
                url: s.url, 
                isM3U8: s.isM3U8 !== false, 
                headers: {"Referer": "https://gogoplay.io/"}, 
                subtitles: [] 
            });
        });
    }
    return streams;
  }
};

window.extensions = window.extensions || {}; 
window.extensions[GOGOANIME.pkgName] = GOGOANIME;
