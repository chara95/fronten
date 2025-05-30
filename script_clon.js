// =========================================================
// 1. Configuración de Variables Globales y Conexión a PocketBase
// =========================================================

// --- Variables del Juego (Se cargarán desde PocketBase) ---
let balance = 0;
let hashRate = 100; // Hashrate inicial (mantendremos fijo para simplificar, sin mejoras)
let totalBlocksMined = 0;
let currentBlockNumber = 1;
let nextBlockReward = 0.00000010; // Recompensa base
let isMining = false;
let miningProgress = 0; // Porcentaje de progreso del bloque actual

// --- Variables de Temperatura y Enfriamiento (SIMPLIFICADAS/ELIMINADAS EN LÓGICA ACTIVA) ---
// La UI seguirá mostrando estos elementos, pero el JS no los controlará activamente para minar
// Si quieres reintroducir la lógica de temperatura/enfriamiento más tarde, se puede hacer.
let currentTemperature = 30.0;
let cooldownTimer = 0; // Solo para display, no para lógica de enfriamiento activo

// --- Variables de Retiro ---
let userEmail = localStorage.getItem('userEmail') || 'no configurado'; // Email de FaucetPay
const MIN_WITHDRAWAL_AMOUNT = 0.00000001; // Cantidad mínima para retiro
const FIXED_WITHDRAWAL_FEE = 0.00000001; // Comisión fija por retiro

// --- PocketBase Setup ---
// ¡IMPORTANTE! REEMPLAZA ESTA URL CON LA URL REAL DE TU SERVICIO DE POCKETBASE EN RENDER
const PB_URL = 'https://my-miner-pocketbase-backend.onrender.com'; // Ejemplo: https://my-miner-pocketbase.onrender.com
const pb = new PocketBase(PB_URL);

let currentUserPocketBaseId = null; // ID del registro de PocketBase para el usuario actual
let autoMiningInterval; // Para el intervalo de minado

// --- Elementos del DOM (UI) ---
const balanceDisplay = document.getElementById('balance');
const temperatureStatusDisplay = document.getElementById('temperatureStatus');
const cooldownTimerDisplay = document.getElementById('cooldownTimer');
const coolDownButton = document.getElementById('coolDownButton');
const miningGlobalStatus = document.getElementById('miningGlobalStatus');
const miningProgressBar = document.getElementById('miningProgressBar');
const miningProgressDisplay = document.getElementById('miningProgressDisplay');
const currentBlockNumberDisplay = document.getElementById('currentBlockNumber');
const nextBlockRewardInfo = document.getElementById('nextBlockRewardInfo');
const currentTemperatureDisplay = document.getElementById('currentTemperature');
const hashRateDisplay = document.getElementById('hashRate');
const totalBlocksMinedDisplay = document.getElementById('totalBlocksMined');
const mineButton = document.getElementById('mineButton');
const activityLog = document.getElementById('activityLog');

const navHomeBtn = document.getElementById('navHomeBtn');
// const navUpgradesBtn = document.getElementById('navUpgradesBtn'); // ELIMINADO en HTML, por lo tanto aquí
const navActivityBtn = document.getElementById('navActivityBtn');
const navAccountBtn = document.getElementById('navAccountBtn');
const navTermsBtn = document.getElementById('navTermsBtn');

const gameScreen = document.getElementById('gameScreen');
// const upgradesScreen = document.getElementById('upgradesScreen'); // ELIMINADO en HTML
const activityLogScreen = document.getElementById('activityLogScreen');
const withdrawalScreen = document.getElementById('withdrawalScreen');
const termsScreen = document.getElementById('termsScreen');

