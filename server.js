const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Configuration
const BASE_URL = "https://sudoku.lumitelburundi.com:8083";

// Variables d'état - TOUTES DYNAMIQUES
let isProcessing = false;
let waitingForToken = false;
let authToken = '';
let workerBotUrl = '';  // Pas de variable d'environnement
let mainBotUrl = '';    // URL de ce bot (fournie dynamiquement)
let solvedCount = 0;
let currentRound = 1;
let stats = {
    totalSolved: 0,
    errors: 0,
    startTime: null
};

// Headers de base
const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Authorization': `Bearer ${authToken}`,
    'Origin': 'https://sudoku.lumitelburundi.com',
    'Connection': 'keep-alive',
    'Referer': 'https://sudoku.lumitelburundi.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
});

// Routes API
app.get("/", (req, res) => {
    res.json({
        message: "🤖 Main Sudoku Bot (Coordinator)",
        version: "3.0",
        status: isProcessing ? "RUNNING" : waitingForToken ? "WAITING_FOR_TOKEN" : "READY",
        configuration: {
            workerBot: workerBotUrl || "Not configured",
            mainBotUrl: mainBotUrl || "Not configured",
            hasToken: !!authToken
        },
        endpoints: {
            status: "GET /status",
            start: "POST /start-bot - Requires: token, workerUrl, mainUrl",
            stop: "POST /stop-bot", 
            token: "POST /submit-token",
            stats: "GET /stats"
        }
    });
});

app.post("/start-bot", async (req, res) => {
    const { token, workerUrl, mainUrl } = req.body;
    
    if (isProcessing) {
        return res.status(400).json({
            success: false,
            error: "Le bot est déjà en cours d'exécution"
        });
    }

    // Validation des paramètres requis
    if (!token) {
        return res.status(400).json({
            success: false,
            error: "Token d'authentification requis"
        });
    }

    if (!workerUrl) {
        return res.status(400).json({
            success: false,
            error: "URL du worker bot requise (workerUrl)"
        });
    }

    if (!mainUrl) {
        return res.status(400).json({
            success: false,
            error: "URL du bot principal requise (mainUrl)"
        });
    }

    try {
        // Configurer dynamiquement toutes les variables
        authToken = token;
        workerBotUrl = workerUrl;
        mainBotUrl = mainUrl;
        waitingForToken = false;
        
        console.log("🔧 Configuration dynamique:");
        console.log(`   🔑 Token: ${token.substring(0, 10)}...`);
        console.log(`   🔗 Worker: ${workerBotUrl}`);
        console.log(`   🏠 Main: ${mainBotUrl}`);
        
        // Initialiser le worker avec la configuration
        await initializeWorker();
        
        isProcessing = true;
        stats.startTime = Date.now();
        solvedCount = 0;
        currentRound = 1;
        
        console.log("🚀 Démarrage du système à deux bots...");
        
        startSudokuBot().catch(error => {
            console.error("❌ Erreur:", error);
            isProcessing = false;
            stats.errors++;
        });

        res.json({
            success: true,
            message: "Système de bots jumelés démarré!",
            configuration: {
                workerBot: workerBotUrl,
                mainBot: mainBotUrl,
                workerStatus: "Initialized"
            }
        });
    } catch (error) {
        isProcessing = false;
        stats.errors++;
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post("/stop-bot", async (req, res) => {
    isProcessing = false;
    
    // Arrêter aussi le worker si configuré
    if (workerBotUrl) {
        try {
            await axios.post(`${workerBotUrl}/stop`, {});
            console.log("✅ Worker bot arrêté");
        } catch (error) {
            console.error("⚠️ Erreur arrêt worker:", error.message);
        }
    }
    
    res.json({
        success: true,
        message: "Système arrêté",
        finalStats: {
            totalSolved: stats.totalSolved,
            errors: stats.errors,
            uptime: stats.startTime ? Math.floor((Date.now() - stats.startTime) / 1000) : 0
        }
    });
});

// Initialiser le worker bot avec configuration dynamique
async function initializeWorker() {
    try {
        console.log(`🔄 Initialisation worker: ${workerBotUrl}`);
        
        const response = await axios.post(`${workerBotUrl}/initialize`, {
            token: authToken,
            mainBotUrl: mainBotUrl
        }, {
            timeout: 10000 // 10 secondes timeout
        });
        
        if (!response.data.success) {
            throw new Error(`Worker refusé: ${response.data.error || 'Raison inconnue'}`);
        }
        
        console.log("✅ Worker bot initialisé avec succès");
        return true;
    } catch (error) {
        console.error("❌ Erreur initialisation worker:", error.message);
        throw new Error(`Impossible de connecter au worker bot: ${error.message}`);
    }
}

// Algorithmes de résolution (identiques)
function isSafe(board, row, col, num) {
    for (let d = 0; d < board.length; d++) {
        if (board[row][d] === num) return false;
    }
    for (let r = 0; r < board.length; r++) {
        if (board[r][col] === num) return false;
    }
    const sqrt = Math.floor(Math.sqrt(board.length));
    const boxRowStart = row - row % sqrt;
    const boxColStart = col - col % sqrt;
    for (let r = boxRowStart; r < boxRowStart + sqrt; r++) {
        for (let d = boxColStart; d < boxColStart + sqrt; d++) {
            if (board[r][d] === num) return false;
        }
    }
    return true;
}

function solveSudoku(board) {
    const n = board.length;
    let row = -1, col = -1, isEmpty = true;
    
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (board[i][j] === 0) {
                row = i; col = j; isEmpty = false; break;
            }
        }
        if (!isEmpty) break;
    }
    if (isEmpty) return true;
    
    for (let num = 1; num <= n; num++) {
        if (isSafe(board, row, col, num)) {
            board[row][col] = num;
            if (solveSudoku(board)) return true;
            else board[row][col] = 0;
        }
    }
    return false;
}

function findEmptyCells(original, solved) {
    const emptyCells = [];
    for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
            if (original[i][j] === 0) {
                emptyCells.push({ row: i, col: j, value: solved[i][j] });
            }
        }
    }
    return emptyCells;
}

