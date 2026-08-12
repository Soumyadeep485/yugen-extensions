// GogoAnime (Anitaku) Extension for Yugen
// Features: AnimeDex API + Pure Native MP4 AES-Bypass
const GOGOANIME = {
  name: 'GogoAnime',
  pkgName: 'com.gogoanime',
  version: '1.0.7',
  lang: 'EN',
  baseURL: 'https://anitaku.com.ro',

  async _fetch(url) {
      try { 
          const res = await nativeFetch(url); 
          if (res) return res;
      } catch(e) {}
      
      // Bypass ISP/SSL blocks via proxy
      try { 
          return await nativeFetch('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url)); 
      } catch(e) {
          throw new Error("Network completely blocked.");
      }
  },

  async search(query) {
      try {
          const res = await this._fetch(`https://api.animedex.vip/search?query=${encodeURIComponent(query)}`);
          const json = JSON.parse(res);
          return json.results.map(i => ({ title: i.title, poster: i.image, url: i.id }));
      } catch(e) { return []; }
  },

  async getEpisodes(slug) {
      try {
          const res = await this._fetch(`https://api.animedex.vip/anime/${slug}`);
          const json = JSON.parse(res);
          return json.results.episodes.map(e => ({ 
              id: e[1], // Episode ID from AnimeDex
              number: e[0], 
              title: `Episode ${e[0]}` 
          }));
      } catch(e) { return []; }
  },

  async getEpisodeCount(slug) {
      const eps = await this.getEpisodes(slug);
      return eps.length || 1;
  },

  async extractStreams(epId, title) {
      let slug = epId.split('/ep-')[0];
      let epNum = epId.split('/ep-')[1] || '1';
      const streams = [];

      // METHOD 1: AnimeDex API (Fast M3U8)
      try {
          const dexRes = await this._fetch(`https://api.animedex.vip/episode/${slug}-episode-${epNum}`);
          const json = JSON.parse(dexRes);
          if (json.results && json.results.stream && json.results.stream.sources) {
              json.results.stream.sources.forEach(s => {
                  streams.push({
                      quality: `[SUB] Gogo M3U8 - Auto`,
                      url: s.file,
                      isM3U8: true,
                      headers: {"Referer": "https://gogoplay.io/"},
                      subtitles: []
                  });
              });
              if (streams.length > 0) return streams; 
          }
      } catch(e) { console.log("[GogoAnime] API Failed, deploying native fallback..."); }

      // METHOD 2: The Direct MP4 Bypass (No AES required!)
      try {
          const epHtml = await this._fetch(`${this.baseURL}/${slug}-episode-${epNum}`);
          const dlMatch = epHtml.match(/<li class="dowloads"><a href="([^"]+)"/i);
          
          if (dlMatch) {
              const dlHtml = await this._fetch(dlMatch[1]);
              const linkRegex = /<a href="([^"]+)"[^>]*>Download\s*\(([^)]+)\)/gi;
              let match;
              while ((match = linkRegex.exec(dlHtml)) !== null) {
                  // Skip captcha-locked links
                  if (!match[1].includes('captcha')) {
                      streams.push({
                          quality: `[SUB] MP4 Direct - ${match[2].trim()}`,
                          url: match[1],
                          isM3U8: false,
                          headers: {},
                          subtitles: []
                      });
                  }
              }
          }
      } catch(e) { console.log("[GogoAnime] Native HTML Bypass Failed.", e); }

      return streams;
  }
};

window.extensions = window.extensions || {}; 
window.extensions[GOGOANIME.pkgName] = GOGOANIME;