const currentWithdrawalBalance = document.getElementById('currentWithdrawalBalance');
const displayEmail = document.getElementById('displayEmail');
const editEmailBtn = document.getElementById('editEmailBtn');
const emailInputSection = document.getElementById('emailInputSection');
const emailInput = document.getElementById('emailInput');
const saveEmailBtn = document.getElementById('saveEmailBtn');
const withdrawalAmountSelect = document.getElementById('withdrawalAmount');
const requestWithdrawalBtn = document.getElementById('requestWithdrawalBtn');
const withdrawalMessage = document.getElementById('withdrawalMessage'); // Para mensajes en pantalla de retiro

// Un elemento para mensajes generales, por ejemplo en la pantalla de juego
const messageDisplay = document.createElement('p');
messageDisplay.classList.add('message');
messageDisplay.style.display = 'none';
// Asegúrate de agregar este elemento a tu HTML si quieres un mensaje general
// Por ejemplo, puedes añadirlo dentro de la sección gameScreen, después del .control-buttons
// O si tienes un div específico para mensajes en tu HTML, usa su ID.
// Para este ejemplo, lo añadiremos dinámicamente si no existe un contenedor de mensajes general.
document.addEventListener('DOMContentLoaded', () => {
    const gameContainer = document.getElementById('gameScreen');
    if (gameContainer && !gameContainer.querySelector('.general-message-container')) {
        const msgContainer = document.createElement('div');
        msgContainer.classList.add('general-message-container');
        msgContainer.appendChild(messageDisplay);
        gameContainer.insertBefore(msgContainer, gameContainer.querySelector('.control-buttons').nextSibling);
    }
});


// =========================================================
// 2. Funciones de Ayuda (Formato, Mensajes, Comunicación con App Inventor)
// =========================================================

function formatLTC(amount) {
    return parseFloat(amount).toFixed(8);
}

