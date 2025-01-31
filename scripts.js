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

const fileForm        = document.querySelector("#fileInputForm");
const fileInput       = fileForm.querySelector("#historyFileInput");
const messageDiv      = document.querySelector("#message");
const dataDiv         = document.querySelector("#data");
const notificationDiv = document.querySelector("#notification");
const filter          = document.querySelector(".filter-bar-dropdown");
const filterField     = document.querySelector("#filterYearInput");
const dropDown        = document.querySelector(".filter-bar-dropdown-content")
const list            = document.querySelector(".filter-bar-dropdown-content-list");
const navItems        = document.querySelectorAll(".aside-nav .nav-item");
const dataTabs        = document.querySelectorAll(".data-tab");
const songFilter      = document.querySelector("#songFilter");
const artistFilter    = document.querySelector("#artistFilter");
const podcastFilter   = document.querySelector("#podcastFilter");

// const lifetimeChart   = document.querySelector("#lifetimeChart");
// const annualChart     = document.querySelector("#anualChart");

let chartInstance; 
let worker;

let dataStore = {
    songFilter: 10,
    artistFilter: 10,
    podcastFilter: 10,
    songs: [],
    artists: [],
    podcasts: [],
    lifetimeChart: {},
    annualChart: {}
};

//fill dropdown list 
const fillDropdownList = (item) => {

    const listItem = document.createElement("li");
    listItem.className = "filter-list-item-option";
    listItem.textContent = item;
    list.append(listItem);

};

//Shows/hides dropdown list 
const toggleFilterDropdown = (event) => {
    let parent = event.target.parentNode
    parent.classList.toggle("active");
};

//Shows value from dropdown list in the sybling input field
const showItem = (event) => {

    let listText                = event.target.innerText;
    let dropdownInputField      = event.target.offsetParent.previousElementSibling.firstElementChild; 
    let parent                  = event.target.parentElement.parentElement.parentElement;
    dropdownInputField.value    = listText;

    if (event.target.dataset.value && dropdownInputField.dataset.value) {
        dropdownInputField.dataset.value = event.target.dataset.value
    }

    dropdownInputField.dispatchEvent(new Event("change"));
    parent.classList.toggle("active");
};

const clearActiveTabs = () => {
    dataTabs.forEach(tab => tab.classList.remove("active"));
}

navItems.forEach((navItem, index) => {
    navItem.addEventListener("click", function () {
        // Clear active state from all tabs
        clearActiveTabs();

        // Add 'active' class to the corresponding data-tab
        if (dataTabs[index]) {
            dataTabs[index].classList.add("active");
        }

        // Optionally highlight the active nav-item
        navItems.forEach(item => item.classList.remove("active"));
        navItem.classList.add("active");
    });
});

const doSomething = () => worker.postMessage({type: "fetchAggregatedData", filter: filterField.value });
const updateFilter = (navId, filterName, event) => {

    const target = event.target;

    if (target.classList.contains("pill-item")) {
        
        const pillItems = document.querySelectorAll(`${navId} .pill-item`);
        
        pillItems.forEach(item => item.classList.remove("active"));

        target.classList.add("active");

        const filterValue = parseInt(target.getAttribute("data-value"), 10);

        dataStore[filterName] = filterValue;

        updateLists();

        console.log(`${filterName} updated to: `, filterValue);
        console.log('Updated dataStore:', dataStore);

    }

};

filter.addEventListener("click", toggleFilterDropdown, false);
list.addEventListener("click", showItem, false);
filterField.addEventListener("change", doSomething, false);
songFilter.addEventListener("click", event => { updateFilter("#songFilter", "songFilter", event) });
artistFilter.addEventListener("click", event => { updateFilter("#artistFilter", "artistFilter", event)});
podcastFilter.addEventListener("click", event => { updateFilter("#podcastFilter", "podcastFilter", event)});

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

const updateLists = () => {
    const songsList = document.querySelector("#songsList");
    const artstList = document.querySelector("#artistList");
    const podcastList = document.querySelector("#podcastList");

    songsList.innerHTML = "";
    artstList.innerHTML = "";
    podcastList.innerHTML = "";

    dataStore.songs.slice(0, dataStore.songFilter).map(item => { 
        const listItem = document.createElement("li");
        listItem.className = "flex flex-row justify-content-between pl-15 pr-15 pt-15 pb-15";
        listItem.innerHTML = `
            <span class="data-item-wrapper">
                <span class="block mb-5">${item.trackName}</span>
                <span class="eyebrow">${item.artistName}</span>
            </span>
            <span class="flex">
                <span class="mr-15">
                    <span class="eyebrow mb-5">Count</span>
                    <span>${item.count.count}</span>
                </span>
                <span>
                    <span class="eyebrow mb-5">Time</span>
                    <span class="time-value">${msToTime(item.count.ms)}</span>
                </span>
            </span>
        `;
        songsList.append(listItem);
    });
    
    dataStore.artists.slice(0, dataStore.artistFilter).map(item => {
        const listItem = document.createElement("li");
        listItem.className = "flex flex-row justify-content-between pl-15 pr-15 pt-15 pb-15";
        listItem.innerHTML = `
            <span class="data-item-wrapper">
                <span class="block">${item.artist}</span>
            </span>
            <span class="flex">
                <span class="mr-15">
                    <span class="eyebrow mb-5">Count</span>
                    <span>${item.count.count}</span>
                </span>
                <span class="mr-15">
                    <span class="eyebrow mb-5">Time</span>
                    <span class="time-value">${msToTime(item.count.ms)}</span>
                </span>
            <span>
        `;
        artstList.append(listItem);
    });

    dataStore.podcasts.slice(0, dataStore.podcastFilter).map(item => {
        const listItem = document.createElement("li");
        listItem.className = "flex flex-row justify-content-between pl-15 pr-15 pt-15 pb-15";
        listItem.innerHTML = `
            <span class="data-item-wrapper">
                <span class="block">${item.episode_show_name}</span>
            </span>
            <span class="flex">
                <span class="mr-15">
                    <span class="eyebrow mb-5">Count</span>
                    <span>${item.count.count}</span>
                </span>
                <span class="mr-15">
                    <span class="eyebrow mb-5">Time</span>
                    <span class="time-value">${msToTime(item.count.ms)}</span>
                </span>
            <span>
        `;
        podcastList.append(listItem);
    })

}

