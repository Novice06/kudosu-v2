const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Configuration
const BASE_URL = "https://sudoku.lumitelburundi.com:8083";

// Variables d'état - TOUTES DYNAMIQUES
let authToken = '';
let mainBotUrl = '';
let isInitialized = false;
let processingStats = {
    totalProcessed: 0,
    totalSuccess: 0,
    totalErrors: 0,
    lastProcessingTime: 0
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
        message: "🤖 Worker Sudoku Bot",
        version: "3.0",
        status: isInitialized ? "READY" : "WAITING_INITIALIZATION",
        configuration: {
            mainBot: mainBotUrl || "Not configured",
            hasToken: !!authToken,
            initialized: isInitialized
        },
        stats: processingStats,
        endpoints: {
            initialize: "POST /initialize - Initialise le worker (token + mainBotUrl requis)",
            solveBatch: "POST /solve-batch - Traite un lot de cellules",
            stop: "POST /stop - Arrête le worker",
            status: "GET /status - Statut complet",
            ping: "GET /ping - Test de vie"
        }
    });
});

app.get("/status", (req, res) => {
    res.json({
        isInitialized,
        hasToken: !!authToken,
        mainBot: mainBotUrl || "Not configured",
        stats: processingStats,
        message: isInitialized ? "Worker opérationnel" : "En attente d'initialisation par le bot principal"
    });
});

// Initialisation du worker - CONFIGURATION 100% DYNAMIQUE
app.post("/initialize", (req, res) => {
    const { token, mainBotUrl: providedMainUrl } = req.body;
    
    // Validation stricte
    if (!token) {
        return res.status(400).json({
            success: false,
            error: "Token d'authentification requis"
        });
    }
    
    if (!providedMainUrl) {
        return res.status(400).json({
            success: false,
            error: "URL du bot principal requise (mainBotUrl)"
        });
    }
    
    // Validation format URL
    try {
        new URL(providedMainUrl);
    } catch (error) {
        return res.status(400).json({
            success: false,
            error: "URL du bot principal invalide"
        });
    }
    
    // Configuration dynamique
    authToken = token;
    mainBotUrl = providedMainUrl;
    isInitialized = true;
    
    // Reset des stats
    processingStats = {
        totalProcessed: 0,
        totalSuccess: 0,
        totalErrors: 0,
        lastProcessingTime: 0
    };
    
    console.log("🔧 Worker initialisé dynamiquement:");
    console.log(`   🔑 Token: ${token.substring(0, 10)}...`);
    console.log(`   🔗 Bot principal: ${mainBotUrl}`);
    
    res.json({
        success: true,
        message: "Worker initialisé avec succès",
        configuration: {
            mainBot: mainBotUrl,
            tokenConfigured: true,
            workerReady: true
        }
    });
});

// Traitement d'un lot de cellules - CŒUR DU WORKER
app.post("/solve-batch", async (req, res) => {
    const { tasks } = req.body;
    
    if (!isInitialized) {
        return res.status(400).json({
            success: false,
            error: "Worker non initialisé. Utilisez /initialize d'abord."
        });
    }
    
    if (!tasks || !Array.isArray(tasks)) {
        return res.status(400).json({
            success: false,
            error: "Paramètre 'tasks' requis (array de cellules)"
        });
    }
    
    if (tasks.length === 0) {
        return res.json({
            success: true,
            completed: 0,
            total: 0,
            message: "Aucune tâche à traiter"
        });
    }
    
    console.log(`🔄 Worker: traitement de ${tasks.length} cellules en parallèle`);
    const startTime = Date.now();
    
    let completedCount = 0;
    const results = [];
    
    try {
        // Traitement MASSIF en parallèle - vitesse maximale
        const promises = tasks.map(async (task, index) => {
            // Validation de la tâche
            if (!task || typeof task.row !== 'number' || typeof task.col !== 'number' || typeof task.value !== 'number') {
                return {
                    index,
                    success: false,
                    error: "Tâche invalide",
                    task
                };
            }
            
            try {
                const success = await submitAnswer(task.row, task.col, task.value);
                if (success) {
                    completedCount++;
                }
                return {
                    index,
                    success,
                    row: task.row,
                    col: task.col,
                    value: task.value
                };
            } catch (error) {
                console.error(`❌ Worker erreur ${task.row},${task.col}=${task.value}: ${error.message}`);
                return {
                    index,
                    success: false,
                    row: task.row,
                    col: task.col,
                    value: task.value,
                    error: error.message
                };
            }
        });
        
        // Attendre TOUS les résultats
        const taskResults = await Promise.all(promises);
        results.push(...taskResults);
        
        const processingTime = Date.now() - startTime;
        
        // Mise à jour des statistiques
        processingStats.totalProcessed += tasks.length;
        processingStats.totalSuccess += completedCount;
        processingStats.totalErrors += (tasks.length - completedCount);
        processingStats.lastProcessingTime = processingTime;
        
        console.log(`✅ Worker terminé: ${completedCount}/${tasks.length} OK en ${processingTime}ms`);
        console.log(`   📊 Vitesse: ${Math.round((tasks.length / processingTime) * 1000)} cellules/seconde`);
        
        res.json({
            success: true,
            completed: completedCount,
            total: tasks.length,
            processingTime,
            speed: Math.round((tasks.length / processingTime) * 1000), // cellules/seconde
            successRate: ((completedCount / tasks.length) * 100).toFixed(1) + '%',
            results: results
        });
        
    } catch (error) {
        console.error("❌ Erreur critique traitement batch:", error.message);
        
        processingStats.totalProcessed += tasks.length;
        processingStats.totalErrors += tasks.length;
        
        res.status(500).json({
            success: false,
            error: error.message,
            completed: completedCount,
            total: tasks.length,
            processingTime: Date.now() - startTime
        });
    }
});

