// Game State
let credits = 100;
let betAmount = 1;
let selectedNumbers = [];
let drawnNumbers = [];
let isPlaying = false;

// Keno standard paytables (Multipliers based on pick count and matches)
// Format: paytable[numberOfPicks][matches] = multiplier
const PAYTABLES = {
    1: { 1: 5 },
    2: { 1: 2, 2: 15 },
    3: { 1: 1, 2: 5, 3: 50 },
    4: { 1: 1, 2: 3, 3: 15, 4: 200 },
    5: { 1: 2, 2: 5, 3: 20, 4: 100, 5: 1000 }
};

// DOM Elements
const gridContainer = document.getElementById('keno-grid');
const pickCountEl = document.getElementById('pick-count');
const creditsEl = document.getElementById('credits');
const betAmountEl = document.getElementById('bet-amount');
const paytableEl = document.getElementById('paytable');
const messageEl = document.getElementById('game-message');

const btnBetUp = document.getElementById('btn-bet-up');
const btnBetDown = document.getElementById('btn-bet-down');
const btnClear = document.getElementById('btn-clear');
const btnQuickPick = document.getElementById('btn-quick-pick');
const btnPlay = document.getElementById('btn-play');

// Confetti Setup
const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
let particles = [];

// Initialization
function init() {
    createGrid();
    updateUI();
    
    // Event Listeners
    btnBetUp.addEventListener('click', () => {
        if (betAmount < credits && !isPlaying) {
            betAmount++;
            updateUI();
        }
    });
    
    btnBetDown.addEventListener('click', () => {
        if (betAmount > 1 && !isPlaying) {
            betAmount--;
            updateUI();
        }
    });
    
    btnClear.addEventListener('click', () => {
        if (!isPlaying) {
            selectedNumbers = [];
            resetGridClasses();
            updateUI();
        }
    });
    
    btnQuickPick.addEventListener('click', () => {
        if (!isPlaying) {
            selectedNumbers = [];
            while(selectedNumbers.length < 5) {
                const num = Math.floor(Math.random() * 40) + 1;
                if (!selectedNumbers.includes(num)) {
                    selectedNumbers.push(num);
                }
            }
            resetGridClasses();
            selectedNumbers.forEach(num => {
                document.getElementById(`num-${num}`).classList.add('selected');
            });
            updateUI();
        }
    });
    
    btnPlay.addEventListener('click', playRound);
}

function createGrid() {
    gridContainer.innerHTML = '';
    for (let i = 1; i <= 40; i++) {
        const numEl = document.createElement('div');
        numEl.classList.add('keno-num');
        numEl.id = `num-${i}`;
        numEl.textContent = i;
        
        numEl.addEventListener('click', () => toggleNumber(i));
        gridContainer.appendChild(numEl);
    }
}

function toggleNumber(num) {
    if (isPlaying) return;
    
    const index = selectedNumbers.indexOf(num);
    const numEl = document.getElementById(`num-${num}`);
    
    if (index > -1) {
        // Deselect
        selectedNumbers.splice(index, 1);
        numEl.classList.remove('selected');
    } else {
        // Select
        if (selectedNumbers.length < 5) {
            selectedNumbers.push(num);
            numEl.classList.add('selected');
        } else {
            showMessage("You can only select up to 5 numbers.", "warning");
        }
    }
    
    // Reset any previous draw states
    resetGridClasses(true); 
    
    updateUI();
}

function resetGridClasses(keepSelected = false) {
    for (let i = 1; i <= 40; i++) {
        const numEl = document.getElementById(`num-${i}`);
        numEl.classList.remove('drawn', 'matched');
        if (!keepSelected) {
            numEl.classList.remove('selected');
        }
    }
    document.querySelectorAll('.pay-row').forEach(row => row.classList.remove('highlight'));
}

function updateUI() {
    creditsEl.textContent = credits;
    betAmountEl.textContent = betAmount;
    pickCountEl.textContent = `${selectedNumbers.length} / 5 Picks`;
    
    // Enable/Disable Play button
    btnPlay.disabled = selectedNumbers.length === 0 || credits < betAmount || isPlaying;
    
    // Update Paytable display
    renderPaytable();
    
    if (!isPlaying) {
        if (selectedNumbers.length === 0) {
            showMessage("Select numbers or use Quick Pick to play.");
        } else {
            showMessage(`Ready to play. Cost: ${betAmount} credits.`);
        }
    }
}

