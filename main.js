const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Constants
const GRAVITY = 0.5;
const JUMP_FORCE = -12;
const MOVE_SPEED = 5;
const MAX_FALL_SPEED = 15;

// Load Background Image
const bgImage = new Image();
bgImage.src = 'assets/forest_bg.png';

// Input State
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    Space: false
};

let gameState = 'START';
let musicInterval = null;

function startMusic() {
    if (musicInterval) return;
    musicInterval = true; // Avoid adding multiple iframes

    // Add invisible YouTube player for the 8-bit version of Talus Battle
    const ytContainer = document.createElement('div');
    ytContainer.style.position = 'absolute';
    ytContainer.style.top = '-9999px';
    ytContainer.style.left = '-9999px';
    ytContainer.innerHTML = '<iframe width="10" height="10" src="https://www.youtube.com/embed/1XjCmCoqmwU?autoplay=1&loop=1&playlist=1XjCmCoqmwU" allow="autoplay" allowfullscreen></iframe>';
    document.body.appendChild(ytContainer);
}

window.addEventListener('keydown', (e) => {
    if (gameState === 'START' && e.code === 'Enter') {
        gameState = 'PLAYING';
        startMusic();
    }
    if (keys.hasOwnProperty(e.code)) keys[e.code] = true;
    if (e.code === 'Space') keys.Space = true;
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
    if (e.code === 'Space') keys.Space = false;
});

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30; // Square sprite
        this.height = 30;
        this.vx = 0;
        this.vy = 0;
        this.color = '#e52521'; // Mario redish
        this.isGrounded = false;
        this.facingRight = true;
    }

    update(platforms) {
        // Horizontal Movement
        if (keys.ArrowLeft) {
            this.vx = -MOVE_SPEED;
            this.facingRight = false;
        } else if (keys.ArrowRight) {
            this.vx = MOVE_SPEED;
            this.facingRight = true;
        } else {
            // Apply slight friction
            this.vx *= 0.8;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }

        // Jumping
        if ((keys.ArrowUp || keys.Space) && this.isGrounded) {
            this.vy = JUMP_FORCE;
            this.isGrounded = false;
        }

        // Apply Gravity
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;

        // Anticipate new positions
        let nextX = this.x + this.vx;
        let nextY = this.y + this.vy;
        
        this.isGrounded = false;

        // Collision detection for X-axis
        let hitX = false;
        for (let p of platforms) {
            if (nextX < p.x + p.width && nextX + this.width > p.x &&
                this.y < p.y + p.height && this.y + this.height > p.y) {
                
                if (this.vx > 0) { // Moving right
                    nextX = p.x - this.width;
                } else if (this.vx < 0) { // Moving left
                    nextX = p.x + p.width;
                }
                this.vx = 0;
                hitX = true;
                break;
            }
        }
        this.x = nextX;

        // Collision detection for Y-axis
        for (let p of platforms) {
            if (this.x < p.x + p.width && this.x + this.width > p.x &&
                nextY < p.y + p.height && nextY + this.height > p.y) {
                
                if (this.vy > 0) { // Falling down
                    nextY = p.y - this.height;
                    this.isGrounded = true;
                } else if (this.vy < 0) { // Jumping up, hit head
                    nextY = p.y + p.height;
                }
                this.vy = 0;
                break;
            }
        }
        this.y = nextY;

        // Screen boundaries
        if (this.x < 0) this.x = 0;
        
        // Win condition / End of level (just loop for now)
        // Let it scroll or lock camera based on player
        
        // Death by falling
        if (this.y > canvas.height + 100) {
            this.reset();
        }
    }

    reset() {
        this.x = 50;
        this.y = 100;
        this.vx = 0;
        this.vy = 0;
    }

    draw(ctx, cameraX) {
        ctx.fillStyle = this.color;
        // Adjust for camera
        const drawX = this.x - cameraX;
        ctx.fillRect(drawX, this.y, this.width, this.height);
        
        // Eyes and simple details
        ctx.fillStyle = '#fff'; // sclera
        if (this.facingRight) {
            ctx.fillRect(drawX + 16, this.y + 6, 8, 8);
            ctx.fillStyle = '#000'; // pupil
            ctx.fillRect(drawX + 20, this.y + 8, 4, 4);
        } else {
            ctx.fillRect(drawX + 6, this.y + 6, 8, 8);
            ctx.fillStyle = '#000';
            ctx.fillRect(drawX + 6, this.y + 8, 4, 4);
        }

        // Simple overalls
        ctx.fillStyle = '#0047bb'; // blue
        ctx.fillRect(drawX, this.y + 20, this.width, 10);
    }
}

