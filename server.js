const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Configuration
const BASE_URL = "https://sudoku.lumitelburundi.com:8083";
const PAUSE_BETWEEN_SUDOKUS = 5000; // 5 secondes exactement

// Variables d'état
let isProcessing = false;
let waitingForToken = false;
let authToken = '';
let solvedCount = 0;
let currentRound = 1;
let stats = {
    totalSolved: 0,
    errors: 0,
    startTime: null
};

// Headers de base (seront complétés avec le token)
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
        message: "🤖 Dynamic Sudoku Bot API",
        version: "2.0",
        status: isProcessing ? "RUNNING" : waitingForToken ? "WAITING_FOR_TOKEN" : "READY",
        endpoints: {
            status: "GET /status - Statut détaillé du bot",
            start: "POST /start-bot - Démarre le processus (nécessite un token)",
            stop: "POST /stop-bot - Arrête le processus",
            token: "POST /submit-token - Fournit le token d'authentification",
            stats: "GET /stats - Statistiques de résolution"
        }
    });
});

app.get("/status", (req, res) => {
    res.json({
        isProcessing,
        waitingForToken,
        hasToken: !!authToken,
        currentRound,
        solvedCount,
        stats: {
            ...stats,
            uptime: stats.startTime ? Date.now() - stats.startTime : 0
        }
    });
});

app.get("/stats", (req, res) => {
    const uptime = stats.startTime ? Date.now() - stats.startTime : 0;
    const avgTimePerSudoku = stats.totalSolved > 0 ? uptime / stats.totalSolved : 0;
    
    res.json({
        totalSolved: stats.totalSolved,
        errors: stats.errors,
        currentRound,
        uptime: Math.floor(uptime / 1000), // en secondes
        averageTimePerSudoku: Math.floor(avgTimePerSudoku / 1000), // en secondes
        successRate: stats.totalSolved + stats.errors > 0 ? 
            ((stats.totalSolved / (stats.totalSolved + stats.errors)) * 100).toFixed(2) + '%' : '0%'
    });
});

