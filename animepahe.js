// AnimePahe Extension for Yugen
const ANIMEPAHE = {
  name: 'AnimePahe',
  pkgName: 'ru.animepahe',
  version: '1.0.0',
  lang: 'EN',
  baseURL: 'https://animepahe.ru',

  async _fetchApi(url) {
    const jsonStr = await nativeFetch(url, {
      'Referer': this.baseURL,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    return JSON.parse(jsonStr);
  },

  async search(query) {
    const data = await this._fetchApi(`${this.baseURL}/api?m=search&q=${encodeURIComponent(query)}`);
    if (!data || !data.data) return [];
    
    return data.data.map(item => ({
      title: item.title,
      poster: item.poster,
      url: item.session,
      year: item.year
    }));
  },

  async getEpisodeCount(session) {
    const data = await this._fetchApi(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=1`);
    return data ? data.total : 0;
  },

  async getEpisodes(session) {
    const total = await this.getEpisodeCount(session);
    const episodes = [];
    
    const maxPages = Math.min(Math.ceil(total / 30), 10); 
    
    for (let p = 1; p <= maxPages; p++) {
        try {
            const data = await this._fetchApi(`${this.baseURL}/api?m=release&id=${session}&sort=episode_asc&page=${p}`);
            if (data && data.data) {
                data.data.forEach(ep => {
                    episodes.push({
                        id: `${session}|${ep.session}`,
                        number: ep.episode,
                        title: `Episode ${ep.episode}`
                    });
                });
            }
        } catch (e) {
            break;
        }
    }
    
    return episodes;
  },

  async extractStreams(episodeId, animeTitle) {
    const parts = episodeId.split('|');
    const epSession = parts[1];
    
    const data = await this._fetchApi(`${this.baseURL}/api?m=embed&id=${epSession}`);
    const streams = [];
    
    if (data && data.data) {
        for (const provider of Object.keys(data.data)) {
            const links = data.data[provider];
            for (const linkObj of Object.values(links)) {
                const kwikUrl = linkObj.kwik; 
                const quality = linkObj.resolution + 'p ' + (linkObj.audio === 'jpn' ? 'SUB' : 'DUB');
                
                try {
                    const kwikHtml = await nativeFetch(kwikUrl, {
                        'Referer': this.baseURL
                    });
                    
                    const sourceMatch = kwikHtml.match(/source src="([^"]+)"/i);
                    if (sourceMatch) {
                        streams.push({
                            url: sourceMatch[1],
                            quality: quality,
                            sourceName: `Kwik (${linkObj.resolution}p)`,
                            isM3U8: sourceMatch[1].includes('.m3u8')
                        });
                    } else {
                        // Pass kwik URL if extraction fails natively
                        streams.push({
                            url: kwikUrl,
                            quality: quality,
                            sourceName: `Kwik (${linkObj.resolution}p)`,
                            isM3U8: false
                        });
                    }
                } catch (e) {
                    console.error("Failed to parse kwik", e);
                }
            }
        }
    }
    
    return streams;
  }
};

window.extensions = window.extensions || {};
window.extensions[ANIMEPAHE.pkgName] = ANIMEPAHE;
