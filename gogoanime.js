// GogoAnime (anitaku) Extension for Yugen
const GOGOANIME = {
  name: 'GogoAnime',
  pkgName: 'com.gogoanime',
  version: '1.0.2',
  lang: 'EN',
  baseURL: 'https://anitaku.com.ro',

  async _fetchFallback(episodeId) {
      const endpoints = [
          { url: `https://api.amvstr.me/api/v2/stream/${episodeId}`, type: 'amvstr' },
          { url: `https://api-consumet.zjts.dev/anime/gogoanime/watch/${episodeId}`, type: 'consumet' }
      ];
      
      for (let ep of endpoints) {
          try {
              let responseStr;
              try {
                  // Attempt Dart fetch first
                  responseStr = await nativeFetch(ep.url);
              } catch(e) {
                  // 🚀 CLOUDFLARE BYPASS: If Dart is blocked, use the WebView's native browser fetch
                  const res = await fetch(ep.url);
                  responseStr = await res.text();
              }
              
              // Skip 149KB Cloudflare HTML pages to prevent JSON crashes
              if (responseStr.trim().startsWith('<')) continue;
              
              const data = JSON.parse(responseStr);
              if (ep.type === 'amvstr' && data && data.stream && data.stream.multi) {
                  return { type: 'amvstr', data: data.stream.multi };
              }
              if (ep.type === 'consumet' && data && data.sources) {
                  return { type: 'consumet', data: data.sources };
              }
          } catch (e) {
              console.error(`[GogoAnime] Failed fetching from ${ep.url}`);
          }
      }
      throw new Error("All API instances blocked or down.");
  },

  async search(query) {
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
  },

  async getEpisodeCount(slug) {
    const html = await nativeFetch(`${this.baseURL}/category/${slug}`);
    const epRegex = /ep_end="(\d+)"/gi;
    let maxEp = 0;
    let match;
    while ((match = epRegex.exec(html)) !== null) {
        const ep = parseInt(match[1]);
        if (ep > maxEp) maxEp = ep;
    }
    return maxEp || 1; 
  },

  async getEpisodes(slug) {
    const maxEp = await this.getEpisodeCount(slug);
    const episodes = [];
    for (let i = 1; i <= maxEp; i++) {
        episodes.push({ id: `${slug}/ep-${i}`, number: i, title: `Episode ${i}` });
    }
    return episodes;
  },

  async extractStreams(episodeId) {
    try {
        let safeId = episodeId;
        if (episodeId.includes('/ep-')) safeId = episodeId.replace('/ep-', '-episode-');
        
        const result = await this._fetchFallback(safeId);
        const streams = [];
        const requiredHeaders = { "Referer": "https://gogoplay.io/" };
        
        if (result.type === 'amvstr') {
            const multi = result.data;
            if (multi.main && multi.main.url) streams.push({ quality: "[SUB] Gogo CDN - Main", url: multi.main.url, isM3U8: true, headers: requiredHeaders, subtitles: [] });
            if (multi.backup && multi.backup.url) streams.push({ quality: "[SUB] Gogo CDN - Backup", url: multi.backup.url, isM3U8: true, headers: requiredHeaders, subtitles: [] });
        } else if (result.type === 'consumet') {
            result.data.forEach(src => {
                streams.push({ quality: `[SUB] Gogo CDN - ${src.quality || 'Auto'}`, url: src.url, isM3U8: src.isM3U8, headers: requiredHeaders, subtitles: [] });
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
