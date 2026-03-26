const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Gerador de Padrão (Pixel Art de Grama)
const grassCanvas = document.createElement('canvas');
grassCanvas.width = 32; grassCanvas.height = 32;
const gCtx = grassCanvas.getContext('2d');
gCtx.fillStyle = '#3a8732'; gCtx.fillRect(0, 0, 32, 32);
gCtx.fillStyle = '#49a83f'; gCtx.fillRect(0, 0, 16, 16); gCtx.fillRect(16, 16, 16, 16);
gCtx.fillStyle = '#2d6926'; gCtx.fillRect(0, 16, 8, 8); gCtx.fillRect(16, 0, 8, 8);
const grassPattern = ctx.createPattern(grassCanvas, 'repeat');

// Game Constants
const GRAVITY = 0.5;
const JUMP_FORCE = -12;
const MOVE_SPEED = 5;
const MAX_FALL_SPEED = 15;

// Load Assets
const bgImage = new Image();
bgImage.src = 'assets/forest_bg.png';

// Remove apenas o fundo "externo" via flood-fill a partir de (0,0) — evita buracos no interior
async function removeSolidBackground(img) {
    try {
        const resp = await fetch(img.src);
        const blob = await resp.blob();
        const bmp = await createImageBitmap(blob);
        const ofc = new OffscreenCanvas(bmp.width, bmp.height);
        const ofCtx = ofc.getContext('2d');
        ofCtx.drawImage(bmp, 0, 0);
        const imgData = ofCtx.getImageData(0, 0, bmp.width, bmp.height);
        const data = imgData.data;
        const w = bmp.width;
        const h = bmp.height;
        
        // Cor do fundo pegada do pixel (0,0)
        const br = data[0], bg = data[1], bb = data[2];
        const visited = new Uint8Array(w * h);
        const queue = [[0, 0]];
        visited[0] = 1;

        while (queue.length > 0) {
            const [x, y] = queue.shift();
            const idx = (y * w + x) * 4;
            
            // Se a cor for muito similar à do fundo, torna transparente e espalha (limiar rigoroso de 10)
            if (Math.abs(data[idx]-br) < 10 && Math.abs(data[idx+1]-bg) < 10 && Math.abs(data[idx+2]-bb) < 10) {
                data[idx+3] = 0;
                // Check neighbors (4 directions)
                [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].forEach(([nx, ny]) => {
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h && !visited[ny * w + nx]) {
                        visited[ny * w + nx] = 1;
                        queue.push([nx, ny]);
                    }
                });
            }
        }
        
        ofCtx.putImageData(imgData, 0, 0);
        const newBlob = await ofc.convertToBlob();
        img.src = URL.createObjectURL(newBlob);
    } catch(e) {
        console.warn('removeSolidBackground falhou para', img.src, e);
    }
}

// Helper de desenho normal (usa transparência real do PNG)
function drawSprite(img, x, y, w, h, flip = false) {
    if (!img.complete || img.naturalWidth === 0) return false;
    ctx.save();
    if (flip) {
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, w, h);
    } else {
        ctx.drawImage(img, x, y, w, h);
    }
    ctx.restore();
    return true;
}

const finalBgImage = new Image();
finalBgImage.src = 'assets/imagem cenário final.jpg';

const playerSprite = new Image();
playerSprite.src = 'assets/protagonista.png';
playerSprite.addEventListener('load', () => removeSolidBackground(playerSprite));

const startBg = new Image();
startBg.src = 'assets/waterfall_start_bg_v2_1774490309580.png';

const bossSprite = new Image();
bossSprite.src = 'assets/boss.png';
bossSprite.addEventListener('load', () => removeSolidBackground(bossSprite));

const monkeySprite = new Image();
monkeySprite.src = 'assets/macaco.png';
monkeySprite.addEventListener('load', () => removeSolidBackground(monkeySprite));

const hunterSprite = new Image();
hunterSprite.src = 'assets/caçador.png';
hunterSprite.addEventListener('load', () => removeSolidBackground(hunterSprite));

