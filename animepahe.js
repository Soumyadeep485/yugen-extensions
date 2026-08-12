// AnimePahe Extension for Yugen (Pure Native, Robust Null-Checking)
const ANIMEPAHE = {
  name: 'AnimePahe',
  pkgName: 'ru.animepahe',
  version: '1.0.4',
  lang: 'EN',
  baseURL: 'https://animepahe.com',

  async _fetchApi(url) {
    const jsonStr = await nativeFetch(url, {
      'Referer': this.baseURL,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    return JSON.parse(jsonStr);
  },

  async _fetchHtml(url) {
    return await nativeFetch(url, { 
      'Referer': this.baseURL,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
  },

  async search(query) {
    try {
      const data = await this._fetchApi(`${this.baseURL}/api?m=search&q=${encodeURIComponent(query)}`);
      if (!data || !data.data || !Array.isArray(data.data)) return [];
      
      return data.data.map(item => ({
        title: item.title,
        poster: item.poster,
        url: item.session
      }));
    } catch(e) {
      console.error("[AnimePahe] Search failed:", e);
      return [];
    }
  },

  async getEpisodes(session) {
    try {
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
    } catch(e) {
      return [];
    }
  },

  async getEpisodeCount(session) {
    try {
      const data = await this._fetchApi(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=1`);
      return data ? (data.total || 0) : 0;
    } catch(e) {
      return 0;
    }
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

  async extractStreams(episodeId, animeTitle) {
    try {
        let safeSession = episodeId.contains('|') ? episodeId.split('|')[1] : null;
        
        // Dynamic search fallback if ID is not pre-bound
        if (!safeSession) {
            let searchQuery = animeTitle || episodeId.split('/ep-')[0];
            searchQuery = searchQuery.replace(/[-_]/g, ' ').replace(/iii/i, '3');
            
            const searchResults = await this.search(searchQuery);
            if (!searchResults || searchResults.length === 0) {
              console.error("[AnimePahe] No anime found matching search query:", searchQuery);
              return [];
            }
            
            const trueId = searchResults[0].url;
            const epNum = parseInt(episodeId.split('/ep-')[1]) || 1;
            const eps = await this.getEpisodes(trueId);
            const target = eps.find(e => e.number === epNum);
            
            if (!target) {
              console.error("[AnimePahe] Could not match episode number:", epNum);
              return [];
            }
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
