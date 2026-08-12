// GogoAnime (Anitaku) Extension for Yugen
// Hardened against DNS blocks using Vercel instances
const GOGOANIME = {
  name: 'GogoAnime',
  pkgName: 'com.gogoanime',
  version: '1.0.3',
  lang: 'EN',
  
  apiHosts: [
      'https://spacetik.vercel.app/anime/gogoanime',
      'https://consumet-api-clone.vercel.app/anime/gogoanime',
      'https://c.delusionz.xyz/anime/gogoanime'
  ],

  async _fetchFallback(endpoint) {
      for (let host of this.apiHosts) {
          try {
              const url = `${host}${endpoint}`;
              let responseStr;
              try {
                  // Attempt Dart fetch
                  responseStr = await nativeFetch(url);
              } catch(e) {
                  // Bypasses Dart-level DNS blocks by using the WebView network stack
                  const res = await fetch(url);
                  responseStr = await res.text();
              }
              
              if (responseStr.trim().startsWith('<')) continue; // Skip Cloudflare HTML
              
              const data = JSON.parse(responseStr);
              if (data && data.sources) {
                  return { type: 'consumet', data: data.sources };
              }
          } catch (e) {
              console.error(`[GogoAnime] Failed fetching from ${host}`);
          }
      }
      throw new Error("All API instances blocked or down.");
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
        if (episodeId.includes('/ep-')) safeId = episodeId.replace('/ep-', '-episode-');
        
        const result = await this._fetchFallback(`/watch/${safeId}`);
        const streams = [];
        const requiredHeaders = { "Referer": "https://gogoplay.io/" };
        
        if (result.type === 'consumet') {
            result.data.forEach(src => {
                streams.push({ 
                    quality: `[SUB] Gogo CDN - ${src.quality || 'Auto'}`, 
                    url: src.url, 
                    isM3U8: src.isM3U8, 
                    headers: requiredHeaders, 
                    subtitles: [] 
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
