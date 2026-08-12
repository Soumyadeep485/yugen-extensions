// AnimePahe Extension for Yugen (v2.0.0)
// 100% Native Session Routing & HLS Kwik Unpacker (Proxy Smuggled)
const ANIMEPAHE = {
  name: 'AnimePahe',
  pkgName: 'ru.animepahe',
  version: '2.0.0',
  lang: 'EN',
  baseURL: 'https://animepahe.ru',

  // 🚀 Step 1 & 2: Smuggle API requests past the ISP block
  async _fetchProxy(url, isJson = true) {
    try {
      const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
      const proxyRes = await nativeFetch(proxyUrl);
      const wrapper = JSON.parse(proxyRes);
      if (!wrapper.contents) throw new Error("Empty proxy response.");
      return isJson ? JSON.parse(wrapper.contents) : wrapper.contents;
    } catch(e) { 
      throw new Error("Data block impenetrable."); 
    }
  },

  async search(query) {
    try {
      const data = await this._fetchProxy(`${this.baseURL}/api?m=search&q=${encodeURIComponent(query)}`);
      if (!data || !data.data) return [];
      return data.data.map(i => ({ title: i.title, poster: i.poster, url: i.session }));
    } catch(e) { return []; }
  },

  async getEpisodes(session) {
    try {
      const data = await this._fetchProxy(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=1`);
      if (!data || !data.data) return [];
      
      const episodes = [];
      const maxPages = data.last_page || 1;
      for (let p = 1; p <= maxPages; p++) {
          let pageData = p === 1 ? data : await this._fetchProxy(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=${p}`);
          if (pageData && pageData.data) {
              pageData.data.forEach(ep => {
                  // We bind BOTH session IDs together so we can access the play page later
                  episodes.push({ id: `${session}|${ep.session}`, number: ep.episode, title: `Episode ${ep.episode}` });
              });
          }
      }
      return episodes;
    } catch(e) { return []; }
  },

  async getEpisodeCount(session) {
    try {
      const data = await this._fetchProxy(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=1`);
      return data ? (data.total || 0) : 0;
    } catch(e) { return 0; }
  },

  // 🚀 Step 4: The core unpacking logic ported to JS
  _unpack(code) {
      const argsMatch = code.match(/}\('(.*?)', *(\d+), *(\d+), *'(.*?)'\.split\('\|'\)/);
      if (!argsMatch) return code;
      let p = argsMatch[1];
      let a = parseInt(argsMatch[2]);
      let c = parseInt(argsMatch[3]);
      let k = argsMatch[4].split('|');
      let e = function(c) { return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36)); };
      while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
      return p;
  },

  async extractStreams(epId, title) {
    try {
        let animeSession = "";
        let epSession = "";
        
        // 🚀 Smart Fallback: Map the clean English title to the AnimePahe session UUIDs
        if (!epId.includes('|')) {
            console.log("[AnimePahe] Standalone ID detected. Deploying smart search mapping...");
            const epNum = parseInt(epId.split('/ep-')[1] || '1');
            const rawTitle = title || epId.split('/ep-')[0];
            const query = rawTitle.replace(/[-_:]/g, ' ').split(' ').filter(Boolean).slice(0, 2).join(' ');
            
            const searchResults = await this.search(query);
            if (!searchResults || searchResults.length === 0) return [];
            
            animeSession = searchResults[0].url;
            const eps = await this.getEpisodes(animeSession);
            const target = eps.find(e => e.number === epNum);
            
            if (!target) return [];
            epSession = target.id.split('|')[1];
        } else {
            animeSession = epId.split('|')[0];
            epSession = epId.split('|')[1];
        }

        // 🚀 Step 3: Fetch the physical play page via Proxy to scrape the Kwik buttons
        const playHtml = await this._fetchProxy(`${this.baseURL}/play/${animeSession}/${epSession}`, false);
        const kwikLinks = [];
        const btnRegex = /<button[^>]+data-src="([^"]+)"[^>]*>([^<]+)<\/button>/gi;
        let match;
        while ((match = btnRegex.exec(playHtml)) !== null) {
            kwikLinks.push({ url: match[1], quality: match[2].trim() });
        }

        const streams = [];
        for (const link of kwikLinks) {
            try {
                // Fetch Kwik HTML. Try direct first, fallback to proxy if blocked.
                let kwikHtml = "";
                try {
                    kwikHtml = await nativeFetch(link.url, { "Referer": this.baseURL + "/" });
                    if (!kwikHtml.includes('eval(function(')) throw new Error("Blocked");
                } catch(e) {
                    kwikHtml = await this._fetchProxy(link.url, false);
                }

                const evalMatch = kwikHtml.match(/eval\(function\(p,a,c,k,e,d\).*?\)\)/);
                if (evalMatch) {
                    const unpacked = this._unpack(evalMatch[0]);
                    const sourceMatch = unpacked.match(/const source='([^']+)'/);
                    if (sourceMatch) {
                        streams.push({
                            quality: `[Kwik HLS] ${link.quality}`,
                            url: sourceMatch[1],
                            isM3U8: sourceMatch[1].includes('.m3u8'),
                            headers: { "Referer": "https://kwik.cx/" },
                            subtitles: []
                        });
                    }
                }
            } catch (e) {
                console.log("[AnimePahe] Failed to unpack Kwik stream:", e);
            }
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
