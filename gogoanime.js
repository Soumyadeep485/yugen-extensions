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
    // episodeId is like "bleach/ep-1"
    const parts = episodeId.split('/ep-');
    const slug = parts[0];
    const epNum = parts[1];
    
    const epUrl = `${this.baseURL}/${slug}-episode-${epNum}/`;
    const html = await nativeFetch(epUrl);
    
    const streams = [];

    // 1. Find Download Links (MP4 direct)
    const downloadPageMatch = html.match(/class="cf-download"[\s\S]*?href="([^"]+)"/i);
    if (downloadPageMatch) {
        let downloadUrl = downloadPageMatch[1];
        if (downloadUrl.startsWith('/')) {
            downloadUrl = this.baseURL + downloadUrl;
        }
        
        try {
            const dlHtml = await nativeFetch(downloadUrl);
            const dlRegex = /<div class="dowload">[\s\S]*?<a href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>/gi;
            let dlMatch;
            while ((dlMatch = dlRegex.exec(dlHtml)) !== null) {
                const link = dlMatch[1];
                let qualityText = dlMatch[2].replace(/<[^>]+>/g, '').trim(); 
                
                // e.g. "Download (360P - mp4)"
                const qMatch = qualityText.match(/(\d+P)/i);
                const quality = qMatch ? qMatch[1] : 'MP4';
                
                if (link.includes('.mp4')) {
                    streams.push({
                        url: link,
                        quality: quality,
                        sourceName: 'Gogo CDN (MP4)',
                        isM3U8: false
                    });
                }
            }
        } catch (e) {
            // Ignored, proceed to HLS fallback
        }
    }

    // 2. Find streaming iframe (HLS)
    const iframeMatch = html.match(/<iframe[^>]*src="([^"]+)"/i);
    if (iframeMatch) {
        let embedUrl = iframeMatch[1];
        if (embedUrl.startsWith('//')) {
            embedUrl = 'https:' + embedUrl;
        }
        
        streams.push({
            url: embedUrl,
            quality: 'Auto',
            sourceName: 'Gogo Embed (Stream)',
            isM3U8: true 
        });
    }

    return streams;
  }
};

window.extensions = window.extensions || {};
window.extensions[GOGOANIME.pkgName] = GOGOANIME;