const fillSummaryData = object => {
    document.querySelector("#songHoursPlayedPlaceholder").innerHTML = object.totalSongHours.toFixed(0);
    document.querySelector("#distincSongsPlaceholder").innerHTML = object.distinctSongs;
    document.querySelector("#podcastHoursPlayedPlaceholder").innerHTML = object.totalPodcastHours.toFixed(0);
    document.querySelector("#distinctPodcastsPlaceholder").innerHTML = object.distinctPodcasts;
};

const fillChart = () => {

    const canvas = document.querySelector("#mainChart");
    const ctx    = canvas.getContext("2d");

    let labels = [];
    let data = [];
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
    } else if (Object.keys(dataStore.annualChart).length > 0) {
        const keys = Object.keys(dataStore.annualChart);
        console.log(keys)
        data = keys.map(key => dataStore.annualChart[key].totalSongHoursPlayed.toFixed(0))
        labels = keys.map(key => Map[key]);
    }

    if (chartInstance) {
        chartInstance.data.labels = labels; 
        chartInstance.data.datasets[0].data = data;
        chartInstance.update()
    } else {
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
                //color: 'black', 
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

};

const fillDataStore = object => {
    dataStore.songs = object.songs;
    dataStore.artists = object.artists;
    dataStore.podcasts = object.podcasts;
    dataStore.lifetimeChart = object.years;
    dataStore.annualChart = object.months;

    updateLists();
    fillChart();
    console.log("DATA STORE:", dataStore)
};

const main = () => {

    if (window.Worker) {
        worker = new Worker("worker.js");

        worker.postMessage({ type: "fetchKeys" });

        fileInput.addEventListener("change", (event) => {
            const files = event.target.files;
            const label = fileInput.previousElementSibling;
            messageDiv.innerHTML = "";

            if (files && files.length == 1) {
                label.querySelector("#labelValue").innerHTML = files[0].name;
            }

            if (files && files.length > 1) {
                label.querySelector("#labelValue").innerHTML = `${files.length} files selected`;
            }
        
            for (const file of files) {
                if (file.type === "application/json") {
                    const reader = new FileReader();
        
                    reader.onload = () => {
                        try {
                            const jsonData = JSON.parse(reader.result);
        
                            if (validateJson(jsonData, schema)) {
                                // Send valid data to the Web Worker
                                worker.postMessage({ type: "addFile", name: file.name, data: jsonData });
                                messageDiv.innerHTML += `<p>File "${file.name}" is valid and sent to worker.</p>`;
                            } else {
                                messageDiv.innerHTML += `<p>File "${file.name}" does not match schema and was rejected.</p>`;
                            }
                        } catch (error) {
                            console.error(`Error parsing JSON for file "${file.name}":`, error);
                            messageDiv.innerHTML += `<p>File "${file.name}" is not a valid JSON file and was rejected.</p>`;
                        }
                    };
        
                    reader.readAsText(file);
                } else {
                    messageDiv.innerHTML += `<p>File "${file.name}" is not a JSON file and was rejected.</p>`;
                }
            }

            worker.postMessage({ type: "allFilesAdded"});
        });

        // Worker communication
        worker.onmessage = (event) => {

            const { status, results, message } = event.data;

            console.log("STATUS:", status, results, message);

            if (status === "keysFetched") {
                results.map(item => fillDropdownList(item));
                filterField.value = "Lifetime";
                filterField.dispatchEvent(new Event("change"));
            }

            if (status === "aggregatedData") {
                fillSummaryData({
                    totalSongHours: results.totalSongHoursPlayed, 
                    distinctSongs: results.distinctSongs,
                    totalPodcastHours: results.totalPodcastHoursPlayed,
                    distinctPodcasts: results.distinctPodcasts
                });
                fillDataStore({
                    songs: results.rankedSongs, 
                    artists: results.topArtists, 
                    podcasts: results.topPodcasts,
                    years: results.years || {}, 
                    months: results.months || {}
                });
            };

            if (status === "noAggregatedData") {
                worker.postMessage({ type: "checkAndAggregateFiles" });
            };

            if (status === "aggregationComplete") {
               worker.postMessage({ type: "fetchKeys" });
            };

            if (status === "error") {
                messageDiv.innerHTML += `<p>Error: ${message}</p>`;
            } 
            
            if (status === "fileAdded") {
                messageDiv.innerHTML += `<p>File "${event.data.file}" added successfully.</p>`;
            };
        }
    } else {
        notificationDiv.innerHTML = `<p>Your browser doens't support Web Workers</p>`
        console.log("Your browser doens't support Web Workers")
    }
    
};

main();