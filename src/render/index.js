module.exports = class Renderer {
    constructor({
        width = 1920,
        height = 1080,
        layers = 1,
        autoResize = true,
        backgroundColor = {
            r: 255,
            g: 255,
            b: 255
        }
    } = {}) {
        this.width = width;
        this.height = height;
        this.backgroundColor = backgroundColor;
        this.layers = layers;
        this.autoResize = autoResize;
        this.backgroundColor = backgroundColor

        this.spriteCache = new Map();
        this.idSourceMap = new Map();
        this.layerBuffer = [];
        this.spritePos = {};
        this.globalOffset = { x: 0, y: 0 };
        this.drawCounter = 0
    }
    //create canvas
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
    //reads and caches sprite
    async loadSprite(src) {
        if (this.spriteCache.has(src)) return this.spriteCache.get(src);

        let img;

        
        img = new Image();
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
    //convert sprite cache to buffer
    async renderSprite({id, src, x = 0, y = 0, scale = 1, layer = 0, rotation = 0}) {
        this.idSourceMap.set(id, src)
        const sprite = await this.loadSprite(src);
        x = Math.floor(x)
        y = Math.floor(y)
        if (!sprite) return;
        this.spritePos[id] = { x, y, scale, rotation, renderIndex: this.drawCounter++, hitbox: { width: sprite.width * scale, height: sprite.height * scale }, layer: layer};
        x -= this.globalOffset.x;
        y -= this.globalOffset.y;
        
        /*if (this.autoResize) {
            this.canvas.width = sprite.width * scale;
            this.canvas.height = sprite.height * scale;
        }*/

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

        //degrees to radians
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

        //inverse Mapping
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

    //display renders
    async flush() {
        const W = this.canvas.width;
        const H = this.canvas.height;

        const finalFrame = this.ctx.createImageData(W, H);
        const out = finalFrame.data;

        const bg = this.backgroundColor;

        if (bg) {
            const r = this.backgroundColor.r
            const g = this.backgroundColor.g
            const b = this.backgroundColor.b

            for (let i = 0; i < out.length; i += 4) {
                out[i]     = r;
                out[i + 1] = g;
                out[i + 2] = b;
                out[i + 3] = 255;
            }
        }

        for (let i = 0; i < this.layerBuffer.length; i++) {
            const layer = this.layerBuffer[i];
            if (!layer) continue;

            const src = layer.data;

            for (let p = 0; p < src.length; p += 4) {
                const a = src[p + 3];
                if (a === 0) continue;

                out[p]     = src[p];
                out[p + 1] = src[p + 1];
                out[p + 2] = src[p + 2];
                out[p + 3] = a;
            }
        }

        this.ctx.putImageData(finalFrame, 0, 0);
    }
    
    //check for existing sprite id
    async checkForExistingSprite(id){
        return this.spritePos.hasOwnProperty(id);
    }
    //rerender sprite at new pos
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

    async shiftCamera(x, y) {
        this.globalOffset.x = x;
        this.globalOffset.y = y;
    }

    //reset display
    async clearLayers() {
        this.layerBuffer = [];
    }

    //return sprite info
    async getSpritePositions(){
        return this.spritePos;
    }

    getCameraOffset(){
        return this.globalOffset;
    }
}