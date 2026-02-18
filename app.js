// IsiVoltPro - app.js CORREGIDO
console.log('IsiVoltPro cargado correctamente');

let db;
let scanner = null;

// Inicializar cuando cargue la página
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM cargado');
    initDB();
    checkAuth();
    setupEventListeners();
});

// Inicializar Base de Datos
function initDB() {
    const request = indexedDB.open('IsiVoltProDB', 1);
    
    request.onerror = function() {
        console.error('Error al abrir BD');
    };
    
    request.onupgradeneeded = function(event) {
        db = event.target.result;
        
        if (!db.objectStoreNames.contains('materials')) {
            db.createObjectStore('materials', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('staff')) {
            db.createObjectStore('staff', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('movements')) {
            db.createObjectStore('movements', { autoIncrement: true });
        }
    };
    
    request.onsuccess = function(event) {
        db = event.target.result;
        console.log('BD inicializada');
        loadDashboard();
    };
}

// Verificar autenticación
function checkAuth() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (isLoggedIn === 'true') {
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
    }
}

// Login
function login() {
    const pin = document.getElementById('pinInput').value;
    if (pin === '1234') {
        localStorage.setItem('isLoggedIn', 'true');
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        loadDashboard();
    } else {
        alert('❌ PIN incorrecto. Usa: 1234');
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Formulario Material
    const materialForm = document.getElementById('materialForm');
    if (materialForm) {
        materialForm.addEventListener('submit', function(e) {
            e.preventDefault();
            addMaterialFromForm();
        });
    }
    
    // Formulario Personal
    const staffForm = document.getElementById('staffForm');
    if (staffForm) {
        staffForm.addEventListener('submit', function(e) {
            e.preventDefault();
            addStaffFromForm();
        });
    }
    
    // PIN input
    const pinInput = document.getElementById('pinInput');
    if (pinInput) {
        pinInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') login();
        });
    }
}

// Mostrar/Ocultar secciones
function showSection(sectionId) {
    console.log('Mostrando sección:', sectionId);
    
    // Ocultar todas
    const sections = ['dashboard', 'scannerSection', 'addMaterialSection', 'addStaffSection', 'historySection'];
    sections.forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    // Mostrar la seleccionada
    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.remove('hidden');
    }
    
    if (sectionId === 'dashboard') {
        loadDashboard();
    }
}

// Cargar Dashboard
async function loadDashboard() {
    const materials = await getAllMaterials();
    const staff = await getAllStaff();
    
    const inUse = materials.filter(m => m.inUse).length;
    const available = materials.length - inUse;
    
    document.getElementById('totalMaterials').textContent = materials.length;
    document.getElementById('availableMaterials').textContent = available;
    document.getElementById('inUseMaterials').textContent = inUse;
    document.getElementById('totalStaff').textContent = staff.length;
    
    // Lista de materiales
    const list = document.getElementById('materialsList');
    if (list) {
        if (materials.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-center py-4">📭 No hay materiales</p>';
        } else {
            list.innerHTML = materials.map(m => `
                <div class="p-3 border-b dark:border-gray-600">
                    <p class="font-bold">${m.name}</p>
                    <p class="text-sm text-gray-500">${m.code} - ${m.inUse ? '🔧 En Uso' : '✅ Disponible'}</p>
                </div>
            `).join('');
        }
    }
}

// Añadir Material
async function addMaterialFromForm() {
    const name = document.getElementById('materialName').value;
    const code = document.getElementById('materialCode').value;
    const category = document.getElementById('materialCategory').value;
    
    if (!name || !code) {
        alert('❌ Nombre y código son obligatorios');
        return;
    }
    
    const material = {
        id: Date.now().toString(),
        name: name,
        code: code,
        category: category,
        inUse: false,
        createdAt: new Date().toISOString()
    };
    
    await addMaterial(material);
    alert('✅ Material guardado');
    document.getElementById('materialForm').reset();
    showSection('dashboard');
}

// Añadir Personal
async function addStaffFromForm() {
    const name = document.getElementById('staffName').value;
    const code = document.getElementById('staffCode').value;
    
    if (!name || !code) {
        alert('❌ Nombre y código son obligatorios');
        return;
    }
    
    const staff = {
        id: Date.now().toString(),
        name: name,
        code: code,
        createdAt: new Date().toISOString()
    };
    
    await addStaff(staff);
    alert('✅ Personal guardado');
    document.getElementById('staffForm').reset();
    showSection('dashboard');
}

// Funciones de IndexedDB
function addMaterial(data) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('materials', 'readwrite');
        const store = tx.objectStore('materials');
        const request = store.add(data);
        request.onsuccess = () => resolve();
        request.onerror = () => reject();
    });
}

function getAllMaterials() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('materials', 'readonly');
        const store = tx.objectStore('materials');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject();
    });
}

function addStaff(data) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('staff', 'readwrite');
        const store = tx.objectStore('staff');
        const request = store.add(data);
        request.onsuccess = () => resolve();
        request.onerror = () => reject();
    });
}

function getAllStaff() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('staff', 'readonly');
        const store = tx.objectStore('staff');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject();
    });
}

// Scanner QR
function startScanner() {
    if (!window.Html5Qrcode) {
        alert('❌ Librería de QR no cargada');
        return;
    }
    
    scanner = new Html5Qrcode('reader');
    scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        function(text) {
            alert('📦 QR detectado: ' + text);
            stopScanner();
        }
    ).then(() => {
        document.querySelector('button[onclick="startScanner()"]').classList.add('hidden');
        document.querySelector('button[onclick="stopScanner()"]').classList.remove('hidden');
    }).catch(err => {
        console.error('Error scanner:', err);
        alert('❌ Error al iniciar cámara: ' + err.message);
    });
}

function stopScanner() {
    if (scanner) {
        scanner.stop().then(() => {
            document.querySelector('button[onclick="startScanner()"]').classList.remove('hidden');
            document.querySelector('button[onclick="stopScanner()"]').classList.add('hidden');
        });
    }
}
