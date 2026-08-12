// AnimePahe Extension for Yugen
// Features: CodeTabs Proxy Wrapping + Pure Native Kwik Unpacker
const ANIMEPAHE = {
  name: 'AnimePahe',
  pkgName: 'ru.animepahe',
  version: '1.0.7',
  lang: 'EN',
  baseURL: 'https://animepahe.com',

  async _fetch(url, isJson = true) {
      // Force all traffic through CodeTabs to bypass Cloudflare and DPI Resets
      const proxyUrl = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url);
      try { 
          const res = await nativeFetch(proxyUrl); 
          if (res.includes('Just a moment...')) throw new Error("CF Blocked Proxy");
          return isJson ? JSON.parse(res) : res;
      } catch(e) {}

      // Secondary AllOrigins fallback
      const altProxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
      try {
          const res2 = await nativeFetch(altProxy);
          return isJson ? JSON.parse(res2) : res2;
      } catch(e) { throw new Error("All Proxies Blocked"); }
  },

  async search(query) {
    try {
      const data = await this._fetch(`${this.baseURL}/api?m=search&q=${encodeURIComponent(query)}`);
      if (!data || !data.data) return [];
      return data.data.map(i => ({ title: i.title, poster: i.poster, url: i.session }));
    } catch(e) { return []; }
  },

  async getEpisodes(session) {
    try {
      const data = await this._fetch(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=1`);
      if (!data || !data.data) return [];
      
      const episodes = [];
      const maxPages = data.last_page || 1;
      for (let p = 1; p <= maxPages; p++) {
          let pageData = p === 1 ? data : await this._fetch(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=${p}`);
          if (pageData && pageData.data) {
              pageData.data.forEach(ep => {
                  episodes.push({ id: `${session}|${ep.session}`, number: ep.episode, title: `Episode ${ep.episode}` });
              });
          }
      }
      return episodes;
    } catch(e) { return []; }
  },

  async getEpisodeCount(session) {
    try {
      const data = await this._fetch(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=1`);
      return data ? (data.total || 0) : 0;
    } catch(e) { return 0; }
  },

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
        let safeSession = epId.includes('|') ? epId.split('|')[1] : null;
        if (!safeSession) {
            let query = (title || epId.split('/ep-')[0]).replace(/[-_:]/g, ' ').split(' ').slice(0, 3).join(' ');
            const res = await this.search(query);
            if (res.length === 0) return [];
            const epNum = parseInt(epId.split('/ep-')[1]) || 1;
            const eps = await this.getEpisodes(res[0].url);
            const target = eps.find(e => e.number === epNum);
            if (!target) return [];
            safeSession = target.id.split('|')[1];
        }

        const data = await this._fetch(`${this.baseURL}/api?m=embed&id=${safeSession}`);
        const streams = [];
        
        if (data && data.data) {
            for (const provider of Object.keys(data.data)) {
                for (const linkObj of Object.values(data.data[provider])) {
                    const kwikUrl = linkObj.kwik; 
                    const quality = linkObj.resolution + 'p ' + (linkObj.audio === 'jpn' ? 'SUB' : 'DUB');
                    try {
                        const kwikHtml = await this._fetch(kwikUrl, false);
                        const evalMatch = kwikHtml.match(/eval\(function\(p,a,c,k,e,d\).*?\)\)/);
                        if (evalMatch) {
                            const unpacked = this._unpack(evalMatch[0]);
                            const srcMatch = unpacked.match(/const source='([^']+)'/);
                            if (srcMatch) {
                                streams.push({
                                    url: srcMatch[1],
                                    quality: `[Kwik] ${quality}`,
                                    headers: { "Referer": "https://kwik.cx/" },
                                    isM3U8: srcMatch[1].includes('.m3u8'),
                                    subtitles: []
                                });
                            }
                        }
                    } catch (e) {}
                }
            }
        }
        return streams;
    } catch(e) { return []; }
  }
};

window.extensions = window.extensions || {}; 
window.extensions[ANIMEPAHE.pkgName] = ANIMEPAHE;
