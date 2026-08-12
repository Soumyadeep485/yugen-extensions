// AnimePahe Extension for Yugen
// Utilizing the Premium Hisoka API Network to bypass Cloudflare
const ANIMEPAHE = {
  name: 'AnimePahe',
  pkgName: 'ru.animepahe',
  version: '1.1.1',
  lang: 'EN',
  
  apiHosts: [
      'https://anime-api.hisoka.dev/anime/animepahe',
      'https://api-consumet.marie-fd.me/anime/animepahe',
      'https://api.consumet.org/anime/animepahe'
  ],

  async _api(endpoint) {
    for (let host of this.apiHosts) {
      try {
        const res = await nativeFetch(host + endpoint);
        // Skip Cloudflare HTML payloads
        if (!res.trim().startsWith('<')) {
          const json = JSON.parse(res);
          if (json && !json.message) return json;
        }
      } catch(e) {}
    }
    throw new Error("All Premium API instances blocked.");
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
          id: `${slug}|${e.id}`, 
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
    let epGuid = epId.includes('|') ? epId.split('|')[1] : null;
    const epNum = parseInt(epId.split('/ep-')[1] || epId.split('|')[0].split('-').pop() || '1');
    
    if (!epGuid) {
      const rawString = title || epId.split('/ep-')[0];
      const shortQuery = rawString.replace(/[-_:]/g, ' ').split(' ').filter(Boolean).slice(0, 2).join(' ');
      
      const searchResults = await this.search(shortQuery);
      if (searchResults.length > 0) {
        const info = await this._api(`/info/${searchResults[0].url}`);
        const targetEp = info.episodes.find(e => e.number === epNum);
        if (targetEp) epGuid = targetEp.id;
      }
    }
    
    if (!epGuid) return [];

    try {
      const res = await this._api(`/watch/${epGuid}`);
      return res.sources.map(s => ({ 
          quality: `[SUB] Kwik - ${s.quality || 'Auto'}`, 
          url: s.url, 
          isM3U8: s.isM3U8, 
          headers: {"Referer": "https://kwik.cx/"}, 
          subtitles: [] 
      }));
    } catch(e) { return []; }
  }
};

window.extensions = window.extensions || {}; 
window.extensions[ANIMEPAHE.pkgName] = ANIMEPAHE;