const woodcutterSprite = new Image();
woodcutterSprite.src = 'assets/lenhador.png';
woodcutterSprite.addEventListener('load', () => removeSolidBackground(woodcutterSprite));

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
let birdList = [];      // "monkeys" falling from sky
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
    constructor(x, groundY) {
        this.x = x;
        this.groundY = groundY; // Y do chão (topo da plataforma)
        this.y = groundY - 55;  // Topo da bandeira (55px acima do chão)
        this.width = 40;
        this.height = 55;
        this.activated = false;
        this.flagWave = 0;
        this.notifyTimer = 0;
    }

    update(playerX, playerY, playerW, playerH) {
        if (!this.activated) {
            // Caixa de colisão generosa para facilitar ativar passando pelo checkpoint
            if (playerX + playerW > this.x && playerX < this.x + this.width + 20 &&
                playerY + playerH > this.y && playerY < this.groundY) {
                this.activated = true;
                this.notifyTimer = 150;
            }
        }
        if (this.activated) {
            this.flagWave++;
            if (this.notifyTimer > 0) this.notifyTimer--;
        }
    }

    draw(ctx, cameraX) {
        const drawX = this.x - cameraX;
        if (drawX + this.width < 0 || drawX > canvas.width) return;

        // Mastro
        ctx.fillStyle = '#aaa';
        ctx.fillRect(drawX + 10, this.y, 5, this.height);

        // Bandeira
        const wave = this.activated ? Math.sin(this.flagWave * 0.15) * 5 : 0;
        ctx.fillStyle = this.activated ? '#ffd700' : '#cccccc';
        ctx.beginPath();
        ctx.moveTo(drawX + 15, this.y);
        ctx.lineTo(drawX + 40, this.y + 8 + wave);
        ctx.lineTo(drawX + 40, this.y + 24 + wave);
        ctx.lineTo(drawX + 15, this.y + 20);
        ctx.closePath();
        ctx.fill();

        if (this.activated) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('★', drawX + 28, this.y + 18 + wave);
        }

        // Notificação flutuante ao ativar
        if (this.notifyTimer > 0) {
            const alpha = Math.min(1, this.notifyTimer / 30);
            const floatY = this.y - 30 - (1 - this.notifyTimer / 150) * 30;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('★ Checkpoint! ★', drawX + 15, floatY);
            ctx.restore();
        }
        ctx.textAlign = 'left';
    }
}

