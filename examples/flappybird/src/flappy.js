const {Pxlatd} = require("../../../src/PXLATD-GPU/pxlatd.js")

window.addEventListener("DOMContentLoaded", async () => {
    const pxlatd = new Pxlatd("Flappy")

    pxlatd.init({
        window:{
            width: 1920,
            height: 1080,
            autoResize: true,
            backgroundColor: {
                r: 255,
                g: 126,
                b: 112
            }
        }
    })

    let running = false
    let gravity = 0
    let spawnInterval = 180
    let tickTicks = 0
    let ticks = 0


    await pxlatd.renderSprite({
        id: "player",
        src: "../assets/bird.png",
        x: 800,
        y: document.body.clientHeight / 2,
        scale: 1,
        layer: 1,
        rotation: 0
    })

    await pxlatd.renderSprite({
        id: "pipe1",
        src: "../assets/pipe.jpg",
        x: 800,
        y: -1,
        scale: 0,
        layer: 1,
        rotation: 180
    })

    pxlatd.onKeyPress("w", () => {
        console.log(pxlatd.getSpriteData())
    })

    let currentPipe = 1

    async function spawnPipes(){
        let pipeHeight = Math.floor(Math.random() * 300 + 1)
        await pxlatd.renderSprite({
            id: `currentPipe${currentPipe}-top`,
            src: "../assets/pipe.jpg",
            x: window.innerWidth,
            y: -pipeHeight,
            scale: 0.35,
            layer: 1,
            rotation: 180
        })

        await pxlatd.renderSprite({
            id: `currentPipe${currentPipe}-bottom`,
            src: "../assets/pipe.jpg",
            x: window.innerWidth,
            y: pxlatd.getSpriteData().get("pipe1").bitmap.height * 0.35 - pipeHeight + 200,
            scale: 0.35,
            layer: 1,
            rotation: 0
        })

        await pxlatd.renderSprite({
            id: `collider${currentPipe}`,
            src: "../assets/collider.png",
            x: window.innerWidth,
            y: 0,
            scale: 1,
            layer: 1,
            rotation: 0
        })
    }

    let next = 1
    let score = 0
    let tilt = 0

    pxlatd.onKeyPress("Tab", async () => {
        if (running) gravity = -10
        else {
            pxlatd.addFrameFunction("gameLogic", async () => {
                gravity += 0.4
                await pxlatd.queueAdd("player", true, false, {
                    x: 800,
                    y: pxlatd.getSpriteData().get("player").y + gravity,
                    scale: 1,
                    rotation: tilt
                })

                if (tilt < 25 && gravity > 0) tilt += 0.9
                else if (tilt > -25 && gravity < 0) tilt -= 1

                ticks++;
                tickTicks++;
                if (tickTicks === 300){
                    spawnInterval -= 10
                    tickTicks = 0
                }
                if (ticks === spawnInterval){
                    await spawnPipes()
                    if (currentPipe !== 6) currentPipe++;
                    else currentPipe = 1
                    ticks = 0
                }

                for (let i = 1; i < 7; i++){
                    if (pxlatd.getSpriteData().has(`currentPipe${i}-top`)){
                        let batch3 = await pxlatd.checkCollisionsBatch([["player",`collider${i}`]])

                        console.log(next)

                        if (batch3.length && next === i) {
                            score++;
                            console.log(score)
                            document.getElementById("score").innerHTML = score
                            if (next !== 6) next++
                            else next = 1
                        }

                        await pxlatd.queueAdd(`currentPipe${i}-top`, true, false, {
                            x: pxlatd.getSpriteData().get(`currentPipe${i}-top`).x - 10,
                            y: pxlatd.getSpriteData().get(`currentPipe${i}-top`).y,
                            scale: 0.35,
                            rotation: 180
                        })
                        
                        await pxlatd.queueAdd(`currentPipe${i}-bottom`, true, false, {
                            x: pxlatd.getSpriteData().get(`currentPipe${i}-bottom`).x - 10,
                            y: pxlatd.getSpriteData().get(`currentPipe${i}-bottom`).y,
                            scale: 0.35,
                            rotation: 0
                        })

                        await pxlatd.queueAdd(`collider${i}`, true, false, {
                            x: pxlatd.getSpriteData().get(`collider${i}`).x - 10,
                            y: pxlatd.getSpriteData().get(`collider${i}`).y,
                            scale: 1,
                            rotation: 0
                        })

                        let firstBatch = await pxlatd.checkCollisionsBatch([["player",`currentPipe${i}-top`]])
                        let secondBatch = await pxlatd.checkCollisionsBatch([["player",`currentPipe${i}-bottom`]])
                        if (firstBatch.length || secondBatch.length || pxlatd.getSpriteData().get("player").y > window.innerHeight || pxlatd.getSpriteData().get("player").y < 0 ){
                                pxlatd.removeFrameFunction("gameLogic")
                                document.getElementById("message").style.display = "flex"
                                document.getElementById("message").innerHTML = "GAME OVER"
                                running = false
                                for (let i = 1; i < 7; i++){
                                    await pxlatd.deleteSprite(`currentPipe${i}-top`)
                                    await pxlatd.deleteSprite(`currentPipe${i}-bottom`)
                                    await pxlatd.deleteSprite(`currentPipe${i}-top`)
                                }
                                next = 1
                                score = 0
                                gravity = 0
                                spawnInterval = 180
                                tickTicks = 0
                                ticks = 0
                                currentPipe = 1
                                await pxlatd.renderSprite({
                                    id: "player",
                                    src: "../assets/bird.png",
                                    x: 800,
                                    y: document.body.clientHeight / 2,
                                    scale: 1,
                                    layer: 1,
                                    rotation: 0
                                })
                        }
                    }
                }
            })
            document.getElementById("message").style.display = "none"
            document.getElementById("score").innerHeight = score
            running = true
        }
    })



    pxlatd.initEventLoop(60,60)
})


//Message for new Commit