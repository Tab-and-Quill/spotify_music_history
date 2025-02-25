let dbReady = new Promise((resolve, reject) => {

    const indexedDB = 
        self.indexedDB ||
        self.mozIndexedDB ||
        self.webkitIndexedDB ||
        self.msIndexedDB ||
        self.shimIndexedDB
    ;

    const request = indexedDB.open("AppDB", 1);
    request.onupgradeneeded = (event) => {

        const db = event.target.result;
        if (!db.objectStoreNames.contains("files")) {
            db.createObjectStore("files", { keyPath: "name" });
        }
        if (!db.objectStoreNames.contains("aggregatedData")) {
            db.createObjectStore("aggregatedData", { keyPath: "year" });
        }
    };

    request.onsuccess = (event) => {
        const db = event.target.result;
        resolve(db);
    };

    request.onerror = (event) => {
        reject(event.target.errorCode);
    };
});


onmessage = async (event) => {

    const { type, name, data } = event.data || {};

    if (type === "checkData") {
       
        try {

            const db = await dbReady; 
            const transaction = db.transaction("files", "readonly");
            const store = transaction.objectStore("files");
            const countRequest = store.count();

            countRequest.onsuccess = () => {
                self.postMessage({ status: "fileCountCheck", results: countRequest.result > 0});
            };

            countRequest.onerror = () => {
                self.postMessage({ status: "error", message: "Failed to check data"});
            };

        } catch (error) {
            self.postMessage({ status: "error", message: error.message });
        }
    }

    if (type === "fetchKeys") {
        //Fetch all available keys (years and lifetime)

        try {
            const db = await dbReady;
            const transaction = db.transaction("aggregatedData", "readonly");
            const store = transaction.objectStore("aggregatedData");
            const keysRequest = store.getAllKeys();

            keysRequest.onsuccess = () => {
                const keys = keysRequest.result;
                self.postMessage({ status: "keysFetched", results: keys });
            };

            keysRequest.onerror = () => {
                self.postMessage({ status: "error", message: "Failed to fetch keys."})
            };

        } catch (error) {
            self.postMessage({ status: "error", message: error.message });
        }
    }

    if (type === "fetchAggregatedData") {

        const { filter } = event.data;

        try {
            const db = await dbReady;
            const transaction = db.transaction("aggregatedData", "readonly");
            const store = transaction.objectStore("aggregatedData");
            const result = await new Promise((resolve, reject) => {
                const request = store.get(filter.toLowerCase());
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject("Failed to fetch aggregated data.")
            });

            if (result) {
                self.postMessage({ status: "aggregatedData", results: result });
            } else {
                self.postMessage({ status: "noAggregatedData" });
            }

        } catch (error) {
            self.postMessage({ status: "error", message: error });
        }
    
    };

    if (type === "addFile") {
        const db = await dbReady;
        const transaction = db.transaction("files", "readwrite");
        const store = transaction.objectStore("files");
        const request = store.add({ name, data });

        request.onsuccess = () => {
            self.postMessage({ status: "fileAdded", results: true,  file: name });
        };

        request.onerror = () => {
            self.postMessage({ status: "error", message: `Failed to add file "${name}".` });
        };

    };
    
    if (type === "checkAndAggregateFiles") {

        const db = await dbReady;
        const transaction = db.transaction("files", "readonly");
        const store = transaction.objectStore("files");
        const request = store.getAll();

        request.onsuccess = async () => {
            const files = request.result;
            if (files.length === 0) {
                self.postMessage({ status: "error", message: "No files to aggregate." });
                return;
            }

            const allData = files.flatMap((entry) => entry.data);
            const aggregatedResults = await aggregateData(allData);

            await saveAggregatedData(aggregatedResults);
            self.postMessage({ status: "aggregationComplete", results: true });

        };

        request.onerror = () => {
            self.postMessage({ status: "error", message: "Failed to check files for aggregation." });
        };
    }
};

const saveAggregatedData = async (data) => {

    const db = await dbReady;
    const transaction = db.transaction("aggregatedData", "readwrite");
    const store = transaction.objectStore("aggregatedData");
    const lifetimeRecord = { year: "lifetime", ...data.lifetime };
    store.put(lifetimeRecord);

    for (const year in data.lifetime.years) {
        const record = {year, ...data.lifetime.years[year]}
        store.put(record);
    }
};