app.post("/start-bot", (req, res) => {
    const { token } = req.body;
    
    if (isProcessing) {
        return res.status(400).json({
            success: false,
            error: "Le bot est déjà en cours d'exécution"
        });
    }

    if (token) {
        authToken = token;
        waitingForToken = false;
    } else if (!authToken) {
        waitingForToken = true;
        return res.json({
            success: true,
            message: "Bot en attente du token d'authentification",
            waitingForToken: true
        });
    }

    try {
        isProcessing = true;
        stats.startTime = Date.now();
        solvedCount = 0;
        currentRound = 1;
        
        console.log("🚀 Démarrage du bot de résolution Sudoku...");
        
        // Lancer le processus de résolution
        startSudokuBot().catch(error => {
            console.error("❌ Erreur dans le processus:", error);
            isProcessing = false;
            stats.errors++;
        });

        res.json({
            success: true,
            message: "Bot démarré avec succès!",
            token: token ? "✅ Fourni" : "✅ Déjà configuré"
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

app.post("/stop-bot", (req, res) => {
    if (!isProcessing) {
        return res.status(400).json({
            success: false,
            error: "Aucun processus en cours"
        });
    }

    isProcessing = false;
    console.log("🛑 Arrêt du bot demandé par l'utilisateur");
    
    res.json({
        success: true,
        message: "Bot arrêté",
        finalStats: {
            totalSolved: stats.totalSolved,
            errors: stats.errors,
            uptime: Math.floor((Date.now() - stats.startTime) / 1000)
        }
    });
});

app.post("/submit-token", (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({
            success: false,
            error: "Token requis"
        });
    }

    authToken = token;
    waitingForToken = false;
    
    console.log("🔑 Token d'authentification reçu");
    
    res.json({
        success: true,
        message: "Token configuré avec succès"
    });
});

// Fonctions utilitaires
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Algorithme de résolution Sudoku (identique à votre version)
function isSafe(board, row, col, num) {
    for (let d = 0; d < board.length; d++) {
        if (board[row][d] === num) {
            return false;
        }
    }

    for (let r = 0; r < board.length; r++) {
        if (board[r][col] === num) {
            return false;
        }
    }

    const sqrt = Math.floor(Math.sqrt(board.length));
    const boxRowStart = row - row % sqrt;
    const boxColStart = col - col % sqrt;

    for (let r = boxRowStart; r < boxRowStart + sqrt; r++) {
        for (let d = boxColStart; d < boxColStart + sqrt; d++) {
            if (board[r][d] === num) {
                return false;
            }
        }
    }

    return true;
}

function solveSudoku(board) {
    const n = board.length;
    let row = -1;
    let col = -1;
    let isEmpty = true;
    
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (board[i][j] === 0) {
                row = i;
                col = j;
                isEmpty = false;
                break;
            }
        }
        if (!isEmpty) {
            break;
        }
    }

    if (isEmpty) {
        return true;
    }

    for (let num = 1; num <= n; num++) {
        if (isSafe(board, row, col, num)) {
            board[row][col] = num;
            if (solveSudoku(board)) {
                return true;
            } else {
                board[row][col] = 0;
            }
        }
    }
    return false;
}

function convertTo2D(gridValues) {
    const board = [];
    for (let i = 0; i < 9; i++) {
        board.push(gridValues.slice(i * 9, (i + 1) * 9).map(Number));
    }
    return board;
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

// Fonctions API
async function getSudokuGrid() {
    try {
        const response = await axios.post(`${BASE_URL}/turns/start`, {}, {
            headers: getHeaders()
        });
        
        if (response.data && response.data.board) {
            console.log("✅ Nouvelle grille récupérée");
            return response.data.board;
        }
        
        throw new Error("Format de grille invalide");
    } catch (error) {
        console.error(`❌ Erreur récupération grille: ${error.message}`);
        throw error;
    }
}

async function submitAnswer(row, col, value) {
    try {
        const headers = getHeaders();
        headers['Content-Type'] = 'application/json';
        headers['Priority'] = 'u=0';
        
        const response = await axios.post(`${BASE_URL}/turns/submit`, {
            answer: { row, col, value }
        }, { headers });
        
        return true;
    } catch (error) {
        console.error(`❌ Erreur soumission (${row},${col})=${value}: ${error.message}`);
        throw error;
    }
}

// Fonction principale de résolution
async function solveOneSudoku() {
    const roundStart = Date.now();
    console.log(`\n🎯 === ROUND ${currentRound} ===`);
    
    try {
        // 1. Récupérer la grille
        console.log("📥 Récupération de la grille...");
        const originalGrid = await getSudokuGrid();
        
        // 2. Résoudre le sudoku
        console.log("🧠 Résolution en cours...");
        const gridCopy = originalGrid.map(row => [...row]);
        
        if (!solveSudoku(gridCopy)) {
            throw new Error("Impossible de résoudre cette grille");
        }
        
        // 3. Identifier les cellules à remplir
        const emptyCells = findEmptyCells(originalGrid, gridCopy);
        console.log(`📝 ${emptyCells.length} cellules à remplir`);
        
        // 4. Soumettre les réponses (sans délai entre chaque soumission)
        console.log("📤 Soumission des réponses...");
        let successCount = 0;
        
        for (const cell of emptyCells) {
            try {
                await submitAnswer(cell.row, cell.col, cell.value);
                successCount++;
            } catch (error) {
                console.error(`⚠️ Échec soumission ${cell.row},${cell.col}`);
            }
        }
        
        const roundTime = Date.now() - roundStart;
        console.log(`✅ Round ${currentRound} terminé: ${successCount}/${emptyCells.length} réponses OK (${roundTime}ms)`);
        
        // Incrémenter les compteurs
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

// Processus principal du bot
async function startSudokuBot() {
    console.log("🤖 === DÉMARRAGE DU BOT SUDOKU DYNAMIQUE ===");
    console.log(`⏱️ Pause entre sudokus: ${PAUSE_BETWEEN_SUDOKUS/1000}s`);
    
    while (isProcessing) {
        try {
            // Vérifier le token
            if (!authToken) {
                console.log("⏳ En attente du token d'authentification...");
                waitingForToken = true;
                
                while (!authToken && isProcessing) {
                    await sleep(1000);
                }
                
                waitingForToken = false;
                if (!isProcessing) break;
                console.log("🔑 Token reçu, reprise du processus");
            }
            
            // Résoudre un sudoku
            const success = await solveOneSudoku();
            
            if (!success) {
                console.log("⚠️ Échec de résolution, pause de 2 secondes");
                await sleep(2000);
                continue;
            }
            
            // Pause obligatoire de 5 secondes entre chaque sudoku
            /*if (isProcessing) {
                console.log(`⏳ Pause de ${PAUSE_BETWEEN_SUDOKUS/1000}s avant le prochain sudoku...`);
                await sleep(PAUSE_BETWEEN_SUDOKUS);
            }*/
            
        } catch (error) {
            console.error(`❌ Erreur dans la boucle principale: ${error.message}`);
            stats.errors++;
            await sleep(5000); // Pause plus longue en cas d'erreur critique
        }
    }
    
    console.log("🏁 Bot arrêté");
    console.log(`📊 Statistiques finales: ${stats.totalSolved} sudokus résolus, ${stats.errors} erreurs`);
}

// Gestion de l'arrêt propre
process.on('SIGINT', () => {
    console.log('\n🛑 Arrêt par signal');
    isProcessing = false;
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Arrêt par SIGTERM');
    isProcessing = false;
    process.exit(0);
});

// Démarrage du serveur
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Dynamic Sudoku Bot API running on port ${PORT}`);
    console.log(`📱 Endpoints disponibles:`);
    console.log(`   POST /start-bot - Démarre le bot (body: {token: "your_token"})`);
    console.log(`   POST /submit-token - Fournit le token (body: {token: "your_token"})`);
    console.log(`   POST /stop-bot - Arrête le bot`);
    console.log(`   GET /status - Statut du bot`);
    console.log(`   GET /stats - Statistiques détaillées`);
    console.log(`\n💡 Usage:`);
    console.log(`   1. POST /start-bot avec votre token`);
    console.log(`   2. Le bot résoudra automatiquement les sudokus à l'infini`);
    console.log(`   3. Pause de ${PAUSE_BETWEEN_SUDOKUS/1000}s entre chaque sudoku`);
});