// Arrêt du worker
app.post("/stop", (req, res) => {
    console.log("🛑 Arrêt du worker demandé");
    
    // Reset de la configuration
    isInitialized = false;
    authToken = '';
    mainBotUrl = '';
    
    res.json({
        success: true,
        message: "Worker arrêté et réinitialisé",
        finalStats: processingStats
    });
});

// Fonction de soumission - OPTIMISÉE POUR LA VITESSE
async function submitAnswer(row, col, value) {
    try {
        const headers = getHeaders();
        headers['Content-Type'] = 'application/json';
        headers['Priority'] = 'u=0';
        
        const response = await axios.post(`${BASE_URL}/turns/submit`, {
            answer: { row, col, value }
        }, { 
            headers,
            timeout: 10000, // 10 secondes max par requête
            validateStatus: (status) => status < 500 // Accepter même les erreurs 4xx
        });
        
        return response.status < 400;
    } catch (error) {
        // Log minimal pour performance
        if (error.code !== 'ECONNABORTED') { // Pas de log pour les timeouts
            console.error(`⚠️ ${row},${col}=${value}: ${error.response?.status || error.code}`);
        }
        throw error;
    }
}

// Routes utilitaires
app.get("/ping", (req, res) => {
    res.json({
        success: true,
        message: "Worker alive",
        timestamp: Date.now(),
        uptime: process.uptime(),
        initialized: isInitialized
    });
});

// Test de performance
app.get("/perf-test", async (req, res) => {
    if (!isInitialized) {
        return res.status(400).json({
            success: false,
            error: "Worker non initialisé"
        });
    }
    
    const testStart = Date.now();
    
    // Test de performance sans vraies requêtes
    const mockTasks = Array.from({length: 10}, (_, i) => ({
        row: Math.floor(i / 3),
        col: i % 3,
        value: (i % 9) + 1
    }));
    
    res.json({
        success: true,
        message: "Test de performance",
        mockTasksGenerated: mockTasks.length,
        generationTime: Date.now() - testStart,
        workerReady: true,
        stats: processingStats
    });
});

// Reset des statistiques
app.post("/reset-stats", (req, res) => {
    processingStats = {
        totalProcessed: 0,
        totalSuccess: 0,
        totalErrors: 0,
        lastProcessingTime: 0
    };
    
    res.json({
        success: true,
        message: "Statistiques réinitialisées"
    });
});

// Gestion d'erreur globale pour éviter les crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Worker Unhandled Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (error) => {
    console.error('🚨 Worker Uncaught Exception:', error?.message || error);
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
    console.log(`🔧 Worker Sudoku Bot running on port ${PORT}`);
    console.log(`⚡ Configuration 100% dynamique - aucune variable d'environnement`);
    console.log(`📡 Prêt à recevoir les tâches du bot principal`);
    console.log(`\n💡 Le worker doit être initialisé par le bot principal avec:`);
    console.log(`   POST /initialize`);
    console.log(`   Body: { "token": "...", "mainBotUrl": "..." }`);
});
