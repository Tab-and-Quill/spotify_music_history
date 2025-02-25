"use strict"

const schema = {
    type: "array",
    items: {
        type: "object",
        properties: {
            ts: { type: "string", format: "date-time" },
            platform: { type: "string" },
            ms_played: { type: "integer" },
            conn_country: { type: "string" },
            ip_addr: { type: "string" },
            master_metadata_track_name: { type: ["string", "null"] },
            master_metadata_album_artist_name: { type: ["string", "null"] },
            master_metadata_album_album_name: { type: ["string", "null"] },
            spotify_track_uri: { type: ["string", "null"]},
            episode_name: { type: ["string", "null"] },
            episode_show_name: { type: ["string", "null"] },
            spotify_episode_uri: { type: ["string", "null"] },
            reason_start: { type: "string" },
            reason_end: { type: "string" },
            shuffle: { type: "boolean" },
            skipped: { type: "boolean" },
            offline: { type: "boolean" },
            offline_timestamp: { type: ["number", "null"] },
            incognito_mode: { type: "boolean" },
        },
        required: [
            "ts",
            "platform",
            "ms_played",
            "conn_country",
            "ip_addr",
            "master_metadata_track_name",
            "master_metadata_album_artist_name",
            "master_metadata_album_album_name",
            "spotify_track_uri",
            "reason_start",
            "reason_end",
            "shuffle",
            "skipped",
            "offline",
            "incognito_mode",
        ],
    },
};

let chartInstance; 
let worker;

let dataStore = {
    songFilter: 10,
    artistFilter: 10,
    podcastFilter: 10,
    filterPeriod: "lifetime",
    totalSongHours: 420,
    uniqueSongCount: 1991,
    totalPodcastHours: 1,
    uniqueEpisodeCount: 19,
    songs: [],
    artists: [],
    podcasts: [],
    lifetimeChart: {},
    annualChart: {},
    dropDownList: [],
    subscribers: [],

    subscribe(callback) {
        this.subscribers.push(callback);
    },

    setDropDownList(newList) {
        this.dropDownList = newList;
        this.notify();
    },

    setSongsList(newSongsList) {
        this.songs = newSongsList;
        this.notify();
    },

    setArtistsList(newArtistList) {
        this.artists = newArtistList;
        this.notify();
    },

    setPodcastsList(newPodcastList) {
        this.podcasts = newPodcastList;
        this.notify();
    },

    setFilterPeriod(newPeriod) {
        this.filterPeriod = newPeriod;
        this.notify();
    },

    setTotalSongHours(newTotalHours) {
        this.totalSongHours = newTotalHours;
        this.notify();
    },

    setUniqueSongCount(newSongCount) {
        this.uniqueSongCount = newSongCount;
        this.notify();
    },

    setTotalPodcastHours(newPodcastHours) {
        this.totalPodcastHours = newPodcastHours;
        this.notify();
    },

    setUniqueEpisodeCount(newEpisodeCount) {
        this.uniqueEpisodeCount = newEpisodeCount;
        this.notify();
    },

    setSongFilter(newFilterValue) {
        this.songFilter = Number(newFilterValue);
        this.notify();
    },

    setArtistFilter(newFilterValue) {
        this.artistFilter = Number(newFilterValue);
        this.notify();
    },

    setPodcastFilter(newFilterValue) {
        this.podcastFilter = Number(newFilterValue);
        this.notify();
    },

    setLifetimeChart(newValues) {
        this.lifetimeChart = newValues || {};
        this.notify();
    },

    setAnnualChart(newValues) {
        this.annualChart = newValues || {};
        this.notify();
    },

    notify() {
        this.subscribers.map(callback => callback());
    }
};

