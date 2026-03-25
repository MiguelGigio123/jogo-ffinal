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
    Space: false,
    Enter: false
};

// ─── Game State ───────────────────────────────────────────────────────────────
let gameState = 'START'; // START | PLAYING | DEAD
let musicInterval = null;
let deathTimer = 0;        // frames shown on death screen
const DEATH_FREEZE = 90;   // frames before "press enter" appears

function startMusic() {
    if (musicInterval) return;
    musicInterval = true;

    const ytContainer = document.createElement('div');
    ytContainer.style.position = 'absolute';
    ytContainer.style.top = '-9999px';
    ytContainer.style.left = '-9999px';
    ytContainer.innerHTML =
        '<iframe width="10" height="10" ' +
        'src="https://www.youtube.com/embed/O2l2Q0dh6t8?autoplay=1&loop=1&playlist=O2l2Q0dh6t8" ' +
        'allow="autoplay" allowfullscreen></iframe>';
    document.body.appendChild(ytContainer);
}

window.addEventListener('keydown', (e) => {
    if (gameState === 'START' && e.code === 'Enter') {
        gameState = 'PLAYING';
        startMusic();
    }
    // Respawn from death screen
    if (gameState === 'DEAD' && e.code === 'Enter' && deathTimer >= DEATH_FREEZE) {
        respawnPlayer();
    }
    if (keys.hasOwnProperty(e.code)) keys[e.code] = true;
    if (e.code === 'Space') keys.Space = true;
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
    if (e.code === 'Space') keys.Space = false;
});

// ─── Checkpoint ───────────────────────────────────────────────────────────────
class Checkpoint {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 50;
        this.activated = false;
        this.flagWave = 0; // animation frame counter
    }

    update(playerX, playerY) {
        if (!this.activated) {
            // Activate when player walks into flag hitbox
            if (playerX + 30 > this.x && playerX < this.x + this.width &&
                playerY + 30 > this.y && playerY < this.y + this.height) {
                this.activated = true;
            }
        }
        if (this.activated) this.flagWave++;
    }

    draw(ctx, cameraX) {
        const drawX = this.x - cameraX;
        if (drawX + this.width < 0 || drawX > canvas.width) return;

        // Pole
        ctx.fillStyle = '#888';
        ctx.fillRect(drawX + 8, this.y, 4, this.height);

        // Flag
        const wave = this.activated ? Math.sin(this.flagWave * 0.15) * 4 : 0;
        ctx.fillStyle = this.activated ? '#ffd700' : '#ccc';
        // Simple waving flag using a trapezoid-ish quad
        ctx.beginPath();
        ctx.moveTo(drawX + 12, this.y);
        ctx.lineTo(drawX + 30, this.y + 5 + wave);
        ctx.lineTo(drawX + 30, this.y + 18 + wave);
        ctx.lineTo(drawX + 12, this.y + 18);
        ctx.closePath();
        ctx.fill();

        // Star on activated flag
        if (this.activated) {
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('★', drawX + 21, this.y + 14 + wave);
        }
    }
}

