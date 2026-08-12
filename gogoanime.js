// GogoAnime (Anitaku) Extension for Yugen
// Utilizing Consumet API for AES Decryption Bypass
const GOGOANIME = {
  name: 'GogoAnime',
  pkgName: 'com.gogoanime',
  version: '1.0.1',
  lang: 'EN',
  
  // Multi-host fallback in case primary instances face downtime
  apiHosts: [
      'https://api.consumet.org/anime/gogoanime',
      'https://api.haikei.xyz/anime/gogoanime',
      'https://consumet-api-clone.vercel.app/anime/gogoanime'
  ],

  async _fetchFallback(endpoint) {
      for (let host of this.apiHosts) {
          try {
              const url = `${host}${endpoint}`;
              const response = await nativeFetch(url);
              const data = JSON.parse(response);
              if (data) return data;
          } catch (e) {
              console.error(`[GogoAnime] Failed fetching from ${host}`);
          }
      }
      throw new Error("All API instances failed.");
  },

  async search(query) {
    try {
        const data = await this._fetchFallback(`/${encodeURIComponent(query)}`);
        return data.results.map(item => ({
          title: item.title,
          poster: item.image,
          url: item.id
        }));
    } catch(e) { return []; }
  },

  async getEpisodes(slug) {
    try {
        const data = await this._fetchFallback(`/info/${slug}`);
        if (!data.episodes) return [];
        return data.episodes.map(ep => ({
          id: ep.id, 
          number: ep.number,
          title: `Episode ${ep.number}`
        }));
    } catch(e) { return []; }
  },

  async getEpisodeCount(slug) {
    const eps = await this.getEpisodes(slug);
    return eps.length;
  },

  async extractStreams(episodeId) {
    try {
        // Safe mapping formatting if the UI passes a raw "slug/ep-1"
        let safeId = episodeId;
        if (episodeId.includes('/ep-')) {
            safeId = episodeId.replace('/ep-', '-episode-');
        }
        
        const data = await this._fetchFallback(`/watch/${safeId}`);
        const streams = [];
        
        if (data.sources) {
            data.sources.forEach(src => {
                streams.push({
                    quality: `[SUB] Gogo CDN - ${src.quality || 'Auto'}`,
                    url: src.url,
                    isM3U8: src.isM3U8,
                    headers: data.headers || { "Referer": "https://gogoplay.io/" },
                    subtitles: [] // Gogo uses hardsubs primarily
                });
            });
        }
        return streams;
    } catch(e) { 
        console.error("[GogoAnime] Extraction Error:", e);
        return []; 
    }
  }
};

window.extensions = window.extensions || {};
window.extensions[GOGOANIME.pkgName] = GOGOANIME;
