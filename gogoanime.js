// GogoAnime (anitaku) Extension for Yugen
const GOGOANIME = {
  name: 'GogoAnime',
  pkgName: 'com.gogoanime',
  version: '1.0.0',
  lang: 'EN',
  baseURL: 'https://anitaku.com.ro',

      async search(query) {
    const html = await nativeFetch(`${this.baseURL}/search.html?keyword=${encodeURIComponent(query)}`);
    const results = [];
    
    const articleRegex = /<article class="bs"[\s\S]*?href="([^"]+)"[\s\S]*?title="([^"]+)"[\s\S]*?src="([^"]+)"/gi;
    let match;
    while ((match = articleRegex.exec(html)) !== null) {
      let url = match[1];
      const title = match[2];
      const poster = match[3];

      let slug = url.split('/').filter(Boolean).pop();
      if (slug.includes('-episode-')) {
          slug = slug.split('-episode-')[0];
      }

      results.push({
        title: title.replace(/ Episode \d+/i, '').trim(),
        poster: poster,
        url: slug
      });
    }
    return results;
  },



  async getEpisodeCount(slug) {
    const html = await nativeFetch(`${this.baseURL}/category/${slug}`);
    
    // Find <a href="#" class="active" ep_start="0" ep_end="366">
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
        episodes.push({
            id: `${slug}/ep-${i}`,
            number: i,
            title: `Episode ${i}`
        });
    }
    return episodes;
  },

    async extractStreams(episodeId, animeTitle) {
    const parts = episodeId.split('/ep-');
    const slug = parts[0];
    const epNum = parts[1];
    
    const epUrl = `${this.baseURL}/${slug}-episode-${epNum}/`;
    const html = await nativeFetch(epUrl);
    
    const streams = [];

    // Find streaming iframe (Vidstreaming/tamilembed/gogocdn)
    const iframeMatch = html.match(/<iframe[^>]*src="([^"]+)"/i);
    if (iframeMatch) {
        let embedUrl = iframeMatch[1];
        if (embedUrl.startsWith('//')) {
            embedUrl = 'https:' + embedUrl;
        }
        
        try {
            const embedHost = embedUrl.split('/').slice(0, 3).join('/'); 
            let streamId = embedUrl.split('/').pop().split('?')[0];
            
            // Try getSources API directly (Decrypts the iframe)
            let apiUrl = `${embedHost}/stream/getSources?id=${streamId}&id=${streamId}`;
            let apiResponse = await nativeFetch(apiUrl, {
                "Accept": "*/*",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": embedUrl
            });
            
            let data = JSON.parse(apiResponse);
            
            if (!data || (!data.sources && !data.file && !data.url)) {
                apiUrl = `${embedHost}/stream/getSourcesNew?id=${streamId}&id=${streamId}`;
                apiResponse = await nativeFetch(apiUrl, {
                    "Accept": "*/*",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": embedUrl
                });
                data = JSON.parse(apiResponse);
            }

            let actualData = data.result ? data.result : data;
            if (actualData) {
                let sources = actualData.sources || actualData.file || actualData.url;
                if (Array.isArray(sources)) {
                    sources.forEach(src => {
                        const streamUrl = src.file || src.url || src.src || src.link;
                        if (streamUrl && typeof streamUrl === 'string') {
                            streams.push({ 
                                quality: src.label || src.quality || "Auto", 
                                url: streamUrl, 
                                isM3U8: streamUrl.includes('.m3u8')
                            });
                        }
                    });
                } else if (typeof sources === 'object' && (sources.file || sources.url)) {
                    streams.push({ quality: "Auto", url: sources.file || sources.url, isM3U8: (sources.file || sources.url).includes('.m3u8') });
                } else if (typeof sources === 'string' && sources.startsWith("http")) {
                    streams.push({ quality: "Auto", url: sources, isM3U8: sources.includes('.m3u8') });
                }
            }
        } catch (e) {
            // Fallback to iframe url if API fails
            streams.push({ url: embedUrl, quality: 'Iframe Embed (Fallback)', isM3U8: false });
        }
    }

    return streams;
  }
};

window.extensions = window.extensions || {};
window.extensions[GOGOANIME.pkgName] = GOGOANIME;