// ─── Player ───────────────────────────────────────────────────────────────────
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.spawnX = x;  // last activated checkpoint position
        this.spawnY = y;
        this.width = 30;
        this.height = 30;
        this.vx = 0;
        this.vy = 0;
        this.color = '#e52521';
        this.isGrounded = false;
        this.facingRight = true;
        this.dead = false;
        this.deathAnim = 0; // bounce up on death
    }

    setCheckpoint(x, y) {
        this.spawnX = x;
        this.spawnY = y - this.height; // place above flag
    }

    update(platforms) {
        if (this.dead) return; // handled by death screen

        // Horizontal Movement
        if (keys.ArrowLeft) {
            this.vx = -MOVE_SPEED;
            this.facingRight = false;
        } else if (keys.ArrowRight) {
            this.vx = MOVE_SPEED;
            this.facingRight = true;
        } else {
            this.vx *= 0.8;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        }

        // Jumping
        if ((keys.ArrowUp || keys.Space) && this.isGrounded) {
            this.vy = JUMP_FORCE;
            this.isGrounded = false;
        }

        // Gravity
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;

        let nextX = this.x + this.vx;
        let nextY = this.y + this.vy;
        this.isGrounded = false;

        // X collision
        for (let p of platforms) {
            if (nextX < p.x + p.width && nextX + this.width > p.x &&
                this.y < p.y + p.height && this.y + this.height > p.y) {
                if (this.vx > 0) nextX = p.x - this.width;
                else if (this.vx < 0) nextX = p.x + p.width;
                this.vx = 0;
                break;
            }
        }
        this.x = nextX;

        // Y collision
        for (let p of platforms) {
            if (this.x < p.x + p.width && this.x + this.width > p.x &&
                nextY < p.y + p.height && nextY + this.height > p.y) {
                if (this.vy > 0) {
                    nextY = p.y - this.height;
                    this.isGrounded = true;
                } else if (this.vy < 0) {
                    nextY = p.y + p.height;
                }
                this.vy = 0;
                break;
            }
        }
        this.y = nextY;

        // Screen left boundary
        if (this.x < 0) this.x = 0;

        // Death by falling
        if (this.y > canvas.height + 100) {
            this.die();
        }
    }

    die() {
        this.dead = true;
        this.vx = 0;
        this.vy = 0;
        gameState = 'DEAD';
        deathTimer = 0;
        // Make camera stay where player died (handled by keeping cameraX)
    }

    reset() {
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.vx = 0;
        this.vy = 0;
        this.dead = false;
    }

    draw(ctx, cameraX) {
        if (this.dead) return;
        ctx.fillStyle = this.color;
        const drawX = this.x - cameraX;
        ctx.fillRect(drawX, this.y, this.width, this.height);

        // Eyes
        ctx.fillStyle = '#fff';
        if (this.facingRight) {
            ctx.fillRect(drawX + 16, this.y + 6, 8, 8);
            ctx.fillStyle = '#000';
            ctx.fillRect(drawX + 20, this.y + 8, 4, 4);
        } else {
            ctx.fillRect(drawX + 6, this.y + 6, 8, 8);
            ctx.fillStyle = '#000';
            ctx.fillRect(drawX + 6, this.y + 8, 4, 4);
        }

        // Overalls
        ctx.fillStyle = '#0047bb';
        ctx.fillRect(drawX, this.y + 20, this.width, 10);
    }
}

// ─── Platform ─────────────────────────────────────────────────────────────────
class Platform {
    constructor(x, y, width, height, type = 'ground') {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type;
    }

    draw(ctx, cameraX) {
        const drawX = this.x - cameraX;
        if (drawX + this.width < 0 || drawX > canvas.width) return;

        const pFactor = (typeof player !== 'undefined' && player.x > 17500)
            ? Math.max(0, Math.min(1, (player.x - 17500) / 2000))
            : 0;

        if (this.type === 'ground') {
            ctx.fillStyle = '#6e4524';
            ctx.fillRect(drawX, this.y, this.width, this.height);
            ctx.fillStyle = '#3a8732';
            ctx.fillRect(drawX, this.y, this.width, 12);
            ctx.fillStyle = '#49a83f';
            for (let i = 0; i < this.width; i += 20) {
                ctx.fillRect(drawX + i, this.y + 2, 8, 4);
            }
            if (pFactor > 0) {
                ctx.fillStyle = `rgba(20, 10, 5, ${pFactor * 0.9})`;
                ctx.fillRect(drawX, this.y, this.width, this.height);
                ctx.fillStyle = `rgba(0, 0, 0, ${pFactor * 0.85})`;
                ctx.fillRect(drawX, this.y, this.width, 12);
            }
        } else {
            ctx.fillStyle = '#cc5c34';
            ctx.fillRect(drawX, this.y, this.width, this.height);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(drawX, this.y, this.width, this.height);
            ctx.beginPath();
            ctx.moveTo(drawX, this.y + this.height / 2);
            ctx.lineTo(drawX + this.width, this.y + this.height / 2);
            ctx.moveTo(drawX + this.width / 2, this.y);
            ctx.lineTo(drawX + this.width / 2, this.y + this.height / 2);
            ctx.moveTo(drawX + this.width * 0.25, this.y + this.height / 2);
            ctx.lineTo(drawX + this.width * 0.25, this.y + this.height);
            ctx.moveTo(drawX + this.width * 0.75, this.y + this.height / 2);
            ctx.lineTo(drawX + this.width * 0.75, this.y + this.height);
            ctx.stroke();
            if (pFactor > 0) {
                ctx.fillStyle = `rgba(15, 0, 0, ${pFactor * 0.85})`;
                ctx.fillRect(drawX, this.y, this.width, this.height);
            }
        }
    }
}