// Récupérer une grille
async function getSudokuGrid() {
    try {
        const response = await axios.post(`${BASE_URL}/turns/start`, {}, {
            headers: getHeaders()
        });
        
        if (response.data && response.data.board) {
            console.log("✅ Nouvelle grille récupérée");
            return response.data.board;
        }
        throw new Error("Format invalide");
    } catch (error) {
        console.error(`❌ Erreur récupération: ${error.message}`);
        throw error;
    }
}

// Soumettre une réponse (main bot)
async function submitAnswer(row, col, value) {
    try {
        const headers = getHeaders();
        headers['Content-Type'] = 'application/json';
        
        const response = await axios.post(`${BASE_URL}/turns/submit`, {
            answer: { row, col, value }
        }, { headers });
        
        return true;
    } catch (error) {
        console.error(`❌ Erreur soumission main (${row},${col})=${value}`);
        throw error;
    }
}

// Distribuer les tâches entre main et worker
function distributeTasks(emptyCells) {
    const half = Math.ceil(emptyCells.length / 2);
    return {
        mainTasks: emptyCells.slice(0, half),
        workerTasks: emptyCells.slice(half)
    };
}

// Résoudre un sudoku avec les deux bots
async function solveOneSudoku() {
    const roundStart = Date.now();
    console.log(`\n🎯 === ROUND ${currentRound} (DUAL BOT) ===`);
    
    try {
        // 1. Récupérer la grille
        console.log("📥 Récupération grille...");
        const originalGrid = await getSudokuGrid();
        
        // 2. Résoudre
        console.log("🧠 Résolution...");
        const gridCopy = originalGrid.map(row => [...row]);
        if (!solveSudoku(gridCopy)) {
            throw new Error("Impossible de résoudre");
        }
        
        // 3. Identifier cellules vides
        const emptyCells = findEmptyCells(originalGrid, gridCopy);
        console.log(`📝 ${emptyCells.length} cellules à remplir`);
        
        // 4. Distribuer les tâches
        const { mainTasks, workerTasks } = distributeTasks(emptyCells);
        console.log(`🔄 Distribution: Main=${mainTasks.length}, Worker=${workerTasks.length}`);
        
        // 5. Envoyer les tâches au worker
        const workerPromise = axios.post(`${workerBotUrl}/solve-batch`, {
            tasks: workerTasks
        }, {
            timeout: 30000 // 30 secondes timeout
        }).catch(error => {
            console.error("❌ Erreur worker:", error.message);
            return { data: { success: false, completed: 0 } };
        });
        
        // 6. Traitement en parallèle
        console.log("⚡ Traitement parallèle...");
        
        const [mainResults, workerResponse] = await Promise.all([
            // Main bot traite sa part
            Promise.all(mainTasks.map(async (cell) => {
                try {
                    await submitAnswer(cell.row, cell.col, cell.value);
                    return true;
                } catch (error) {
                    return false;
                }
            })),
            // Worker traite sa part
            workerPromise
        ]);
        
        const mainSuccess = mainResults.filter(r => r).length;
        const workerSuccess = workerResponse.data?.completed || 0;
        const totalSuccess = mainSuccess + workerSuccess;
        
        const roundTime = Date.now() - roundStart;
        console.log(`✅ Round ${currentRound}: ${totalSuccess}/${emptyCells.length} OK (${roundTime}ms)`);
        console.log(`   📊 Main: ${mainSuccess}/${mainTasks.length}, Worker: ${workerSuccess}/${workerTasks.length}`);
        
        currentRound++;
        solvedCount++;
        stats.totalSolved++;
        
        return true;
        
    } catch (error) {
        console.error(`❌ Erreur Round ${currentRound}: ${error.message}`);
        stats.errors++;
        return false;
    }
}