function displayMessage(message, type, targetElement = null) {
    let element = targetElement || messageDisplay; // Usa messageDisplay como default
    if (!element) return;

    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = 'block';

    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

function logActivity(message, type = 'info') {
    if (!activityLog) return;
    const listItem = document.createElement('li');
    listItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    listItem.className = type;
    activityLog.prepend(listItem);
    if (activityLog.children.length > 50) {
        activityLog.removeChild(activityLog.lastChild);
    }
}

// Función para comunicar con App Inventor (mantenerla por si acaso)
function callAppInventor(functionName, data = '') {
    console.log(`[JS DEBUG] Intentando llamar a App Inventor con: ${functionName}|${data}`);
    if (window.AppInventor && typeof window.AppInventor.setWebViewString === 'function') {
        window.AppInventor.setWebViewString(functionName + '|' + data);
        console.log(`[JS DEBUG] Llamada a setWebViewString exitosa con: ${functionName}|${data}`);
    } else {
        console.warn(`[JS DEBUG] window.AppInventor.setWebViewString NO disponible. Ejecutando en navegador?`);
    }
}

// Temperatura y Enfriamiento son solo para display ahora, no afectan la minería directamente
function updateTemperatureStatusDisplay() {
    let statusText = 'Óptimo';
    let statusClass = 'optimal';
    if (cooldownTimer > 0) {
        statusText = 'Enfriando';
        statusClass = 'cooling';
    } else if (currentTemperature >= 80) { // Ejemplo, puedes ajustar tus umbrales
        statusText = 'Caliente';
        statusClass = 'warning';
    } else if (currentTemperature >= 100) {
        statusText = 'Sobrecalentado';
        statusClass = 'overheated';
    }

    temperatureStatusDisplay.textContent = statusText;
    // miningGlobalStatus.className = `status-indicator ${statusClass}`; // Si quieres que afecte el status global
}


// =========================================================
// 3. Lógica del Juego (Minado Básico, UI)
// =========================================================

function updateDisplay() {
    balanceDisplay.textContent = formatLTC(balance);
    currentWithdrawalBalance.textContent = formatLTC(balance);
    hashRateDisplay.textContent = hashRate.toFixed(0);
    totalBlocksMinedDisplay.textContent = totalBlocksMined;
    currentBlockNumberDisplay.textContent = currentBlockNumber;
    nextBlockRewardInfo.textContent = formatLTC(nextBlockReward);

    miningProgressBar.style.width = `${miningProgress.toFixed(2)}%`;
    miningProgressDisplay.textContent = `${miningProgress.toFixed(0)}%`;

    currentTemperatureDisplay.textContent = currentTemperature.toFixed(1);
    // Cambiar color de temperatura según el valor (ej. rojo si está cerca del límite)
    if (currentTemperature >= 80) {
        currentTemperatureDisplay.style.color = 'var(--error-color)';
    } else if (currentTemperature >= 60) {
        currentTemperatureDisplay.style.color = 'orange';
    } else {
        currentTemperatureDisplay.style.color = 'var(--primary-color)';
    }
    updateTemperatureStatusDisplay();

    // Botones de minado
    mineButton.textContent = isMining ? 'Minando...' : 'Iniciar Minería';
    mineButton.disabled = isMining; // Solo deshabilitar si ya está minando
    miningGlobalStatus.textContent = isMining ? 'Estado: Minando' : 'Estado: Detenido';
    miningGlobalStatus.className = `status-indicator ${isMining ? 'mining' : 'stopped'}`;

    // Botón de enfriamiento (solo para display, no afecta la minería en esta versión)
    coolDownButton.disabled = cooldownTimer > 0;
    cooldownTimerDisplay.textContent = formatTime(cooldownTimer);
    if (cooldownTimer > 0) {
        coolDownButton.textContent = `Enfriando... (${formatTime(cooldownTimer)})`;
    } else {
        coolDownButton.textContent = 'Enfriar ASIC';
    }
    
    // Actualizar email en pantalla de retiro
    displayEmail.textContent = userEmail === 'no configurado' ? 'No configurado' : userEmail;
    emailInput.value = userEmail === 'no configurado' ? '' : userEmail;
}

function startMining() {
    if (isMining) {
        displayMessage('El minado ya está en curso.', 'info', messageDisplay);
        return;
    }
    isMining = true;
    logActivity('Minado iniciado.', 'info');
    displayMessage('Minería iniciada. ¡A minar LTC!', 'success', messageDisplay);

    autoMiningInterval = setInterval(() => {
        if (!isMining) return;

        miningProgress += (hashRate / 100); // Incrementa el progreso basado en hashrate
        currentTemperature += 0.05; // La temperatura sube muy lentamente, sin afectos de gameplay

        if (miningProgress >= 100) {
            miningProgress = 0;
            balance += nextBlockReward;
            totalBlocksMined++;
            currentBlockNumber++;
            nextBlockReward = calculateNextBlockReward(); // Actualiza la recompensa
            logActivity(`Bloque #${totalBlocksMined} minado. Ganancia: ${formatLTC(nextBlockReward)} LTC.`, 'success');
            saveGameToPocketBase(); // Guardar el progreso después de cada bloque

            // --- Lógica de Publicidad ---
            if (totalBlocksMined > 0 && totalBlocksMined % 5 === 0) {
                console.log("script_clon.js: Condición de anuncio cumplida (cada 5 bloques).");
                callAppInventor('ShowInterstitialAd');
            }
        }
        updateDisplay();
    }, 100); // Actualiza cada 100ms
}

function stopMining() {
    isMining = false;
    clearInterval(autoMiningInterval);
    logActivity('Minado detenido.', 'info');
    displayMessage('Minería detenida.', 'info', messageDisplay);
    updateDisplay();
}

function calculateNextBlockReward() {
    // La recompensa aumenta ligeramente con cada bloque minado
    return 0.00000010 + (totalBlocksMined * 0.000000001);
}

function startCooldown() {
    // En esta versión, solo es un temporizador visual, no afecta la minería
    if (cooldownTimer > 0) {
        displayMessage('El enfriamiento ya está en curso.', 'info', messageDisplay);
        return;
    }

    logActivity('Enfriamiento manual iniciado.', 'info');
    displayMessage('Enfriando ASIC...', 'info', messageDisplay);
    cooldownTimer = 30; // 30 segundos de enfriamiento visual
    coolDownButton.disabled = true;

    let visualCooldownInterval = setInterval(() => {
        cooldownTimer--;
        currentTemperature -= 0.5; // Baja temperatura visualmente
        if (currentTemperature < 30) currentTemperature = 30; // Temperatura mínima visual

        if (cooldownTimer <= 0) {
            clearInterval(visualCooldownInterval);
            cooldownTimer = 0;
            logActivity('Enfriamiento completado.', 'success');
            displayMessage('ASIC enfriado. ¡Listo!', 'success', messageDisplay);
            coolDownButton.disabled = false;
            callAppInventor('ShowInterstitialAd');
        }
        updateDisplay();
    }, 1000);
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s]
        .map(v => v < 10 ? '0' + v : v)
        .filter((v, i) => v !== '00' || i > 0 || (i === 0 && h === 0 && m === 0)) // No muestra horas/minutos si son cero
        .join(':');
}


