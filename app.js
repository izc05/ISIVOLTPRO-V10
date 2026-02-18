let db;
document.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    checkAuth();
});

async function initDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open('IsiVoltProDB', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('materials')) db.createObjectStore('materials', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('staff')) db.createObjectStore('staff', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('movements')) db.createObjectStore('movements', { autoIncrement: true });
        };
        request.onsuccess = () => { db = request.result; resolve(db); loadDashboard(); };
    });
}

function checkAuth() {
    if (localStorage.getItem('isLoggedIn') === 'true') {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
    }
}

function login() {
    const pin = document.getElementById('pinInput').value;
    if (pin === '1234') {
        localStorage.setItem('isLoggedIn', 'true');
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        loadDashboard();
    } else {
        alert('PIN incorrecto');
    }
}

function showSection(id) {
    ['dashboard', 'scannerSection', 'addMaterialSection', 'addStaffSection', 'historySection'].forEach(s => {
        document.getElementById(s).classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
    if (id === 'dashboard') loadDashboard();
}

async function loadDashboard() {
    const materials = await getAllMaterials();
    const staff = await getAllStaff();
    document.getElementById('totalMaterials').textContent = materials.length;
    document.getElementById('availableMaterials').textContent = materials.filter(m => !m.inUse).length;
    document.getElementById('inUseMaterials').textContent = materials.filter(m => m.inUse).length;
    document.getElementById('totalStaff').textContent = staff.length;
    
    const list = document.getElementById('materialsList');
    list.innerHTML = materials.map(m => `
        <div class="p-3 border-b dark:border-gray-600">
            <p class="font-bold">${m.name}</p>
            <p class="text-sm text-gray-500">${m.code} - ${m.inUse ? '🔧 En Uso' : '✅ Disponible'}</p>
        </div>
    `).join('');
}

document.getElementById('materialForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addMaterial({
        id: Date.now().toString(),
        name: document.getElementById('materialName').value,
        code: document.getElementById('materialCode').value,
        category: document.getElementById('materialCategory').value,
        inUse: false
    });
    alert('✅ Guardado');
    e.target.reset();
    showSection('dashboard');
});

document.getElementById('staffForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addStaff({
        id: Date.now().toString(),
        name: document.getElementById('staffName').value,
        code: document.getElementById('staffCode').value
    });
    alert('✅ Guardado');
    e.target.reset();
    showSection('dashboard');
});

// IndexedDB Functions
function addMaterial(data) {
    return new Promise((resolve) => {
        const tx = db.transaction('materials', 'readwrite');
        tx.objectStore('materials').add(data);
        tx.oncomplete = resolve;
    });
}

function getAllMaterials() {
    return new Promise((resolve) => {
        const tx = db.transaction('materials', 'readonly');
        const req = tx.objectStore('materials').getAll();
        req.onsuccess = () => resolve(req.result);
    });
}

function addStaff(data) {
    return new Promise((resolve) => {
        const tx = db.transaction('staff', 'readwrite');
        tx.objectStore('staff').add(data);
        tx.oncomplete = resolve;
    });
}

function getAllStaff() {
    return new Promise((resolve) => {
        const tx = db.transaction('staff', 'readonly');
        const req = tx.objectStore('staff').getAll();
        req.onsuccess = () => resolve(req.result);
    });
}

// Scanner
let scanner;
function startScanner() {
    scanner = new Html5Qrcode('reader');
    scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (text) => {
        alert('QR: ' + text);
        stopScanner();
    });
    document.querySelector('button[onclick="startScanner()"]').classList.add('hidden');
    document.querySelector('button[onclick="stopScanner()"]').classList.remove('hidden');
}

function stopScanner() {
    if (scanner) { scanner.stop(); }
    document.querySelector('button[onclick="startScanner()"]').classList.remove('hidden');
    document.querySelector('button[onclick="stopScanner()"]').classList.add('hidden');
}
