// AnimePahe Extension for Yugen
// 100% Forced AllOrigins Proxying
const ANIMEPAHE = {
  name: 'AnimePahe',
  pkgName: 'ru.animepahe',
  version: '1.1.3',
  lang: 'EN',
  baseURL: 'https://animepahe.ru',

  async _fetch(url, isJson = true) {
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
            const rawString = title || epId.split('/ep-')[0];
            const query = rawString.replace(/[-_:]/g, ' ').split(' ').filter(Boolean).slice(0, 2).join(' ');
            
            const searchResults = await this.search(query);
            if (!searchResults || searchResults.length === 0) return [];
            
            const epNum = parseInt(epId.split('/ep-')[1]) || 1;
            const eps = await this.getEpisodes(searchResults[0].url);
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
                            const sourceMatch = unpacked.match(/const source='([^']+)'/);
                            if (sourceMatch) {
                                streams.push({
                                    quality: `[Kwik] ${quality}`,
                                    url: sourceMatch[1],
                                    isM3U8: sourceMatch[1].includes('.m3u8'),
                                    headers: { "Referer": "https://kwik.cx/" },
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