// =========================================================
// 4. Gestión de Pantallas y Navegación
// =========================================================

window.showScreen = function (screenId) {
    const allScreens = [gameScreen, activityLogScreen, withdrawalScreen, termsScreen];
    allScreens.forEach(screen => {
        if (screen) screen.classList.add('hidden');
    });

    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
    } else {
        console.error(`Error: La pantalla con id "${screenId}" no fue encontrada.`);
    }

    const allNavButtons = [navHomeBtn, navActivityBtn, navAccountBtn, navTermsBtn];
    allNavButtons.forEach(button => {
        if (button) button.classList.remove('active');
    });

    // Activar el botón de navegación correcto
    switch (screenId) {
        case 'gameScreen':
            if (navHomeBtn) navHomeBtn.classList.add('active');
            break;
        case 'activityLogScreen':
            if (navActivityBtn) navActivityBtn.classList.add('active');
            break;
        case 'withdrawalScreen':
            if (navAccountBtn) navAccountBtn.classList.add('active');
            updateEmailDisplay(); // Asegúrate de que el email y el balance se actualicen al ir a esta pantalla
            break;
        case 'termsScreen':
            if (navTermsBtn) navTermsBtn.classList.add('active');
            break;
    }
    updateDisplay();
}

function updateEmailDisplay() {
    displayEmail.textContent = userEmail === 'no configurado' ? 'No configurado' : userEmail;
    emailInput.value = userEmail === 'no configurado' ? '' : userEmail;
    emailInputSection.style.display = 'none';
    editEmailBtn.style.display = 'block';
}


// =========================================================
// 5. Lógica de Retiro y Actualización de Email con PocketBase
// =========================================================

editEmailBtn.addEventListener('click', () => {
    emailInputSection.style.display = 'flex';
    editEmailBtn.style.display = 'none';
});

saveEmailBtn.addEventListener('click', async () => {
    const newEmail = emailInput.value.trim();
    if (!newEmail || !newEmail.includes('@') || !newEmail.includes('.')) {
        displayMessage('Por favor, ingresa un correo electrónico válido.', 'error', withdrawalMessage);
        return;
    }
    if (newEmail === userEmail && currentUserPocketBaseId) { // Si el email no ha cambiado Y ya tenemos un usuario en PB
        displayMessage('El correo electrónico ya está configurado.', 'info', withdrawalMessage);
        emailInputSection.style.display = 'none';
        editEmailBtn.style.display = 'block';
        return;
    }

    userEmail = newEmail;
    localStorage.setItem('userEmail', userEmail); // Guardar en localStorage

    // Intentar cargar o crear el usuario en PocketBase con el nuevo email
    await loadOrCreateUserRecord();

    displayMessage('Correo electrónico actualizado con éxito.', 'success', withdrawalMessage);
    updateEmailDisplay();
    emailInputSection.style.display = 'none';
    editEmailBtn.style.display = 'block';
    console.log("script_clon.js: Email actualizado. Llamando a callAppInventor para anuncio.");
    callAppInventor('ShowInterstitialAd');
});

