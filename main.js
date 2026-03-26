const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Constants
const GRAVITY = 0.5;
const JUMP_FORCE = -12;
const MOVE_SPEED = 5;
const MAX_FALL_SPEED = 15;

// Load Assets
const bgImage = new Image();
bgImage.src = 'assets/forest_bg.png';

const playerSprite = new Image();
playerSprite.src = 'assets/protagonista.png';

const startBg = new Image();
startBg.src = 'assets/waterfall_start_bg_v2_1774490309580.png';

const bossSprite = new Image();
bossSprite.src = 'assets/boss.png';

const monkeySprite = new Image();
monkeySprite.src = 'assets/macaco.png';

const hunterSprite = new Image();
hunterSprite.src = 'assets/caçador.png';

const woodcutterSprite = new Image();
woodcutterSprite.src = 'assets/lenhador.png';

// Input State
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    Space: false,
    Enter: false
};

// ─── Game State ───────────────────────────────────────────────────────────────
let gameState = 'START'; // START | PLAYING | DEAD | WIN
let musicInterval = null;
let deathTimer = 0;
const DEATH_FREEZE = 90;

// Boss / end-game globals
let boss = null;
let birdList = [];      // "pássaros" falling from sky
let purified = false;   // forest cleansed?
let purifyTimer = 0;    // animation timer after picking item
let groundItem = null;  // the item that spawns after boss death
let bossArena = 20500;  // world-x where boss waits

function startMusic() {
    try {
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
    } catch (err) {
        console.warn("Música não pôde ser iniciada:", err);
    }
}

