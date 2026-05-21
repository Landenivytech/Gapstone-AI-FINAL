const songs = [
    { title: "Stairway to Heaven", artist: "Led Zeppelin", listens: 4200000 },
    { title: "Bohemian Rhapsody", artist: "Queen", listens: 3800000 },
    { title: "Hotel California", artist: "Eagles", listens: 3500000 },
    { title: "Sweet Child o' Mine", artist: "Guns N' Roses", listens: 3100000 },
    { title: "Smells Like Teen Spirit", artist: "Nirvana", listens: 2900000 },
    { title: "Black", artist: "Pearl Jam", listens: 2700000 },
    { title: "Wonderwall", artist: "Oasis", listens: 2500000 },
    { title: "Paranoid Android", artist: "Radiohead", listens: 2300000 },
    { title: "Comfortably Numb", artist: "Pink Floyd", listens: 2100000 },
    { title: "Another One Bites the Dust", artist: "Queen", listens: 1900000 }
];

let currentData = [...songs];
let loadedData = [];
let editingInfoIndex = null;

const MAX_LISTENS = 10000000; // 10 million max listens

function formatListens(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num;
}

function getRankClass(rank) {
    if (rank === 1) return "rank top1";
    if (rank === 2) return "rank top2";
    if (rank === 3) return "rank top3";
    return "rank";
}