const appState = {
    dbHasFiles: false,
    showHowItWorks: false,
    showTab: "songs",
    showDropDownList: false,
    subscribers: [],

    subscribe(callback) {
        this.subscribers.push(callback);
    }, 

    setDbHasFiles(value) {
        this.dbHasFiles = value;
        this.notify();
    },

    toggleHowItWorks() {
        this.showHowItWorks = !this.showHowItWorks;
        this.notify();
    },

    toggleDropDownList() {
        this.showDropDownList = !this.showDropDownList;
        this.notify();
    },

    toggleShowTab(newTabValue) {
        this.showTab = newTabValue;
        this.notify();
    },

    notify() {
        this.subscribers.map(callback => callback());
    }
}

// Helper: Check value type
const checkType = (value, type) => {
    if (type === "integer") return Number.isInteger(value);
    if (type === "number") return typeof value === "number";
    if (type === "string") return typeof value === "string";
    if (type === "boolean") return typeof value === "boolean";
    if (type === "null") return value === null;
    return false; // Unsupported type
};


const validateJson = (data, schema) => {
    if (!Array.isArray(data)) {
        console.error("Root element must be an array.");
        return false; // Root must be an array
    }

    const { properties, required } = schema.items;

    for (const item of data) {
        // Check required fields
        for (const field of required) {
            if (!(field in item)) {
                console.error(`Missing required field: ${field}`);
                return false;
            }
        }

        // Check field types
        for (const [key, constraints] of Object.entries(properties)) {
            const value = item[key];

            if (value === undefined) continue; // Ignore undefined values for non-required fields

            if (Array.isArray(constraints.type)) {
                // Handle multi-type constraints
                
                if (!constraints.type.some((type) => checkType(value, type))) {
                    console.error(`Invalid type for key "${key}". Expected one of ${constraints.type}, got ${typeof value}`);
                    return false;
                }
            } else {
                if (!checkType(value, constraints.type)) {
                    console.error(`Invalid type for key "${key}". Expected ${constraints.type}, got ${typeof value}`);
                    return false;
                }
            }
        }
    }

    return true;
};

const msToTime = (ms) => {
    const hours = Math.floor(ms/(3600000));
    const minutes = Math.floor((ms % (3600000)) /60000);
    const seconds = Math.floor((ms % 60000)/ 1000);

    const pad = (num) => String(num).padStart(2, '0');

    if (hours > 0) {
        return `${pad(hours)}h ${pad(minutes)}m`
    }
    if (hours == 0 && minutes > 0) {
        return `${pad(minutes)}m ${pad(seconds)}s`
    }
    if (hours == 0 && minutes == 0) {
        return `${pad(seconds)}s`
    }
    
}