// Boucle principale
async function startSudokuBot() {
    console.log("🤖 === DÉMARRAGE SYSTÈME DUAL BOT ===");
    console.log(`🔗 Worker URL: ${workerBotUrl}`);
    console.log(`🏠 Main URL: ${mainBotUrl}`);
    
    while (isProcessing) {
        try {
            if (!authToken) {
                console.log("⏳ Attente token...");
                waitingForToken = true;
                while (!authToken && isProcessing) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                waitingForToken = false;
                if (!isProcessing) break;
            }
            
            const success = await solveOneSudoku();
            if (!success) {
                console.log("⚠️ Échec, pause 2s");
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
        } catch (error) {
            console.error(`❌ Erreur boucle: ${error.message}`);
            stats.errors++;
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    console.log("🏁 Système arrêté");
}

// Routes de status 
app.get("/status", (req, res) => {
    res.json({
        isProcessing,
        waitingForToken,
        hasToken: !!authToken,
        currentRound,
        solvedCount,
        configuration: {
            workerBot: workerBotUrl || "Not configured",
            mainBot: mainBotUrl || "Not configured"
        },
        stats: { ...stats, uptime: stats.startTime ? Date.now() - stats.startTime : 0 }
    });
});

app.get("/stats", (req, res) => {
    const uptime = stats.startTime ? Date.now() - stats.startTime : 0;
    const avgTime = stats.totalSolved > 0 ? uptime / stats.totalSolved : 0;
    
    res.json({
        totalSolved: stats.totalSolved,
        errors: stats.errors,
        currentRound,
        uptime: Math.floor(uptime / 1000),
        averageTimePerSudoku: Math.floor(avgTime / 1000),
        successRate: stats.totalSolved + stats.errors > 0 ? 
            ((stats.totalSolved / (stats.totalSolved + stats.errors)) * 100).toFixed(2) + '%' : '0%'
    });
});

app.post("/submit-token", (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ success: false, error: "Token requis" });
    }
    authToken = token;
    waitingForToken = false;
    res.json({ success: true, message: "Token configuré" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Main Sudoku Bot running on port ${PORT}`);
    console.log(`📱 Configuration 100% dynamique - aucune variable d'environnement requise`);
    console.log(`\n💡 Usage:`);
    console.log(`   POST /start-bot`);
    console.log(`   Body: {`);
    console.log(`     "token": "your_auth_token",`);
    console.log(`     "workerUrl": "https://your-worker-bot.onrender.com",`);
    console.log(`     "mainUrl": "https://your-main-bot.onrender.com"`);
    console.log(`   }`);
});
