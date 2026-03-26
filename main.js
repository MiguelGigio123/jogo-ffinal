<canvas id="gameCanvas" width="960" height="540"></canvas>
<script>
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ================= CONFIG =================
const GRAVITY = 0.5;
const MAX_FALL_SPEED = 15;

// ================= INPUT =================
const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// ================= PLAYER =================
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;

        this.width = 50;
        this.height = 50;

        this.vx = 0;
        this.vy = 0;

        this.speed = 5;
        this.jumpForce = -12;

        this.isGrounded = false;
        this.coyoteTime = 0;

        this.dead = false;
        this.facingRight = true;
    }

    update(platforms) {
        if (this.dead) return;

        // Movimento
        if (keys['ArrowLeft']) {
            this.vx = -this.speed;
            this.facingRight = false;
        } else if (keys['ArrowRight']) {
            this.vx = this.speed;
            this.facingRight = true;
        } else {
            this.vx *= 0.6;
        }

        // Coyote time
        if (this.isGrounded) this.coyoteTime = 6;
        else this.coyoteTime--;

        // Pulo
        if ((keys['Space'] || keys['ArrowUp']) && this.coyoteTime > 0) {
            this.vy = this.jumpForce;
            this.coyoteTime = 0;
        }

        // Gravidade
        this.vy += GRAVITY;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;

        // X
        this.x += this.vx;
        for (let p of platforms) {
            if (this.collide(p)) {
                if (this.vx > 0) this.x = p.x - this.width;
                if (this.vx < 0) this.x = p.x + p.width;
                this.vx = 0;
            }
        }

        // Y (fix anti-bug)
        this.y += this.vy;
        this.isGrounded = false;

        for (let p of platforms) {
            if (this.collide(p)) {
                if (this.vy > 0) {
                    this.y = p.y - this.height;
                    this.isGrounded = true;
                } else {
                    this.y = p.y + p.height;
                }
                this.vy = 0;
            }
        }

        if (this.y > canvas.height + 200) this.die();
    }

    collide(p) {
        return this.x < p.x + p.width &&
               this.x + this.width > p.x &&
               this.y < p.y + p.height &&
               this.y + this.height > p.y;
    }

    die() {
        this.dead = true;
        gameState = 'DEAD';
    }

    reset() {
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.vx = 0;
        this.vy = 0;
        this.dead = false;
    }

    draw(cameraX) {
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
    }
}

// ================= PLATFORM =================
class Platform {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
    }

    draw(cameraX) {
        ctx.fillStyle = '#3a8732';
        ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
    }
}

// ================= ENEMY =================
class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 50;
        this.vx = 2;
        this.alive = true;
    }

    update() {
        if (!this.alive) return;

        if (Math.abs(player.x - this.x) < 200) {
            this.vx = Math.sign(player.x - this.x) * 3;
        }

        this.x += this.vx;
    }

    draw(cameraX) {
        if (!this.alive) return;
        ctx.fillStyle = 'purple';
        ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
    }
}

// ================= BOSS =================
class Boss {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 200;
        this.height = 200;
        this.hp = 5;
        this.dead = false;
    }

    takeHit() {
        this.hp--;
        if (this.hp <= 0) this.dead = true;
    }

    draw(cameraX) {
        if (this.dead) return;
        ctx.fillStyle = 'black';
        ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);

        // HP bar
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - cameraX, this.y - 20, this.width * (this.hp / 5), 10);
    }
}

// ================= MONKEY =================
class Monkey {
    constructor(x) {
        this.x = x;
        this.y = 120;
        this.width = 40;
        this.height = 40;
        this.alive = true;
    }

    update() {
        if (!this.alive) return;

        const onTop =
            player.x + player.width > this.x &&
            player.x < this.x + this.width &&
            player.y + player.height >= this.y &&
            player.y + player.height <= this.y + 30 &&
            player.vy > 0;

        if (onTop && boss && !boss.dead) {
            boss.takeHit();
            this.alive = false;
            player.vy = -10;
        }
    }

    draw(cameraX) {
        if (!this.alive) return;
        ctx.fillStyle = 'cyan';
        ctx.fillRect(this.x - cameraX, this.y, this.width, this.height);
    }
}

// ================= GAME =================
let player;
let platforms = [];
let enemies = [];
let monkeys = [];
let boss = null;
let cameraX = 0;
let gameState = 'PLAYING';
let bossArena = 2000;

// INIT
function init() {
    player = new Player(50, 300);

    // plataformas reais (SEM chão infinito)
    platforms.push(new Platform(0, 450, 400, 100));
    platforms.push(new Platform(500, 400, 300, 100));
    platforms.push(new Platform(900, 350, 300, 100));
    platforms.push(new Platform(1400, 450, 400, 100));
    platforms.push(new Platform(2000, 450, 600, 100));

    enemies.push(new Enemy(600, 350));
    enemies.push(new Enemy(1500, 400));

    monkeys.push(new Monkey(2100));

    requestAnimationFrame(loop);
}

// CAMERA SUAVE
function updateCamera() {
    const target = player.x - canvas.width * 0.4;
    cameraX += (target - cameraX) * 0.1;
}

// LOOP
function loop() {
    if (gameState === 'DEAD') {
        ctx.fillStyle = 'black';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = 'red';
        ctx.fillText('MORREU', 400, 250);
        return;
    }

    // Spawn boss
    if (!boss && player.x > bossArena) {
        boss = new Boss(bossArena + 200, 250);
    }

    player.update(platforms);

    enemies.forEach(e => e.update());
    monkeys.forEach(m => m.update());

    // colisão inimigos
    for (let e of enemies) {
        if (!e.alive) continue;

        const hit =
            player.x < e.x + e.width &&
            player.x + player.width > e.x &&
            player.y < e.y + e.height &&
            player.y + player.height > e.y;

        if (hit) {
            const stomp =
                player.vy > 0 &&
                player.y + player.height < e.y + e.height * 0.6;

            if (stomp) {
                e.alive = false;
                player.vy = -10;
            } else {
                player.die();
            }
        }
    }

    updateCamera();

    // DRAW
    ctx.clearRect(0,0,canvas.width,canvas.height);

    platforms.forEach(p => p.draw(cameraX));
    enemies.forEach(e => e.draw(cameraX));
    monkeys.forEach(m => m.draw(cameraX));
    if (boss) boss.draw(cameraX);
    player.draw(cameraX);

    requestAnimationFrame(loop);
}

init();
</script>
