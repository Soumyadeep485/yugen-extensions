// AnimePahe Extension for Yugen
// Utilizing Consumet API for Kwik Obfuscation Bypass
const ANIMEPAHE = {
  name: 'AnimePahe',
  pkgName: 'ru.animepahe',
  version: '1.0.1',
  lang: 'EN',
  
  // Multi-host fallback in case primary instances face downtime
  apiHosts: [
      'https://api.consumet.org/anime/animepahe',
      'https://api.haikei.xyz/anime/animepahe',
      'https://consumet-api-clone.vercel.app/anime/animepahe'
  ],

  async _fetchFallback(endpoint) {
      for (let host of this.apiHosts) {
          try {
              const url = `${host}${endpoint}`;
              const response = await nativeFetch(url);
              const data = JSON.parse(response);
              if (data) return data;
          } catch (e) {
              console.error(`[AnimePahe] Failed fetching from ${host}`);
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
        let safeId = episodeId;
        
        // If sticky-mapped from Anikoto's "slug/ep-1" format, dynamically resolve the true Pahe ID
        if (episodeId.includes('/ep-')) {
            const slug = episodeId.split('/ep-')[0];
            const dataInfo = await this._fetchFallback(`/info/${slug}`);
            const epNum = parseInt(episodeId.split('/ep-')[1]);
            const epData = dataInfo.episodes.find(e => e.number === epNum);
            if (epData) safeId = epData.id;
        }

        const data = await this._fetchFallback(`/watch/${safeId}`);
        const streams = [];
        
        if (data.sources) {
            data.sources.forEach(src => {
                streams.push({
                    quality: `[SUB] Kwik - ${src.quality || 'Auto'}`,
                    url: src.url,
                    isM3U8: src.isM3U8,
                    headers: data.headers || { "Referer": "https://kwik.cx/" },
                    subtitles: [] 
                });
            });
        }
        return streams;
    } catch(e) { 
        console.error("[AnimePahe] Extraction Error:", e);
        return []; 
    }
  }
};

window.extensions = window.extensions || {};
window.extensions[ANIMEPAHE.pkgName] = ANIMEPAHE;
