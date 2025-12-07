module.exports = class Renderer {
    constructor({
        width = 1920,
        height = 1080,
        backgroundColor = "#000000",
        layers = 1,
        autoResize = true
    } = {}) {
        this.width = width;
        this.height = height;
        this.backgroundColor = backgroundColor;
        this.layers = layers;
        this.autoResize = autoResize;

        this.spriteCache = new Map();
        this.layerBuffer = [];
        this.spritePos = {};
        this.idSourceMap = new Map();
    }

    init() {
        const container = document.getElementById("canvas");
        if (!container) throw new Error("Element #canvas not found");
        container.innerHTML = "";

        const canvas = document.createElement("canvas");
        canvas.id = "canvas";
        canvas.width = this.width;
        canvas.height = this.height;

        container.id = "container";
        container.appendChild(canvas);

        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
    }

    async loadSprite(src) {
        if (this.spriteCache.has(src)) return this.spriteCache.get(src);

        const img = new Image();
        img.src = src;

        await new Promise(res => img.onload = res);

        const temp = document.createElement("canvas");
        const tctx = temp.getContext("2d");
        temp.width = img.width;
        temp.height = img.height;

        tctx.drawImage(img, 0, 0);
        const { data } = tctx.getImageData(0, 0, img.width, img.height);

        const pixels = new Array(img.width * img.height);
        for (let i = 0; i < data.length; i += 4) {
            const idx = i / 4;
            pixels[idx] = [
                data[i],
                data[i + 1],
                data[i + 2],
                data[i + 3]
            ];
        }

        const sprite = {
            width: img.width,
            height: img.height,
            pixels
        };

        this.spriteCache.set(src, sprite);
        return sprite;
    }

    async renderSprite({id, src, x = 0, y = 0, scale = 1, layer = 0, rotation = 0 }) {
        this.spritePos[id] = {x, y, scale, rotation};
        this.idSourceMap.set(id, src);
        const sprite = await this.loadSprite(src);
        if (!sprite) return;

        if (this.autoResize) {
            this.canvas.width = sprite.width * scale;
            this.canvas.height = sprite.height * scale;
        }

        if (!this.layerBuffer[layer]) {
            this.layerBuffer[layer] = this.ctx.createImageData(
                this.canvas.width,
                this.canvas.height
            );
        }

        const buffer = this.layerBuffer[layer];
        const data = buffer.data;

        const W = this.canvas.width;
        const H = this.canvas.height;

        //rotation calculations
        const angle = rotation * Math.PI / 180;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        //pivot
        const pivotX = x + (sprite.width * scale) / 2;
        const pivotY = y + (sprite.height * scale) / 2;

        function rotatedBounds(w, h, angle) {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const hw = w / 2;
            const hh = h / 2;

            const corners = [
                [ -hw, -hh ],
                [  hw, -hh ],
                [  hw,  hh ],
                [ -hw,  hh ]
            ];

            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            for (const [px, py] of corners) {
                const rx = px * cos - py * sin;
                const ry = px * sin + py * cos;

                if (rx < minX) minX = rx;
                if (rx > maxX) maxX = rx; 
                if (ry < minY) minY = ry;
                if (ry > maxY) maxY = ry;
            }

            return {
                minX: minX + hw,
                maxX: maxX + hw,
                minY: minY + hh,
                maxY: maxY + hh
            };
        }

        const bounds = rotatedBounds(sprite.width * scale, sprite.height * scale, angle);

        const loopMinX = Math.max(0, (x + bounds.minX) | 0);
        const loopMaxX = Math.min(W, (x + bounds.maxX) | 0);
        const loopMinY = Math.max(0, (y + bounds.minY) | 0);
        const loopMaxY = Math.min(H, (y + bounds.maxY) | 0);

        //Inverse Mapping
        for (let py = loopMinY; py < loopMaxY; py++) {
            for (let px = loopMinX; px < loopMaxX; px++) {

                //pivot to origin
                const tx = px - pivotX;
                const ty = py - pivotY;

                //rotation formula
                const ox =  cosA * tx + sinA * ty + pivotX;
                const oy = -sinA * tx + cosA * ty + pivotY;

                //scale
                const sx = ((ox - x) / scale) | 0;
                const sy = ((oy - y) / scale) | 0;

                if (sx < 0 || sy < 0 || sx >= sprite.width || sy >= sprite.height)
                    continue;

                const [r, g, b, a] =
                    sprite.pixels[sy * sprite.width + sx];

                if (a === 0) continue;

                const idx = (py * W + px) * 4;
                data[idx]     = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = a;
            }
        }
    }



    async flush() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (let i = 0; i < this.layerBuffer.length; i++) {
            const buf = this.layerBuffer[i];
            if (!buf) continue;
            this.ctx.putImageData(buf, 0, 0);
        }
    }

    async getSpritePositions(){
        return this.spritePos;
    }

    async checkForExistingSprite(id){
        return this.spritePos.hasOwnProperty(id);
    }

    async updateSpritePosition(id, {x, y, scale, rotation}){
        if (!this.spritePos[id]) throw new Error(`Sprite with ID ${id} does not exist.`);
        await this.renderSprite({
            id: id,
            src: this.idSourceMap.get(id),
            x: x,
            y: y,
            scale: scale,
            rotation: rotation,
            layer: this.spritePos[id].layer
        })
    }

    async clearLayers() {
        this.layerBuffer = [];
    }
}