async function getImportedData() {
    let dbData = [];
    let localData = [];

    // Try to get from database
    try {
        const response = await fetch('songs.php');
        if (response.ok) {
            dbData = await response.json();
            console.log('✅ Loaded data from database:', dbData.length, 'songs');
        } else {
            throw new Error(`Database fetch failed: ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Database fetch failed:', error);
    }

    // Always get from localStorage
    try {
        const savedData = localStorage.getItem("importedData");
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            let saveBack = false;
            localData = parsedData.map((song, index) => {
                if (!song.id) {
                    saveBack = true;
                    return {
                        ...song,
                        id: `local-${Date.now()}-${index}`
                    };
                }
                return song;
            });
            if (saveBack) {
                localStorage.setItem("importedData", JSON.stringify(localData));
            }
            console.log('Loaded data from localStorage:', localData.length, 'songs');
        }
    } catch (parseError) {
        console.error('Failed to parse localStorage data:', parseError);
    }

    // Merge data: database takes precedence for duplicates (by title+artist)
    const mergedData = [...dbData];
    const dbKeys = new Set(dbData.map(song => `${song.title}-${song.artist}`));

    for (const song of localData) {
        const key = `${song.title}-${song.artist}`;
        if (!dbKeys.has(key)) {
            mergedData.push(song);
        }
    }

    console.log('Total merged data:', mergedData.length, 'songs');
    return mergedData;
}

async function saveImportedData(data) {
    // Always try to save to database first
    try {
        const response = await fetch('songs.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songs: data })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Database save failed: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
        }

        const result = await response.json();
        console.log('✅ Successfully saved to database:', result);
        return result;
    } catch (error) {
        console.error('❌ Database save failed:', error);

        // Show user-friendly error message
        alert(`Failed to save to database: ${error.message}\n\nPlease make sure the server is running and try again.`);

        // Re-throw error so calling function knows it failed
        throw error;
    }
}

async function addImportedSongs(newSongs) {
    return await saveImportedData(newSongs);
}

async function clearImportedData() {
    // Always try to clear from database first
    try {
        const response = await fetch('songs.php', { method: 'DELETE' });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Database clear failed: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
        }

        const result = await response.json();
        console.log('✅ Successfully cleared database:', result);

        // Also clear localStorage as backup
        localStorage.removeItem("importedData");
        return result;
    } catch (error) {
        console.error('❌ Database clear failed:', error);

        // Only clear localStorage if database clear failed
        console.log('⚠️ Clearing localStorage instead...');
        localStorage.removeItem("importedData");
        return { message: 'Cleared localStorage (database clear failed)' };
    }
}

async function getStats() {
    // Always try to get stats from database first
    try {
        const response = await fetch('stats.php');
        if (!response.ok) {
            throw new Error(`Database stats failed: ${response.status} ${response.statusText}`);
        }
        const stats = await response.json();
        console.log('✅ Loaded stats from database:', stats);
        return stats;
    } catch (error) {
        console.error('❌ Database stats failed:', error);

        // Fall back to calculating from localStorage data
        console.log('⚠️ Calculating stats from localStorage...');
        try {
            const data = await getImportedData();
            const stats = {
                totalSongs: data.length,
                totalListens: data.reduce((sum, song) => sum + Number(song.listens), 0),
                avgListens: data.length > 0 ? Math.round(data.reduce((sum, song) => sum + Number(song.listens), 0) / data.length) : 0
            };
            console.log('Calculated stats from localStorage:', stats);
            return stats;
        } catch (calcError) {
            console.error('Failed to calculate stats:', calcError);
            return { totalSongs: 0, totalListens: 0, avgListens: 0 };
        }
    }
}

function renderTable() {
    const tbody = document.getElementById("leaderboardBody");
    const noResults = document.getElementById("noResults");

    if (!tbody) return;

    if (currentData.length === 0) {
        tbody.innerHTML = "";
        noResults.style.display = "block";
        return;
    }

    noResults.style.display = "none";
    tbody.innerHTML = currentData.map((song, index) => `
        <tr>
            <td class="${getRankClass(index + 1)}">${index + 1}</td>
            <td class="song-title">${song.title}${song.description ? `<br><small style="color: #666;">${song.description}</small>` : ''}</td>
            <td class="artist">${song.artist}</td>
            <td class="listens">${formatListens(song.listens)}</td>
        </tr>
    `).join("");
}

const searchInput = document.getElementById("searchInput");
if (searchInput) {
    searchInput.addEventListener("keyup", function() {
        const searchTerm = this.value.toLowerCase();
        currentData = songs.filter(song =>
            song.title.toLowerCase().includes(searchTerm) ||
            song.artist.toLowerCase().includes(searchTerm)
        );
        currentData.sort((a, b) => b.listens - a.listens);
        renderTable();
    });
}

function resetSearch() {
    const searchElement = document.getElementById("searchInput");
    if (!searchElement) return;
    searchElement.value = "";
    currentData = [...songs];
    renderTable();
}

function sortTable(field) {
    if (field === "listens") {
        currentData.sort((a, b) => b.listens - a.listens);
    } else if (field === "title") {
        currentData.sort((a, b) => a.title.localeCompare(b.title));
    } else if (field === "artist") {
        currentData.sort((a, b) => a.artist.localeCompare(b.artist));
    }
    renderTable();
}

async function loadImportedData() {
    const importedData = await getImportedData();
    if (importedData.length > 0) {
        songs.length = 0;
        songs.push(...importedData);
        currentData = [...songs];
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const leaderboardBody = document.getElementById("leaderboardBody");
    const dataInfo = document.getElementById("dataInfo");

    if (leaderboardBody) {
        await loadImportedData();
        currentData = [...songs];
        renderTable();
    }

    if (dataInfo) {
        displayDataInfo();
    }
});

let tempSongs = [];

function addSong() {
    const title = document.getElementById("songTitle").value.trim();
    const artist = document.getElementById("artistName").value.trim();
    const listens = document.getElementById("listensCount").value.trim();
    const description = document.getElementById("songDescription").value.trim();

    if (!title) {
        alert("Please enter a song title");
        return;
    }
    if (!artist) {
        alert("Please enter an artist name");
        return;
    }
    if (!listens || isNaN(listens) || listens <= 0) {
        alert("Please enter a valid number of listens");
        return;
    }

    const listensNum = parseInt(listens);
    if (listensNum > MAX_LISTENS) {
        alert(`Maximum listens allowed is ${MAX_LISTENS.toLocaleString()}. Please enter a lower number.`);
        return;
    }

    const song = {
        title: title,
        artist: artist,
        listens: listensNum,
        description: description || ""
    };

    tempSongs.push(song);
    displaySongsList();

    document.getElementById("songTitle").value = "";
    document.getElementById("artistName").value = "";
    document.getElementById("listensCount").value = "";
    document.getElementById("songDescription").value = "";
    document.getElementById("songTitle").focus();
}

function displaySongsList() {
    const songsList = document.getElementById("songsList");
    if (!songsList) return;

    if (tempSongs.length === 0) {
        songsList.innerHTML = "";
        return;
    }

    let html = `<h3>Songs to Import (${tempSongs.length}):</h3><div class="temp-songs">`;

    tempSongs.forEach((song, index) => {
        html += `
            <div class="temp-song-item">
                <div><strong>${index + 1}. ${song.title}</strong></div>
                <div>Artist: ${song.artist}</div>
                <div>Listens: ${song.listens.toLocaleString()}</div>
                ${song.description ? `<div>Description: ${song.description}</div>` : ''}
                <button onclick="removeSong(${index})" class="remove-btn">Remove</button>
            </div>
        `;
    });

    html += `</div>`;
    songsList.innerHTML = html;
}

function removeSong(index) {
    tempSongs.splice(index, 1);
    displaySongsList();
}

function ensureLocalSongId(song, fallbackIndex) {
    return {
        ...song,
        id: song.id || `local-${Date.now()}-${fallbackIndex}`
    };
}

function saveSongsLocally(songsToSave) {
    const existingData = JSON.parse(localStorage.getItem("importedData") || "[]");
    const normalizedExisting = existingData.map((song, index) => ensureLocalSongId(song, index));
    const newData = [
        ...normalizedExisting,
        ...songsToSave.map((song, index) => ensureLocalSongId(song, index + normalizedExisting.length))
    ];
    localStorage.setItem("importedData", JSON.stringify(newData));

    songs.length = 0;
    songs.push(...newData);
    currentData = [...songs];
    console.log('✅ Saved locally:', songsToSave.length, 'songs');
}

async function importAllSongs() {
    if (tempSongs.length === 0) {
        alert("Please add at least one song before importing");
        return;
    }

    const songsCount = tempSongs.length;
    const saveToDatabase = document.getElementById("saveToDatabase").checked;

    // Show loading message
    const importBtn = document.querySelector('.import-btn');
    const originalText = importBtn.textContent;
    importBtn.textContent = 'Importing...';
    importBtn.disabled = true;

    try {
        console.log('🚀 Starting import of', songsCount, 'songs...');

        if (saveToDatabase) {
            try {
                const result = await addImportedSongs(tempSongs);
                console.log('✅ Import successful:', result);
                alert(`✅ Successfully imported ${songsCount} songs to database!\n\nYou can now view them on the info page.`);
                tempSongs = [];
                displaySongsList();
                window.location.href = "info.html";
                return;
            } catch (dbError) {
                const saveLocal = confirm('Database save failed. Save songs locally instead?');
                if (saveLocal) {
                    saveSongsLocally(tempSongs);
                    alert(`✅ Saved ${songsCount} songs locally. You can view them on the leaderboard.`);
                    tempSongs = [];
                    displaySongsList();
                    window.location.href = "leaderboard.html";
                    return;
                }
                throw dbError;
            }
        }

        saveSongsLocally(tempSongs);
        alert(`✅ Successfully saved ${songsCount} songs locally!\n\nYou can now view them on the leaderboard.`);
        tempSongs = [];
        displaySongsList();
        window.location.href = "leaderboard.html";

    } catch (error) {
        console.error('❌ Import failed:', error);
        alert(`❌ Failed to import songs:\n\n${error.message}\n\nPlease make sure the server is running and try again.`);
    } finally {
        // Reset button
        importBtn.textContent = originalText;
        importBtn.disabled = false;
    }
}

function clearAllFields() {
    if (confirm("Are you sure you want to clear all songs and input fields?")) {
        document.getElementById("songTitle").value = "";
        document.getElementById("artistName").value = "";
        document.getElementById("listensCount").value = "";
        document.getElementById("songDescription").value = "";
        tempSongs = [];
        displaySongsList();
    }
}

async function displayDataInfo() {
    const dataInfoDiv = document.getElementById("dataInfo");
    if (!dataInfoDiv) return;

    try {
        const [data, stats] = await Promise.all([getImportedData(), getStats()]);
        loadedData = data;

        if (data.length === 0) {
            editingInfoIndex = null;
            dataInfoDiv.innerHTML = "<p style='text-align: center; color: #999;'>No imported data yet. <a href='import.html'>Go to Import</a></p>";
            return;
        }

        let html = `
            <div class="data-stats">
                <p><strong>Total Songs:</strong> ${stats.totalSongs}</p>
                <p><strong>Total Listens:</strong> ${stats.totalListens.toLocaleString()}</p>
                <p><strong>Average Listens:</strong> ${stats.avgListens.toLocaleString()}</p>
            </div>
            <h3>Imported Songs:</h3>
            <table class="info-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Song Title</th>
                        <th>Artist</th>
                        <th>Description</th>
                        <th>Listens</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach((song, index) => {
            if (editingInfoIndex === index) {
                html += `
                    <tr class="editing-row">
                        <td>${index + 1}</td>
                        <td><input id="edit-title-${index}" type="text" value="${song.title.replace(/"/g, '&quot;')}" /></td>
                        <td><input id="edit-artist-${index}" type="text" value="${song.artist.replace(/"/g, '&quot;')}" /></td>
                        <td><input id="edit-description-${index}" type="text" value="${(song.description || '').replace(/"/g, '&quot;')}" /></td>
                        <td><input id="edit-listens-${index}" type="number" min="0" max="10000000" value="${Number(song.listens)}" /></td>
                        <td>
                            <button type="button" onclick="saveEditedSong(${index})" class="save-btn">Save</button>
                            <button type="button" onclick="cancelEditSong()" class="cancel-btn">Cancel</button>
                        </td>
                    </tr>
                `;
            } else {
                html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${song.title}</td>
                        <td>${song.artist}</td>
                        <td>${song.description || 'N/A'}</td>
                        <td>${Number(song.listens).toLocaleString()}</td>
                        <td>
                            <button type="button" onclick="startEditSong(${index})" class="edit-btn">Edit</button>
                            <button type="button" onclick="deleteSong(${index})" class="delete-btn">Delete</button>
                        </td>
                    </tr>
                `;
            }
        });

        html += `
                </tbody>
            </table>
        `;
        dataInfoDiv.innerHTML = html;
    } catch (error) {
        dataInfoDiv.innerHTML = "<p style='color: red;'>Error loading data. Please try again.</p>";
    }
}

function startEditSong(index) {
    editingInfoIndex = index;
    displayDataInfo();
}

function cancelEditSong() {
    editingInfoIndex = null;
    displayDataInfo();
}

async function updateSong(songId, updatedFields) {
    const response = await fetch('songs.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Update failed with status ${response.status}`);
    }

    return await response.json();
}

async function saveEditedSong(index) {
    const song = loadedData[index];
    if (!song) {
        alert('Unable to save: song not found');
        return;
    }

    const title = document.getElementById(`edit-title-${index}`).value.trim();
    const artist = document.getElementById(`edit-artist-${index}`).value.trim();
    const listensValue = document.getElementById(`edit-listens-${index}`).value.trim();
    const description = document.getElementById(`edit-description-${index}`).value.trim();

    if (!title) {
        alert('Please enter a song title');
        return;
    }
    if (!artist) {
        alert('Please enter an artist name');
        return;
    }
    const listens = parseInt(listensValue, 10);
    if (isNaN(listens) || listens < 0 || listens > MAX_LISTENS) {
        alert('Please enter a valid listens count between 0 and ' + MAX_LISTENS.toLocaleString());
        return;
    }

    const updatedSong = {
        title,
        artist,
        listens,
        description: description || ''
    };

    try {
        if (song.id && song.id.toString().startsWith('local-')) {
            const localData = JSON.parse(localStorage.getItem('importedData') || '[]');
            const updatedLocal = localData.map(item => {
                if (item.id === song.id) {
                    return {
                        ...item,
                        ...updatedSong,
                        id: song.id
                    };
                }
                return item;
            });
            localStorage.setItem('importedData', JSON.stringify(updatedLocal));
            alert('✅ Local song updated successfully.');
        } else {
            await updateSong(song.id, updatedSong);
            alert('✅ Song updated successfully in the database.');
        }
        editingInfoIndex = null;
        await displayDataInfo();
    } catch (error) {
        console.error('❌ Failed to save edit:', error);
        alert(`❌ Could not save changes: ${error.message}`);
    }
}

async function deleteSong(index) {
    const song = loadedData[index];
    if (!song) {
        alert('Unable to delete: song not found');
        return;
    }

    if (!confirm(`Are you sure you want to delete "${song.title}" by ${song.artist}? This cannot be undone.`)) {
        return;
    }

    try {
        if (song.id && song.id.toString().startsWith('local-')) {
            const localData = JSON.parse(localStorage.getItem('importedData') || '[]');
            const updatedLocal = localData.filter(item => item.id !== song.id);
            localStorage.setItem('importedData', JSON.stringify(updatedLocal));
            alert('✅ Local song deleted successfully.');
        } else {
            const response = await fetch('songs.php', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: song.id })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Delete failed with status ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Delete failed');
            }
            alert('✅ Song deleted successfully from the database.');
        }

        await displayDataInfo();
    } catch (error) {
        console.error('❌ Failed to delete song:', error);
        alert(`❌ Could not delete song: ${error.message}`);
    }
}

async function clearData() {
    if (confirm("⚠️ Are you sure you want to clear ALL imported songs from the database?\n\nThis will also clear local storage data.\n\nThis action cannot be undone!")) {
        try {
            console.log('🗑️ Clearing all data from database...');
            const result = await clearImportedData();
            await displayDataInfo();
            console.log('✅ Database cleared:', result);

            // Also clear localStorage
            localStorage.removeItem("importedData");
            console.log('✅ LocalStorage cleared');

            alert("✅ All songs have been cleared from database and local storage!");
        } catch (error) {
            console.error('❌ Failed to clear database:', error);
            alert(`❌ Failed to clear data from database:\n\n${error.message}\n\nPlease make sure the server is running.`);
        }
    }
}

if (document.getElementById("dataInfo")) {
    displayDataInfo();
}
