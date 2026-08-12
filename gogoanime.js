// GogoAnime (Anitaku) Extension for Yugen
const GOGOANIME = {
  name: 'GogoAnime',
  pkgName: 'com.gogoanime',
  version: '1.0.5',
  lang: 'EN',
  apiHosts: [
      'https://spacetik.vercel.app/anime/gogoanime', 
      'https://consumet-api-clone.vercel.app/anime/gogoanime'
  ],

  async _api(endpoint) {
    for (let host of this.apiHosts) {
      try {
        const res = await nativeFetch(host + endpoint);
        if (!res.trim().startsWith('<')) {
          const json = JSON.parse(res);
          if (json) return json;
        }
      } catch(e) {}
    }
    throw new Error("All API instances are down or blocked.");
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
      return res.episodes.map(e => ({ 
          id: `${slug}/ep-${e.number}`, 
          number: e.number, 
          title: `Episode ${e.number}` 
      }));
    } catch(e) { return []; }
  },

  async getEpisodeCount(slug) {
    const eps = await this.getEpisodes(slug);
    return eps.length || 1;
  },

  async extractStreams(epId, title) {
    let safeId = epId.replace('/ep-', '-episode-');
    
    try {
      const res = await this._api(`/watch/${safeId}`);
      if (!res.sources || res.sources.length === 0) throw new Error("No sources");
      return res.sources.map(s => ({ 
          quality: `[SUB] Gogo CDN - ${s.quality || 'Auto'}`, 
          url: s.url, 
          isM3U8: s.isM3U8, 
          headers: {"Referer": "https://gogoplay.io/"}, 
          subtitles: [] 
      }));
    } catch(e) {
      // 🚀 SMART FALLBACK: If slug fails, search using only the first 2 words of the title!
      const rawString = title || epId.split('/ep-')[0];
      const shortQuery = rawString.replace(/[-_:]/g, ' ').split(' ').filter(Boolean).slice(0, 2).join(' ');
      
      const searchResults = await this.search(shortQuery);
      if (searchResults.length > 0) {
        const trueSlug = searchResults[0].url;
        const epNum = epId.split('/ep-')[1] || '1';
        try {
            const fallbackRes = await this._api(`/watch/${trueSlug}-episode-${epNum}`);
            return fallbackRes.sources.map(s => ({ 
                quality: `[SUB] Gogo CDN - ${s.quality || 'Auto'}`, 
                url: s.url, 
                isM3U8: s.isM3U8, 
                headers: {"Referer": "https://gogoplay.io/"}, 
                subtitles: [] 
            }));
        } catch(fallbackErr) { return []; }
      }
      return [];
    }
  }
};

window.extensions = window.extensions || {}; 
window.extensions[GOGOANIME.pkgName] = GOGOANIME;
