const Renderer = require("./src/render/index.js");
const Physics = require("./src/physics/index.js");
/*
window.addEventListener('DOMContentLoaded', async () => {
  const pxl = new Renderer({
    width: 1920,
    height: 1080,
    autoResize: false});
  pxl.init();
  for (let i = 0; i < 10; i++) {
      console.time("rendering");
      console.time("total")
      await pxl.renderSprite(
        { id: "player",
          src: "src\\sprites\\test2.png",
          x: 0 + i * 10,
          y: 0 + i * 10,
          scale: 1,
          layer: 0
        });
      await pxl.flush();
  }
});*/

const Pxlatd = require("./src/host/index.js");
startingx = 500;
startingy = 500;

window.addEventListener('DOMContentLoaded', async () => {
    const pxl = new Pxlatd("Test");
    pxl.init({
        window: { 
            width: 1920,
            height: 1080,
            autoResize: false 
        },
        physics: { 
            globalGravity: 9.81,
            globalVelocity: 0
        }
    });
    await pxl.renderSprite({
        id: "player",
        src: "src\\sprites\\test.jpg",
        x: 500,
        y: 500,
        scale: 2,
        layer: 0
    })
    pxl.initEventLoop(60);
    addEventListener("keydown", async (e) => {
        if (e.key === "ArrowRight") {
            startingx += 10;
        } else if (e.key === "ArrowLeft") {
            startingx -= 10;
        } else if (e.key === "ArrowUp") {
            startingy -= 10;
        } else if (e.key === "ArrowDown") {
            startingy += 10;
        }
        await pxl.queueAdd("player", true, false, {
            x: startingx,
            y: startingy,
            scale: 2,
            rotation: 0
        });
    });

});

/*window.addEventListener("DOMContentLoaded", async () => {
  const pxl = new Renderer({
    width: 1920,
    height: 1080,
    autoResize: false});
  pxl.init();
  console.time("total");
  for (let i = 0; i < 361; i++) {
    console.time("rendering");
      await pxl.renderSprite(
        { id: "player",
          src: "src\\sprites\\test.jpg",
          x: 500,
          y: 500,
          scale: 10,
          rotation: i,
          layer: 0
    });
    console.timeEnd("rendering");
    console.time("flush");
    await pxl.flush();
    console.timeEnd("flush");
    console.time("clearLayers");
    await pxl.clearLayers();
    console.timeEnd("clearLayers");

    await new Promise(requestAnimationFrame);
  }

  console.timeEnd("total");
});*/