// ─── Level Data ───────────────────────────────────────────────────────────────
const levelData = [
    { type: 'ground', x: 0,    y: 500, w: 1000, h: 100 },
    { type: 'ground', x: 1100, y: 500, w: 800,  h: 100 },
    { type: 'block',  x: 300,  y: 350, w: 40,   h: 40 },
    { type: 'block',  x: 340,  y: 350, w: 40,   h: 40 },
    { type: 'block',  x: 380,  y: 350, w: 40,   h: 40 },
    { type: 'block',  x: 340,  y: 180, w: 40,   h: 40 },
    { type: 'ground', x: 550,  y: 400, w: 60,   h: 100 },
    { type: 'block',  x: 750,  y: 300, w: 120,  h: 20 },
    { type: 'block',  x: 950,  y: 250, w: 80,   h: 20 },
    { type: 'block',  x: 1200, y: 350, w: 40,   h: 40 },
    { type: 'block',  x: 1350, y: 250, w: 40,   h: 40 },
    { type: 'ground', x: 1500, y: 400, w: 400,  h: 200 }
];

// ─── Enemy ────────────────────────────────────────────────────────────────────
class Enemy {
    constructor(x, y, walkDistance) {
        this.startX = x;
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.vx = 2;
        this.walkDistance = Math.max(walkDistance, 10);
        this.color = '#8b0000';
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
        ctx.fillRect(drawX + 4,  this.y + 8, 8, 8);
        ctx.fillRect(drawX + 18, this.y + 8, 8, 8);
        ctx.fillStyle = '#000';
        ctx.fillRect(drawX + 6  + (this.vx > 0 ? 2 : 0), this.y + 10, 4, 4);
        ctx.fillRect(drawX + 20 + (this.vx > 0 ? 2 : 0), this.y + 10, 4, 4);
    }
}

// ─── Runtime state ────────────────────────────────────────────────────────────
let player;
let platforms  = [];
let enemies    = [];
let checkpoints = [];
let cameraX    = 0;

function respawnPlayer() {
    player.reset();
    // Snap camera to spawn point
    cameraX = Math.max(0, player.x - canvas.width * 0.3);
    gameState = 'PLAYING';
}

function init() {
    player = new Player(50, 400);

    platforms = levelData.map(p => new Platform(p.x, p.y, p.w, p.h, p.type));

    // Place checkpoints every ~2000 units along the level
    const checkpointInterval = 2000;
    for (let cx = checkpointInterval; cx < 20000; cx += checkpointInterval) {
        // The flag will sit on the ground; y=370 keeps it above typical ground
        checkpoints.push(new Checkpoint(cx, 370));
    }

    // Generate long level (up to x=20000)
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

    requestAnimationFrame(gameLoop);
}

function updateCamera() {
    const scrollBorderRight = cameraX + canvas.width * 0.6;
    const scrollBorderLeft  = cameraX + canvas.width * 0.3;

    if (player.x > scrollBorderRight) {
        cameraX = player.x - canvas.width * 0.6;
    } else if (player.x < scrollBorderLeft && cameraX > 0) {
        cameraX = player.x - canvas.width * 0.3;
    }

    if (cameraX < 0) cameraX = 0;
}

