"use strict"
const worker = new Worker("worker.js");
const schema = {
    ts: "string",
    platform: "string",
    ms_played: "number",
    conn_country: "string",
    ip_addr: "string",
    master_metadata_track_name: "string",
    master_metadata_album_artist_name: "string",
    master_metadata_album_album_name: "string",
    spotify_track_uri: "string",
    episode_name: "string",
    episode_show_name: "string",
    spotify_episode_uri: "string",
    reason_start: "string",
    reason_end: "string",
    shuffle: "boolean",
    skipped: "boolean",
    offline: "boolean",
    offline_timestamp: "string",
    incognito_mode: "boolean",
};

const documentBody = document.body
const fileForm = documentBody.querySelector("#fileInputForm");
const fileInput = fileForm.querySelector("#historyFileInput");
const messageDiv = fileForm.querySelector("#message");

const validateJSON = (data, schema) => {
    for (const key in schema) {
        const expectedType = schema[key];
        const actualValue = data[key];

        if (actualValue === null) continue; // Allow null for optional fields
        if (typeof actualValue !== expectedType) {
            return false;
        }
    }
    return true;
}

fileInput.addEventListener("change", (event) => {

    const files = event.target.files;
    messageDiv.innerHTML = "";


    for (const file of files) {

        if (file.type === "application/json") {

            const reader = new FileReader();

            console.log(file);

            reader.onload = () => {
                try {
                    const jsonData = JSON.parse(reader.result);

                    if (validateJson(jsonData, schema)) {
                        // Send valid data to the Web Worker
                        worker.postMessage({ name: file.name, data: jsonData });
                        messageDiv.innerHTML += `<p>File "${file.name}" is valid and sent to worker.</p>`;
                    } else {
                        messageDiv.innerHTML += `<p>File "${file.name}" does not match schema and was rejected.</p>`;
                    }
                } catch (error) {
                    messageDiv.innerHTML += `<p>File "${file.name}" is not a valid JSON file and was rejected.</p>`;
                }
            };

            reader.readAsText(file);
        } else {
            messageDiv.innerHTML += <p>File "${file.name}" is not a JSON file and was rejected.</p>;
        }
    };
        

});
    


worker.onmessage = (event) => {
    console.log("Main thread received message", event.data);
}