function renderPaytable() {
    const pickCount = selectedNumbers.length;
    paytableEl.innerHTML = '<div class="pay-row"><span>Matches</span><span>Payout</span></div>';
    
    if (pickCount === 0) {
        paytableEl.innerHTML += '<div class="pay-row"><span>-</span><span>-</span></div>';
        return;
    }
    
    const table = PAYTABLES[pickCount];
    
    // Convert object to sorted array of matches
    const matches = Object.keys(table).map(Number).sort((a,b) => b - a);
    
    matches.forEach(match => {
        const row = document.createElement('div');
        row.className = 'pay-row';
        row.id = `pay-row-${match}`;
        row.innerHTML = `<span>${match}</span><span>${table[match] * betAmount}</span>`;
        paytableEl.appendChild(row);
    });
}

function showMessage(text, type = "normal") {
    messageEl.textContent = text;
    messageEl.className = 'game-message';
    if (type !== "normal") {
        messageEl.classList.add(type);
    }
}

async function playRound() {
    if (selectedNumbers.length === 0 || credits < betAmount || isPlaying) return;
    
    isPlaying = true;
    credits -= betAmount;
    resetGridClasses(true);
    updateUI();
    
    showMessage("Drawing numbers...", "normal");
    
    // Fisher-Yates shuffle: generate array 1-40, shuffle, pick first 5
    const pool = Array.from({ length: 40 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    drawnNumbers = pool.slice(0, 5).sort((a, b) => a - b);
    
    // Reveal sequentially
    for (let i = 0; i < drawnNumbers.length; i++) {
        await new Promise(r => setTimeout(r, 150)); // 150ms per draw
        
        const num = drawnNumbers[i];
        const numEl = document.getElementById(`num-${num}`);
        
        if (selectedNumbers.includes(num)) {
            numEl.classList.remove('selected');
            numEl.classList.add('matched');
        } else {
            numEl.classList.add('drawn');
        }
    }
    
    calculateWin();
}

function calculateWin() {
    const matches = drawnNumbers.filter(n => selectedNumbers.includes(n)).length;
    const pickCount = selectedNumbers.length;
    const table = PAYTABLES[pickCount];
    
    const multiplier = table && table[matches] ? table[matches] : 0;
    const winAmount = multiplier * betAmount;
    
    // Highlight paytable row
    const rowEl = document.getElementById(`pay-row-${matches}`);
    if (rowEl) rowEl.classList.add('highlight');
    
    if (winAmount > 0) {
        credits += winAmount;
        showMessage(`You matched ${matches} numbers! Won ${winAmount} credits!`, "win");
        fireConfetti();
    } else {
        showMessage(`You matched ${matches} numbers. Better luck next time!`, "loss");
    }
    
    isPlaying = false;
    updateUI();
}

// Confetti System
function fireConfetti() {
    particles = [];
    const colors = ['#fbbf24', '#3b82f6', '#10b981', '#ef4444', '#ffffff'];
    
    for (let i = 0; i < 120; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2 + 100,
            r: Math.random() * 5 + 2,
            dx: Math.random() * 6 - 3,
            dy: Math.random() * -6 - 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.floor(Math.random() * 10) - 10,
            tiltAngleInc: (Math.random() * 0.04) + 0.02,
            tiltAngle: 0
        });
    }
    animateConfetti();
}

function animateConfetti() {
    requestAnimationFrame(animateConfetti);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    particles.forEach((p, index) => {
        p.tiltAngle += p.tiltAngleInc;
        p.y += (Math.cos(p.tiltAngle) + 1 + p.r / 2) / 2;
        p.x += Math.sin(p.tiltAngle) * 2;
        p.dy += 0.03; // gravity
        p.y += p.dy;
        p.x += p.dx;
        
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r);
        ctx.stroke();
        
        if (p.y > canvas.height) {
            particles.splice(index, 1);
        }
    });
}

// Resize canvas on window resize
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Start
init();