function drawBackground() {
    const pFactor = (typeof player !== 'undefined' && player.x > 17500)
        ? Math.max(0, Math.min(1, (player.x - 17500) / 2000))
        : 0;

    if (pFactor > 0) {
        const r = Math.floor(92  + (44  - 92)  * pFactor);
        const g = Math.floor(148 + (20  - 148) * pFactor);
        const b = Math.floor(252 + (10  - 252) * pFactor);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    } else {
        ctx.fillStyle = '#5c94fc';
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (bgImage.complete) {
        const bgPatternScroll = (cameraX * 0.2) % canvas.width;
        ctx.drawImage(bgImage, -bgPatternScroll, 0, canvas.width, canvas.height);
        ctx.drawImage(bgImage, canvas.width - bgPatternScroll, 0, canvas.width, canvas.height);
        if (pFactor > 0) {
            ctx.fillStyle = `rgba(40, 20, 10, ${pFactor * 0.85})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }
}

// ─── Death Screen ─────────────────────────────────────────────────────────────
function drawDeathScreen() {
    // Semi-transparent dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Flicker red vignette
    const vig = (Math.sin(deathTimer * 0.15) * 0.5 + 0.5) * 0.4;
    const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.2,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.8
    );
    grad.addColorStop(0, `rgba(180,0,0,0)`);
    grad.addColorStop(1, `rgba(180,0,0,${vig})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // "VOCÊ MORREU" title — big bold red text with dark shadow
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#cc0000';
    ctx.font = 'bold 72px Arial';
    ctx.fillText('VOCÊ MORREU', canvas.width / 2, canvas.height / 2 - 30);
    ctx.shadowBlur = 0;

    // Checkpoint hint
    const atCheckpoint = checkpoints.some(c => c.activated);
    ctx.fillStyle = '#ddd';
    ctx.font = '18px Arial';
    if (atCheckpoint) {
        ctx.fillText('Respawn do último checkpoint', canvas.width / 2, canvas.height / 2 + 20);
    } else {
        ctx.fillText('Sem checkpoint ativo — voltando ao início', canvas.width / 2, canvas.height / 2 + 20);
    }

    // Blinking "Press ENTER" — only shown after DEATH_FREEZE frames
    if (deathTimer >= DEATH_FREEZE && Math.floor(deathTimer / 30) % 2 === 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('Pressione ENTER para continuar', canvas.width / 2, canvas.height / 2 + 70);
    }

    ctx.textAlign = 'left'; // reset
}

// ─── Checkpoint banner (HUD) ──────────────────────────────────────────────────
let checkpointBanner = { visible: false, timer: 0 };

function showCheckpointBanner() {
    checkpointBanner.visible = true;
    checkpointBanner.timer = 180; // ~3s at 60fps
}

function drawCheckpointBanner() {
    if (!checkpointBanner.visible) return;
    checkpointBanner.timer--;
    if (checkpointBanner.timer <= 0) {
        checkpointBanner.visible = false;
        return;
    }

    const alpha = Math.min(1, checkpointBanner.timer / 30); // fade out in last 30 frames
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(canvas.width / 2 - 160, 20, 320, 44);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('★ Checkpoint ativado! ★', canvas.width / 2, 49);
    ctx.textAlign = 'left';
    ctx.restore();
}

// ─── Game Loop ────────────────────────────────────────────────────────────────
function gameLoop() {
    // ── START SCREEN ──
    if (gameState === 'START') {
        ctx.fillStyle = '#5c94fc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SQUARE PLATFORMER', canvas.width / 2, canvas.height / 2 - 50);
        ctx.font = '20px Arial';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.fillText('Press ENTER to Start', canvas.width / 2, canvas.height / 2 + 30);
        }
        ctx.textAlign = 'left';
        requestAnimationFrame(gameLoop);
        return;
    }

    // ── DEAD SCREEN ──
    if (gameState === 'DEAD') {
        deathTimer++;
        // Still draw the game world frozen behind the overlay
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        for (let platform of platforms) platform.draw(ctx, cameraX);
        for (let cp of checkpoints)  cp.draw(ctx, cameraX);
        for (let enemy of enemies)   enemy.draw(ctx, cameraX);
        // Don't draw player (dead = true)

        drawDeathScreen();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ── PLAYING ──

    // Update
    player.update(platforms);
    enemies.forEach(e => e.update());

    // Checkpoint collision & update
    for (let cp of checkpoints) {
        const wasActivated = cp.activated;
        cp.update(player.x, player.y);
        if (cp.activated && !wasActivated) {
            // Newly activated — save spawn and show banner
            player.setCheckpoint(cp.x - 10, cp.y);
            showCheckpointBanner();
        }
    }

    // Enemy collision → trigger death
    if (!player.dead) {
        for (let enemy of enemies) {
            if (player.x < enemy.x + enemy.width && player.x + player.width > enemy.x &&
                player.y < enemy.y + enemy.height && player.y + player.height > enemy.y) {
                player.die();
                break;
            }
        }
    }

    updateCamera();

    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();

    for (let platform of platforms) platform.draw(ctx, cameraX);
    for (let cp of checkpoints)   cp.draw(ctx, cameraX);
    for (let enemy of enemies)    enemy.draw(ctx, cameraX);
    player.draw(ctx, cameraX);

    // HUD
    drawCheckpointBanner();

    requestAnimationFrame(gameLoop);
}

init();
