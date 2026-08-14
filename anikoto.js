globalThis.Extension = (function() {
    const BASE_URL = "https://anikoto.cz"; 

    function utf8Encode(str) { return unescape(encodeURIComponent(str)); }
    
    function exchange(input, key1, key2) {
        let res = "";
        for(let i = 0; i < input.length; i++) {
            let idx = key1.indexOf(input[i]);
            res += (idx !== -1) ? key2[idx] : input[i];
        }
        return res;
    }

    function rc4Encrypt(key, input) {
        input = utf8Encode(input);
        let s = [], j = 0, x;
        for (let i = 0; i < 256; i++) s[i] = i;
        for (let i = 0; i < 256; i++) {
            j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
            x = s[i]; s[i] = s[j]; s[j] = x;
        }
        let i = 0, res = ""; j = 0;
        for (let y = 0; y < input.length; y++) {
            i = (i + 1) % 256;
            j = (j + s[i]) % 256;
            x = s[i]; s[i] = s[j]; s[j] = x;
            res += String.fromCharCode(input.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]);
        }
        return btoa(res).replace(/\+/g, '-').replace(/\//g, '_');
    }

    function vrfEncrypt(input) {
        let vrf = input;
        vrf = exchange(vrf, "AP6GeR8H0lwUz1", "UAz8Gwl10P6ReH");
        vrf = rc4Encrypt("ItFKjuWokn4ZpB", vrf);
        vrf = rc4Encrypt("fOyt97QWFB3", vrf);
        vrf = exchange(vrf, "1majSlPQd2M5", "da1l2jSmP5QM");
        vrf = exchange(vrf, "CPYvHj09Au3", "0jHA9CPYu3v");
        vrf = vrf.split('').reverse().join('');
        vrf = rc4Encrypt("736y1uTJpBLUX", vrf);
        vrf = btoa(utf8Encode(vrf)).replace(/\+/g, '-').replace(/\//g, '_');
        return encodeURIComponent(vrf);
    }
    
    function getBestSearchMatchUrl(targetTitle, searchResults) {
        if (!searchResults || searchResults.length === 0) return null;
        const clean = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const cleanTarget = clean(targetTitle);
        const isLookingForSequel = /season|part|cour|2nd|3rd|4th/i.test(targetTitle);

        for (let res of searchResults) {
            if (clean(res.title) === cleanTarget) return res.url;
        }

        if (!isLookingForSequel) {
            for (let res of searchResults) {
                const hasSequelTag = /season|part|cour|2nd|3rd|4th/i.test(res.title);
                if (!hasSequelTag) return res.url;
            }
        }
        return searchResults[0].url;
    }

    return {
        search: async function(query) {
            try {
                const formattedQuery = encodeURIComponent(query).replace(/%20/g, '+');
                const searchUrl = `${BASE_URL}/filter?keyword=${formattedQuery}`;
                const responseHtml = await nativeFetch(searchUrl);
                const parser = new DOMParser();
                const doc = parser.parseFromString(responseHtml, "text/html");
                const results = [];
                const items = doc.querySelectorAll('.flw-item, .film_list-wrap > div, .item, .film-poster');
                
                items.forEach(item => {
                    const aTag = item.querySelector('a');
                    const imgTag = item.querySelector('img');
                    if (aTag && aTag.getAttribute('href')) {
                        let title = aTag.getAttribute('title') || aTag.getAttribute('data-jname') || imgTag?.getAttribute('alt') || aTag.innerText.trim();
                        let url = aTag.getAttribute('href');
                        let poster = imgTag ? (imgTag.getAttribute('data-src') || imgTag.getAttribute('src')) : "";
                        if (url && url.startsWith('/')) { url = BASE_URL + url; }
                        if (title && title !== "") { results.push({ title: title, url: url, poster: poster }); }
                    }
                });
                return results;
            } catch (e) {
                return [{ title: "🚨 JS ERROR: " + String(e), url: "", poster: "" }];
            }
        },

        getEpisodes: async function(animeUrl) {
            try {
                const responseHtml = await nativeFetch(animeUrl);
                const parser = new DOMParser();
                const doc = parser.parseFromString(responseHtml, "text/html");
                
                let animeId = "";
                const idEl = doc.querySelector('[data-id]') || doc.querySelector('[data-tip]');
                if (idEl) animeId = idEl.getAttribute('data-id') || idEl.getAttribute('data-tip');
                if (!animeId) return [];
                
                const vrfToken = vrfEncrypt(animeId);
                const ajaxUrl = `${BASE_URL}/ajax/episode/list/${animeId}?vrf=${vrfToken}`;
                
                const ajaxResponse = await nativeFetch(ajaxUrl, {
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "Referer": animeUrl,
                    "X-Requested-With": "XMLHttpRequest"
                });
                
                const jsonResp = JSON.parse(ajaxResponse);
                const htmlContent = jsonResp.result || jsonResp.html || "";
                if (!htmlContent || htmlContent.trim() === "") return [];

                const ajaxDoc = parser.parseFromString(htmlContent, "text/html");
                const epElements = ajaxDoc.querySelectorAll('div.episodes ul > li > a');
                
                const episodes = [];
                epElements.forEach(el => {
                    let epNum = parseFloat(el.getAttribute('data-num') || "1");
                    let ids = el.getAttribute('data-ids'); 
                    episodes.push({ 
                        number: epNum, 
                        id: ids, 
                        title: el.parentElement?.getAttribute('title') || `Episode ${epNum}`
                    });
                });

                episodes.sort((a, b) => a.number - b.number);
                return episodes;
            } catch (e) {
                console.error("🚨 JS ERROR: " + String(e));
                return [];
            }
        },

        getEpisodeCount: async function(animeUrl) {
            const eps = await Extension.getEpisodes(animeUrl);
            return eps.length;
        },

        extractStreams: async function(episodeId, animeTitle) {
            try {
                let watchUrl = episodeId;
                const epMatch = watchUrl.match(/[-/]ep-(\d+)/i);
                const epNum = epMatch ? epMatch[1] : "1";

                if (watchUrl.startsWith("http")) {
                    let cleanBase = watchUrl.split('?')[0].replace(/(\/ep-\d+|-ep-\d+)+$/i, '');
                    watchUrl = `${cleanBase}/ep-${epNum}`;
                } else {
                    let rawTitle = watchUrl.replace(/(\/ep-\d+|-ep-\d+)+$/i, '');
                    const searchResults = await Extension.search(rawTitle);
                    if (searchResults && searchResults.length > 0) {
                        let bestUrl = getBestSearchMatchUrl(rawTitle, searchResults) || searchResults[0].url;
                        let foundUrl = bestUrl.split('?')[0].replace(/(\/ep-\d+|-ep-\d+)+$/i, '');
                        watchUrl = `${foundUrl}/ep-${epNum}`;
                    } else {
                        let cleanSlug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                        watchUrl = `${BASE_URL}/watch/${cleanSlug}/ep-${epNum}`;
                    }
                }
                
                const watchHtml = await nativeFetch(watchUrl);
                let animeId = "";
                const idMatch = watchHtml.match(/data-id="([^"]+)"/) || watchHtml.match(/data-tip="([^"]+)"/);
                if (idMatch) animeId = idMatch[1];
                if (!animeId) throw new Error("Could not find Anime ID on watch page.");
                
                const vrfToken = vrfEncrypt(animeId);
                const epsAjax = await nativeFetch(`${BASE_URL}/ajax/episode/list/${animeId}?vrf=${vrfToken}`, {
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "X-Requested-With": "XMLHttpRequest"
                });
                const epsJson = JSON.parse(epsAjax);
                
                const parser = new DOMParser();
                const epsDoc = parser.parseFromString(epsJson.result || epsJson.html || "", "text/html");
                const targetEp = epsDoc.querySelector(`a[data-num="${epNum}"]`);
                if (!targetEp) throw new Error("Could not find episode " + epNum + " in API response.");
                const epIds = targetEp.getAttribute("data-ids");
                
                const serversAjax = await nativeFetch(`${BASE_URL}/ajax/server/list?servers=${epIds}`, {
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "X-Requested-With": "XMLHttpRequest"
                });
                const serversJson = JSON.parse(serversAjax);
                const serversDoc = parser.parseFromString(serversJson.result || serversJson.html || "", "text/html");
                
                const serverElements = serversDoc.querySelectorAll('.type li[data-link-id]');
                if (serverElements.length === 0) throw new Error("No video servers available.");
                
                const allStreams = [];

                for (const serverEl of serverElements) {
                    try {
                        const serverId = serverEl.getAttribute("data-link-id");
                        const serverName = serverEl.innerText.trim() || "Server";
                        const typeContainer = serverEl.closest('.type');
                        const typeStr = typeContainer ? (typeContainer.getAttribute("data-type") || typeContainer.innerText).toLowerCase() : "sub";
                        const isDub = typeStr.includes('dub');
                        const prefix = isDub ? "[DUB]" : "[SUB]";
                        
                        const embedAjax = await nativeFetch(`${BASE_URL}/ajax/server?get=${serverId}`, {
                            "Accept": "application/json, text/javascript, */*; q=0.01",
                            "X-Requested-With": "XMLHttpRequest"
                        });
                        const embedJson = JSON.parse(embedAjax);
                        let embedUrl = embedJson.result.url || embedJson.result.link;
                        if (embedUrl.startsWith('//')) embedUrl = "https:" + embedUrl;
                        
                        const embedHost = embedUrl.split('/').slice(0, 3).join('/'); 
                        
                        const requiredHeaders = {
                            "Referer": embedHost + "/",
                            "Origin": embedHost,
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                        };

                        // 🚀 KOTLIN PARITY FIX 1: MewCDN Fragment Decoding
                        if (embedUrl.includes("mewcdn.online/player/plyr.php")) {
                            const fragment = embedUrl.split('#')[1];
                            if (fragment) {
                                const rawM3u8 = decodeURIComponent(escape(atob(fragment))).trim();
                                const mewHtml = await nativeFetch(embedUrl, { "Referer": BASE_URL + "/" });
                                const hostMapMatch = mewHtml.match(/var HOST_MAP\s*=\s*\{([^}]+)\}/);
                                let finalM3u8 = rawM3u8;
                                
                                if (hostMapMatch) {
                                    const mapString = hostMapMatch[1];
                                    const entryRegex = /'([^']+)'\s*:\s*'([^']+)'/g;
                                    let match;
                                    while ((match = entryRegex.exec(mapString)) !== null) {
                                        if (finalM3u8.includes(match[1])) {
                                            finalM3u8 = finalM3u8.replace(match[1], match[2]);
                                            break;
                                        }
                                    }
                                }
                                allStreams.push({ quality: `${prefix} ${serverName} - Auto`, url: finalM3u8, headers: requiredHeaders, subtitles: [] });
                            }
                            continue;
                        }
                        
                        // 🚀 KOTLIN PARITY FIX 2: Strict Data-ID Body Regex
                        const embedHtml = await nativeFetch(embedUrl, { "Referer": BASE_URL + "/" });
                        const dataIdMatch = embedHtml.match(/data-id="([^"]+)"/);
                        let data = {};

                        if (dataIdMatch) {
                            const dataId = dataIdMatch[1];
                            const streamType = isDub ? "dub" : "sub";
                            
                            // Strategy A: getSources
                            let apiUrl = `${embedHost}/stream/getSources?id=${dataId}&id=${dataId}`;
                            let apiResponse = await nativeFetch(apiUrl, { "Accept": "*/*", "X-Requested-With": "XMLHttpRequest", "Referer": embedUrl, "Origin": embedHost });
                            try { data = JSON.parse(apiResponse); } catch(e) {}
                            
                            // Strategy B: getSourcesNew Fallback
                            if (!data || (!data.sources && !data.file && !data.url && !data.result)) {
                                apiUrl = `${embedHost}/stream/getSourcesNew?id=${dataId}&id=${dataId}&type=${streamType}&type=${streamType}`;
                                apiResponse = await nativeFetch(apiUrl, { "Accept": "*/*", "X-Requested-With": "XMLHttpRequest", "Referer": embedUrl, "Origin": embedHost });
                                try { data = JSON.parse(apiResponse); } catch(e) {}
                            }
                        }

                        // 🚀 KOTLIN PARITY FIX 3: Direct m3u8 Regex Brute-Force
                        if (!data || (!data.sources && !data.file && !data.url && !data.result)) {
                            const directM3u8Match = embedHtml.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
                            if (directM3u8Match) {
                                allStreams.push({ quality: `${prefix} ${serverName} - Auto`, url: directM3u8Match[0], headers: requiredHeaders, subtitles: [] });
                                continue;
                            }
                        }

                        let parsedSubtitles = [];
                        let tracks = data.tracks || (data.result && data.result.tracks) || [];
                        
                        if (Array.isArray(tracks)) {
                            tracks.forEach(track => {
                                if (track.file && typeof track.file === 'string' && track.kind !== 'thumbnails') {
                                    let subUrl = String(track.file);
                                    if (subUrl.includes('.vtt') || subUrl.includes('.ass') || subUrl.includes('.srt')) {
                                        if (subUrl.startsWith('/')) { subUrl = embedHost + subUrl; }
                                        parsedSubtitles.push({
                                            label: track.label ? String(track.label) : "English",
                                            url: subUrl,
                                            isDefault: track.default === true || track.default === "true"
                                        });
                                    }
                                }
                            });
                        }
                        
                        let actualData = data.result ? data.result : data;
                        if (actualData) {
                            let sources = actualData.sources || actualData.file || actualData.url;
                            if (Array.isArray(sources)) {
                                sources.forEach(src => {
                                    const streamUrl = src.file || src.url || src.src || src.link;
                                    if (streamUrl && typeof streamUrl === 'string') {
                                        allStreams.push({ quality: `${prefix} ${serverName} - ${src.label || src.quality || "Auto"}`, url: streamUrl, headers: requiredHeaders, subtitles: parsedSubtitles });
                                    }
                                });
                            } else if (typeof sources === 'object' && (sources.file || sources.url)) {
                                allStreams.push({ quality: `${prefix} ${serverName} - Auto`, url: sources.file || sources.url, headers: requiredHeaders, subtitles: parsedSubtitles });
                            } else if (typeof sources === 'string' && sources.startsWith("http")) {
                                allStreams.push({ quality: `${prefix} ${serverName} - Auto`, url: sources, headers: requiredHeaders, subtitles: parsedSubtitles });
                            }
                        }
                    } catch (serverErr) {}
                }
                return allStreams;
            } catch (e) {
                return [];
            }
        }
    };
})();