requestWithdrawalBtn.addEventListener('click', async () => {
    const amount = parseFloat(withdrawalAmountSelect.value);
    const email = userEmail.trim();

    if (email === 'no configurado' || !email.includes('@')) {
        displayMessage('Por favor, configura tu correo electrónico de FaucetPay.', 'error', withdrawalMessage);
        return;
    }
    if (isNaN(amount) || amount < MIN_WITHDRAWAL_AMOUNT) {
        displayMessage(`El monto mínimo de retiro es ${formatLTC(MIN_WITHDRAWAL_AMOUNT)}.`, 'error', withdrawalMessage);
        return;
    }

    const totalAmountNeeded = amount + FIXED_WITHDRAWAL_FEE;

    if (balance < totalAmountNeeded) {
        displayMessage('Saldo insuficiente para el retiro y las comisiones.', 'error', withdrawalMessage);
        return;
    }
    if (!currentUserPocketBaseId) {
        displayMessage('Error: No se ha podido cargar tu perfil de usuario. Intenta recargar.', 'error', withdrawalMessage);
        return;
    }

    displayMessage('Procesando retiro...', 'info', withdrawalMessage);
    requestWithdrawalBtn.disabled = true;

    try {
        // Llama a tu backend de Render para procesar el retiro con FaucetPay
        // ¡IMPORTANTE! REEMPLAZA ESTA URL CON LA URL REAL DE TU BACKEND DE RETIRO EN RENDER
        const backendUrl = 'https://your-faucet-backend.onrender.com/withdraw'; // Ejemplo: https://my-faucet-backend.onrender.com/withdraw

        const response = await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                amount: amount,
                pocketBaseUserId: currentUserPocketBaseId // Enviar ID de PocketBase para validación/actualización
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            balance -= totalAmountNeeded;
            logActivity(`Retiro de ${formatLTC(amount)} LTC solicitado. Comisión: ${formatLTC(FIXED_WITHDRAWAL_FEE)} LTC.`, 'info');
            displayMessage('¡Retiro solicitado con éxito! Revisa tu cuenta de FaucetPay.', 'success', withdrawalMessage);
            await saveGameToPocketBase(); // Guardar el nuevo balance después del retiro
            console.log("script_clon.js: Retiro exitoso. Llamando a callAppInventor para anuncio.");
            callAppInventor('ShowInterstitialAd');
        } else {
            displayMessage(data.error || 'Error al procesar el retiro.', 'error', withdrawalMessage);
            logActivity(`Error de retiro: ${data.error || 'Desconocido'}.`, 'error');
        }
    } catch (error) {
        console.error('script_clon.js: Error de red al solicitar retiro:', error);
        displayMessage('Error de conexión. Intenta nuevamente.', 'error', withdrawalMessage);
        logActivity('Error de conexión para retiro.', 'error');
    } finally {
        requestWithdrawalBtn.disabled = false;
        updateDisplay();
    }
});


// =========================================================
// 6. Carga y Guardado de Datos con PocketBase
// =========================================================