window.addEventListener('keydown', (e) => {
    if (gameState === 'START' && e.code === 'Enter') {
        gameState = 'PLAYING';
        startMusic();
    }
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
        this.flagWave = 0;
    }

    update(playerX, playerY) {
        if (!this.activated) {
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
        ctx.fillStyle = '#888';
        ctx.fillRect(drawX + 8, this.y, 4, this.height);
        const wave = this.activated ? Math.sin(this.flagWave * 0.15) * 4 : 0;
        ctx.fillStyle = this.activated ? '#ffd700' : '#ccc';
        ctx.beginPath();
        ctx.moveTo(drawX + 12, this.y);
        ctx.lineTo(drawX + 30, this.y + 5 + wave);
        ctx.lineTo(drawX + 30, this.y + 18 + wave);
        ctx.lineTo(drawX + 12, this.y + 18);
        ctx.closePath();
        ctx.fill();
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
        this.spawnX = x;
        this.spawnY = y;
        this.width = 30;
        this.height = 30;
        this.vx = 0;
        this.vy = 0;
        this.color = '#e52521';
        this.isGrounded = false;
        this.facingRight = true;
        this.dead = false;
        this.onBird = null; // reference to bird being ridden
    }

    setCheckpoint(x, y) {
        this.spawnX = x;
        this.spawnY = y - this.height;
    }

    update(platforms) {
        if (this.dead) return;

        if (keys.ArrowLeft) { this.vx = -MOVE_SPEED; this.facingRight = false; }
        else if (keys.ArrowRight) { this.vx = MOVE_SPEED; this.facingRight = true; }
        else { this.vx *= 0.8; if (Math.abs(this.vx) < 0.1) this.vx = 0; }

        if ((keys.ArrowUp || keys.Space) && this.isGrounded) {
            this.vy = JUMP_FORCE;
            this.isGrounded = false;
        }

        this.vy += GRAVITY;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;

        let nextX = this.x + this.vx;
        let nextY = this.y + this.vy;
        this.isGrounded = false;

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

        for (let p of platforms) {
            if (this.x < p.x + p.width && this.x + this.width > p.x &&
                nextY < p.y + p.height && nextY + this.height > p.y) {
                if (this.vy > 0) { nextY = p.y - this.height; this.isGrounded = true; }
                else if (this.vy < 0) { nextY = p.y + p.height; }
                this.vy = 0;
                break;
            }
        }
        this.y = nextY;

        if (this.x < 0) this.x = 0;
        if (this.y > canvas.height + 100) this.die();
    }

    die() {
        this.dead = true;
        this.vx = 0;
        this.vy = 0;
        gameState = 'DEAD';
        deathTimer = 0;
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
        const drawX = this.x - cameraX;

        if (playerSprite.complete) {
            ctx.save();
            if (!this.facingRight) {
                ctx.translate(drawX + this.width, this.y);
                ctx.scale(-1, 1);
                ctx.drawImage(playerSprite, 0, 0, this.width, this.height);
            } else {
                ctx.drawImage(playerSprite, drawX, this.y, this.width, this.height);
            }
            ctx.restore();
        } else {
            // Fallback to rectangle if image not loaded
            ctx.fillStyle = this.color;
            ctx.fillRect(drawX, this.y, this.width, this.height);
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
            ctx.fillStyle = '#0047bb';
            ctx.fillRect(drawX, this.y + 20, this.width, 10);
        }
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

        // pFactor drives the burn effect; clears when purified
        const rawFactor = (typeof player !== 'undefined' && player.x > 17500)
            ? Math.max(0, Math.min(1, (player.x - 17500) / 2000))
            : 0;
        const pFactor = purified ? 0 : rawFactor;

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

// ─── Boss ─────────────────────────────────────────────────────────────────────
class Boss {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width  = 300;
        this.height = 300;
        this.hp = 5;
        this.maxHp = 5;
        this.vx = 1.2;
        this.projectiles = [];
        this.shootTimer = 0;
        this.shootInterval = 90;
        this.hitFlash = 0;
        this.dead = false;
        this.deathAnim = 0;
        this.startX = x;
        this.patrolRange = 300;
        // Monkeys spawned by boss phase
        this.birdSpawnTimer = 0;
        this.birdSpawnInterval = 180;
    }

    update() {
        if (this.dead) {
            this.deathAnim++;
            return;
        }

        // Patrol
        this.x += this.vx;
        if (this.x > this.startX + this.patrolRange) { this.x = this.startX + this.patrolRange; this.vx *= -1; }
        else if (this.x < this.startX - 100)          { this.x = this.startX - 100; this.vx *= -1; }

        // Shoot projectiles
        this.shootTimer++;
        if (this.shootTimer >= this.shootInterval) {
            this.shootTimer = 0;
            const px = this.x + this.width / 2;
            const py = this.y + this.height / 2;
            const dx = player.x - px;
            const dy = player.y - py;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const speed = 5;
            this.projectiles.push({
                x: px, y: py,
                vx: (dx / len) * speed,
                vy: (dy / len) * speed,
                radius: 10, alive: true
            });
        }

        // Spawn bird every interval
        this.birdSpawnTimer++;
        if (this.birdSpawnTimer >= this.birdSpawnInterval) {
            this.birdSpawnTimer = 0;
            spawnBird();
        }

        // Update projectiles
        for (let proj of this.projectiles) {
            proj.x += proj.vx;
            proj.y += proj.vy;
            // Kill if off screen
            if (proj.y > canvas.height + 50) proj.alive = false;

            // Check hit on player
            if (!player.dead && proj.alive) {
                if (Math.abs(proj.x - (player.x + 15)) < proj.radius + 15 &&
                    Math.abs(proj.y - (player.y + 15)) < proj.radius + 15) {
                    proj.alive = false;
                    player.die();
                }
            }
        }
        this.projectiles = this.projectiles.filter(p => p.alive);

        if (this.hitFlash > 0) this.hitFlash--;
    }

    takeHit() {
        if (this.dead) return;
        this.hp--;
        this.hitFlash = 15; // white flash for 15 frames
        if (this.hp <= 0) {
            this.dead = true;
            this.hp = 0;
            // Stop spawning birds
            birdList = [];
            // Spawn item path + item
            spawnItemPath();
        }
    }

    draw(ctx, cameraX) {
        const drawX = this.x - cameraX;
        if (drawX + this.width < 0 || drawX > canvas.width) return;

        if (this.dead) {
            // Shrinking disappear effect
            const scale = Math.max(0, 1 - this.deathAnim / 60);
            const cx = drawX + this.width / 2;
            const cy = this.y + this.height / 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.globalAlpha = scale;
            this._drawBody(ctx, -this.width / 2, -this.height / 2);
            ctx.restore();
            return;
        }

        // Body
        if (bossSprite.complete) {
            ctx.save();
            if (this.hitFlash > 0 && Math.floor(this.hitFlash / 3) % 2 === 0) {
                ctx.globalAlpha = 0.5; // Visual hit feedback
            }
            ctx.drawImage(bossSprite, drawX, this.y, this.width, this.height);
            ctx.restore();
        } else {
            if (this.hitFlash > 0 && Math.floor(this.hitFlash / 3) % 2 === 0) {
                ctx.fillStyle = '#ffffff';
            } else {
                ctx.fillStyle = '#4b0000';
            }
            this._drawBody(ctx, drawX, this.y);
        }

        // HP bar
        const barW = this.width;
        const barH = 18;
        ctx.fillStyle = '#333';
        ctx.fillRect(drawX, this.y - 30, barW, barH);
        ctx.fillStyle = '#cc0000';
        ctx.fillRect(drawX, this.y - 30, barW * (this.hp / this.maxHp), barH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, this.y - 30, barW, barH);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.hp}/${this.maxHp}`, drawX + barW / 2, this.y - 16);
        ctx.textAlign = 'left';

        // Projectiles
        for (let proj of this.projectiles) {
            const px = proj.x - cameraX;
            ctx.beginPath();
            ctx.arc(px, proj.y, proj.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#ff4400';
            ctx.fill();
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    _drawBody(ctx, bx, by) {
        // Main dark body
        ctx.fillRect(bx, by, this.width, this.height);
        // Glowing evil eyes
        const eyeColor = this.hitFlash > 0 ? '#000' : '#ff2200';
        ctx.fillStyle = eyeColor;
        ctx.fillRect(bx + 50,  by + 80, 60, 60);
        ctx.fillRect(bx + 190, by + 80, 60, 60);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(bx + 65,  by + 95, 30, 30);
        ctx.fillRect(bx + 205, by + 95, 30, 30);
        // Mouth
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(bx + 80, by + 200, 140, 20);
        ctx.fillStyle = '#111';
        for (let t = 0; t < 4; t++) {
            ctx.fillRect(bx + 90 + t * 35, by + 200, 15, 20);
        }
    }
}

// ─── Bird (Pássaro) ───────────────────────────────────────────────────────────
class Monkey {
    constructor(x) {
        this.x = x;
        this.y = -60;
        this.width = 40;
        this.height = 40;
        this.vy = 0;
        this.state = 'falling';
        this.groundY = 0;
        this.playerWasOn = false;
        this.flyTargetX = 0;
        this.flyTargetY = 0;
        this.bobTimer = 0;
        this.alpha = 1;
    }

    update() {
        this.bobTimer++;
        if (this.state === 'falling') {
            this.vy += 0.3;
            this.y += this.vy;
            // Hover in the sky at a fixed height (150px from top), wobbling
            const targetY = 120 + Math.sin(this.bobTimer * 0.05) * 10;
            if (this.y >= targetY) {
                this.y = targetY;
                this.vy = 0;
                this.state = 'waiting';
            }
        } else if (this.state === 'waiting') {
            // Bob gently
            this.y = 120 + Math.sin(this.bobTimer * 0.05) * 10;

            // Check if player jumps onto it
            const onTop = (
                player.x + player.width > this.x &&
                player.x < this.x + this.width &&
                player.y + player.height >= this.y &&
                player.y + player.height <= this.y + 15 &&
                player.vy >= 0
            );
            if (onTop && !player.dead) {
                this.state = 'flying';
                this.flyTargetX = boss.x + boss.width / 2;
                this.flyTargetY = boss.y + boss.height / 2;
                // Bounce player up slightly
                player.vy = -8;
                player.isGrounded = false;
            }
        } else if (this.state === 'flying') {
            // Rush toward boss
            const dx = this.flyTargetX - this.x;
            const dy = this.flyTargetY - this.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const speed = 18;
            this.x += (dx / len) * speed;
            this.y += (dy / len) * speed;
            this.alpha = Math.max(0, this.alpha - 0.02);

            // Hit check on boss
            if (boss && !boss.dead &&
                Math.abs(this.x - this.flyTargetX) < 40 &&
                Math.abs(this.y - this.flyTargetY) < 40) {
                boss.takeHit();
                this.alive = false;
                return;
            }
        }
        this.alive = this.alive !== false; // keep unless flying missed
    }

    draw(ctx, cameraX) {
        const drawX = this.x - cameraX;
        ctx.save();
        ctx.globalAlpha = this.alpha;

        if (monkeySprite.complete) {
            ctx.drawImage(monkeySprite, drawX, this.y, this.width, this.height);
        } else {
            // Cyan/sky square bird fallback
            ctx.fillStyle = '#00cfff';
            ctx.fillRect(drawX, this.y, this.width, this.height);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(drawX + 5,  this.y + 10, 12, 5);
            ctx.fillRect(drawX + 23, this.y + 10, 12, 5);
            ctx.fillStyle = '#000';
            ctx.fillRect(drawX + 10, this.y + 6, 5, 5);
            ctx.fillRect(drawX + 26, this.y + 6, 5, 5);
        }

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('MACACO', drawX + this.width / 2, this.y - 5);
        ctx.restore();
    }
}

// ─── Ground Item ──────────────────────────────────────────────────────────────
class GroundItem {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.collected = false;
        this.bobTimer = 0;
    }

    update() {
        this.bobTimer++;
    }

    draw(ctx, cameraX) {
        if (this.collected) return;
        const drawX = this.x - cameraX;
        const bob = Math.sin(this.bobTimer * 0.08) * 5;
        // Glowing leaf/orb
        ctx.save();
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(drawX, this.y + bob, this.width, this.height);
        ctx.shadowBlur = 0;
        // Leaf veins
        ctx.fillStyle = '#006633';
        ctx.fillRect(drawX + 13, this.y + bob + 4, 4, 22);
        ctx.fillRect(drawX + 5,  this.y + bob + 10, 20, 3);
        ctx.fillRect(drawX + 8,  this.y + bob + 17, 14, 3);
        ctx.restore();

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ITEM', drawX + 15, this.y + bob - 5);
        ctx.textAlign = 'left';
    }
}

// ─── Spawn helpers ────────────────────────────────────────────────────────────
function spawnBird() {
    if (!boss || boss.dead) return;
    const bx = player.x + (Math.random() * 200 - 100);
    const monk = new Monkey(bx);
    monk.alive = true;
    birdList.push(monk);
}

function spawnItemPath() {
    // Add a bridge of platforms past the boss
    const itemX = bossArena + 800;
    const groundY = 450;
    platforms.push(new Platform(bossArena + 320, groundY, 600, 150, 'ground'));
    groundItem = new GroundItem(itemX, groundY - 30);
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
        this.width = 40; // Slightly larger for assets
        this.height = 40;
        this.vx = 2;
        this.walkDistance = Math.max(walkDistance, 10);
        this.color = '#8b0000';
        this.alive = true;
        this.type = Math.random() > 0.5 ? 'hunter' : 'woodcutter';
    }

    update() {
        this.x += this.vx;
        if (this.x > this.startX + this.walkDistance) { this.x = this.startX + this.walkDistance; this.vx *= -1; }
        else if (this.x < this.startX) { this.x = this.startX; this.vx *= -1; }
    }

    draw(ctx, cameraX) {
        const drawX = this.x - cameraX;
        if (drawX + this.width < 0 || drawX > canvas.width) return;
        
        const spr = this.type === 'hunter' ? hunterSprite : woodcutterSprite;
        if (spr.complete) {
            ctx.save();
            if (this.vx > 0) {
                ctx.translate(drawX + this.width, this.y);
                ctx.scale(-1, 1);
                ctx.drawImage(spr, 0, 0, this.width, this.height);
            } else {
                ctx.drawImage(spr, drawX, this.y, this.width, this.height);
            }
            ctx.restore();
        } else {
            ctx.fillStyle = this.color;
            ctx.fillRect(drawX, this.y, this.width, this.height);
        }
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
    cameraX = Math.max(0, player.x - canvas.width * 0.3);
    gameState = 'PLAYING';
    // Reset boss state on respawn if boss still alive
    if (boss && !boss.dead) {
        boss.projectiles = [];
        birdList = [];
    }
}

function init() {
    player = new Player(50, 400);
    purified = false;
    purifyTimer = 0;
    boss = null;
    birdList = [];
    groundItem = null;

    platforms = levelData.map(p => new Platform(p.x, p.y, p.w, p.h, p.type));

    // Checkpoints every ~2000 units
    const checkpointInterval = 2000;
    for (let cx = checkpointInterval; cx < 20000; cx += checkpointInterval) {
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

    // ── Extra burned terrain (x 17500–20300) ──────────────────────────────────
    // Wider, denser ground in the burned zone so the player has room to dodge
    platforms.push(new Platform(17500, 450, 3000, 150, 'ground')); // continuous base
    // Some elevated ledges for dodging projectiles
    platforms.push(new Platform(17700, 350, 150, 20, 'block'));
    platforms.push(new Platform(18050, 300, 150, 20, 'block'));
    platforms.push(new Platform(18400, 370, 150, 20, 'block'));
    platforms.push(new Platform(18750, 310, 150, 20, 'block'));
    platforms.push(new Platform(19100, 360, 150, 20, 'block'));
    platforms.push(new Platform(19450, 290, 150, 20, 'block'));
    platforms.push(new Platform(19800, 340, 150, 20, 'block'));
    platforms.push(new Platform(20100, 300, 400, 20, 'block')); // pre-boss jump pads

    // ── Boss arena spawn ───────────────────────────────────────────────────────
    // Boss appears at x=20500, standing on solid ground
    platforms.push(new Platform(20300, 450, 1200, 150, 'ground')); // boss floor

    requestAnimationFrame(gameLoop);
}

function updateCamera() {
    const scrollBorderRight = cameraX + canvas.width * 0.6;
    const scrollBorderLeft  = cameraX + canvas.width * 0.3;
    if (player.x > scrollBorderRight) cameraX = player.x - canvas.width * 0.6;
    else if (player.x < scrollBorderLeft && cameraX > 0) cameraX = player.x - canvas.width * 0.3;
    if (cameraX < 0) cameraX = 0;
}

function drawBackground() {
    const rawFactor = (typeof player !== 'undefined' && player.x > 17500)
        ? Math.max(0, Math.min(1, (player.x - 17500) / 2000))
        : 0;
    const pFactor = purified ? 0 : rawFactor;

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

    // Purify flash overlay
    if (purified && purifyTimer < 90) {
        const alpha = Math.max(0, 1 - purifyTimer / 90);
        ctx.fillStyle = `rgba(180, 255, 180, ${alpha * 0.7})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// ─── Death Screen ─────────────────────────────────────────────────────────────
function drawDeathScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const vig = (Math.sin(deathTimer * 0.15) * 0.5 + 0.5) * 0.4;
    const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.2,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.8
    );
    grad.addColorStop(0, `rgba(180,0,0,0)`);
    grad.addColorStop(1, `rgba(180,0,0,${vig})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#cc0000';
    ctx.font = 'bold 72px Arial';
    ctx.fillText('VOCÊ MORREU', canvas.width / 2, canvas.height / 2 - 30);
    ctx.shadowBlur = 0;

    const atCheckpoint = checkpoints.some(c => c.activated);
    ctx.fillStyle = '#ddd';
    ctx.font = '18px Arial';
    if (atCheckpoint) {
        ctx.fillText('Respawn do último checkpoint', canvas.width / 2, canvas.height / 2 + 20);
    } else {
        ctx.fillText('Sem checkpoint ativo — voltando ao início', canvas.width / 2, canvas.height / 2 + 20);
    }
    if (deathTimer >= DEATH_FREEZE && Math.floor(deathTimer / 30) % 2 === 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('Pressione ENTER para continuar', canvas.width / 2, canvas.height / 2 + 70);
    }
    ctx.textAlign = 'left';
}

// ─── Win Screen ───────────────────────────────────────────────────────────────
function drawWinScreen() {
    ctx.fillStyle = 'rgba(0,80,0,0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#00ff88';
    ctx.font = '32px "Press Start 2P"';
    ctx.fillText('FLORESTA SALVA!', canvas.width / 2, canvas.height / 2 - 40);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fff';
    ctx.font = '14px "Press Start 2P"';
    ctx.fillText('A pureza retornou.', canvas.width / 2, canvas.height / 2 + 40);
    ctx.fillText('Fsoul vitoriosa! 🌿', canvas.width / 2, canvas.height / 2 + 80);
    ctx.textAlign = 'left';
}

// ─── Checkpoint banner (HUD) ──────────────────────────────────────────────────
let checkpointBanner = { visible: false, timer: 0 };
function showCheckpointBanner() {
    checkpointBanner.visible = true;
    checkpointBanner.timer = 180;
}
function drawCheckpointBanner() {
    if (!checkpointBanner.visible) return;
    checkpointBanner.timer--;
    if (checkpointBanner.timer <= 0) { checkpointBanner.visible = false; return; }
    const alpha = Math.min(1, checkpointBanner.timer / 30);
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

// ─── Boss HUD hint ────────────────────────────────────────────────────────────
function drawBossHint() {
    if (!boss || boss.dead) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Pule no MACACO para lançá-lo no chefe! (' + boss.hp + '/5 hits restantes)', canvas.width / 2, canvas.height - 22);
    ctx.textAlign = 'left';
    ctx.restore();
}

// ─── Game Loop ────────────────────────────────────────────────────────────────
function gameLoop() {
    // ── START SCREEN ──
    if (gameState === 'START') {
        if (startBg.complete) {
            ctx.drawImage(startBg, 0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#1a2a4a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        ctx.fillStyle = '#00ff88';
        ctx.font = '72px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 15;
        ctx.fillText('FSOUL', canvas.width / 2, canvas.height / 2);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = 'white';
        ctx.font = '16px "Press Start 2P"';
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.fillText('PRESSIONE ENTER', canvas.width / 2, canvas.height / 2 + 100);
        }
        ctx.textAlign = 'left';
        requestAnimationFrame(gameLoop);
        return;
    }

    // ── DEAD SCREEN ──
    if (gameState === 'DEAD') {
        deathTimer++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        for (let platform of platforms) platform.draw(ctx, cameraX);
        for (let cp of checkpoints)  cp.draw(ctx, cameraX);
        for (let enemy of enemies)   enemy.draw(ctx, cameraX);
        if (boss) boss.draw(ctx, cameraX);
        drawDeathScreen();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ── WIN SCREEN ──
    if (gameState === 'WIN') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Draw a clean green sky
        ctx.fillStyle = '#a8e063';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let platform of platforms) platform.draw(ctx, cameraX);
        drawWinScreen();
        requestAnimationFrame(gameLoop);
        return;
    }

    // ── PLAYING ──

    // Spawn boss when player gets close enough
    if (!boss && player.x >= bossArena - 200) {
        boss = new Boss(bossArena, 150); // y=150 so 300px tall boss stands on y=450
    }

    // Update player, enemies, boss, birds
    player.update(platforms);
    enemies.forEach(e => { if (e.alive) e.update(); });
    if (boss) boss.update();

    // Update birds
    for (let bird of birdList) bird.update();
    birdList = birdList.filter(b => b.alive !== false);

    // Update ground item
    if (groundItem && !groundItem.collected) {
        groundItem.update();
        // Collect check
        if (player.x < groundItem.x + groundItem.width && player.x + player.width > groundItem.x &&
            player.y < groundItem.y + groundItem.height && player.y + player.height > groundItem.y) {
            groundItem.collected = true;
            purified = true;
            purifyTimer = 0;
            // Remove all regular enemies too (impurities gone)
            enemies.forEach(e => e.alive = false);
            setTimeout(() => { gameState = 'WIN'; }, 3000);
        }
    }
    if (purified) purifyTimer++;

    // Checkpoint collision & update
    for (let cp of checkpoints) {
        const wasActivated = cp.activated;
        cp.update(player.x, player.y);
        if (cp.activated && !wasActivated) {
            player.setCheckpoint(cp.x - 10, cp.y);
            showCheckpointBanner();
        }
    }

    // Enemy collision → death
    if (!player.dead) {
        for (let enemy of enemies) {
            if (!enemy.alive) continue;
            if (player.x < enemy.x + enemy.width && player.x + player.width > enemy.x &&
                player.y < enemy.y + enemy.height && player.y + player.height > enemy.y) {
                player.die();
                break;
            }
        }
    }

    updateCamera();

    // ── DRAW ──
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    for (let platform of platforms) platform.draw(ctx, cameraX);
    for (let cp of checkpoints)   cp.draw(ctx, cameraX);
    for (let enemy of enemies)    { if (enemy.alive) enemy.draw(ctx, cameraX); }
    if (boss) boss.draw(ctx, cameraX);
    for (let bird of birdList)    bird.draw(ctx, cameraX);
    if (groundItem && !groundItem.collected) groundItem.draw(ctx, cameraX);
    player.draw(ctx, cameraX);

    // HUD
    drawCheckpointBanner();
    drawBossHint();

    requestAnimationFrame(gameLoop);
}

init();