class Platform {
    constructor(x, y, width, height, type = 'ground') {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type; // 'ground' or 'block'
    }

    draw(ctx, cameraX) {
        const drawX = this.x - cameraX;
        
        // Culling (don't draw if offscreen)
        if (drawX + this.width < 0 || drawX > canvas.width) return;

        // Calculate pollution/burn factor based on player position progressing past x=17500
        const pFactor = (typeof player !== 'undefined' && player.x > 17500) 
            ? Math.max(0, Math.min(1, (player.x - 17500) / 2000)) 
            : 0;

        if (this.type === 'ground') {
            // Earth color
            ctx.fillStyle = '#6e4524';
            ctx.fillRect(drawX, this.y, this.width, this.height);
            
            // Grass top
            ctx.fillStyle = '#3a8732'; // Pixel art style grass green
            ctx.fillRect(drawX, this.y, this.width, 12);
            
            // Random grass spots pattern
            ctx.fillStyle = '#49a83f';
            for (let i = 0; i < this.width; i += 20) {
                ctx.fillRect(drawX + i, this.y + 2, 8, 4);
            }

            // Burn overlay directly applied to ground
            if (pFactor > 0) {
                ctx.fillStyle = `rgba(20, 10, 5, ${pFactor * 0.9})`;
                ctx.fillRect(drawX, this.y, this.width, this.height);
                // Extra burnt effect on grass making it ash black
                ctx.fillStyle = `rgba(0, 0, 0, ${pFactor * 0.85})`;
                ctx.fillRect(drawX, this.y, this.width, 12);
            }
        } else {
            // Brick block
            ctx.fillStyle = '#cc5c34';
            ctx.fillRect(drawX, this.y, this.width, this.height);
            
            // Outline/details for block
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(drawX, this.y, this.width, this.height);
            // Internal brick lines
            ctx.beginPath();
            ctx.moveTo(drawX, this.y + this.height/2);
            ctx.lineTo(drawX + this.width, this.y + this.height/2);
            ctx.moveTo(drawX + this.width/2, this.y);
            ctx.lineTo(drawX + this.width/2, this.y + this.height/2);
            ctx.moveTo(drawX + this.width*0.25, this.y + this.height/2);
            ctx.lineTo(drawX + this.width*0.25, this.y + this.height);
            ctx.moveTo(drawX + this.width*0.75, this.y + this.height/2);
            ctx.lineTo(drawX + this.width*0.75, this.y + this.height);
            ctx.stroke();

            // Burn overlay for blocks
            if (pFactor > 0) {
                ctx.fillStyle = `rgba(15, 0, 0, ${pFactor * 0.85})`;
                ctx.fillRect(drawX, this.y, this.width, this.height);
            }
        }
    }
}

// Level Data
const levelData = [
    { type: 'ground', x: 0, y: 500, w: 1000, h: 100 },
    { type: 'ground', x: 1100, y: 500, w: 800, h: 100 },
    { type: 'block', x: 300, y: 350, w: 40, h: 40 },
    { type: 'block', x: 340, y: 350, w: 40, h: 40 },
    { type: 'block', x: 380, y: 350, w: 40, h: 40 },
    { type: 'block', x: 340, y: 180, w: 40, h: 40 },
    { type: 'ground', x: 550, y: 400, w: 60, h: 100 }, // Pipe / Obstacle
    { type: 'block', x: 750, y: 300, w: 120, h: 20 },
    // A bit of platforming
    { type: 'block', x: 950, y: 250, w: 80, h: 20 },
    { type: 'block', x: 1200, y: 350, w: 40, h: 40 },
    { type: 'block', x: 1350, y: 250, w: 40, h: 40 },
    { type: 'ground', x: 1500, y: 400, w: 400, h: 200 } // Taller ground section
];

class Enemy {
    constructor(x, y, walkDistance) {
        this.startX = x;
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.vx = 2; // Walk speed
        this.walkDistance = Math.max(walkDistance, 10);
        this.color = '#8b0000'; // Dark red
    }

    update() {
        this.x += this.vx;
        if (this.x > this.startX + this.walkDistance) {
            this.x = this.startX + this.walkDistance;
            this.vx *= -1;
        } else if (this.x < this.startX) {
            this.x = this.startX;
            this.vx *= -1;
        }
    }

    draw(ctx, cameraX) {
        const drawX = this.x - cameraX;
        if (drawX + this.width < 0 || drawX > canvas.width) return;
        
        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, this.y, this.width, this.height);
        