// ─── Player ───────────────────────────────────────────────────────────────────
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
        this.width = 60;
        this.height = 60;
        this.vx = 0;
        this.vy = 0;
        this.color = '#e52521';
        this.isGrounded = false;
        this.facingRight = true;
        this.dead = false;
        this.onBird = null; 
    }

    // Salva o ponto de renascimento no chão do checkpoint
    setCheckpoint(x, groundY) {
        this.spawnX = x;
        this.spawnY = groundY - this.height; // Renascer em cima do chão
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

        const drawn = drawSprite(playerSprite, drawX, this.y, this.width, this.height, !this.facingRight);
        if (!drawn) {
            ctx.fillStyle = this.color;
            ctx.fillRect(drawX, this.y, this.width, this.height);
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

        const rawFactor = (typeof player !== 'undefined' && player.x > 17500)
            ? Math.max(0, Math.min(1, (player.x - 17500) / 2000))
            : 0;
        const pFactor = purified ? 0 : rawFactor;

        if (this.type === 'ground') {
            ctx.save();
            ctx.translate(drawX, this.y);
            ctx.fillStyle = grassPattern;
            ctx.fillRect(0, 0, this.width, this.height);
            
            // Highlight superior
            ctx.fillStyle = '#5bd651';
            for (let i = 0; i < this.width; i += 16) {
                ctx.fillRect(i, 0, 8, 6);
            }
            
            // Variedade no chão
            ctx.fillStyle = '#2d6926';
            let prng = this.x * 13 + this.y * 7;
            for (let dx = 20; dx < this.width - 20; dx += 40) {
                prng = (prng * 17) % 1000;
                if (prng > 300) {
                    let wDrop = (prng % 3 === 0) ? 12 : 8;
                    let hDrop = (prng % 2 === 0) ? 12 : 6;
                    ctx.fillRect(dx, 20 + (prng % (this.height - 40)), wDrop, hDrop);
                }
            }
            ctx.restore();

            if (pFactor > 0) {
                ctx.fillStyle = `rgba(25, 25, 20, ${pFactor * 0.95})`; // Efeito escuro/carbonizado
                ctx.fillRect(drawX, this.y, this.width, this.height);
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
        this.birdSpawnTimer = 0;
        this.birdSpawnInterval = 180;
    }

    update() {
        if (this.dead) {
            this.deathAnim++;
            return;
        }

        this.x += this.vx;
        if (this.x > this.startX + this.patrolRange) { this.x = this.startX + this.patrolRange; this.vx *= -1; }
        else if (this.x < this.startX - 100)          { this.x = this.startX - 100; this.vx *= -1; }

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

        this.birdSpawnTimer++;
        if (this.birdSpawnTimer >= this.birdSpawnInterval) {
            this.birdSpawnTimer = 0;
            spawnBird();
        }

        for (let proj of this.projectiles) {
            proj.x += proj.vx;
            proj.y += proj.vy;
            if (proj.y > canvas.height + 50) proj.alive = false;
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
        this.hitFlash = 15;
        if (this.hp <= 0) {
            this.dead = true;
            this.hp = 0;
            birdList = [];
            spawnItemPath();
        }
    }

    draw(ctx, cameraX) {
        const drawX = this.x - cameraX;
        if (drawX + this.width < 0 || drawX > canvas.width) return;

        if (this.dead) {
            if (this.deathAnim > 80) return; // Fully done
            const progress = this.deathAnim / 80;
            const scale = Math.max(0, 1 - progress);
            const alpha = Math.max(0, 1 - progress);
            const shake = this.deathAnim < 30 ? (Math.random() - 0.5) * 12 : 0;
            const cx = drawX + this.width / 2 + shake;
            const cy = this.y + this.height / 2 + shake;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.globalAlpha = alpha;

            // Flash white on early death frames
            if (this.deathAnim < 20 && Math.floor(this.deathAnim / 3) % 2 === 0) {
                ctx.filter = 'brightness(10)';
            }

            if (bossSprite.complete && bossSprite.naturalWidth > 0) {
                ctx.drawImage(bossSprite, -this.width / 2, -this.height / 2, this.width, this.height);
            } else {
                ctx.fillStyle = '#4b0000';
                this._drawBody(ctx, -this.width / 2, -this.height / 2);
            }

            ctx.filter = 'none';
            ctx.restore();

            // Explosion particles
            if (this.deathAnim < 40 && this.deathAnim % 4 === 0) {
                const px = drawX + Math.random() * this.width;
                const py = this.y + Math.random() * this.height;
                ctx.save();
                ctx.globalAlpha = 1 - progress;
                ctx.fillStyle = ['#ff4500','#ff8c00','#ffff00','#ff0000'][Math.floor(Math.random()*4)];
                ctx.beginPath();
                ctx.arc(px, py, 8 + Math.random() * 18, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            return;
        }

        if (bossSprite.complete && bossSprite.naturalWidth > 0) {
            ctx.save();
            if (this.hitFlash > 0 && Math.floor(this.hitFlash / 3) % 2 === 0) {
                ctx.globalAlpha = 0.5;
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

        const barW = this.width;
        const barH = 18;
        ctx.fillStyle = '#333';
        ctx.fillRect(drawX, this.y - 30, barW, barH);
        ctx.fillStyle = '#cc0000';
        ctx.fillRect(drawX, this.y - 30, barW * (this.hp / this.maxHp), barH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, this.y - 30, barW, barH);
    }

    _drawBody(ctx, bx, by) {
        ctx.fillRect(bx, by, this.width, this.height);
        const eyeColor = this.hitFlash > 0 ? '#000' : '#ff2200';
        ctx.fillStyle = eyeColor;
        ctx.fillRect(bx + 50,  by + 80, 60, 60);
        ctx.fillRect(bx + 190, by + 80, 60, 60);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(bx + 65,  by + 95, 30, 30);
        ctx.fillRect(bx + 205, by + 95, 30, 30);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(bx + 80, by + 200, 140, 20);
        ctx.fillStyle = '#111';
        for (let t = 0; t < 4; t++) {
            ctx.fillRect(bx + 90 + t * 35, by + 200, 15, 20);
        }
    }
}

// ─── Monkey ───────────────────────────────────────────────────────────────────
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
            const targetY = 120 + Math.sin(this.bobTimer * 0.05) * 10;
            if (this.y >= targetY) {
                this.y = targetY;
                this.vy = 0;
                this.state = 'waiting';
            }
        } else if (this.state === 'waiting') {
            this.y = 120 + Math.sin(this.bobTimer * 0.05) * 10;
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
                player.vy = -8;
                player.isGrounded = false;
            }
        } else if (this.state === 'flying') {
            const dx = this.flyTargetX - this.x;
            const dy = this.flyTargetY - this.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const speed = 18;
            this.x += (dx / len) * speed;
            this.y += (dy / len) * speed;
            this.alpha = Math.max(0, this.alpha - 0.02);
            if (boss && !boss.dead &&
                Math.abs(this.x - this.flyTargetX) < 40 &&
                Math.abs(this.y - this.flyTargetY) < 40) {
                boss.takeHit();
                this.alive = false;
                return;
            }
        }
        this.alive = this.alive !== false;
    }

    draw(ctx, cameraX) {
        const drawX = this.x - cameraX;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        if (monkeySprite.complete && monkeySprite.naturalWidth > 0) {
            ctx.drawImage(monkeySprite, drawX, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = '#00cfff';
            ctx.fillRect(drawX, this.y, this.width, this.height);
        }
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
    update() { this.bobTimer++; }
    draw(ctx, cameraX) {
        if (this.collected) return;
        const drawX = this.x - cameraX;
        const bob = Math.sin(this.bobTimer * 0.08) * 5;
        ctx.save();
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(drawX, this.y + bob, this.width, this.height);
        ctx.restore();
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function spawnBird() {
    if (!boss || boss.dead) return;
    const bx = player.x + (Math.random() * 200 - 100);
    const monk = new Monkey(bx);
    monk.alive = true;
    birdList.push(monk);
}

function spawnItemPath() {
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
        this.startX = x; this.x = x; this.y = y;
        this.width = 80; this.height = 80;
        this.vx = 2.5 + Math.random() * 2; // Velocidade variável: 2.5–4.5
        this.walkDistance = Math.max(walkDistance, 60);
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
        const drawn = drawSprite(spr, drawX, this.y, this.width, this.height, this.vx > 0);
        if (!drawn) { ctx.fillStyle = '#8b0000'; ctx.fillRect(drawX, this.y, this.width, this.height); }
    }
}

// ─── Runtime ──────────────────────────────────────────────────────────────────
let player, platforms = [], enemies = [], checkpoints = [], cameraX = 0;

function respawnPlayer() {
    player.reset();
    cameraX = Math.max(0, player.x - canvas.width * 0.3);
    gameState = 'PLAYING';
    if (boss && !boss.dead) { boss.projectiles = []; birdList = []; }
}

function init() {
    player = new Player(50, 450 - 60); purified = false; purifyTimer = 0; boss = null; birdList = []; groundItem = null; checkpoints = []; enemies = [];
    // Plataforma base contínua cobrindo todo o nível — garante que o jogador NUNCA caia em nenhum buraco
    platforms = [new Platform(0, 450, 23000, 150, 'ground')];
    // Plataformas decorativas do início do nível (blocos)
    levelData.filter(p => p.type === 'block').forEach(p => platforms.push(new Platform(p.x, p.y, p.w, p.h, p.type)));
    
    let currentX = 1900;
    let lastY = 450;
    let nextCP = 2000;
    
    while (currentX < 16000) {
        const nextY = Math.min(480, Math.max(380, lastY + (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 50)));
        const groundWidth = Math.random() * 700 + 500;
        // Degrau de transição entre alturas
        if (Math.abs(nextY - lastY) > 20) {
            platforms.push(new Platform(currentX, Math.min(lastY, nextY), 100, Math.abs(nextY - lastY) + 60, 'ground'));
        }
        platforms.push(new Platform(currentX, nextY, groundWidth, 600 - nextY, 'ground'));
        
        // Adicionar Checkpoints no chão certo (corrige o teletransporte)
        if (currentX > nextCP) {
            checkpoints.push(new Checkpoint(currentX + 50, nextY));
            nextCP += 2000;
        }
        
        // Gerar obstáculos de madeira e diminuir inimigos
        if (Math.random() < 0.6) {
            platforms.push(new Platform(currentX + groundWidth / 2, nextY - 40, 40, 40, 'block'));
            if (Math.random() < 0.4) {
                platforms.push(new Platform(currentX + groundWidth / 2 + 40, nextY - 40, 40, 40, 'block'));
            }
        }
        
        const numEnemies = Math.max(1, Math.floor((groundWidth / 300) * 0.75));
        for (let i = 0; i < numEnemies; i++) {
            const ex = currentX + 100 + i * (groundWidth / numEnemies);
            if (ex + 80 < currentX + groundWidth) enemies.push(new Enemy(ex, nextY - 80, 220));
        }
        currentX += groundWidth;
        lastY = nextY;
    }
    // Zona queimada e arena do boss (já coberta pela plataforma base)
    platforms.push(new Platform(17500, 450, 5500, 150, 'ground')); // cobre até x=23000
    requestAnimationFrame(gameLoop);
}

function updateCamera() {
    const sr = cameraX + canvas.width * 0.6, sl = cameraX + canvas.width * 0.3;
    if (player.x > sr) cameraX = player.x - canvas.width * 0.6;
    else if (player.x < sl && cameraX > 0) cameraX = player.x - canvas.width * 0.3;
}

function drawBackground() {
    const rawFactor = (typeof player !== 'undefined' && player.x > 17500) ? Math.max(0, Math.min(1, (player.x - 17500) / 2000)) : 0;
    const pFactor = purified ? 0 : rawFactor;
    
    // Fallback base color
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const ps = (cameraX * 0.2) % canvas.width;
    
    // Draw normal forest if it exists
    if (bgImage.complete && bgImage.naturalWidth > 0) {
        ctx.globalAlpha = 1 - pFactor;
        ctx.drawImage(bgImage, -ps, 0, canvas.width, canvas.height);
        ctx.drawImage(bgImage, canvas.width - ps, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
    }

    // Draw burned forest over it smoothly
    if (pFactor > 0 && finalBgImage.complete && finalBgImage.naturalWidth > 0) {
        ctx.globalAlpha = pFactor;
        ctx.drawImage(finalBgImage, -ps, 0, canvas.width, canvas.height);
        ctx.drawImage(finalBgImage, canvas.width - ps, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
    } else if (pFactor > 0) {
        // Safe fallback tint if image is missing
        const r = Math.floor(92 + (44 - 92) * pFactor), g = Math.floor(148 + (20 - 148) * pFactor), b = Math.floor(252 + (10 - 252) * pFactor);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${pFactor})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function drawDeathScreen() {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign = 'center'; ctx.fillStyle = '#cc0000'; ctx.font = 'bold 72px Arial'; ctx.fillText('VOCÊ MORREU', canvas.width/2, canvas.height/2);
}

function drawWinScreen() {
    ctx.fillStyle = 'rgba(0,80,0,0.75)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign = 'center'; ctx.fillStyle = '#00ff88'; ctx.font = '32px "Press Start 2P"'; ctx.fillText('FLORESTA SALVA!', canvas.width/2, canvas.height/2-40);
    ctx.fillStyle = '#fff'; ctx.font = '14px "Press Start 2P"'; ctx.fillText('Fsoul vitoriosa! 🌿', canvas.width/2, canvas.height/2+40);
}

function drawBossHint() {
    if (!boss || boss.dead) return;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, canvas.height-50, canvas.width, 50);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Pule no MACACO para lançá-lo no chefe! (' + boss.hp + '/5)', canvas.width/2, canvas.height-22);
}

function gameLoop() {
    try {
        if (gameState === 'START') {
            if (startBg.complete && startBg.naturalWidth > 0) { ctx.drawImage(startBg, 0, 0, canvas.width, canvas.height); ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(0,0,canvas.width,canvas.height); }
            else { ctx.fillStyle = '#1a2a4a'; ctx.fillRect(0,0,canvas.width,canvas.height); }
            ctx.fillStyle = '#00ff88'; ctx.font = '72px "Press Start 2P"'; ctx.textAlign = 'center'; ctx.fillText('FSOUL', canvas.width/2, canvas.height/2);
            ctx.fillStyle = 'white'; ctx.font = '16px "Press Start 2P"'; if (Math.floor(Date.now()/500)%2===0) ctx.fillText('PRESSIONE ENTER', canvas.width/2, canvas.height/2+100);
            requestAnimationFrame(gameLoop); return;
        }
        if (gameState === 'DEAD') { deathTimer++; drawBackground(); for (let p of platforms) p.draw(ctx,cameraX); drawDeathScreen(); requestAnimationFrame(gameLoop); return; }
        if (gameState === 'WIN') { drawBackground(); drawWinScreen(); requestAnimationFrame(gameLoop); return; }

        player.update(platforms); if (boss) boss.update();
        enemies.forEach(e => { if (e.alive) e.update(); }); // <-- CORRIGIDO: inimigos agora se movem
        for (let b of birdList) b.update(); birdList = birdList.filter(b => b.alive !== false);
        if (groundItem && !groundItem.collected) { groundItem.update(); if (player.x < groundItem.x + groundItem.width && player.x + player.width > groundItem.x && player.y < groundItem.y + groundItem.height && player.y + player.height > groundItem.y) { groundItem.collected = true; purified = true; setTimeout(() => { gameState = 'WIN'; }, 3000); } }
        if (purified) purifyTimer++;
        for (let cp of checkpoints) {
            const wa = cp.activated;
            cp.update(player.x, player.y, player.width, player.height);
            if (cp.activated && !wa) player.setCheckpoint(cp.x, cp.groundY);
        }
        if (!player.dead) {
            for (let e of enemies) {
                let marginX = 15;
                let marginY = 10;
                if (e.alive && player.x + marginX < e.x + e.width - marginX && player.x + player.width - marginX > e.x + marginX && player.y + marginY < e.y + e.height - marginY && player.y + player.height - marginY > e.y + marginY) {
                    // Se o jogador estiver caindo E a borda inferior do player estiver batendo na metade superior do inimigo
                    if (player.vy > 0 && player.y + player.height - marginY < e.y + e.height * 0.6) {
                        e.alive = false;     // Mata o inimigo
                        player.vy = -10;     // O jogador quica
                        player.isGrounded = false;
                    } else {
                        player.die();        // Caso contrário, morre
                        break;
                    }
                }
            }
        }

        updateCamera();
        
        ctx.clearRect(0,0,canvas.width,canvas.height); 
        drawBackground();
        for (let p of platforms) p.draw(ctx,cameraX); for (let cp of checkpoints) cp.draw(ctx, cameraX);
        for (let e of enemies) if (e.alive) e.draw(ctx, cameraX); if (boss) boss.draw(ctx, cameraX);
        for (let b of birdList) b.draw(ctx, cameraX); if (groundItem && !groundItem.collected) groundItem.draw(ctx, cameraX);
        player.draw(ctx, cameraX); drawBossHint(); 
    } catch (e) {
        console.error("Game loop error:", e);
    }
    requestAnimationFrame(gameLoop);
}
init();
