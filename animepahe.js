// AnimePahe Extension for Yugen (Pure Native)
// Hardened against DPI TCP Resets
const ANIMEPAHE = {
  name: 'AnimePahe',
  pkgName: 'ru.animepahe',
  version: '1.0.3',
  lang: 'EN',
  baseURL: 'https://animepahe.com', // Using .com to evade .su ISP blocks

  async _fetchApi(url) {
    try {
      const jsonStr = await nativeFetch(url, {
        'Referer': this.baseURL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      });
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error(`[AnimePahe] Dart fetch blocked. Deploying WebView fallback...`);
      const res = await fetch(url, { headers: { 'Referer': this.baseURL } });
      return await res.json();
    }
  },

  async _fetchHtml(url) {
    try {
      return await nativeFetch(url, { 'Referer': this.baseURL });
    } catch (e) {
      const res = await fetch(url, { headers: { 'Referer': this.baseURL } });
      return await res.text();
    }
  },

  async search(query) {
    const data = await this._fetchApi(`${this.baseURL}/api?m=search&q=${encodeURIComponent(query)}`);
    if (!data || !data.data) return [];
    
    return data.data.map(item => ({
      title: item.title,
      poster: item.poster,
      url: item.session
    }));
  },

  async getEpisodes(session) {
    const data = await this._fetchApi(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=1`);
    if (!data || !data.data) return [];
    
    const episodes = [];
    const maxPages = data.last_page || 1;
    
    for (let p = 1; p <= maxPages; p++) {
        let pageData = data;
        if (p > 1) {
            try {
                pageData = await this._fetchApi(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=${p}`);
            } catch(e) { break; }
        }
        if (pageData && pageData.data) {
            pageData.data.forEach(ep => {
                episodes.push({
                    id: `${session}|${ep.session}`,
                    number: ep.episode,
                    title: `Episode ${ep.episode}`
                });
            });
        }
    }
    return episodes;
  },

  async getEpisodeCount(session) {
    const data = await this._fetchApi(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=1`);
    return data ? data.total : 0;
  },

  _unpack(code) {
      const argsMatch = code.match(/}\('(.*?)', *(\d+), *(\d+), *'(.*?)'\.split\('\|'\)/);
      if (!argsMatch) return code;
      let p = argsMatch[1];
      let a = parseInt(argsMatch[2]);
      let c = parseInt(argsMatch[3]);
      let k = argsMatch[4].split('|');

      let e = function(c) {
          return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
      };

      while (c--) {
          if (k[c]) {
              p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
          }
      }
      return p;
  },

  async extractStreams(episodeId) {
    try {
        let safeSession = episodeId.split('|')[1];
        
        if (!safeSession) {
            const slug = episodeId.split('/ep-')[0];
            const dataInfo = await this._fetchApi(`${this.baseURL}/api?m=search&q=${slug}`);
            const trueId = dataInfo.data[0].session;
            const epNum = parseInt(episodeId.split('/ep-')[1]);
            const eps = await this.getEpisodes(trueId);
            const target = eps.find(e => e.number === epNum);
            safeSession = target.id.split('|')[1];
        }

        const data = await this._fetchApi(`${this.baseURL}/api?m=embed&id=${safeSession}`);
        const streams = [];
        
        if (data && data.data) {
            for (const provider of Object.keys(data.data)) {
                const links = data.data[provider];
                for (const linkObj of Object.values(links)) {
                    const kwikUrl = linkObj.kwik; 
                    const quality = linkObj.resolution + 'p ' + (linkObj.audio === 'jpn' ? 'SUB' : 'DUB');
                    
                    try {
                        const kwikHtml = await this._fetchHtml(kwikUrl);
                        
                        const evalMatch = kwikHtml.match(/eval\(function\(p,a,c,k,e,d\).*?\)\)/);
                        if (evalMatch) {
                            const unpacked = this._unpack(evalMatch[0]);
                            const sourceMatch = unpacked.match(/const source='([^']+)'/);
                            if (sourceMatch) {
                                streams.push({
                                    url: sourceMatch[1],
                                    quality: `[Kwik] ${quality}`,
                                    headers: { "Referer": "https://kwik.cx/" },
                                    isM3U8: sourceMatch[1].includes('.m3u8'),
                                    subtitles: []
                                });
                            }
                        }
                    } catch (e) {
                        console.error("[AnimePahe] Failed to unpack kwik", e);
                    }
                }
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
