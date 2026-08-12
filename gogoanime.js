// GogoAnime (anitaku) Extension for Yugen
const GOGOANIME = {
  name: 'GogoAnime',
  pkgName: 'com.gogoanime',
  version: '1.0.4',
  lang: 'EN',
  baseURL: 'https://anitaku.com.ro',
  
  apiHosts: [
      'https://spacetik.vercel.app/anime/gogoanime',
      'https://consumet-api-clone.vercel.app/anime/gogoanime'
  ],

  async _fetchFallback(endpoint) {
      for (let host of this.apiHosts) {
          try {
              const url = `${host}${endpoint}`;
              const responseStr = await nativeFetch(url);
              
              if (!responseStr || responseStr.trim().startsWith('<')) continue;
              
              const data = JSON.parse(responseStr);
              if (data && data.sources && data.sources.length > 0) {
                  return { type: 'consumet', data: data.sources };
              }
          } catch (e) {
              console.error(`[GogoAnime] Failed fetching from ${host}`);
          }
      }
      throw new Error("All API instances returned empty or were unreachable.");
  },

  async search(query) {
    try {
      const html = await nativeFetch(`${this.baseURL}/search.html?keyword=${encodeURIComponent(query)}`);
      const results = [];
      const articleRegex = /<article class="bs"[\s\S]*?href="([^"]+)"[\s\S]*?title="([^"]+)"[\s\S]*?src="([^"]+)"/gi;
      let match;
      while ((match = articleRegex.exec(html)) !== null) {
        let url = match[1];
        let slug = url.split('/').filter(Boolean).pop();
        if (slug.includes('-episode-')) slug = slug.split('-episode-')[0];
        results.push({ title: match[2].replace(/ Episode \d+/i, '').trim(), poster: match[3], url: slug });
      }
      return results;
    } catch(e) {
      return [];
    }
  },

  async getEpisodeCount(slug) {
    try {
      const html = await nativeFetch(`${this.baseURL}/category/${slug}`);
      const epRegex = /ep_end="(\d+)"/gi;
      let maxEp = 0;
      let match;
      while ((match = epRegex.exec(html)) !== null) {
          const ep = parseInt(match[1]);
          if (ep > maxEp) maxEp = ep;
      }
      return maxEp || 1; 
    } catch(e) {
      return 1;
    }
  },

  async getEpisodes(slug) {
    const maxEp = await this.getEpisodeCount(slug);
    const episodes = [];
    for (let i = 1; i <= maxEp; i++) {
        episodes.push({ id: `${slug}/ep-${i}`, number: i, title: `Episode ${i}` });
    }
    return episodes;
  },

  async extractStreams(episodeId, animeTitle) {
    try {
        let safeId = episodeId;
        if (episodeId.includes('/ep-')) safeId = episodeId.replace('/ep-', '-episode-');
        
        // Clean slug formatting
        safeId = safeId.replace(/iii/i, '3');

        let result;
        try {
          result = await this._fetchFallback(`/watch/${safeId}`);
        } catch(e) {
          // If direct slug watch fails, search first to grab the exact GogoAnime slug
          const query = (animeTitle || safeId.split('-episode-')[0]).replace(/[-_]/g, ' ');
          const searchRes = await this.search(query);
          if (searchRes && searchRes.length > 0) {
            const trueSlug = searchRes[0].url;
            const epNum = episodeId.split('/ep-')[1] || '1';
            result = await this._fetchFallback(`/watch/${trueSlug}-episode-${epNum}`);
          } else {
            throw e;
          }
        }

        const streams = [];
        const requiredHeaders = { "Referer": "https://gogoplay.io/" };
        
        if (result && result.type === 'consumet') {
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
