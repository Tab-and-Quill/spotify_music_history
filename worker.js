const request = indexedDB.open("FileDatabase", 1);

let db;

request.onupgradeneeded = (event) => {
    db = event.target.result;

    if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "name" });
    }
};

request.onsuccess = (event) => {
    db = event.target.result;
    console.log("Database initialized.");
};

request.onerror = (event) => {
    console.error("Database error:", event.target.errorCode);
};

self.onmessage = (event) => {
    const { name, data } = event.data;

    if (db) {
        const transaction = db.transaction("files", "readwrite");
        const objectStore = transaction.objectStore("files");

        const fileEntry = { name, data };

        const request = objectStore.add(fileEntry);

        request.onsuccess = () => {
            console.log(`File "${name}" added to IndexedDB.`);
            self.postMessage({ status: "success", file: name });
        };

        request.onerror = (event) => {
            console.error(`Failed to add file "${name}" to IndexedDB:`, event.target.error);
            self.postMessage({ status: "error", file: name });
        };
    } else {
        console.error("Database is not initialized.");
        self.postMessage({ status: "error", file: name });
    }
};
