
# Pxlatd

Pxlatd is a game engine based on HTML canvas using vanilla JavaScript.

It is NOT intended to be used in large scale projects but instead in basic 2d games that can be ran on a browser.


## Features

- 2d Rendering API
- Gameloop logic
- Input handlers (Mouse and Keyboard)
- Basic collision handling
- Scene creation and loading
- Basic Audio API
- Camera Controls


## Installation

You can clone the project using:

```bash
  git clone https://github.com/kKrksh/pxlatd
```

Or just download pxlatd.js using this URL:
https://github.com/kKrksh/pxlatd/blob/main/src/PXLATD-GPU/pxlatd.js

You can then proceed by importing it in your porject:

```javascript
  const {Pxlatd} = require("<path>/Pxlatd.js")
```
⚠️ Pxlatd is intended for browser environments but uses fs for scene loading. Scene loading requires bundler or environment support (e.g., Electron, Node-based builds).
You can also use a CDN though it's not encouraged.
    

## Usage

#####The HTML file has to have a div in the body with the id "canvas"

Initializing the class
```javascript
    const engine = new Pxlatd("MyGame");
```
Initializing window
```javascript
await engine.init({
  window: {
    width: 1280,
    height: 720,
    autoResize: true,
    backgroundColor: { r: 0, g: 0, b: 0 }
  }
});
```
Initializing eventloop
```javascript
engine.initEventLoop(60, 60) //(framerate, tickrate);
```
Rendering a sprite
```javascript
await engine.renderSprite({
  id: "player",
  src: "/assets/player.png",
  x: 100,
  y: 100,
  scale: 1,
  layer: 1
});
```

PXLATD provides many other functions, but I am too lazy to document them.

For further guidance refer to the source code at https://github.com/kKrksh/pxlatd/blob/main/src/PXLATD-GPU/pxlatd.js.

Each functions parameters have detailed labeling to where you should be able to understand what to pass into that function. Currently error handling isn't widely present in the code so be careful.

Also note that the getSpriteData function returns a Map and NOT an object.




## Deployment

It's encouraged to use PXLATD alongside electronjs which provides a node environment and tends to let you publish games much easier.

Here's the electron docs which walk you step by step on how to create an electron app, which apis it provides and how to build your project:

https://www.electronjs.org/docs/latest/
## Demo

There's and example game provided at:

https://github.com/kKrksh/pxlatd/tree/main/examples