async function loadOrCreateUserRecord() {
    if (userEmail === 'no configurado' || !userEmail) {
        console.warn("script_clon.js: No hay email de usuario configurado. No se cargarán/guardarán datos de PocketBase hasta que se configure.");
        // Opcional: mostrar un mensaje al usuario para que configure su email
        // displayMessage('Configura tu email para guardar el progreso.', 'info');
        return;
    }

    try {
        const records = await pb.collection('users').getFullList({
            filter: `email = "${userEmail}"`,
            requestKey: null // Deshabilita el caché para asegurar la última versión
        });

        if (records.length > 0) {
            const userData = records[0];
            currentUserPocketBaseId = userData.id;
            balance = userData.balance;
            totalBlocksMined = userData.totalBlocksMined;
            currentBlockNumber = userData.currentBlockNumber;
            nextBlockReward = userData.nextBlockReward;
            hashRate = userData.hashRate || 100; // Cargar hashrate, si no existe, usar 100
            currentTemperature = userData.currentTemperature || 30.0; // Cargar temperatura

            logActivity('Datos del juego cargados desde PocketBase.', 'success');
            displayMessage('Progreso cargado desde la nube.', 'success');
            console.log('script_clon.js: Datos cargados de PocketBase:', userData);
        } else {
            // Si no se encuentra un usuario con ese email, se crea uno nuevo
            const newRecord = await pb.collection('users').create({
                email: userEmail,
                balance: 0,
                totalBlocksMined: 0,
                currentBlockNumber: 1,
                nextBlockReward: calculateNextBlockReward(),
                hashRate: hashRate, // Guardar hashrate inicial
                currentTemperature: currentTemperature // Guardar temperatura inicial
            });
            currentUserPocketBaseId = newRecord.id;
            logActivity('Nuevo perfil creado en PocketBase.', 'info');
            displayMessage('Nuevo perfil creado en la nube.', 'info');
            console.log('script_clon.js: Nuevo registro PocketBase creado:', newRecord);
        }
    } catch (error) {
        console.error('script_clon.js: Error al cargar/crear usuario en PocketBase:', error);
        displayMessage('Error al conectar con la nube. El progreso no se guardará.', 'error');
        logActivity('Error al cargar datos de la nube.', 'error');
    } finally {
        updateDisplay();
    }
}

async function saveGameToPocketBase() {
    if (!currentUserPocketBaseId || userEmail === 'no configurado') {
        console.warn("script_clon.js: No hay ID de usuario PocketBase o email configurado para guardar.");
        return;
    }

    try {
        await pb.collection('users').update(currentUserPocketBaseId, {
            balance: balance,
            totalBlocksMined: totalBlocksMined,
            currentBlockNumber: currentBlockNumber,
            nextBlockReward: nextBlockReward,
            email: userEmail, // Asegura que el email se actualice si el usuario lo cambia
            hashRate: hashRate, // Guarda el hashrate actual
            currentTemperature: currentTemperature // Guarda la temperatura actual
        });
        console.log("script_clon.js: Juego guardado en PocketBase.");
    } catch (error) {
        console.error("script_clon.js: Error al guardar en PocketBase:", error);
        displayMessage("Error al guardar el juego en la nube.", "error");
        logActivity('Error al guardar datos en la nube.', 'error');
    }
}

// =========================================================
// 7. Inicialización al Cargar el DOM y Event Listeners
// =========================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log("script_clon.js: DOMContentLoaded se ha disparado.");

    // Cargar datos del usuario de PocketBase
    // El email se carga de localStorage primero, luego se usa para buscar/crear en PocketBase
    await loadOrCreateUserRecord();

    // Event Listeners para botones de navegación
    if (navHomeBtn) navHomeBtn.addEventListener('click', () => showScreen('gameScreen'));
    if (navActivityBtn) navActivityBtn.addEventListener('click', () => showScreen('activityLogScreen'));
    if (navAccountBtn) navAccountBtn.addEventListener('click', () => showScreen('withdrawalScreen'));
    if (navTermsBtn) navTermsBtn.addEventListener('click', () => showScreen('termsScreen'));

    // Event Listeners para botones del juego
    mineButton.addEventListener('click', () => {
        if (isMining) {
            stopMining();
        } else {
            startMining();
        }
    });

    coolDownButton.addEventListener('click', startCooldown); // El enfriamiento es solo visual ahora

    // Muestra la pantalla de juego por defecto al cargar
    showScreen('gameScreen');
});