        ctx.fillStyle = '#fff';
        ctx.fillRect(drawX + 4, this.y + 8, 8, 8);
        ctx.fillRect(drawX + 18, this.y + 8, 8, 8);
        ctx.fillStyle = '#000';
        ctx.fillRect(drawX + 6 + (this.vx > 0 ? 2 : 0), this.y + 10, 4, 4);
        ctx.fillRect(drawX + 20 + (this.vx > 0 ? 2 : 0), this.y + 10, 4, 4);
    }
}

// Game State
let player;
let platforms = [];
let enemies = [];
let cameraX = 0;

function init() {
    player = new Player(50, 400);
    
    // Parse level data
    platforms = levelData.map(p => new Platform(p.x, p.y, p.w, p.h, p.type));
    
    // Generate long level (10x longer, up to x=20000)
    let currentX = 1900;
    while (currentX < 20000) {
        const gap = Math.random() > 0.7 ? Math.random() * 150 + 50 : 0;
        currentX += gap;
        
        const groundWidth = Math.random() * 800 + 400;
        const groundY = 400 + Math.random() * 100;
        platforms.push(new Platform(currentX, groundY, groundWidth, 600 - groundY, 'ground'));
        
        if (Math.random() > 0.5) {
            platforms.push(new Platform(currentX + 100, groundY - 100, 40, 40, 'block'));
            platforms.push(new Platform(currentX + 140, groundY - 100, 40, 40, 'block'));
        }
        
        if (Math.random() > 0.3) {
            enemies.push(new Enemy(currentX + 100, groundY - 30, groundWidth - 200));
        }

        currentX += groundWidth;
    }
    
    // Start loop
    requestAnimationFrame(gameLoop);
}

function updateCamera() {
    // Keep player in the middle third of the screen roughly
    const scrollBorderRight = cameraX + canvas.width * 0.6;
    const scrollBorderLeft = cameraX + canvas.width * 0.3;
    
    if (player.x > scrollBorderRight) {
        cameraX = player.x - canvas.width * 0.6;
    } else if (player.x < scrollBorderLeft && cameraX > 0) {
        cameraX = player.x - canvas.width * 0.3;
    }
    
    // Don't scroll past the left edge of the level
    if (cameraX < 0) cameraX = 0;
}

function drawBackground() {
    const pFactor = (typeof player !== 'undefined' && player.x > 17500) 
        ? Math.max(0, Math.min(1, (player.x - 17500) / 2000)) 
        : 0;

    // Clear just in case
    if (pFactor > 0) {
        // Interplate sky blue (92, 148, 252) towards dirty orange/black (44, 20, 10)
        const r = Math.floor(92 + (44 - 92) * pFactor);
        const g = Math.floor(148 + (20 - 148) * pFactor);
        const b = Math.floor(252 + (10 - 252) * pFactor);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    } else {
        ctx.fillStyle = '#5c94fc'; // Default sky blue
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (bgImage.complete) {
        // Advanced parallax: background moves slower than foreground
        const bgPatternScroll = (cameraX * 0.2) % canvas.width;
        
        // Draw the image twice to create a seamless looping background effect
        ctx.drawImage(bgImage, -bgPatternScroll, 0, canvas.width, canvas.height);
        ctx.drawImage(bgImage, canvas.width - bgPatternScroll, 0, canvas.width, canvas.height);

        // Overlay smog / darkness over the image
        if (pFactor > 0) {
            ctx.fillStyle = `rgba(40, 20, 10, ${pFactor * 0.85})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }
}

function gameLoop() {
    if (gameState === 'START') {
        ctx.fillStyle = '#5c94fc'; // Default sky blue
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("SQUARE PLATFORMER", canvas.width/2, canvas.height/2 - 50);
        
        ctx.font = '20px Arial';
        // Blink effect
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.fillText("Press ENTER to Start", canvas.width/2, canvas.height/2 + 30);
        }
        
        requestAnimationFrame(gameLoop);
        return;
    }

    // 1. Update Game State
    player.update(platforms);
    enemies.forEach(enemy => enemy.update());
    
    // Check collision with enemies -> reset player
    for (let enemy of enemies) {
        if (player.x < enemy.x + enemy.width && player.x + player.width > enemy.x &&
            player.y < enemy.y + enemy.height && player.y + player.height > enemy.y) {
            player.reset();
        }
    }

    updateCamera();

    // 2. Clear & Draw Background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();

    // 3. Draw Elements (offset by camera)
    for (let platform of platforms) {
        platform.draw(ctx, cameraX);
    }
    for (let enemy of enemies) {
        enemy.draw(ctx, cameraX);
    }
    player.draw(ctx, cameraX);

    // 4. Request next frame
    requestAnimationFrame(gameLoop);
}

// Wait for bg to load before starting just to avoid flashes, though can start immediately too
init();