const fillChart = () => {

    const canvas = document.querySelector("#mainChart");
    const ctx    = canvas.getContext("2d");

    let labels = [];
    let data = [];
    let title = "";
    const Map = {
        1: "JAN",
        2: "FEB",
        3: "MAR",
        4: "APR",
        5: "MAY",
        6: "JUN",
        7: "JUL",
        8: "AUG",
        9: "SEP",
        10: "OCT",
        11: "NOV",
        12: "DEC"
    }

    if (Object.keys(dataStore.lifetimeChart).length > 0) {
        labels = Object.keys(dataStore.lifetimeChart);
        data = labels.map(key => dataStore.lifetimeChart[key].totalSongHoursPlayed.toFixed(0));
        title = "Years";
    } else if (Object.keys(dataStore.annualChart).length > 0) {
        const keys = Object.keys(dataStore.annualChart);
        data = keys.map(key => dataStore.annualChart[key].totalSongHoursPlayed.toFixed(0));
        labels = keys.map(key => Map[key]);
        title = "Months";
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                labels: "Total Song Hours",
                data: data,
                backgroundColor: 'rgba(0, 0, 0, 1)',
                barThickness: 10,
                borderWidth: 1
            }]
        },
        options: {

            elements: {
                bar: {
                    borderRadius: 5
                }
            },
            scales: {
                x: {
                    grid: {
                    display: false
                    },
                    title: {
                        display: true,
                        text: 'Year'
                    }
                },
                y: {
                    grid: {
                        display: true
                    },
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Total Hours Played'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

};

const renderDropDown = () => {
    return dataStore.dropDownList.length > 0 ? dataStore.dropDownList.map(key => `<li class="filter-list-item-option">${key}</li>`).join("") : "";
};

const attachSideNavEvents = () => {

    document.querySelector(".filter-bar-dropdown")?.addEventListener("click", event => {
        let parent = event.target.parentNode
        parent.classList.toggle("active");
    })

    document.querySelector(".filter-bar-dropdown-content-list")?.addEventListener("click", event => {
        let listText                = event.target.innerText;
        let dropdownInputField      = event.target.offsetParent.previousElementSibling.firstElementChild; 
        let parent                  = event.target.parentElement.parentElement.parentElement;

        dataStore.setFilterPeriod(listText);

        dropdownInputField.dispatchEvent(new Event("change"));
        parent.classList.toggle("active");
    });

    document.querySelector("#filterYearInput")?.addEventListener("change", event => {
        let filterField = event.target
        worker.postMessage({type: "fetchAggregatedData", filter: dataStore.filterPeriod });
    });

    document.querySelector("#tabNav")?.addEventListener("click", event => {
        const navItem = event.target.closest(".nav-item");
        
        appState.toggleShowTab(navItem.dataset.value);
        fillChart();
    })
};

const attachMainEvents = () => {
    document.querySelector("#songFilter")?.addEventListener("click", event => {
        const pill = event.target.closest(".pill-item");

        if (!pill) return;

        dataStore.setSongFilter(pill.dataset.value);
        fillChart();
    });

    document.querySelector("#artistFilter")?.addEventListener("click", event => {
        const pill = event.target.closest(".pill-item");

        if (!pill) return;

        dataStore.setArtistFilter(pill.dataset.value);
        fillChart();
    });

    document.querySelector("#podcastFilter")?.addEventListener("click", event => {
        const pill = event.target.closest(".pill-item");

        if (!pill) return;

        dataStore.setPodcastFilter(pill.dataset.value);
        fillChart();
    });
};

const renderSideNav = () => {
    return `
        <aside class="aside-nav">
            <div class="filter-bar-dropdown desktop-dropdown">
                <div class="filter-bar-dropdown-label">
                    <input id="filterYearInput" placeholder="Lifetime" type="text" class="table-filter filter-bar-dropdown-value" value=${dataStore.filterPeriod} readonly />
                    <span class="chevron">
                        <span></span>
                        <span></span>
                    </span>
                </div>
                <div class="filter-bar-dropdown-content">
                    <ul class="flex flex-column pt-15 pb-15 filter-bar-dropdown-content-list">${renderDropDown()}</ul>
                </div>
            </div>
            <nav>
                <ul id="tabNav" class="flex flex-column pt-15">
                    <li class="nav-item pl-15 pt-10 pb-10 ${appState.showTab === 'songs' ? 'active' : ''}" data-value="songs">Songs</li>
                    <li class="nav-item pl-15 pt-10 pb-10 ${appState.showTab === 'artists' ? 'active' : ''}" data-value="artists">Artists</li>
                    <li class="nav-item pl-15 pt-10 pb-10 ${appState.showTab === 'podcasts' ? 'active': ''}" data-value="podcasts">Podcasts</li>
                </ul>
            </nav>
        </aside>
    `;
};

const renderVisuals  = () => {

    return `
        <aside class="aside-visuals">
            <canvas class="" id="mainChart" height="300"></canvas>
        </aside>
    `
};

const renderSongList = () => {
    return dataStore.songs.length > 0 ? dataStore.songs.slice(0, dataStore.songFilter).map(song => ` 
    <li class="flex flex-row justify-content-between  pl-15 pr-15 pt-15 pb-15">
        <span class="data-item-wrapper">
            <span class="block mb-5">${song.trackName}</span>
            <span class="eyebrow">${song.artistName}</span>
        </span>
        <span class="flex">
            <span class="mr-15">
                <span class="eyebrow mb-5">Count</span>
                <span>${song.count.count}</span>
            </span>
            <span>
                <span class="eyebrow mb-5">Time</span>
                <span class="time-value">${msToTime(song.count.ms)}</span>
            </span>
        </span>
    </li>`).join("") : `<li class="mt-15 flex justify-content-center">There is no data for this period</li>`;

};

const renderArtistList = () => {
    return dataStore.artists.length > 0 ? dataStore.artists.slice(0, dataStore.artistFilter).map(artist => `
        <li class="flex flex-row justify-content-between  pl-15 pr-15 pt-15 pb-15">
            <span class="flex align-items-center">
                <span>${artist.artist}</span>
            </span>
            <span class="flex">
                <span class="mr-15">
                    <span class="eyebrow mb-5">Count</span>
                    <span>${artist.count.count}</span>
                </span>
                <span>
                    <span class="eyebrow mb-5">Time</span>
                    <span class="time-value">${msToTime(artist.count.ms)}</span>
                </span>
            </span>
        </li>`
    ).join("") : `<li class="mt-15 flex justify-content-center">There is no data for this period</li>`;
};

const renderPodcastList = () => {
    return dataStore.podcasts.length > 0 ? dataStore.podcasts.slice(0, dataStore.podcastFilter).map(podcast => `
        <li class="flex flex-row justify-content-between  pl-15 pr-15 pt-15 pb-15">
            <span class="flex align-items-center">
                <span>${podcast.episode_show_name}</span>
            </span>
            <span class="flex">
                <span class="mr-15">
                    <span class="eyebrow mb-5">Count</span>
                    <span>${podcast.count.count}</span>
                </span>
                <span>
                    <span class="eyebrow mb-5">Time</span>
                    <span class="time-value">${msToTime(podcast.count.ms)}</span>
                </span>
            </span>
        </li> 
        `
    ).join("") : `<li class="mt-15 flex justify-content-center">There is no data for this period</li>`;
}

const renderMain = () => {

    return `
        <main>
            <div id="data">
                <div id="summaryData" class="summary-data-bar">
                    <ul class="flex flex-row flex-wrap pl-15 pr-15">
                        <li class="pt-15 pb-15 mr-15 summary-item">
                            <label class="eyebrow text-uppercase mb-5">Music Hours</label>
                            <span id="songHoursPlayedPlaceholder" class="summary-data-value">${dataStore.totalSongHours.toFixed(0)}</span>
                        </li>
                        <li class="pt-15 pb-15 mr-15 summary-item">
                            <label class="eyebrow text-uppercase mb-5">Unique Songs</label>
                            <span id="distincSongsPlaceholder" class="summary-data-value">${dataStore.uniqueSongCount}</span>
                        </li>
                        <li class="pt-15 pb-15 mr-15 summary-item">
                            <label class="eyebrow text-uppercase mb-5">Podcast Hours</label>
                            <span id="podcastHoursPlayedPlaceholder" class="summary-data-value">${dataStore.totalPodcastHours.toFixed(0)}</span>
                        </li>
                        <li class="pt-15 pb-15 summary-item">
                            <label class="eyebrow text-uppercase mb-5">Unique Episodes</label>
                            <span id="distinctPodcastsPlaceholder" class="summary-data-value">${dataStore.uniqueEpisodeCount}</span>
                        </li>
                    </ul>
                </div>
                <div id="songTab" class="data-tab ${appState.showTab === 'songs' ? 'active' : ''}">
                    <nav id="songFilter" class="nav pb-15">
                        <ul class="flex flex-row pl-15">
                            <li class="pill-item ${dataStore.songFilter === 10 ? 'active' : ''}" data-value="10">Top 10</li>
                            <li class="pill-item ${dataStore.songFilter === 30 ? 'active' : ''}" data-value="30">Top 30</li>
                            <li class="pill-item ${dataStore.songFilter === 50 ? 'active' : ''}" data-value="50">Top 50</li>
                        </ul>
                    </nav>
                    <ul id="songsList" class="flex flex-column scrollable-list">${renderSongList()}</ul>
                </div>
                <div id="artistTab" class="data-tab ${appState.showTab === 'artists' ? 'active' : ''}">
                    <nav id="artistFilter" class="nav">
                        <ul class="flex flex-row pl-15">
                            <li class="pill-item ${dataStore.artistFilter === 10 ? 'active' : ''}" data-value="10">Top 10</li>
                            <li class="pill-item ${dataStore.artistFilter === 30 ? 'active' : ''}" data-value="30">Top 30</li>
                            <li class="pill-item ${dataStore.artistFilter === 50 ? 'active' : ''}" data-value="50">Top 50</li>
                        </ul>
                    </nav>
                    <ul id="artistList" class="flex flex-column scrollable-list">${renderArtistList()}</ul>
                </div>    
                <div id="podcastTab" class="data-tab ${appState.showTab === 'podcasts' ? 'active' : ''}">
                    <nav id="podcastFilter" class="nav">
                        <ul class="flex flex-row pl-15">
                            <li class="pill-item ${dataStore.podcastFilter === 10 ? 'active' : ''}" data-value="10">Top 10</li>
                            <li class="pill-item ${dataStore.podcastFilter === 30 ? 'active' : ''}" data-value="30">Top 30</li>
                            <li class="pill-item ${dataStore.podcastFilter === 50 ? 'active' : ''}" data-value="50">Top 50</li>
                        </ul>
                    </nav>
                    <ul id="podcastList" class="flex flex-column scrollable-list">${renderPodcastList()}</ul>
                </div>
            </div>
        </main>
    `

};

const renderFullHeader = () => {
    return `
        <header class="ml-15 mr-15 mb-15 mt-15 flex align-items-center justify-content-between">
            <h1>WYLM</h1>
            <form id="fileInputForm">
                <label for="historyFileInput" class="btn btn-input-file">
                    <span id="labelValue">Upload files</span>
                </label>
                <input type="file" name="history-file-input" id="historyFileInput" class="invisibleInput" multiple />
            </form>
        </header>
        <div class="filter-bar-dropdown mobile-dropdown">
            <div class="filter-bar-dropdown-label">
                <input id="filterYearInput" placeholder="Lifetime" type="text" class="table-filter filter-bar-dropdown-value" value=${dataStore.filterPeriod} readonly />
                <span class="chevron">
                    <span></span>
                    <span></span>
                </span>
            </div>
            <div class="filter-bar-dropdown-content">
                <ul class="flex flex-column pt-15 pb-15 filter-bar-dropdown-content-list">${renderDropDown()}</ul>
            </div>
        </div>
        <div class="wrapper">
            ${renderSideNav()}
            ${renderMain()}
            ${renderVisuals()}
        </div>
        <nav class="nav-bottom flex flex-row justify-content-between">
            <button class="btn btn-menu"></button>
            <button class="btn btn-home"></button>
            <button class="btn btn-chart"></button>
        </nav>
    `
}


const renderCompactHeader = () => {
    
    return `
        <header class="header-compact flex flex-column align-items-center justify-content-center">
            <h1 class="mb-5">WYLM</h1>
            <h2 class="slogan mt-5 mb-30">Wrap Your Lifetime Music</h2>
            <div class="flex flex-row align-items-center flex-gap-10">
                <form class="form-without-formatting" id="fileInputForm">
                    <label for="historyFileInput" class="btn btn-input-file">
                        Upload files
                    </label>
                    <input type="file" id="historyFileInput" class="invisibleInput" multiple />
                </form>
                <button type="button" id="howItWorksBtn" class="btn">How it works</button>
            </div>
        </header>
    `

};

const renderHeader = () => {
    return appState.dbHasFiles ? renderFullHeader() : renderCompactHeader();
};

const renderHowItWorks = () => {

    return appState.showHowItWorks ? `
        <div id="howItWorksOverlay" class="overlay">
            <article class="overlay-card">
                <header class="flex justify-content-end mb-15">
                    <button id="closeOverlay" class="btn btn-close">
                        <span class="btn-close-container">
                            <span class="btn-close-bar"></span>
                            <span class="btn-close-bar"></span>
                        </span>
                    </button>
                </header>
                <section class="overlay-content">
                    <h2 class="mt-15 mb-15">How This App Works</h2>
                    <p class="mb-30">Upload your streaming history, and we'll analyze it for insights.</p>
                    <div class="video-container">
                        <video controls>
                            <source src="/tutorial.mov" type="video/mp4">
                            Your browser does not support the video tag.
                        </video>
                    </div>
                </section>
            </article>
        </div>
    `: "";

};

const attachHowItWorksEvents = () => {
    document.querySelector("#closeOverlay")?.addEventListener("click", () => {
        appState.toggleHowItWorks();
    })
}

const attachHeaderEvent = () => {
    document.querySelector("#howItWorksBtn")?.addEventListener("click", () => {
        appState.toggleHowItWorks();
    });

    document.querySelector("#historyFileInput").addEventListener("change", event => {
        const files = event.target.files;
        const label = event.target.previousElementSibling;
        
        if (!files.length) return;

        if (files.length === 1) {
            label.innerHTML = "1 file selected";
        };

        if (files.length > 1) {
            label.innerHTML = `${files.length} files selected`;
        }

        for (const file of files) {
            
            if (file.type === "application/json") {
                const reader = new FileReader();

                console.log("Checking...", file)

                reader.onload = () => {
                    try {
                        
                        const jsonData = JSON.parse(reader.result);

                        if (validateJson(jsonData, schema)) {

                            worker.postMessage({ type: "addFile", name: file.name, data: jsonData })
                        }
                    } catch (error) {
                        console.error(`Error parsing JSON for file "${file.name}":`, error);
                    }
                    
                }
                reader.readAsText(file);
            }
        }
    });
};

const renderView = () => {

    const container = document.querySelector("#appContainer");

    container.innerHTML = `
        ${renderHeader()}
        ${renderHowItWorks()}
    `

    attachHeaderEvent();
    attachHowItWorksEvents();
    attachSideNavEvents();
    attachMainEvents();
};

const main = () => {

    if (window.Worker) {

        worker = new Worker("worker.js");

        worker.postMessage( { type: "checkData"});

        // Worker communication
        worker.onmessage = (event) => {

            const { status, results, message } = event.data;

            if (
                status === "fileCountCheck" || 
                status === "aggregationComplete" 
            ) {
                appState.setDbHasFiles(results);
                if (results) worker.postMessage({ type: "fetchKeys" });
            };

            if (status === "aggregatedData") {
                dataStore.setSongsList(results.rankedSongs);
                dataStore.setArtistsList(results.topArtists);
                dataStore.setPodcastsList(results.topPodcasts);
                dataStore.setFilterPeriod(results.year);
                dataStore.setTotalSongHours(results.totalSongHoursPlayed);
                dataStore.setUniqueSongCount(results.distinctSongs);
                dataStore.setTotalPodcastHours(results.totalPodcastHoursPlayed);
                dataStore.setUniqueEpisodeCount(results.distinctPodcasts);
                dataStore.setLifetimeChart(results.years);
                dataStore.setAnnualChart(results.months);
                fillChart();
            }

            if (status === "fileAdded") {
                worker.postMessage({ type: "checkAndAggregateFiles"});
            };

            if (status === "keysFetched") {
                dataStore.setDropDownList(results);
                worker.postMessage({ type: "fetchAggregatedData", filter: dataStore.filterPeriod });
            }
        };

        worker.onerror = (error) => {
            console.error("Worker error: ", error.message);
        };
    } else {
        console.log("Your browser doens't support Web Workers")
    }

    renderView();

    appState.subscribe(renderView);
    dataStore.subscribe(renderView);
    
};

main();