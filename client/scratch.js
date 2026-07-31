document.addEventListener('DOMContentLoaded', () => {
    const playButton = document.getElementById('play-button');
    const creditBalanceEl = document.getElementById('credit-balance');
    const messageArea = document.getElementById('message-area');
    const scratchCard = document.getElementById('scratch-card');
    
    let currentCredits = 0;
    let isPlaying = false;
    let rowsData = [];
    
    const NUM_ROWS = 5;
    const SWIPE_TARGET = 300; // pixels to swipe to fully reveal a row
    
    // The 5 images the user provided
    const overlayImages = [
        'assets/silver1.png', // 100% covered
        'assets/silver2.png', // ~75% covered
        'assets/silver3.png', // ~50% covered
        'assets/silver4.png', // ~25% covered
        'assets/silver5.png'  // fully scratched / clear
    ];

    // --- API Calls ---
    async function fetchUserState() {
        try {
            const res = await fetch('/api/user');
            const data = await res.json();
            if (data.success) {
                currentCredits = data.user.balance;
                updateCreditsDisplay();
            }
        } catch (err) {
            console.error('Failed to fetch user state:', err);
        }
    }

    async function apiPlayScratch() {
        const res = await fetch('/api/scratch/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to play');
        }
        return data.result;
    }

    // Set initial balance
    fetchUserState();

    // --- UI Setup ---
    function updateCreditsDisplay() {
        creditBalanceEl.textContent = currentCredits;
    }
    
    function showMessage(msg, isSuccess = false) {
        messageArea.textContent = msg;
        if (isSuccess) {
            messageArea.classList.add('message-success');
        } else {
            messageArea.classList.remove('message-success');
        }
    }

    function initRows() {
        scratchCard.innerHTML = '';
        rowsData = [];
        
        for(let i=0; i<NUM_ROWS; i++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'scratch-row';
            
            const prizeBg = document.createElement('div');
            prizeBg.className = 'prize-background';
            
            const prizeText = document.createElement('div');
            prizeText.className = 'prize-text';
            prizeText.textContent = '???'; // Hidden initially
            
            prizeBg.appendChild(prizeText);
            
            const overlay = document.createElement('img');
            overlay.className = 'overlay-image';
            overlay.src = overlayImages[0];
            overlay.draggable = false;
            
            rowEl.appendChild(prizeBg);
            rowEl.appendChild(overlay);
            scratchCard.appendChild(rowEl);
            
            rowsData.push({
                element: rowEl,
                overlay: overlay,
                prizeBg: prizeBg,
                prizeText: prizeText,
                prizeAmount: 0,
                scratchedDistance: 0,
                isRevealed: true // True by default until they click play
            });
            
            setupRowEvents(rowEl, i);
        }
    }

    // --- Swiping Logic ---
    function setupRowEvents(rowEl, index) {
        let isSwiping = false;
        let lastX = 0;
        
        const startSwipe = (e) => {
            if (rowsData[index].isRevealed || !isPlaying) return;
            isSwiping = true;
            lastX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        };
        
        const moveSwipe = (e) => {
            if (!isSwiping || rowsData[index].isRevealed || !isPlaying) return;
            e.preventDefault(); // prevent scrolling while scratching
            
            const currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
            const deltaX = Math.abs(currentX - lastX); // Accumulate distance even if swiping back and forth
            lastX = currentX;
            
            rowsData[index].scratchedDistance += deltaX;
            updateRowOverlay(index);
        };
        
        const endSwipe = () => {
            isSwiping = false;
        };
        
        rowEl.addEventListener('mousedown', startSwipe);
        window.addEventListener('mousemove', moveSwipe); // Listen on window so dragging outside row doesn't break
        window.addEventListener('mouseup', endSwipe);
        
        rowEl.addEventListener('touchstart', startSwipe, {passive: false});
        rowEl.addEventListener('touchmove', moveSwipe, {passive: false});
        rowEl.addEventListener('touchend', endSwipe);
    }
    
    function updateRowOverlay(index) {
        const row = rowsData[index];
        const percent = Math.min(100, (row.scratchedDistance / SWIPE_TARGET) * 100);
        
        let imageIndex = 0;
        if (percent >= 80) imageIndex = 4;
        else if (percent >= 60) imageIndex = 3;
        else if (percent >= 40) imageIndex = 2;
        else if (percent >= 20) imageIndex = 1;
        
        row.overlay.src = overlayImages[imageIndex];
        
        // If they reach the last image, fully reveal
        if (imageIndex === 4 && !row.isRevealed) {
            row.isRevealed = true;
            row.overlay.style.transition = 'opacity 0.3s ease';
            row.overlay.style.opacity = '0'; // completely hide it
            
            if (row.prizeAmount > 0) {
                row.prizeBg.classList.add('winner');
            }
            
            checkAllRevealed();
        }
    }

    // --- Game Flow ---
    async function handlePlay() {
        if (isPlaying) return;
        
        playButton.disabled = true;
        showMessage("Preparing your card...");
        
        try {
            // Call real API
            const result = await apiPlayScratch();
            
            // Update balance from API result
            currentCredits = result.newBalance;
            updateCreditsDisplay();
            
            // Setup Card
            isPlaying = true;
            
            for (let i = 0; i < NUM_ROWS; i++) {
                const row = rowsData[i];
                row.prizeAmount = result.prizes[i];
                
                if (row.prizeAmount > 0) {
                    row.prizeText.textContent = `WIN ${row.prizeAmount} CREDITS!`;
                } else {
                    row.prizeText.textContent = "NO WIN";
                }
                
                // Reset state
                row.scratchedDistance = 0;
                row.isRevealed = false;
                row.overlay.style.transition = 'none';
                row.overlay.style.opacity = '1';
                row.overlay.src = overlayImages[0];
                row.prizeBg.classList.remove('winner');
            }
            
            showMessage("Swipe left and right on each row to scratch!");
            
        } catch (err) {
            showMessage(err.message || 'Error playing scratch card. Try again.');
            playButton.disabled = false;
            console.error(err);
        }
    }
    
    function checkAllRevealed() {
        const allRevealed = rowsData.every(row => row.isRevealed);
        
        if (allRevealed) {
            isPlaying = false;
            
            const totalWon = rowsData.reduce((sum, row) => sum + row.prizeAmount, 0);
            
            if (totalWon > 0) {
                showMessage(`Congratulations! You won a total of ${totalWon} credits!`, true);
                triggerConfetti();
            } else {
                showMessage("Better luck next time! Try another card.");
            }
            
            // 15 second countdown
            let countdown = 15;
            playButton.disabled = true;
            playButton.textContent = `Next game in ${countdown}s...`;
            
            const timerInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    playButton.textContent = `Next game in ${countdown}s...`;
                } else {
                    clearInterval(timerInterval);
                    playButton.disabled = false;
                    playButton.textContent = "Play (Cost: 5 Credits)";
                    showMessage("Click Play to start a new card!");
                }
            }, 1000);
        }
    }
    
    function triggerConfetti() {
        if (window.confetti) {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#d4af37', '#f3e5ab', '#ffffff']
            });
        }
    }
    
    // --- Initialization ---
    playButton.addEventListener('click', handlePlay);
    initRows(); // Draw the initial locked rows
});