const aggregateData = async (data) => {
    const aggregatedData = {
        lifetime: {
            totalSongMsPlayed: 0,
            totalPodcastMsPlayed: 0,
            distinctSongs: new Set(),
            distinctPodcasts: new Set(),
            songCount: {},
            artistCount: {},
            episodeCount: {},
            years: {} // Holds annual data for lifetime view
        }
    };

    for (const item of data) {
        const date = new Date(item.ts);
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // 1-indexed month

        // Initialize yearly data if not present
        if (!aggregatedData.lifetime.years[year]) {
            aggregatedData.lifetime.years[year] = {
                totalSongMsPlayed: 0,
                totalPodcastMsPlayed: 0,
                distinctSongs: new Set(),
                distinctPodcasts: new Set(),
                songCount: {},
                artistCount: {},
                episodeCount: {},
                months: {} // Holds monthly data for the year
            };
        }

        const yearData = aggregatedData.lifetime.years[year];

        // Initialize monthly data if not present
        if (!yearData.months[month]) {
            yearData.months[month] = {
                totalSongMsPlayed: 0,
                totalPodcastMsPlayed: 0,
                distinctSongs: new Set(),
                distinctPodcasts: new Set(),
                songCount: {},
                artistCount: {},
                episodeCount: {}
            };
        }

        const monthData = yearData.months[month];

        // Update totals and distinct songs for lifetime, year, and month
        if (item.spotify_track_uri) {
            aggregatedData.lifetime.totalSongMsPlayed += item.ms_played;
            yearData.totalSongMsPlayed += item.ms_played;
            monthData.totalSongMsPlayed += item.ms_played;
        }

        if (item.spotify_episode_uri) {
            aggregatedData.lifetime.totalPodcastMsPlayed += item.ms_played;
            yearData.totalPodcastMsPlayed += item.ms_played;
            monthData.totalPodcastMsPlayed += item.ms_played;
        }
        

        if (!aggregatedData.lifetime.distinctSongs.has(item.spotify_track_uri)) {
            if (item.spotify_track_uri) aggregatedData.lifetime.distinctSongs.add(item.spotify_track_uri);
        }
        if (!yearData.distinctSongs.has(item.spotify_track_uri)) {
            if (item.spotify_track_uri) yearData.distinctSongs.add(item.spotify_track_uri);
        }
        if (!monthData.distinctSongs.has(item.spotify_track_uri)) {
            if (item.spotify_track_uri) monthData.distinctSongs.add(item.spotify_track_uri);
        }

        if (!aggregatedData.lifetime.distinctPodcasts.has(item.spotify_episode_uri)) {
           if (item.spotify_episode_uri) aggregatedData.lifetime.distinctPodcasts.add(item.spotify_episode_uri);
        }
        if (!yearData.distinctPodcasts.has(item.spotify_episode_uri)) {
            if (item.spotify_episode_uri) yearData.distinctPodcasts.add(item.spotify_episode_uri);
        }
        if (!monthData.distinctPodcasts.has(item.spotify_episode_uri)) {
            if (item.spotify_episode_uri) monthData.distinctPodcasts.add(item.spotify_episode_uri);
        }

        const trackName = item.master_metadata_track_name;
        const artistName = item.master_metadata_album_artist_name;
        const episodeShowName = item.episode_show_name;

        if (trackName && artistName) {

            const songKey = `${trackName} __ ${artistName}`;

            // Initialize song counts and played ms if not present
            if (!aggregatedData.lifetime.songCount[songKey]) {
                aggregatedData.lifetime.songCount[songKey] = { count: 0, ms: 0 };
            }
            if (!yearData.songCount[songKey]) {
                yearData.songCount[songKey] = { count: 0, ms: 0 };
            }
            if (!monthData.songCount[songKey]) {
                monthData.songCount[songKey] = { count: 0, ms: 0 };
            }

            // Update song counts and played ms
            aggregatedData.lifetime.songCount[songKey].count = (aggregatedData.lifetime.songCount[songKey].count || 0) + 1;
            yearData.songCount[songKey].count = (yearData.songCount[songKey].count || 0) + 1;
            monthData.songCount[songKey].count = (monthData.songCount[songKey].count || 0) + 1;

            aggregatedData.lifetime.songCount[songKey].ms = (aggregatedData.lifetime.songCount[songKey].ms || 0) + item.ms_played;
            yearData.songCount[songKey].ms = (yearData.songCount[songKey].ms || 0) + item.ms_played;
            monthData.songCount[songKey].ms = (monthData.songCount[songKey].ms || 0) + item.ms_played;

        }

        if (artistName) {
            // Initialize artist counts if not present
            if (!aggregatedData.lifetime.artistCount[artistName]) {
                aggregatedData.lifetime.artistCount[artistName] = { count: 0, ms: 0 };
            }
            if (!yearData.artistCount[artistName]) {
                yearData.artistCount[artistName] = { count: 0, ms: 0 };
            }
            if (!monthData.artistCount[artistName]) {
                monthData.artistCount[artistName] = { count: 0, ms: 0 };
            }

            // Update artist counts
            aggregatedData.lifetime.artistCount[artistName].count = (aggregatedData.lifetime.artistCount[artistName].count || 0) + 1;
            yearData.artistCount[artistName].count = (yearData.artistCount[artistName].count || 0) + 1;
            monthData.artistCount[artistName].count = (monthData.artistCount[artistName].count || 0) + 1;

            aggregatedData.lifetime.artistCount[artistName].ms = (aggregatedData.lifetime.artistCount[artistName].ms || 0) + item.ms_played;
            yearData.artistCount[artistName].ms = (yearData.artistCount[artistName].ms || 0) + item.ms_played;
            monthData.artistCount[artistName].ms = (monthData.artistCount[artistName].ms || 0) + item.ms_played;

        }

        if (episodeShowName) {
            // Initialize episode counts if not present
            if (!aggregatedData.lifetime.episodeCount[episodeShowName]) {
                aggregatedData.lifetime.episodeCount[episodeShowName] = { count: 0, ms: 0 };
            }
            if (!yearData.episodeCount[episodeShowName]) {
                yearData.episodeCount[episodeShowName] = { count: 0, ms: 0 };
            }
            if (!monthData.episodeCount[episodeShowName]) {
                monthData.episodeCount[episodeShowName] = { count: 0, ms: 0 };
            }

            aggregatedData.lifetime.episodeCount[episodeShowName].count = (aggregatedData.lifetime.episodeCount[episodeShowName].count || 0) + 1;
            yearData.episodeCount[episodeShowName].count = (yearData.episodeCount[episodeShowName].count || 0) + 1;
            monthData.episodeCount[episodeShowName].count = (monthData.episodeCount[episodeShowName].count || 0) + 1;

            aggregatedData.lifetime.episodeCount[episodeShowName].ms = (aggregatedData.lifetime.episodeCount[episodeShowName].ms || 0) + item.ms_played;
            yearData.episodeCount[episodeShowName].ms = (yearData.episodeCount[episodeShowName].ms || 0) + item.ms_played;
            monthData.episodeCount[episodeShowName].ms = (monthData.episodeCount[episodeShowName].ms || 0) + item.ms_played;
        }
    }

    const processSummary = (data) => {

        const { totalSongMsPlayed, totalPodcastMsPlayed, distinctSongs, distinctPodcasts, songCount, artistCount, episodeCount } = data;

        return {
            totalSongHoursPlayed: totalSongMsPlayed / 3600000,
            totalPodcastHoursPlayed: totalPodcastMsPlayed / 360000,
            distinctSongs: distinctSongs.size,
            distinctPodcasts: distinctPodcasts.size,
            rankedSongs: Object.entries(songCount)
                .sort(([, a], [, b]) => b.ms - a.ms)
                .slice(0, 50)
                .map(([song, count]) => {
                    const [trackName, artistName] = song.split("__").map(part => part.trim());
                    return { trackName, artistName, count};
                }),
            topArtists: Object.entries(artistCount)
                .sort(([, a], [, b]) => b.ms - a.ms)
                .slice(0, 50)
                .map(([artist, count]) => ({ artist, count})),
            topPodcasts: Object.entries(episodeCount)
                .sort(([, a], [, b]) => b.ms - a.ms)
                .slice(0, 50)
                .map(([episode_show_name, count]) => ({ episode_show_name, count}))
        };
    };

    // Process summaries for lifetime, years, and months
    const results = {
        lifetime: processSummary(aggregatedData.lifetime)
    };

    results.lifetime.years = {};
    for (const year in aggregatedData.lifetime.years) {
        const yearData = aggregatedData.lifetime.years[year];
        results.lifetime.years[year] = processSummary(yearData);
        results.lifetime.years[year].months = {};

        for (const month in yearData.months) {
            const monthData = yearData.months[month];
            results.lifetime.years[year].months[month] = processSummary(monthData);
        }
    }

    return results;
};